import sys
import os

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from web.app import create_app
from config.settings import WEB_CONFIG
from utils.logger import get_logger

logger = get_logger("Bootstrap")

if __name__ == '__main__':
    app = create_app()
    logger.info(f"启动服务: http://{WEB_CONFIG['host']}:{WEB_CONFIG['port']}")
    app.run(
        host=WEB_CONFIG['host'],
        port=WEB_CONFIG['port'],
        debug=WEB_CONFIG['debug']
    )