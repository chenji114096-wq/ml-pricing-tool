"""ML定价工具 - FastAPI后端（完整版：搜索 + 分析 + 用户 + 订阅 + 支付）"""
import os
import statistics
import re
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Query, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import (
    init_db, SessionLocal, User, SubscriptionPlan, UserSubscription, UsageRecord
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_user, require_admin, get_db
)
from payment import (
    check_usage, deduct_usage, stripe_create_checkout, mp_create_checkout,
    stripe_handle_webhook, mp_handle_webhook
)
from crawler import search_products
from ai_analysis import analyze_pricing, generate_description

# ── 初始化 ──
init_db()

app = FastAPI(title="ML Precios - Analizador de Precios con IA", version="2.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")

# ═══════════════════════════════════════════════════════════
# 认证 API
# ═══════════════════════════════════════════════════════════

class RegisterBody(BaseModel):
    email: str
    password: str
    name: str = ""

@app.post("/api/auth/register")
def register(body: RegisterBody, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(400, "该邮箱已注册")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
    )
    db.add(user)
    db.commit()
    token = create_access_token(user.id)
    return {"token": token, "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role}}


class LoginBody(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "邮箱或密码错误")
    if not user.is_active:
        raise HTTPException(403, "账号已被禁用")
    token = create_access_token(user.id)
    return {"token": token, "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role}}


@app.get("/api/auth/me")
def me(user=Depends(get_current_user)):
    if not user:
        return {"user": None}
    return {
        "user": {
            "id": user.id, "email": user.email, "name": user.name,
            "role": user.role, "created_at": user.created_at.isoformat(),
        }
    }


# ═══════════════════════════════════════════════════════════
# 套餐 API
# ═══════════════════════════════════════════════════════════

@app.get("/api/plans")
def list_plans(db: Session = Depends(get_db)):
    plans = db.query(SubscriptionPlan).order_by(SubscriptionPlan.sort_order).all()
    return [
        {
            "id": p.id, "slug": p.slug, "name": p.name,
            "description": p.description,
            "price_monthly": p.price_monthly, "price_yearly": p.price_yearly,
            "search_limit_monthly": p.search_limit_monthly,
            "include_ai_description": p.include_ai_description,
            "enabled": p.enabled,
        }
        for p in plans if p.enabled
    ]


@app.get("/api/subscription")
def get_subscription(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """获取当前用户的订阅状态和用量"""
    allowed, reason = False, "未登录"
    remaining = 0
    if user:
        allowed, reason = check_usage(user, "search")
        m = re.search(r'(\d+)', reason)
        remaining = int(m.group(1)) if m else 0

    active_plan = None
    if user and user.subscription and user.subscription.plan:
        active_plan = user.subscription.plan.slug

    return {
        "logged_in": user is not None,
        "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role} if user else None,
        "plan": active_plan or "free",
        "remaining": remaining,
        "message": reason,
    }


# ═══════════════════════════════════════════════════════════
# 支付 API
# ═══════════════════════════════════════════════════════════

class CheckoutBody(BaseModel):
    plan_id: str
    provider: str = "stripe"       # stripe / mercadopago
    is_yearly: bool = False

@app.post("/api/checkout")
def create_checkout(body: CheckoutBody, user=Depends(require_user), db: Session = Depends(get_db)):
    plan = db.query(SubscriptionPlan).filter_by(id=body.plan_id).first()
    if not plan:
        raise HTTPException(404, "套餐不存在")
    if not plan.enabled:
        raise HTTPException(400, "该套餐已停用")

    if body.provider == "stripe":
        url = stripe_create_checkout(plan, user, body.is_yearly)
    elif body.provider == "mercadopago":
        url = mp_create_checkout(plan, user, body.is_yearly)
    else:
        raise HTTPException(400, "不支持的支付方式")

    if not url:
        raise HTTPException(500, f"{body.provider} 支付暂未配置，请联系管理员")

    return {"checkout_url": url}


@app.post("/api/payment/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    ok = stripe_handle_webhook(payload, sig)
    return {"received": ok}


@app.post("/api/payment/mp/webhook")
async def mp_webhook(request: Request):
    data = await request.json()
    ok = mp_handle_webhook(data)
    return {"received": ok}


@app.get("/api/payment/history")
def payment_history(user=Depends(require_user), db: Session = Depends(get_db)):
    from database import PaymentRecord
    payments = db.query(PaymentRecord).filter_by(user_id=user.id).order_by(
        PaymentRecord.created_at.desc()
    ).limit(20).all()
    return [
        {
            "id": p.id, "amount": p.amount, "currency": p.currency,
            "provider": p.provider, "status": p.status,
            "created_at": p.created_at.isoformat(),
        }
        for p in payments
    ]


# ═══════════════════════════════════════════════════════════
# 核心功能 API（带用量检查）
# ═══════════════════════════════════════════════════════════

@app.get("/api/search")
def search(
    q: str = Query(..., description="商品关键词（西语）"),
    site: str = Query("MLA", description="站点"),
    user=Depends(get_current_user),
):
    # 用量检查
    if user:
        allowed, reason = check_usage(user, "search")
    else:
        allowed, reason = False, "请先登录"

    if not allowed:
        return JSONResponse(status_code=402, content={
            "error": "usage_limit",
            "message": reason,
            "need_payment": True,
        })

    # 执行搜索
    products = search_products(q, site=site)
    if not products:
        return {"error": "No se encontraron productos", "products": [], "stats": None, "ai": None}

    # 统计
    prices = [p.price for p in products]
    from models import PriceStats
    stats_obj = PriceStats(
        min_price=min(prices),
        max_price=max(prices),
        avg_price=round(statistics.mean(prices), 2),
        median_price=round(statistics.median(prices), 2),
        total_listings=len(products),
        price_range=f"${min(prices):,.0f} - ${max(prices):,.0f}",
    )
    stats_dict = {
        "min": stats_obj.min_price, "max": stats_obj.max_price,
        "avg": stats_obj.avg_price, "median": stats_obj.median_price,
        "total": stats_obj.total_listings,
        "range": stats_obj.price_range,
    }

    # AI 分析
    ai = None
    plan_slug = user.subscription.plan.slug if user and user.subscription and user.subscription.plan else "free"
    if plan_slug in ("pro", "enterprise") or user is None:
        ai_data = analyze_pricing(products, stats_obj, api_key=DEEPSEEK_API_KEY)
        ai = {
            "suggested_price": ai_data.suggested_price,
            "reason": ai_data.reason,
            "risk_level": ai_data.risk_level,
            "competitor_insight": ai_data.competitor_insight,
        }
    else:
        ai = {"suggested_price": stats_obj.median_price, "reason": "升级至Pro获取AI分析", "risk_level": "medio", "competitor_insight": ""}

    # 扣除用量
    if user:
        deduct_usage(user, "search")

    return {
        "query": q, "site": site, "total": len(products),
        "products": [{"title": p.title, "price": p.price, "currency": p.currency,
                       "condition": p.condition, "url": p.url, "image": p.image} for p in products[:20]],
        "stats": stats_dict,
        "ai": ai,
        "usage": {"remaining": reason},
    }


@app.get("/api/describe")
def describe(
    title: str = Query(...),
    price: float = Query(0),
    currency: str = Query("ARS"),
    features: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    if not user:
        raise HTTPException(401, "请先登录")
    # 检查套餐是否包含AI描述
    plan_slug = user.subscription.plan.slug if user.subscription and user.subscription.plan else "free"
    if plan_slug not in ("pro", "enterprise"):
        raise HTTPException(402, "升级至Pro/Enterprise可使用AI描述生成")

    feat_list = [f.strip() for f in features.split(",")] if features else []
    desc = generate_description(title, price, currency, feat_list, api_key=DEEPSEEK_API_KEY)

    deduct_usage(user, "describe")
    return {"title": title, "description_es": desc}


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0"}


# ═══════════════════════════════════════════════════════════
# 管理后台 API
# ═══════════════════════════════════════════════════════════

from admin import router as admin_router
app.include_router(admin_router)


# ═══════════════════════════════════════════════════════════
# 静态文件
# ═══════════════════════════════════════════════════════════

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8899)
