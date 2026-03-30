from flask import Flask
from config.settings import WEB_CONFIG, STORAGE_CONFIG
from utils.logger import get_logger
import os

logger = get_logger(__name__)


def create_app():
    app = Flask(__name__,
                template_folder='templates',
                static_folder='static')

    # 【新增】配置 Session 密钥（用于加密用户登录状态）
    app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev_secret_key_change_in_production_123456')
    app.config['PERMANENT_SESSION_LIFETIME'] = 3600 * 24 * 7  # 登录状态保持7天

    # 加载配置
    app.config['MAX_CONTENT_LENGTH'] = WEB_CONFIG['max_content_length']

    # 注册路由
    from web.routes import bp as main_bp
    app.register_blueprint(main_bp)

    return app
