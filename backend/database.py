"""数据库配置：支持 SQLite（本地开发）和 Supabase PostgreSQL（生产）"""
import os
from datetime import datetime, timedelta
from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# 数据库连接：优先用环境变量（Render上配置），默认用SQLite本地开发
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./data/ml_pricing.db"
)

# 如果是 SQLite 需要额外参数
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    os.makedirs("data", exist_ok=True)
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args if connect_args else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=lambda: os.urandom(16).hex())
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(100), default="")
    role = Column(String(20), default="user")  # user / admin
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    subscription = relationship("UserSubscription", uselist=False, back_populates="user")
    usage = relationship("UsageRecord", back_populates="user")


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"
    id = Column(String(36), primary_key=True, default=lambda: os.urandom(16).hex())
    name = Column(String(100), nullable=False)
    slug = Column(String(50), unique=True, nullable=False)
    description = Column(Text, default="")
    price_monthly = Column(Float, default=0)
    price_yearly = Column(Float, default=0)
    search_limit_monthly = Column(Integer, default=0)  # -1 = 无限
    include_ai_description = Column(Boolean, default=False)
    enabled = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"
    id = Column(String(36), primary_key=True, default=lambda: os.urandom(16).hex())
    user_id = Column(String(36), ForeignKey("users.id"), unique=True)
    plan_id = Column(String(36), ForeignKey("subscription_plans.id"))
    status = Column(String(20), default="active")
    started_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    payment_provider = Column(String(50), default="")
    payment_subscription_id = Column(String(255), default="")
    user = relationship("User", back_populates="subscription")
    plan = relationship("SubscriptionPlan")


class UsageRecord(Base):
    __tablename__ = "usage_records"
    id = Column(String(36), primary_key=True, default=lambda: os.urandom(16).hex())
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    action = Column(String(50), nullable=False)
    cost = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    user = relationship("User", back_populates="usage")


class PaymentRecord(Base):
    __tablename__ = "payment_records"
    id = Column(String(36), primary_key=True, default=lambda: os.urandom(16).hex())
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    plan_id = Column(String(36), ForeignKey("subscription_plans.id"), nullable=True)
    provider = Column(String(50), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="USD")
    status = Column(String(20), default="pending")
    provider_payment_id = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String(100), primary_key=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def init_db():
    """创建所有表 + 种子数据"""
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        # 默认套餐
        plans_data = [
            ("free", "Free", "每日3次搜索，基础价格统计", 0, 0, 90, False, True, 1),
            ("pro", "Pro", "无限搜索 + AI定价建议 + AI商品描述", 19.99, 199.99, -1, True, True, 2),
            ("enterprise", "Enterprise", "全部功能 + API接入 + 专属支持", 99.99, 999.99, -1, True, True, 3),
            ("pay_per_search", "按次付费", "充值搜索次数，无需月费", 0, 0, 0, True, True, 4),
        ]
        for slug, name, desc, pm, py, slm, ai, en, so in plans_data:
            if not db.query(SubscriptionPlan).filter_by(slug=slug).first():
                db.add(SubscriptionPlan(
                    slug=slug, name=name, description=desc,
                    price_monthly=pm, price_yearly=py,
                    search_limit_monthly=slm, include_ai_description=ai,
                    enabled=en, sort_order=so,
                ))

        # 管理员（密码: admin123）
        from auth import hash_password
        if not db.query(User).filter_by(email="admin@mlprecios.com").first():
            db.add(User(
                email="admin@mlprecios.com",
                password_hash=hash_password("admin123"),
                name="Admin", role="admin",
            ))

        db.commit()
    finally:
        db.close()
