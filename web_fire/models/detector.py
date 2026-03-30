import cv2
import cvzone
import numpy as np
import time
import threading
import os
from concurrent.futures import ThreadPoolExecutor
from ultralytics import YOLO
from utils.logger import get_logger

logger = get_logger(__name__)


class HighResDetector:
    def __init__(self, config):
        """
        :param config: 从 config.settings.MODEL_CONFIG 传入的字典
        """
        self.model_path = config["model_path"]
        self.class_names = config["class_names"]
        self.conf_threshold = config["conf_threshold"]
        self.area_filter = config["area_filter"]
        self.tile_size = config["tile_size"]
        self.overlap_ratio = config["overlap_ratio"]
        self.max_workers = config["max_workers"]
        self.thread_local = threading.local()

        # 预加载模型（可选，也可以延迟到第一次预测时加载）
        logger.info("正在初始化检测器...")
        self._get_model()

    def _get_model(self):
        """线程安全的模型加载"""
        if not hasattr(self.thread_local, "model"):
            logger.info(f"线程 {threading.current_thread().name} 正在加载模型权重: {self.model_path}")
            if not os.path.exists(self.model_path):
                raise FileNotFoundError(f"模型权重文件不存在: {self.model_path}")
            self.thread_local.model = YOLO(self.model_path)
        return self.thread_local.model

    @staticmethod
    def slice_image(img, tile_size, overlap_ratio):
        h, w = img.shape[:2]
        tile_w, tile_h = tile_size
        step_w = int(tile_w * (1 - overlap_ratio))
        step_h = int(tile_h * (1 - overlap_ratio))
        tiles = []
        x_starts = list(range(0, w - tile_w + 1, step_w))
        if x_starts and x_starts[-1] + tile_w < w: x_starts.append(w - tile_w)
        y_starts = list(range(0, h - tile_h + 1, step_h))
        if y_starts and y_starts[-1] + tile_h < h: y_starts.append(h - tile_h)

        # 处理图片小于分块的情况
        if not x_starts: x_starts = [0]
        if not y_starts: y_starts = [0]

        for x in x_starts:
            for y in y_starts:
                tiles.append((img[y:y + tile_h, x:x + tile_w], x, y))
        return tiles

    def _process_tile(self, tile_data):
        img, x_offset, y_offset = tile_data
        dets = []
        try:
            model = self._get_model()
            results = model(img, conf=self.conf_threshold, verbose=False)
            for r in results:
                for box in r.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].int().tolist()
                    conf = float(box.conf[0])
                    cls = int(box.cls[0])

                    if x_offset == -1 and y_offset == -1:
                        dets.append([x1, y1, x2, y2, conf, cls])
                    else:
                        if (x2 - x1) * (y2 - y1) < self.area_filter:
                            dets.append([x1 + x_offset, y1 + y_offset, x2 + x_offset, y2 + y_offset, conf, cls])
        except Exception as e:
            logger.error(f"Tile处理错误: {e}", exc_info=True)
        return dets

    # --- 聚类 NMS 逻辑 (保持原样，封装在类内部) ---
    @staticmethod
    def _bijiao(x1, x2, y1, y2, l):
        intex = np.zeros(l, dtype=int)
        maxi = 0
        for t in range(l):
            if intex[t] == 0:
                intex[t] = maxi + 1
                maxi += 1
            current_group_id = intex[t]
            for i in range(t + 1, l):
                non_overlap = x2[i] < x1[t] or x1[i] > x2[t] or y2[i] < y1[t] or y1[i] > y2[t]
                if not non_overlap:
                    if intex[i] == 0:
                        intex[i] = current_group_id
        return intex, maxi

    @staticmethod
    def _out(x1, x2, y1, y2, sours, cc, maxi, intex, l):
        keep = []
        for group_id in range(1, maxi + 1):
            group_indices = np.where(intex == group_id)[0]
            if len(group_indices) == 0: continue
            first_idx = group_indices[0]
            new_box = [x1[first_idx], y1[first_idx], x2[first_idx], y2[first_idx], sours[first_idx], cc]
            for t in group_indices:
                new_box[0] = min(new_box[0], x1[t])
                new_box[1] = min(new_box[1], y1[t])
                new_box[2] = max(new_box[2], x2[t])
                new_box[3] = max(new_box[3], y2[t])
                new_box[4] = max(new_box[4], sours[t])
            keep.append(new_box)
        return keep

    @staticmethod
    def nb_nms(dets):
        keep = []
        l = len(dets)
        if l == 0: return keep
        dets = np.array(dets) if not isinstance(dets, np.ndarray) else dets
        x1, y1, x2, y2 = dets[:, 0], dets[:, 1], dets[:, 2], dets[:, 3]
        sours, cc1 = dets[:, 4], dets[:, 5]
        cc = cc1[0]
        intex, maxi = HighResDetector._bijiao(x1, x2, y1, y2, l)
        keep = HighResDetector._out(x1, x2, y1, y2, sours, cc, maxi, intex, l)
        return keep

    def predict(self, image_input, output_path=None):
        overall_start = time.time()

        if isinstance(image_input, str):
            if not os.path.exists(image_input): raise FileNotFoundError(f"找不到文件: {image_input}")
            img = cv2.imread(image_input)
        elif isinstance(image_input, np.ndarray):
            img = image_input.copy()
        else:
            raise TypeError("输入必须是文件路径或numpy数组")
        if img is None: raise ValueError("图像读取失败")
        original_img = img.copy()

        tiles = self.slice_image(img, self.tile_size, self.overlap_ratio)
        tasks = [(original_img, -1, -1)] + tiles
        logger.info(f"总任务数: {len(tasks)}")

        all_dets = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            results = executor.map(self._process_tile, tasks)
        for res in results: all_dets.extend(res)
        logger.info(f"初步检测框数: {len(all_dets)}")

        final_img = original_img.copy()
        fire_dets, smoke_dets = [], []
        for det in all_dets:
            if self.class_names[int(det[5])] == 'fire':
                fire_dets.append(det)
            else:
                smoke_dets.append(det)

        fire_dets_np = np.array(fire_dets) if fire_dets else np.empty((0, 6))
        smoke_dets_np = np.array(smoke_dets) if smoke_dets else np.empty((0, 6))
        keep_fire = self.nb_nms(fire_dets_np) if fire_dets_np.size > 0 else []
        keep_smoke = self.nb_nms(smoke_dets_np) if smoke_dets_np.size > 0 else []

        # 绘制结果图
        for det in keep_smoke:

            x1 = int(det[0])
            y1 = int(det[1])
            x2 = int(det[2])
            y2 = int(det[3])
            conf = det[4]
            cc = det[5]

            w, h = x2 - x1, y2 - y1
            label = f"{self.class_names[int(cc)]} {conf:.2f}"
            cvzone.putTextRect(final_img, label, (max(0, x1 + 10), max(35, y1 - 10)), 10, 10, (0, 125, 255),
                               colorR=(0, 0, 0))
            cvzone.cornerRect(final_img, (x1, y1, w, h), l=3, colorR=(0, 125, 255), t=10, rt=10)

        for det in keep_fire:

            x1 = int(det[0])
            y1 = int(det[1])
            x2 = int(det[2])
            y2 = int(det[3])
            conf = det[4]
            cc = det[5]

            w, h = x2 - x1, y2 - y1
            label = f"{self.class_names[int(cc)]} {conf:.2f}"
            cvzone.putTextRect(final_img, label, (max(0, x1 + 10), max(35, y1 - 10)), 10, 10, (0, 255, 255),
                               colorR=(0, 0, 0))
            cvzone.cornerRect(final_img, (x1, y1, w, h), l=3, colorR=(0, 255, 255), t=10, rt=10)

        if output_path:
            cv2.imwrite(output_path, final_img)
            logger.info(f"结果图已保存: {output_path}")

        logger.info(f"检测总耗时: {time.time() - overall_start:.2f}s")
        return keep_smoke + keep_fire, final_img