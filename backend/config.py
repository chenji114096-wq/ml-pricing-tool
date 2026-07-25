"""ML Precios - 可配置参数（env覆盖，否则用默认值）"""
import os

CONFIG = {
    # 匿名用户
    "anon_daily": int(os.getenv("ANON_DAILY_LIMIT", "3")),
    "anon_total": int(os.getenv("ANON_TOTAL_LIMIT", "100")),
    # 免费注册用户
    "free_daily": int(os.getenv("FREE_DAILY_LIMIT", "10")),
    "free_total": int(os.getenv("FREE_TOTAL_LIMIT", "100")),
    # 分享裂变
    "share_bonus": int(os.getenv("SHARE_BONUS", "5")),
    # 套餐默认价格
    "pro_price": float(os.getenv("PRO_PRICE", "9.99")),
    "empresa_price": float(os.getenv("EMPRESA_PRICE", "19.99")),
    "professional_price": float(os.getenv("PROFESSIONAL_PRICE", "39.99")),
}
