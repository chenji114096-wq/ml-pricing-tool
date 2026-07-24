"""支付集成（Stripe + MercadoPago）+ 用量管理"""
import json
import os
from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from database import (
    SessionLocal, User, UserSubscription, SubscriptionPlan,
    UsageRecord, PaymentRecord
)

# Stripe（可选 —— 没配KEY也能运行）
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
stripe = None
if STRIPE_SECRET_KEY:
    try:
        import stripe as _stripe
        _stripe.api_key = STRIPE_SECRET_KEY
        stripe = _stripe
    except ImportError:
        pass

# Mercado Pago（可选）
MP_ACCESS_TOKEN = os.environ.get("MP_ACCESS_TOKEN", "")
mp_sdk = None
if MP_ACCESS_TOKEN:
    try:
        import mercadopago
        mp_sdk = mercadopago.SDK(MP_ACCESS_TOKEN)
    except ImportError:
        pass

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:8000")
WEBHOOK_BASE = os.environ.get("WEBHOOK_BASE", FRONTEND_URL)

# ─── 用量检查 ────────────────────────────────────────────

def check_usage(user: User, action: str = "search") -> Tuple[bool, str]:
    """
    检查用户是否有可用额度。
    返回 (allowed: bool, reason: str)
    """
    db = SessionLocal()
    try:
        # 免费用户：每日限额
        if not user.subscription or not user.subscription.plan:
            return _check_daily_free(db, user, action)

        plan = user.subscription.plan
        if not plan.enabled:
            return False, "当前套餐已停用，请选择其他套餐"

        if plan.search_limit_monthly < 0:
            return True, "无限"

        # 按月统计用量
        start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        used = db.query(UsageRecord).filter(
            UsageRecord.user_id == user.id,
            UsageRecord.action == action,
            UsageRecord.created_at >= start_of_month,
        ).count()

        if used >= plan.search_limit_monthly:
            return False, f"本月额度已用完（{used}/{plan.search_limit_monthly}），请升级套餐或等待下月重置"

        remaining = plan.search_limit_monthly - used
        return True, f"剩余 {remaining} 次"
    finally:
        db.close()


def _check_daily_free(db: Session, user: User, action: str) -> Tuple[bool, str]:
    """未登录或免费计划的每日限额"""
    max_daily = 3
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    used = db.query(UsageRecord).filter(
        UsageRecord.user_id == user.id,
        UsageRecord.action == action,
        UsageRecord.created_at >= today_start,
    ).count()
    if used >= max_daily:
        return False, f"每日免费搜索已达上限（{used}/{max_daily}），请登录或购买套餐"
    remaining = max_daily - used
    return True, f"免费搜索剩余 {remaining} 次"


def deduct_usage(user: User, action: str = "search", cost: int = 1):
    """扣除用量"""
    db = SessionLocal()
    try:
        record = UsageRecord(user_id=user.id, action=action, cost=cost)
        db.add(record)
        db.commit()
    finally:
        db.close()


# ─── Stripe ──────────────────────────────────────────────

def stripe_create_checkout(plan: SubscriptionPlan, user: User, is_yearly: bool = False) -> Optional[str]:
    """创建 Stripe checkout session，返回 URL"""
    if not stripe:
        return None

    price = plan.price_yearly if is_yearly else plan.price_monthly
    if price <= 0:
        return None

    interval = "year" if is_yearly else "month"
    mode = "subscription" if plan.slug != "pay_per_search" else "payment"

    try:
        checkout = stripe.checkout.Session.create(
            customer_email=user.email,
            client_reference_id=user.id,
            mode=mode,
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"ML Precios - {plan.name}",
                        "description": plan.description,
                    },
                    "unit_amount": int(price * 100),
                    "recurring": {"interval": interval} if mode == "subscription" else None,
                },
                "quantity": 1,
            }],
            success_url=f"{FRONTEND_URL}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/payment/cancel",
            metadata={"plan_id": plan.id, "user_id": user.id, "is_yearly": str(is_yearly)},
        )
        return checkout.url
    except Exception as e:
        print(f"[Stripe] checkout error: {e}")
        return None


def stripe_handle_webhook(payload: bytes, sig_header: str) -> bool:
    """处理 Stripe webhook"""
    if not stripe:
        return False
    endpoint_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not endpoint_secret:
        return False

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except Exception:
        return False

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session["metadata"].get("user_id")
        plan_id = session["metadata"].get("plan_id")
        if user_id and plan_id:
            _activate_subscription(user_id, plan_id, "stripe", session["id"], session)
    elif event["type"] == "customer.subscription.deleted":
        subscription = event["data"]["object"]
        _cancel_stripe_subscription(subscription["id"])

    return True


# ─── Mercado Pago ────────────────────────────────────────

def mp_create_checkout(plan: SubscriptionPlan, user: User, is_yearly: bool = False) -> Optional[str]:
    """创建 Mercado Pago preference，返回 checkout URL"""
    if not mp_sdk:
        return None

    price = plan.price_yearly if is_yearly else plan.price_monthly
    if price <= 0:
        return None

    try:
        preference_data = {
            "items": [{
                "title": f"ML Precios - {plan.name}",
                "description": plan.description,
                "quantity": 1,
                "currency_id": "ARS" if is_yearly else "USD",
                "unit_price": float(price),
            }],
            "back_urls": {
                "success": f"{FRONTEND_URL}/payment/success",
                "failure": f"{FRONTEND_URL}/payment/cancel",
                "pending": f"{FRONTEND_URL}/payment/pending",
            },
            "auto_return": "approved",
            "external_reference": json.dumps({
                "user_id": user.id,
                "plan_id": plan.id,
                "is_yearly": is_yearly,
            }),
            "notification_url": f"{WEBHOOK_BASE}/api/payment/mp/webhook",
        }
        result = mp_sdk.preference().create(preference_data)
        if result.get("status") == 201:
            return result["response"]["init_point"]
        return None
    except Exception as e:
        print(f"[MP] preference error: {e}")
        return None


def mp_handle_webhook(data: dict) -> bool:
    """处理 Mercado Pago webhook"""
    if not mp_sdk:
        return False

    try:
        payment_id = data.get("data", {}).get("id")
        if not payment_id:
            # IPN notification
            payment_id = data.get("id")
        if not payment_id:
            return False

        payment = mp_sdk.payment().get(payment_id)
        if payment.get("status") == 200:
            pdata = payment["response"]
            if pdata.get("status") == "approved":
                ext_ref = json.loads(pdata.get("external_reference", "{}"))
                user_id = ext_ref.get("user_id")
                plan_id = ext_ref.get("plan_id")
                if user_id and plan_id:
                    _activate_subscription(user_id, plan_id, "mercadopago", str(payment_id), pdata)
        return True
    except Exception as e:
        print(f"[MP] webhook error: {e}")
        return False


# ─── 内部 ────────────────────────────────────────────────

def _activate_subscription(user_id: str, plan_id: str, provider: str, provider_payment_id: str, provider_data: dict):
    """支付成功后激活/更新订阅"""
    db = SessionLocal()
    try:
        plan = db.query(SubscriptionPlan).filter_by(id=plan_id).first()
        user = db.query(User).filter_by(id=user_id).first()
        if not plan or not user:
            return

        # 创建支付记录
        payment = PaymentRecord(
            user_id=user_id, plan_id=plan_id, provider=provider,
            amount=provider_data.get("amount", provider_data.get("transaction_amount", 0)),
            currency=provider_data.get("currency", "USD"),
            status="completed",
            provider_payment_id=provider_payment_id,
            provider_data=provider_data,
        )
        db.add(payment)

        # 更新或创建订阅
        sub = db.query(UserSubscription).filter_by(user_id=user_id).first()
        if sub:
            sub.plan_id = plan_id
            sub.status = "active"
            sub.payment_provider = provider
            sub.payment_subscription_id = provider_payment_id
            sub.expires_at = datetime.utcnow() + timedelta(days=30)
        else:
            sub = UserSubscription(
                user_id=user_id, plan_id=plan_id, status="active",
                expires_at=datetime.utcnow() + timedelta(days=30),
                payment_provider=provider, payment_subscription_id=provider_payment_id,
            )
            db.add(sub)

        db.commit()
    except Exception as e:
        print(f"[Payment] activate error: {e}")
        db.rollback()
    finally:
        db.close()


def _cancel_stripe_subscription(stripe_sub_id: str):
    """Stripe 取消订阅"""
    db = SessionLocal()
    try:
        sub = db.query(UserSubscription).filter_by(
            payment_provider="stripe", payment_subscription_id=stripe_sub_id
        ).first()
        if sub:
            sub.status = "cancelled"
            db.commit()
    finally:
        db.close()
