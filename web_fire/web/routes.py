import os
import time
import re
import json
import hashlib
from flask import Blueprint, request, jsonify, render_template, send_from_directory, session
from config.settings import MODEL_CONFIG, STORAGE_CONFIG, WEB_CONFIG, DATA_CONFIG, BASE_DIR
from models.detector import HighResDetector
from utils.helpers import generate_unique_filename, generate_thumbnail
from utils.logger import get_logger
import threading
import queue
from datetime import datetime

bp = Blueprint('main', __name__)
logger = get_logger(__name__)


# ==================== 数据集管理 ====================
DATASETS_FILE = os.path.join(DATA_CONFIG['data_dir'], 'datasets.json')


def load_datasets():
    """加载数据集列表"""
    if not os.path.exists(DATASETS_FILE):
        # 默认数据集
        default_datasets = [
            {
                "id": "default_dfire2",
                "name": "D-Fire2 (默认)",
                "path": "E:/123/D-Fire2/data.yaml",
                "is_default": True,
                "created_at": time.time()
            }
        ]
        save_datasets(default_datasets)
        return default_datasets

    try:
        with open(DATASETS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"加载数据集列表失败: {e}")
        return []


def save_datasets(datasets):
    """保存数据集列表"""
    try:
        with open(DATASETS_FILE, 'w', encoding='utf-8') as f:
            json.dump(datasets, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"保存数据集列表失败: {e}")
        return False


# 初始化数据集列表
datasets = load_datasets()


# ==================== 工具函数：支持中文的文件名 ====================
def secure_filename_cn(filename):
    if not filename: return ""
    filename = filename.replace('/', '_').replace('\\', '_')
    filename = re.sub(r'[\\/:*?"<>|]', '', filename)
    filename = re.sub(r'[\x00-\x1f\x7f]', '', filename)
    if not filename.strip(): return f"unnamed_file_{int(time.time())}"
    return filename


# ==================== 工具函数：用户管理 ====================
def load_users():
    """加载用户数据 + 自动创建并持久化管理员账户"""
    if not os.path.exists(DATA_CONFIG['users_file']):
        users = {}
    else:
        try:
            with open(DATA_CONFIG['users_file'], 'r', encoding='utf-8') as f:
                users = json.load(f)
        except Exception as e:
            logger.error(f"读取用户文件失败，初始化空用户: {e}")
            users = {}

    # 定义管理员账户信息
    ADMIN_USERNAME = "lyh123"
    ADMIN_PASSWORD = "123456"

    admin_info = {
        "password": hash_password(ADMIN_PASSWORD),
        "created_at": time.time(),
        "role": "admin"
    }
    users[ADMIN_USERNAME] = admin_info

    try:
        save_users(users)
        logger.info(f"管理员账户 {ADMIN_USERNAME} 已持久化到 users.json")
    except Exception as e:
        logger.error(f"保存管理员账户失败: {e}")

    return users


def save_users(users):
    """保存用户数据到文件"""
    try:
        with open(DATA_CONFIG['users_file'], 'w', encoding='utf-8') as f:
            json.dump(users, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"保存用户数据失败: {e}")
        return False


def hash_password(password):
    """简单的密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()


def is_logged_in():
    """检查用户是否登录"""
    return 'username' in session


# ==================== 工具函数：通用响应 ====================
def api_response(data=None, message="success", code=200):
    return jsonify({"code": code, "message": message, "data": data})


def is_file_allowed(filename):
    ext = os.path.splitext(filename)[1].lower()
    # 禁止上传的文件
    if ext in WEB_CONFIG['blocked_file_extensions']:
        return False
    # 允许的文件：所有文件 + 明确允许模型/配置文件
    allowed_exts = ['.pt', '.pth', '.yaml', '.yml', '.jpg', '.jpeg', '.png', '.pdf', '.zip']
    if WEB_CONFIG['allowed_file_extensions'] != ["*"]:
        return ext in WEB_CONFIG['allowed_file_extensions']
    # 默认允许所有，但特别放行模型文件
    return True


# ==================== 全局初始化 ====================
detector = None
try:
    logger.info("正在预加载检测器模型...")
    detector = HighResDetector(MODEL_CONFIG)
    logger.info("✅ 检测器模型加载成功！")
except Exception as e:
    logger.critical(f"❌ 检测器加载失败！错误: {e}", exc_info=True)
    import sys

    sys.exit(1)

# ==================== 新增：训练任务管理 ====================
task_queue = queue.Queue()
task_status = {}
task_counter = 0
task_lock = threading.Lock()


def task_worker():
    while True:
        task = task_queue.get()
        if task is None:
            break
        task_id, task_type, params = task
        try:
            if task_type == 'train':
                run_training_task(task_id, params)
            elif task_type == 'val':
                run_validation_task(task_id, params)
        except Exception as e:
            with task_lock:
                task_status[task_id]['status'] = 'failed'
                task_status[task_id]['logs'].append(f"❌ 任务失败: {str(e)}")
            logger.error(f"任务 {task_id} 失败: {e}")
        task_queue.task_done()


worker_thread = threading.Thread(target=task_worker, daemon=True)
worker_thread.start()


def generate_task_id():
    global task_counter
    with task_lock:
        task_counter += 1
        return f"task_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{task_counter}"


def run_training_task(task_id, params):
    """执行训练任务（直接在进程中运行，不使用脚本）"""
    import warnings
    warnings.filterwarnings('ignore')

    with task_lock:
        task_status[task_id]['status'] = 'running'
        task_status[task_id]['logs'].append("🚀 开始训练任务...")

    # 定义日志打印函数
    def log_print(msg):
        with task_lock:
            task_status[task_id]['logs'].append(msg)

    try:
        # ==================== 添加参数验证 ====================
        MODEL_PATH = params.get('model_path', '')
        DATA_YAML = params.get('data_yaml', '')

        if not MODEL_PATH:
            raise Exception("模型路径不能为空！请选择或输入模型配置文件（YAML）或预训练模型路径。")

        if not DATA_YAML:
            raise Exception("数据集路径不能为空！请选择数据集。")

        # 检查文件是否存在
        import os
        if not os.path.exists(MODEL_PATH):
            raise Exception(f"模型路径不存在：{MODEL_PATH}\n请检查路径是否正确。")

        if not os.path.exists(DATA_YAML):
            raise Exception(f"数据集路径不存在：{DATA_YAML}\n请检查路径是否正确。")

        # 检查文件扩展名
        ext = os.path.splitext(MODEL_PATH)[1].lower()
        if ext not in ['.pt', '.pth', '.yaml', '.yml']:
            raise Exception(f"不支持的模型格式：{ext}\n训练支持 .pt/.pth 预训练模型或 .yaml/.yml 配置文件。")

        log_print(f"✅ 参数验证通过")
        log_print(f"📌 模型路径: {MODEL_PATH}")
        log_print(f"📌 数据集: {DATA_YAML}")

        import torch
        from ultralytics import YOLO

        EPOCHS = params.get('epochs', 50)
        BATCH = params.get('batch', 16)
        IMGSZ = params.get('imgsz', 640)
        PROJECT = params.get('project', 'runs/train')
        NAME = params.get('name', f'exp_{task_id}')

        log_print(f"📌 配置: Epochs={EPOCHS}, Batch={BATCH}, ImgSz={IMGSZ}")
        log_print(f"📌 保存路径: {PROJECT}/{NAME}")
        log_print("⏳ 开始训练，这可能需要较长时间...")

        # 直接加载模型并训练
        model = YOLO(MODEL_PATH)

        # 自定义回调函数，用于实时更新日志
        def on_train_epoch_end(trainer):
            epoch = trainer.epoch + 1
            total_epochs = trainer.epochs
            loss = trainer.metrics.get('box_loss', 0)
            log_print(f"   📈 Epoch {epoch}/{total_epochs} completed | Loss: {loss:.4f}")

        # 添加回调
        model.add_callback('on_train_epoch_end', on_train_epoch_end)

        # 开始训练
        results = model.train(
            data=DATA_YAML,
            imgsz=IMGSZ,
            epochs=EPOCHS,
            batch=BATCH,
            workers=4,
            device='0' if torch.cuda.is_available() else 'cpu',
            project=PROJECT,
            name=NAME
        )

        log_print("✅ 训练完成！")
        log_print(f"📂 结果保存在: {PROJECT}/{NAME}")

        with task_lock:
            task_status[task_id]['status'] = 'completed'
            task_status[task_id]['result_path'] = os.path.join(PROJECT, NAME)

    except Exception as e:
        import traceback
        error_msg = f"❌ 训练失败: {str(e)}\n{traceback.format_exc()}"
        log_print(error_msg)
        with task_lock:
            task_status[task_id]['status'] = 'failed'


def run_validation_task(task_id, params):
    """执行验证任务"""
    import warnings
    warnings.filterwarnings('ignore')

    with task_lock:
        task_status[task_id]['status'] = 'running'
        task_status[task_id]['logs'].append("🔍 开始验证任务...")

    # 定义日志打印函数
    def log_print(msg):
        with task_lock:
            task_status[task_id]['logs'].append(msg)

    try:
        # ==================== 参数验证 ====================
        import os
        MODEL_PATH = params.get('model_path', '')
        DATA_YAML = params.get('data_yaml', '')

        if not MODEL_PATH:
            raise Exception("模型路径不能为空！请选择或输入 .pt 预训练模型路径。")

        if not DATA_YAML:
            raise Exception("数据集路径不能为空！请选择数据集。")

        if not os.path.exists(MODEL_PATH):
            raise Exception(f"模型路径不存在：{MODEL_PATH}")

        if not os.path.exists(DATA_YAML):
            raise Exception(f"数据集路径不存在：{DATA_YAML}")

        ext = os.path.splitext(MODEL_PATH)[1].lower()
        if ext not in ['.pt', '.pth']:
            raise Exception(f"验证需要 .pt 或 .pth 格式的预训练模型，当前格式：{ext}")

        log_print(f"✅ 参数验证通过")
        log_print(f"📌 模型路径: {MODEL_PATH}")
        log_print(f"📌 数据集: {DATA_YAML}")

        # ==================== 直接使用 YOLO 内置验证（简单稳定） ====================
        import torch
        from ultralytics import YOLO

        log_print("📌 正在加载模型...")
        model = YOLO(MODEL_PATH)
        log_print(f"   ✅ 模型加载完成")

        log_print("📌 正在验证...")
        log_print("   (这可能需要几分钟时间，请耐心等待...)")

        # 直接使用 YOLO 的 val 方法
        results = model.val(
            data=DATA_YAML,
            imgsz=params.get('imgsz', 640),
            device='0' if torch.cuda.is_available() else 'cpu',
            verbose=True
        )

        # ==================== 输出结果 ====================
        log_print("\n" + "=" * 80)
        log_print("📊 验证结果")
        log_print("=" * 80)
        log_print(f"🎯 mAP@0.5:         {results.box.map50:.4f}")
        log_print(f"🎯 mAP@0.75:        {results.box.map75:.4f}")
        log_print(f"🎯 mAP@0.5:0.95:    {results.box.map:.4f}")
        log_print(f"🎯 Precision (P):  {results.box.mp:.4f}")
        log_print(f"🎯 Recall (R):      {results.box.mr:.4f}")
        log_print("=" * 80)

        # 保存结果
        SAVE_DIR = os.path.join(DATA_CONFIG['data_dir'], f"confidence_analysis_result_{task_id}")
        os.makedirs(SAVE_DIR, exist_ok=True)
        result_file = os.path.join(SAVE_DIR, "validation_result.txt")
        with open(result_file, 'w', encoding='utf-8') as f:
            f.write("=" * 80 + "\n")
            f.write("📊 验证结果\n")
            f.write("=" * 80 + "\n")
            f.write(f"🎯 mAP@0.5:         {results.box.map50:.4f}\n")
            f.write(f"🎯 mAP@0.75:        {results.box.map75:.4f}\n")
            f.write(f"🎯 mAP@0.5:0.95:    {results.box.map:.4f}\n")
            f.write(f"🎯 Precision (P):  {results.box.mp:.4f}\n")
            f.write(f"🎯 Recall (R):      {results.box.mr:.4f}\n")

        log_print(f"\n✅ 结果已保存到: {result_file}")

        with task_lock:
            task_status[task_id]['status'] = 'completed'
            task_status[task_id]['logs'].append("✅ 验证完成！")

    except Exception as e:
        import traceback
        error_msg = f"❌ 验证失败: {str(e)}\n{traceback.format_exc()}"
        log_print(error_msg)
        with task_lock:
            task_status[task_id]['status'] = 'failed'


# ==================== 页面路由 ====================
@bp.route('/')
def index():
    return render_template('index.html', logged_in=is_logged_in(), username=session.get('username', ''))


@bp.route('/preview/<dir>/<filename>')
def preview_image(dir, filename):
    if not is_logged_in():
        return "请先登录", 401
    if '..' in filename or '..' in dir:
        return "无效路径", 400
    dir_map = {
        'public': STORAGE_CONFIG['public_dir'],
        'uploads': STORAGE_CONFIG['uploads_dir'],
        'results': STORAGE_CONFIG['results_dir'],
        'thumbs': STORAGE_CONFIG['thumbs_dir']
    }
    if dir not in dir_map:
        return "无效的目录", 400
    ext = os.path.splitext(filename)[1].lower()
    image_exts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
    if ext not in image_exts:
        return "该文件类型不支持预览", 400
    file_path = os.path.join(dir_map[dir], filename)
    if not os.path.exists(file_path):
        return "文件不存在", 404
    return render_template('preview.html', filename=filename, dir=dir, logged_in=is_logged_in())


# ==================== 用户认证 API ====================
@bp.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    confirm_password = data.get('confirm_password', '')

    # 【修复】禁止注册的用户名改为 lyh123
    if username.strip().lower() == "lyh123":
        return api_response(message="该用户名已被系统保留，无法注册", code=403)

    if not username or not password:
        return api_response(message="用户名和密码不能为空", code=400)
    if len(username) < 3:
        return api_response(message="用户名至少3个字符", code=400)
    if len(password) < 6:
        return api_response(message="密码至少6个字符", code=400)
    if password != confirm_password:
        return api_response(message="两次密码输入不一致", code=400)

    users = load_users()
    if username in users:
        return api_response(message="用户名已存在", code=400)

    users[username] = {
        'password': hash_password(password),
        'created_at': time.time(),
        'role': 'user'
    }
    save_users(users)
    logger.info(f"新用户注册: {username}")
    return api_response(message="注册成功，请登录")


@bp.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return api_response(message="用户名和密码不能为空", code=400)

    users = load_users()
    if username not in users:
        return api_response(message="用户名或密码错误", code=401)

    if users[username]['password'] != hash_password(password):
        return api_response(message="用户名或密码错误", code=401)

    session['username'] = username
    session['role'] = users[username].get('role', 'user')
    session.permanent = True
    logger.info(f"用户登录: {username}")
    return api_response(data={'username': username, 'role': session['role']}, message="登录成功")


@bp.route('/api/auth/logout', methods=['POST'])
def api_logout():
    username = session.get('username', 'Unknown')
    session.pop('username', None)
    session.pop('role', None)
    logger.info(f"用户登出: {username}")
    return api_response(message="已退出登录")


@bp.route('/api/auth/status', methods=['GET'])
def api_auth_status():
    if is_logged_in():
        return api_response(
            data={'logged_in': True, 'username': session['username'], 'role': session.get('role', 'user')})
    else:
        return api_response(data={'logged_in': False})


# ==================== 火焰检测 API ====================
@bp.route('/api/detect/image', methods=['POST'])
def api_detect_image():
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    if 'file' not in request.files:
        return api_response(message="没有上传文件", code=400)

    file = request.files['file']
    if file.filename == '':
        return api_response(message="未选择文件", code=400)

    try:
        unique_name = generate_unique_filename(file.filename)
        original_path = os.path.join(STORAGE_CONFIG['uploads_dir'], unique_name)
        file.save(original_path)
        logger.info(f"收到检测任务: {file.filename} -> {unique_name}")

        result_image_name = f"result_{unique_name}"
        result_image_path = os.path.join(STORAGE_CONFIG['results_dir'], result_image_name)
        boxes, _ = detector.predict(original_path, result_image_path)

        thumb_name = f"thumb_{unique_name}"
        thumb_path = os.path.join(STORAGE_CONFIG['thumbs_dir'], thumb_name)
        generate_thumbnail(result_image_path, thumb_path)

        smoke_count = sum(1 for b in boxes if MODEL_CONFIG['class_names'][int(b[5])] == 'smoke')
        fire_count = sum(1 for b in boxes if MODEL_CONFIG['class_names'][int(b[5])] == 'fire')

        detections = []
        for box in boxes:
            x1, y1, x2, y2, conf, cls_id = box
            detections.append({
                'class': MODEL_CONFIG['class_names'][int(cls_id)],
                'confidence': round(float(conf), 2),
                'area': int((x2 - x1) * (y2 - y1)),
                'bbox': [int(x1), int(y1), int(x2), int(y2)]
            })

        base_url = request.host_url.rstrip('/')
        return api_response(data={
            'original_filename': file.filename,
            'thumbnail_url': f"{base_url}/storage/thumbs/{thumb_name}",
            'result_image_url': f"{base_url}/storage/results/{result_image_name}",
            'summary': {
                'total': len(boxes),
                'smoke_count': smoke_count,
                'fire_count': fire_count
            },
            'details': detections
        })

    except Exception as e:
        logger.error(f"检测失败: {e}", exc_info=True)
        return api_response(message=f"检测失败: {str(e)}", code=500)


# ==================== 文件存储 API ====================
@bp.route('/api/files/upload', methods=['POST'])
def api_upload_public_file():
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    if 'files' not in request.files:
        return api_response(message="没有选择文件", code=400)

    files = request.files.getlist('files')
    if not files:
        return api_response(message="文件列表为空", code=400)

    upload_results = []
    for file in files:
        if file.filename == '': continue
        if not is_file_allowed(file.filename):
            upload_results.append({'filename': file.filename, 'status': 'failed', 'message': '禁止上传该类型文件'})
            continue

        safe_filename = secure_filename_cn(file.filename)
        if os.path.exists(os.path.join(STORAGE_CONFIG['public_dir'], safe_filename)):
            name, ext = os.path.splitext(safe_filename)
            safe_filename = f"{name}_{int(time.time())}{ext}"

        try:
            save_path = os.path.join(STORAGE_CONFIG['public_dir'], safe_filename)
            file.save(save_path)
            file_size = os.path.getsize(save_path)
            upload_results.append({
                'filename': safe_filename, 'original_name': file.filename,
                'size': file_size, 'status': 'success',
                'download_url': f"{request.host_url.rstrip('/')}/storage/public/{safe_filename}"
            })
            logger.info(f"文件上传成功: {file.filename} -> {safe_filename}")
        except Exception as e:
            upload_results.append({'filename': file.filename, 'status': 'failed', 'message': str(e)})
            logger.error(f"文件上传失败: {file.filename}, 错误: {e}")

    success_count = sum(1 for r in upload_results if r['status'] == 'success')
    return api_response(data={'results': upload_results}, message=f"成功上传 {success_count}/{len(files)} 个文件")


@bp.route('/api/files/list', methods=['GET'])
def api_list_files():
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    target_dir = request.args.get('dir', 'public')
    dir_map = {
        'public': STORAGE_CONFIG['public_dir'],
        'uploads': STORAGE_CONFIG['uploads_dir'],
        'results': STORAGE_CONFIG['results_dir']
    }
    if target_dir not in dir_map: return api_response(message="无效的目录", code=400)

    dir_path = dir_map[target_dir]
    files = []
    if os.path.exists(dir_path):
        for filename in os.listdir(dir_path):
            filepath = os.path.join(dir_path, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                ext = os.path.splitext(filename)[1].lower()
                is_image = ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
                files.append({
                    'filename': filename,
                    'size': stat.st_size,
                    'upload_time': stat.st_mtime,
                    'is_image': is_image,
                    'dir': target_dir,
                    'download_url': f"{request.host_url.rstrip('/')}/storage/{target_dir}/{filename}"
                })
    files.sort(key=lambda x: x['upload_time'], reverse=True)
    return api_response(data={'dir': target_dir, 'files': files})


@bp.route('/api/files/delete', methods=['DELETE'])
def api_delete_file():
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    data = request.get_json()
    filename = data.get('filename')
    target_dir = data.get('dir', 'public')
    if not filename: return api_response(message="文件名不能为空", code=400)

    dir_map = {
        'public': STORAGE_CONFIG['public_dir'],
        'uploads': STORAGE_CONFIG['uploads_dir'],
        'results': STORAGE_CONFIG['results_dir']
    }
    if target_dir not in dir_map: return api_response(message="无效的目录", code=400)

    file_path = os.path.join(dir_map[target_dir], filename)
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        return api_response(message="文件不存在", code=404)

    try:
        os.remove(file_path)
        logger.info(f"文件删除成功: {target_dir}/{filename}")
        return api_response(message="删除成功")
    except Exception as e:
        logger.error(f"文件删除失败: {filename}, 错误: {e}")
        return api_response(message=f"删除失败: {str(e)}", code=500)


# ==================== 统一文件访问路由 ====================
@bp.route('/storage/<dir>/<filename>')
def serve_storage(dir, filename):
    if not is_logged_in():
        return "请先登录", 401

    dir_map = {
        'public': STORAGE_CONFIG['public_dir'],
        'uploads': STORAGE_CONFIG['uploads_dir'],
        'results': STORAGE_CONFIG['results_dir'],
        'thumbs': STORAGE_CONFIG['thumbs_dir']
    }
    if dir not in dir_map: return "无效的目录", 404
    if '..' in filename or filename.startswith('/'): return "无效的文件名", 400
    return send_from_directory(dir_map[dir], filename, as_attachment=request.args.get('download') == '1')


# ==================== 训练/验证任务 API（移除管理员限制） ====================
@bp.route('/api/tasks/submit', methods=['POST'])
def api_submit_task():
    """提交训练/验证任务（所有登录用户）"""
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    data = request.get_json()
    task_type = data.get('task_type')

    if task_type not in ['train', 'val']:
        return api_response(message="无效的任务类型", code=400)

    task_id = generate_task_id()

    with task_lock:
        task_status[task_id] = {
            'id': task_id,
            'type': task_type,
            'status': 'pending',
            'progress': 0,
            'logs': [f"📋 任务 {task_id} 已创建，等待执行..."],
            'result_path': None,
            'created_at': time.time(),
            'params': data
        }

    task_queue.put((task_id, task_type, data))

    logger.info(f"新任务提交: {task_id} ({task_type})")
    return api_response(data={'task_id': task_id}, message="任务已提交")


@bp.route('/api/tasks/list', methods=['GET'])
def api_list_tasks():
    """获取任务列表（所有登录用户）"""
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    with task_lock:
        tasks = list(task_status.values())
        tasks.sort(key=lambda x: x['created_at'], reverse=True)

    return api_response(data={'tasks': tasks})


@bp.route('/api/tasks/<task_id>/logs', methods=['GET'])
def api_get_task_logs(task_id):
    """获取任务日志（所有登录用户）"""
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    with task_lock:
        if task_id not in task_status:
            return api_response(message="任务不存在", code=404)
        logs = task_status[task_id]['logs'].copy()

    return api_response(data={'logs': logs})


@bp.route('/api/models/list', methods=['GET'])
def api_list_models():
    """检索服务器上的模型文件和YAML配置文件"""
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    # 定义要扫描的目录
    scan_dirs = [
        STORAGE_CONFIG['public_dir'],  # 公共存储目录
        os.path.join(BASE_DIR, 'weights'),  # 项目 weights 目录
        os.path.join(BASE_DIR, 'runs', 'train'),  # 训练输出目录
    ]

    models = []
    yamls = []

    for scan_dir in scan_dirs:
        if not os.path.exists(scan_dir):
            continue

        # 递归扫描目录
        for root, dirs, files in os.walk(scan_dir):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                full_path = os.path.join(root, file)

                # 收集模型文件
                if ext in ['.pt', '.pth']:
                    # 简化显示路径
                    rel_path = full_path
                    try:
                        rel_path = os.path.relpath(full_path, BASE_DIR)
                    except:
                        pass

                    models.append({
                        'name': file,
                        'path': full_path,
                        'display_path': rel_path,
                        'size': os.path.getsize(full_path),
                        'modified': os.path.getmtime(full_path)
                    })

                # 收集 YAML 配置文件
                if ext in ['.yaml', '.yml']:
                    # 简化显示路径
                    rel_path = full_path
                    try:
                        rel_path = os.path.relpath(full_path, BASE_DIR)
                    except:
                        pass

                    yamls.append({
                        'name': file,
                        'path': full_path,
                        'display_path': rel_path,
                        'size': os.path.getsize(full_path),
                        'modified': os.path.getmtime(full_path)
                    })

    # 按修改时间倒序排列
    models.sort(key=lambda x: x['modified'], reverse=True)
    yamls.sort(key=lambda x: x['modified'], reverse=True)

    return api_response(data={
        'models': models,
        'yamls': yamls
    })


# ==================== 新增：数据集管理 API ====================
@bp.route('/api/datasets/list', methods=['GET'])
def api_list_datasets():
    """获取数据集列表"""
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    datasets = load_datasets()
    return api_response(data={'datasets': datasets})


@bp.route('/api/datasets/add', methods=['POST'])
def api_add_dataset():
    """添加新数据集"""
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    data = request.get_json()
    name = data.get('name', '').strip()
    path = data.get('path', '').strip()
    set_default = data.get('set_default', False)

    if not name or not path:
        return api_response(message="数据集名称和路径不能为空", code=400)

    # 检查路径是否存在
    if not os.path.exists(path):
        return api_response(message="数据集路径不存在，请检查路径是否正确", code=400)

    datasets = load_datasets()

    # 如果设为默认，先取消其他的默认
    if set_default:
        for ds in datasets:
            ds['is_default'] = False

    # 生成唯一ID
    dataset_id = f"dataset_{int(time.time())}"

    new_dataset = {
        "id": dataset_id,
        "name": name,
        "path": path,
        "is_default": set_default if set_default else len(datasets) == 0,  # 第一个自动设为默认
        "created_at": time.time()
    }

    datasets.append(new_dataset)
    save_datasets(datasets)

    logger.info(f"新数据集添加: {name} -> {path}")
    return api_response(data={'dataset': new_dataset}, message="数据集添加成功")


@bp.route('/api/datasets/delete', methods=['POST'])
def api_delete_dataset():
    """删除数据集"""
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    data = request.get_json()
    dataset_id = data.get('id', '')

    if not dataset_id:
        return api_response(message="数据集ID不能为空", code=400)

    datasets = load_datasets()
    new_datasets = [ds for ds in datasets if ds['id'] != dataset_id]

    if len(new_datasets) == len(datasets):
        return api_response(message="数据集不存在", code=404)

    # 如果删除的是默认数据集，将第一个设为默认
    if len(new_datasets) > 0 and not any(ds['is_default'] for ds in new_datasets):
        new_datasets[0]['is_default'] = True

    save_datasets(new_datasets)
    logger.info(f"数据集删除: {dataset_id}")
    return api_response(message="数据集删除成功")


@bp.route('/api/datasets/set-default', methods=['POST'])
def api_set_default_dataset():
    """设置默认数据集"""
    if not is_logged_in():
        return api_response(message="请先登录", code=401)

    data = request.get_json()
    dataset_id = data.get('id', '')

    if not dataset_id:
        return api_response(message="数据集ID不能为空", code=400)

    datasets = load_datasets()
    found = False

    for ds in datasets:
        if ds['id'] == dataset_id:
            ds['is_default'] = True
            found = True
        else:
            ds['is_default'] = False

    if not found:
        return api_response(message="数据集不存在", code=404)

    save_datasets(datasets)
    logger.info(f"设置默认数据集: {dataset_id}")
    return api_response(message="默认数据集设置成功")

