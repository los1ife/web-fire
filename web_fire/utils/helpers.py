import os
import uuid
from PIL import Image
from utils.logger import get_logger

logger = get_logger(__name__)

def generate_unique_filename(original_filename):
    """生成唯一文件名，避免覆盖"""
    ext = os.path.splitext(original_filename)[1]
    return f"{uuid.uuid4().hex}{ext}"

def generate_thumbnail(image_path, thumbnail_path, max_size=(800, 600)):
    """
    生成缩略图
    :param image_path: 原图路径
    :param thumbnail_path: 缩略图保存路径
    :param max_size: 最大尺寸 (宽, 高)
    """
    try:
        img = Image.open(image_path)
        # 使用 LANCZOS 算法保持高质量缩放
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        img.save(thumbnail_path)
        logger.info(f"缩略图生成成功: {thumbnail_path}")
        return True
    except Exception as e:
        logger.error(f"生成缩略图失败: {e}", exc_info=True)
        return False