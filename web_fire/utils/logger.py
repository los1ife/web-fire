import logging
import os
from config.settings import BASE_DIR

# 日志目录
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)


def get_logger(name):
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

    # 文件处理器
    file_handler = logging.FileHandler(os.path.join(LOG_DIR, "app.log"), encoding='utf-8')
    file_handler.setFormatter(formatter)

    # 控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    return logger