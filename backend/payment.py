"""支付集成（MercadoPago + Stripe）+ 用量管理"""
import json
import os
from datetime import datetime
from database import get_sub, get_plan, create_payment, upsert_subscription

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:8000")

# ─── Mercado Pago ────────────────────────────────────────

MP_ACCESS_TOKEN = os.environ.get("MP_ACCESS_TOKEN", "")

def mp_create_checkout(plan: dict, user: dict, is_yearly: bool = False) -> str | None:
    """创建 Mercado Pago preference"""
    if not MP_ACCESS_TOKEN:
        return None
    try:
        import mercadopago
        mp = mercadopago.SDK(MP_ACCESS_TOKEN)
        price = plan.get("price_yearly") if is_yearly else plan.get("price_monthly", 0)
        if price <= 0:
            return None
        pref = mp.preference().create({
            "items": [{
                "title": f"ML Precios - {plan['name']}",
                "quantity": 1,
                "currency_id": "ARS",
                "unit_price": float(price),
            }],
            "back_urls": {
                "success": FRONTEND_URL + "/payment/success",
                "failure": FRONTEND_URL + "/payment/cancel",
            },
            "auto_return": "approved",
            "external_reference": json.dumps({"user_id": user["id"], "plan_id": plan["id"], "is_yearly": is_yearly}),
            "notification_url": os.environ.get("WEBHOOK_BASE", FRONTEND_URL) + "/api/payment/mp/webhook",
        })
        if pref.get("status") == 201:
            return pref["response"]["init_point"]
    except Exception as e:
        print(f"[MP] Error: {e}")
    return None

# ─── Stripe ──────────────────────────────────────────────

STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

def stripe_create_checkout(plan: dict, user: dict, is_yearly: bool = False) -> str | None:
    """创建 Stripe Checkout Session"""
    if not STRIPE_KEY:
        return None
    try:
        import stripe
        stripe.api_key = STRIPE_KEY
        price = plan.get("price_yearly") if is_yearly else plan.get("price_monthly", 0)
        if price <= 0:
            return None
        session = stripe.checkout.Session.create(
            customer_email=user.get("email", ""),
            mode="subscription" if plan.get("slug") != "pay_per_search" else "payment",
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"ML Precios - {plan['name']}"},
                    "unit_amount": int(price * 100),
                    "recurring": {"interval": "month"} if plan.get("slug") != "pay_per_search" else None,
                },
                "quantity": 1,
            }],
            success_url=FRONTEND_URL + "/payment/success",
            cancel_url=FRONTEND_URL + "/payment/cancel",
            metadata={"user_id": user["id"], "plan_id": plan["id"]},
        )
        return session.url
    except Exception as e:
        print(f"[Stripe] Error: {e}")
    return None

# ─── Webhook Handlers ────────────────────────────────────

def mp_handle_webhook(data: dict) -> bool:
    """Mercado Pago webhook"""
    try:
        payment_id = data.get("data", {}).get("id") or data.get("id")
        if not payment_id or not MP_ACCESS_TOKEN:
            return False
        import mercadopago
        mp = mercadopago.SDK(MP_ACCESS_TOKEN)
        result = mp.payment().get(payment_id)
        if result.get("status") == 200:
            p = result["response"]
            if p.get("status") == "approved":
                ref = json.loads(p.get("external_reference", "{}"))
                activate(ref.get("user_id"), ref.get("plan_id"), "mercadopago", str(payment_id), {
                    "amount": p.get("transaction_amount", 0),
                    "currency": p.get("currency_id", "ARS"),
                })
        return True
    except Exception as e:
        print(f"[MP webhook] Error: {e}")
    return False

def stripe_handle_webhook(payload: bytes, sig: str) -> bool:
    """Stripe webhook"""
    try:
        import stripe
        stripe.api_key = STRIPE_KEY
        secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        if not secret:
            return False
        event = stripe.Webhook.construct_event(payload, sig, secret)
        if event["type"] == "checkout.session.completed":
            s = event["data"]["object"]
            activate(s["metadata"].get("user_id"), s["metadata"].get("plan_id"),
                     "stripe", s["id"], {"amount": s.get("amount_total", 0) / 100, "currency": s.get("currency", "usd")})
        return True
    except Exception as e:
        print(f"[Stripe webhook] Error: {e}")
    return False

# ─── Internal ────────────────────────────────────────────

def activate(user_id: str, plan_id: str, provider: str, payment_id: str, provider_data: dict):
    """支付成功 → 激活订阅 + 记录支付"""
    plan = get_plan(plan_id)
    if not plan:
        return
    amount = provider_data.get("amount", plan.get("price_monthly", 0))
    currency = provider_data.get("currency", "USD")
    create_payment(user_id, plan_id, provider, float(amount), currency, "completed", str(payment_id))
    upsert_subscription(user_id, plan_id, provider, str(payment_id))
