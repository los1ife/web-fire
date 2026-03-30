import os

# ==================== 项目根路径 ====================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ==================== 模型配置 ====================
# 模型目录
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")

MODEL_CONFIG = {
    # 自动拼接路径，指向 weights/best.pt
    "model_path": os.path.join(WEIGHTS_DIR, "best.pt"),
    "class_names": ['smoke', 'fire'],
    "conf_threshold": 0.2,
    "area_filter": 204080,
    "tile_size": (2500, 2500),
    "overlap_ratio": 0.25,
    "max_workers": 2
}

# ==================== 用户数据存储配置 ====================
DATA_CONFIG = {
    "data_dir": os.path.join(BASE_DIR, "data"),
    "users_file": os.path.join(BASE_DIR, "data", "users.json")
}

# 自动创建数据目录
if not os.path.exists(DATA_CONFIG['data_dir']):
    os.makedirs(DATA_CONFIG['data_dir'], exist_ok=True)


# ==================== 存储路径配置 ====================
STORAGE_CONFIG = {
    # 火焰检测业务目录
    "uploads_dir": os.path.join(BASE_DIR, "storage", "uploads"),
    "results_dir": os.path.join(BASE_DIR, "storage", "results"),
    "thumbs_dir": os.path.join(BASE_DIR, "storage", "thumbs"),
    # 【新增】公共存储目录（用户上传的任意文件）
    "public_dir": os.path.join(BASE_DIR, "storage", "public"),
}


# ==================== Web 服务配置 ====================
WEB_CONFIG = {
    "host": "0.0.0.0",
    "port": 5000,
    "debug": False,
    "max_content_length": 200 * 1024 * 1024,  # 【更新】最大支持200MB单文件
    "allowed_file_extensions": ["*"],  # 允许所有文件类型，如需限制可改为 ['.jpg','.pdf','.zip']
    "blocked_file_extensions": ['.exe', '.bat', '.cmd', '.sh', '.py']  # 禁止上传的可执行文件（安全防护）
}


# ==================== 启动前自检 ====================
def check_environment():
    print("正在检查项目环境...")

    # 1. 检查模型目录
    if not os.path.exists(WEIGHTS_DIR):
        os.makedirs(WEIGHTS_DIR)
        print(f"[提示] 已创建模型目录: {WEIGHTS_DIR}")
        print(f"[警告] 请将你的 best.pt 文件放入该目录后重启！")

    # 2. 检查模型文件
    if not os.path.exists(MODEL_CONFIG['model_path']):
        print(f"[错误] 找不到模型文件！")
        print(f"[错误] 请将模型重命名为 'best.pt' 并放置于: {WEIGHTS_DIR}")
        # 这里不抛出异常，让程序继续跑，直到真正加载模型时报错，给用户缓冲
    else:
        print(f"[成功] 找到模型文件: {MODEL_CONFIG['model_path']}")

    # 3. 自动创建存储目录
    for name, path in STORAGE_CONFIG.items():
        if not os.path.exists(path):
            os.makedirs(path, exist_ok=True)
            print(f"[提示] 已创建数据目录: {path}")


# 执行自检
check_environment()