"""ML定价工具 - FastAPI后端 v2（Supabase REST API版）"""
import os, statistics, re, json, hashlib, time, threading
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Query, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from database import (
    get_user, create_user, get_enabled_plans, get_plan, update_plan,
    get_all_plans, get_sub, get_usage, get_effective_usage, add_usage, get_payments,
    get_all_users, get_stats, get_settings, set_setting,
    upsert_subscription, track_event
)
from auth import hash_password, verify_password, create_access_token, decode_token
from crawler import search_products
from ai_analysis import analyze_pricing, generate_description
from tax_calc import calc_profit, format_profit, FX
from payment import mp_create_checkout, stripe_create_checkout


# ─── 搜索缓存（1小时）────────────────────────────
_SEARCH_CACHE_DIR = "/tmp/ml_search_cache"
_SEARCH_CACHE_TTL = 3600
def _cache_path(q, site, prefix="search"):
    key = hashlib.md5(f"{prefix}_{q}_{site}".encode()).hexdigest()
    return os.path.join(_SEARCH_CACHE_DIR, f"{key}.json")
def _cache_get(q, site, prefix="search"):
    path = _cache_path(q, site, prefix)
    if not os.path.exists(path): return None
    if time.time() - os.path.getmtime(path) > _SEARCH_CACHE_TTL:
        try: os.remove(path)
        except: pass
        return None
    with open(path) as f: return json.load(f)
def _cache_set(q, site, data, prefix="search"):
    try:
        os.makedirs(_SEARCH_CACHE_DIR, exist_ok=True)
        with open(_cache_path(q, site, prefix), "w") as f: json.dump(data, f)
    except: pass

app = FastAPI(title="ML Precios v2", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
# ─── 可配置限额（可通过环境变量覆盖）─────────────
ANON_DAILY = int(os.environ.get("ANON_DAILY_LIMIT", "3"))
ANON_TOTAL = int(os.environ.get("ANON_TOTAL_LIMIT", "100"))
FREE_DAILY = int(os.environ.get("FREE_DAILY_LIMIT", "10"))
FREE_TOTAL = int(os.environ.get("FREE_TOTAL_LIMIT", "100"))
SHARE_BONUS = int(os.environ.get("SHARE_BONUS", "5"))
REFERRAL_BONUS = int(os.environ.get("REFERRAL_BONUS", "5"))

# ─── 邀请码系统 ─────────────────────────────────
import base64, struct
_referral_cache = {}  # referral_code -> user_id

# ─── 匿名用户试用追踪（IP累计：50次）─────────────
from collections import defaultdict
_anon_usage = defaultdict(int)
_anon_daily = defaultdict(lambda: defaultdict(int))

def check_anon_usage(ip: str):
    used = _anon_usage[ip]
    limit = 100
    if used >= limit:
        return False, f"Prueba gratuita agotada ({used}/{limit}). Iniciá sesión para obtener más búsquedas"
    return True, f"Has usado {used} de {limit} búsquedas gratuitas. Te quedan {limit - used}"


def _make_referral_code(user_id: str) -> str:
    """从user_id生成6位邀请码"""
    h = hashlib.sha256(user_id.encode()).hexdigest()
    code = ''.join(c for c in h.upper() if c.isalnum())[:6]
    return code

def _find_user_by_referral(code: str):
    """通过邀请码查找用户"""
    if code in _referral_cache:
        return _referral_cache[code]
    # 查找所有用户（小规模，可接受）
    from database import get_all_users
    users = get_all_users()
    if not isinstance(users, list):
        return None
    for u in users:
        if _make_referral_code(u["id"]) == code.upper():
            _referral_cache[code] = u["id"]
            return u["id"]
    return None

def _get_ref_bonus(user_id: str) -> int:
    """获取用户已获得的邀请奖励（搜索次数）"""
    from datetime import datetime
    from database import get_usage
    start = datetime(2000, 1, 1)
    r = get_usage(user_id, "referral_reward", start)
    return abs(r) if r else 0


# ─── 辅助函数 ────────────────────────────────────────────

def get_current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    uid = decode_token(auth[7:])
    if not uid:
        return None
    user = get_user_by_id(uid)
    return user

def get_user_by_id(uid):
    import requests as req
    from database import SUPABASE_URL, SUPABASE_KEY
    r = req.get(f"{SUPABASE_URL}/rest/v1/users?id=eq.{uid}&limit=1",
                headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"},
                timeout=10)
    data = r.json()
    return data[0] if data else None

def require_user(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Iniciá sesión primero")
    return user

def require_admin(user=Depends(require_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Se requiere permisos de administrador")
    return user

def check_usage(user):
    sub = get_sub(user["id"])
    # Free user or no subscription: enforce daily + total limits
    if not sub or not sub.get("plan"):
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        daily = get_usage(user["id"], "search", today_start)
        if daily >= FREE_DAILY:
            return False, f"Límite diario alcanzado ({FREE_DAILY})", 0
        ever_start = datetime.utcnow().replace(year=2000, month=1, day=1)
        total = get_usage(user["id"], "search", ever_start)
        if total >= FREE_TOTAL:
            return False, f"Superaste las {FREE_TOTAL} búsquedas gratis. Actualizá tu plan", 0
        remaining_today = FREE_DAILY - daily
        total_left = FREE_TOTAL - total
        if total_left <= 0:
            return False, f"Agotaste las {FREE_TOTAL} búsquedas gratis. Actualizá tu plan", 0
        return True, f"Te quedan {remaining_today} búsquedas hoy", remaining_today
    
    plan = sub.get("plan")
    
    if not plan.get("enabled"):
        return False, "El plan actual está deshabilitado", 0
    
    limit = plan.get("search_limit_monthly", 0)
    if limit < 0:
        return True, "Ilimitado", 999
    
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
    used = get_effective_usage(user["id"], start)
    if used >= limit:
        return False, f"Límite mensual alcanzado ({used}/{limit}). Actualizá tu plan", limit - used
    return True, f"Restan {limit - used} búsquedas", limit - used


# ═══════════════════════════════════════════════════════════
# API 路由
# ═══════════════════════════════════════════════════════════

# ─── 认证 ────────────────────────────────────────────────

class AuthBody(BaseModel):
    email: str
    password: str
    name: str = ""
    referral_code: str = ""

@app.post("/api/auth/register")
def register(body: AuthBody):
    if get_user(body.email):
        raise HTTPException(400, "Este email ya está registrado")
    user = create_user(body.email, hash_password(body.password), body.name)
    if isinstance(user, list):
        user = user[0]
    # Auto-claim referral code
    if body.referral_code:
        try:
            from fastapi import Request as _Req
            rc = body.referral_code.strip().upper()
            if len(rc) == 6 and rc != _make_referral_code(user["id"]):
                referrer_id = _find_user_by_referral(rc)
                if referrer_id:
                    from database import api as _api
                    _api("POST", "usage_records", data={"user_id": referrer_id, "action": "referral_reward", "cost": -REFERRAL_BONUS})
                    _api("POST", "usage_records", data={"user_id": user["id"], "action": "referral_claimed", "cost": 0})
        except Exception:
            pass
    token = create_access_token(user["id"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user.get("name",""), "role": user.get("role","user")}}

def _track_login(uid):
    try:
        track_event("login", uid)
    except Exception:
        pass

@app.post("/api/auth/login")
def login(body: AuthBody):
    user = get_user(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Email o contraseña incorrectos")
    token = create_access_token(user["id"])
    try:
        threading.Thread(target=_track_login, args=(user["id"],), daemon=True).start()
    except Exception:
        pass
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user.get("name",""), "role": user.get("role","user")}}

@app.get("/api/auth/me")
def me(user=Depends(get_current_user)):
    if not user:
        return {"user": None}
    return {"user": {"id": user["id"], "email": user["email"], "name": user.get("name",""), "role": user.get("role","user")}}

class VisitBody(BaseModel):
    page: str = "app"
    action: str = ""

@app.post("/api/track/visit")
def track_visit(body: VisitBody = None, request: Request = None, user=Depends(get_current_user)):
    """匿名访问埋点：首页 /precios/ 应用页加载时上报；action=share 记录分享"""
    try:
        if request:
            ua = (request.headers.get("user-agent") or "").lower()
            if any(b in ua for b in ("bot", "spider", "crawl", "harvest", "wordpress",
                                     "pricingcompass", "python-requests", "curl", "wget", "go-http")):
                return {"ok": True}
        if body and body.action == "share":
            track_event("share", user["id"] if user else None)
            return {"ok": True}
        page = body.page if body else "app"
        track_event("visit_home" if page == "home" else "visit_app", user["id"] if user else None)
    except Exception:
        pass
    return {"ok": True}

# ─── 套餐 ────────────────────────────────────────────────

@app.get("/api/plans")
def list_plans():
    return get_enabled_plans()

@app.get("/api/subscription")
def subscription(user=Depends(get_current_user)):
    if not user:
        return {"logged_in": False, "user": None, "plan": "free", "remaining": 3, "message": "No has iniciado sesión"}
    allowed, msg, remain = check_usage(user)
    sub = get_sub(user["id"])
    plan_slug = sub["plan"]["slug"] if sub and sub.get("plan") else "free"
    ref_code = _make_referral_code(user["id"])
    ref_bonus = _get_ref_bonus(user["id"])
    sub_remaining = remain if isinstance(remain, int) else 0
    sub_limit = FREE_DAILY
    if sub and sub.get("plan"):
        pl = sub["plan"]
        if pl.get("search_limit_monthly"):
            sub_limit = pl["search_limit_monthly"]
    return {"logged_in": True, "user": {"id": user["id"], "email": user["email"], "name": user.get("name",""), "role": user.get("role","user")}, "plan": plan_slug, "remaining": sub_remaining, "limit": sub_limit, "message": msg, "referral_code": ref_code, "referral_bonus": ref_bonus}

# ─── 支付 ────────────────────────────────────────────────

@app.post("/api/checkout")
def checkout(data: dict, user=Depends(get_current_user)):
    plan = get_plan(data.get("plan_id", ""))
    if not plan or not plan.get("enabled"):
        raise HTTPException(400, "El plan no existe o está deshabilitado")
    price = plan.get("price_yearly") if data.get("is_yearly") else plan.get("price_monthly", 0)

    # Free plan: activate directly, no payment gateway
    if price <= 0:
        upsert_subscription(user["id"], plan["id"])
        return {
            "checkout_url": None,
            "plan": plan["name"],
            "amount": 0,
            "is_free": True,
            "message": "¡Plan Free activado! Disfrutá de tus búsquedas."
        }

    provider = data.get("provider", "mercadopago")
    checkout_url = None
    if provider == "stripe":
        checkout_url = stripe_create_checkout(plan, user, data.get("is_yearly", False))
    else:
        checkout_url = mp_create_checkout(plan, user, data.get("is_yearly", False))

    return {
        "checkout_url": checkout_url,
        "plan": plan["name"],
        "amount": price,
        "provider": provider,
        "message": "Redirigiendo al pago..." if checkout_url else "Pasarela de pago no configurada. Contactá al administrador"
    }

@app.get("/api/payment/history")
def payment_history():
    return get_payments(user["id"])

# ─── 管理后台 ────────────────────────────────────────────

@app.get("/api/admin/stats")
def admin_stats(admin=Depends(require_admin)):
    return get_stats()

@app.get("/api/admin/plans")
def admin_plans(admin=Depends(require_admin)):
    from database import api as _api
    plans = get_all_plans()
    if not isinstance(plans, list):
        return plans or []
    # 批量：一次拉全部订阅计数
    subs = _api("GET", "user_subscriptions", "?status=eq.active&select=plan_id&limit=1000")
    from collections import Counter
    plan_counts = Counter()
    if isinstance(subs, list):
        for s in subs:
            pid = s.get("plan_id")
            if pid:
                plan_counts[pid] += 1
    for p in plans:
        p["subscriber_count"] = plan_counts.get(p.get("id"), 0)
    return plans

@app.patch("/api/admin/plans/{plan_id}")
def admin_update_plan(plan_id: str, data: dict, admin=Depends(require_admin)):
    update_plan(plan_id, data)
    return {"ok": True}

@app.get("/api/admin/users")
def admin_users(admin=Depends(require_admin)):
    from database import api as _api
    users = get_all_users()
    if not isinstance(users, list) or not users:
        return []
    ids = [u["id"] for u in users]
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
    since = start.isoformat()

    # ── 批量：3 次调用替代 N+1 ──
    # 1) 订阅（含 plan）
    subs = _api("GET", "user_subscriptions",
                f"?user_id=in.({','.join(ids)})&select=user_id,plan:plan_id(slug)&limit=200")
    subs_map = {}
    if isinstance(subs, list):
        for s in subs:
            pl = s.get("plan") or {}
            subs_map[s.get("user_id")] = pl.get("slug") if isinstance(pl, dict) else str(pl) or "free"

    # 2) 本月所有 usage_records（search / ai_description / referral_reward 一次拉完）
    recs = _api("GET", "usage_records",
                f"?user_id=in.({','.join(ids)})&created_at=gte.{since}&select=user_id,action,cost&limit=2000")
    from collections import defaultdict
    search_cost = defaultdict(int)
    ai_count = defaultdict(int)
    if isinstance(recs, list):
        for r in recs:
            uid = r.get("user_id")
            act = r.get("action")
            cost = r.get("cost") or 0
            if act == "search":
                search_cost[uid] += cost
            elif act == "referral_reward":
                search_cost[uid] += cost  # 负值奖励，与 get_effective_usage 一致
            elif act == "ai_description":
                ai_count[uid] += 1

    enriched = []
    for u in users:
        uid = u["id"]
        enriched.append({
            "id": uid,
            "email": u.get("email", ""),
            "name": u.get("name", ""),
            "plan": subs_map.get(uid, "free"),
            "role": u.get("role", "user"),
            "created_at": u.get("created_at", ""),
            "search_used": max(0, search_cost.get(uid, 0)),
            "ai_used": ai_count.get(uid, 0),
        })
    return enriched

@app.get("/api/admin/payments")
def admin_payments(admin=Depends(require_admin)):
    from database import api as _api
    return _api("GET", "payment_records", "?order=created_at.desc&limit=50")

@app.get("/api/admin/settings")
def admin_settings(admin=Depends(require_admin)):
    return get_settings()

@app.post("/api/admin/settings")
def admin_set_setting(data: dict, admin=Depends(require_admin)):
    set_setting(data["key"], data.get("value", ""))
    return {"ok": True}

@app.get("/api/admin/activity")
def admin_activity(admin=Depends(require_admin)):
    from database import get_recent_activity, get_daily_activity
    return {"recent": get_recent_activity(15), "daily": get_daily_activity(7)}

# ─── 核心功能（搜索+分析）──────────────────────────────

@app.get("/api/search")
def search(q: str = Query(...), site: str = Query("MLA"), user=Depends(get_current_user), request: Request = None):
    if user:
        allowed, msg, remain = check_usage(user)
        if not allowed:
            return JSONResponse(content={"error":"usage_limit","message":msg,"need_payment":True}, status_code=402)
    else:
        # Anonymous user — IP-based trial: 3/day
        client_ip = request.client.host if request.client else "unknown"
        allowed, msg = check_anon_usage(client_ip)
        if not allowed:
            return JSONResponse(content={"error":"usage_limit","message":msg,"need_payment":True}, status_code=402)
        today = __import__("datetime").date.today().isoformat()
        remain = ANON_DAILY - _anon_daily[client_ip].get(today, 0)
    
    # 尝试从缓存读取
    cached = _cache_get(q, site)
    if cached:
        products_data = cached
        prices = [p["price"] for p in products_data]
    else:
        products = search_products(q, site=site)
        if not products:
            return {"error":"No se encontraron productos","products":[],"stats":None,"ai":None}
        products_data = [{"title":p.title,"price":p.price,"currency":p.currency,"condition":p.condition,"url":p.url,"image":getattr(p,"image","")} for p in products]
        _cache_set(q, site, products_data)
        prices = [p.price for p in products]
    
    SITE_CURRENCIES = {"MLA":"ARS","MLB":"BRL","MLM":"MXN","MLC":"CLP","MLU":"UYU"}
    currency = SITE_CURRENCIES.get(site, "ARS")
    stats = {"min":min(prices),"max":max(prices),"avg":round(statistics.mean(prices),2),
             "median":round(statistics.median(prices),2),"total":len(prices),
             "currency":currency,
             "range":f"${min(prices):,.0f} - ${max(prices):,.0f} {currency}"}
    
    from models import PriceStats, Product
    so = PriceStats(min_price=stats["min"],max_price=stats["max"],avg_price=stats["avg"],
                    median_price=stats["median"],total_listings=stats["total"],price_range=stats["range"])
    if cached and 'products' not in locals():
        products = [Product(**p) for p in products_data]
    ai_cached = _cache_get(q, site, prefix="ai")
    if ai_cached:
        ai = {"suggested_price": ai_cached.get("suggested_price"), "reason": ai_cached.get("reason"),
              "risk_level": ai_cached.get("risk_level"), "competitor_insight": ai_cached.get("competitor_insight")}
    else:
        ai_data = analyze_pricing(products, so, api_key="")
        ai = {"suggested_price":ai_data.suggested_price,"reason":ai_data.reason,
              "risk_level":ai_data.risk_level,"competitor_insight":ai_data.competitor_insight}
        try:
            _cache_set(q, site, ai, prefix="ai")
        except Exception as e:
            print(f"[AI cache] {e}")
    
    if user:
        add_usage(user["id"], "search")
    else:
        client_ip = request.client.host if request.client else "unknown"
        today = __import__("datetime").date.today().isoformat()
        _anon_usage[client_ip] += 1
        _anon_daily[client_ip][today] = _anon_daily[client_ip].get(today, 0) + 1
    # 利润计算：对每个产品算到手价+利润率
    products_with_profit = []
    for p in (products_data if cached else products)[:20]:
        if cached:
            price = p["price"]
            currency = p["currency"]
        else:
            price = p.price
            currency = p.currency
        profit = calc_profit(price, currency, cost_price=0)
        products_with_profit.append({
            "title": p["title"] if cached else p.title,
            "price": price,
            "currency": currency,
            "condition": p["condition"] if cached else p.condition,
            "url": p["url"] if cached else p.url,
            "image": p.get("image", "") if cached else getattr(p, "image", ""),
            "_profit": {
                "net": profit.net_profit, "margin": profit.profit_margin,
                "ml_fee": profit.ml_fee, "tax": profit.tax_amount,
                "shipping": profit.shipping_cost, "usd": profit.net_usd,
                "breakdown": profit.breakdown
            }
        })
    
    # 最佳利润分析
    if products_with_profit:
        margins = [pp["_profit"]["margin"] for pp in products_with_profit]
        best_idx = margins.index(max(margins))
        best = products_with_profit[best_idx]
        best_analysis = {
            "best_price": best["price"], "best_title": best["title"],
            "best_margin": best["_profit"]["margin"], "best_net": best["_profit"]["net"],
            "avg_margin": round(sum(margins) / len(margins), 1) if margins else 0,
        }
    else:
        best_analysis = None

    return {"query":q,"site":site,"total":len(products),
            "products": products_with_profit,
            "stats":stats,"ai":ai,
            "profit_analysis": best_analysis,
            "usage":{"remaining": (remain if user else (ANON_DAILY - _anon_daily[client_ip].get(today, 0))),
                     "limit": (FREE_DAILY if user else ANON_DAILY),
                     "message": (msg if user else f"Te quedan {ANON_DAILY - _anon_daily[client_ip].get(today, 0)} búsquedas hoy")}}

@app.get("/api/describe")
def describe(title: str = Query(...), price: float = Query(0), currency: str = Query("ARS"),
             features: Optional[str] = Query(None), user=Depends(require_user)):
    allowed, msg, remain = check_usage(user)
    if not allowed:
        raise HTTPException(402, msg)
    sub = get_sub(user["id"])
    if sub and sub.get("plan"):
        ai_limit = sub["plan"].get("include_ai_description", 0)
        if ai_limit and isinstance(ai_limit, (int, float)) and ai_limit > 0:
            start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
            ai_used = get_usage(user["id"], "ai_description", start)
            if ai_used >= int(ai_limit):
                raise HTTPException(402, f"Limite de descripciones IA alcanzado ({ai_used}/{int(ai_limit)})")
    feat_list = [f.strip() for f in features.split(",")] if features else []
    desc = generate_description(title, price, currency, feat_list, api_key=DEEPSEEK_API_KEY)
    add_usage(user["id"], "ai_description")
    return {"title": title, "description_es": desc}

@app.post("/api/share/bonus")
async def share_bonus(request: Request, user: dict = Depends(get_current_user)):
    if user:
        from database import api as _api
        start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
        search_used = get_effective_usage(user["id"], start)
        ai_used = get_usage(user["id"], "ai_description", start)
        sub = get_sub(user["id"])
        search_limit = 30
        ai_limit = 10
        if sub and sub.get("plan"):
            search_limit = sub["plan"].get("search_limit_monthly", 30) or 30
            ai_limit = sub["plan"].get("include_ai_description", 10) or 10
        if search_used >= search_limit and ai_used >= ai_limit:
            return {"ok": False, "message": "Ya alcanzaste el limite mensual"}
        if search_used < search_limit:
            _api("POST", "usage_records", data={"user_id": user["id"], "action": "referral_reward", "cost": -SHARE_BONUS})
        if ai_used < ai_limit:
            _api("POST", "usage_records", data={"user_id": user["id"], "action": "referral_reward", "cost": -1})
        return {"ok": True, "bonus": SHARE_BONUS, "message": f"+{SHARE_BONUS} busquedas, +1 descripcion IA"}
    ip = request.client.host if request.client else "unknown"
    current = _anon_usage[ip]
    if current >= ANON_TOTAL:
        return {"ok": False, "message": "Sin busquedas disponibles"}
    new_usage = max(0, current - SHARE_BONUS)
    _anon_usage[ip] = new_usage
    remaining = ANON_TOTAL - _anon_usage[ip]
    return {"ok": True, "bonus": SHARE_BONUS, "remaining": remaining}


@app.get("/api/ai/analyze")
def ai_analyze(q: str = Query(...), site: str = Query("MLA")):
    # 尝试从缓存读取
    cached = _cache_get(q, site, prefix="ai")
    if cached:
        return cached
    
    import statistics
    from crawler import search_products
    from models import PriceStats
    
    products = search_products(q, site=site, limit=20)
    if not products:
        return {"error": "no products"}
    
    prices = [p.price for p in products if p.price > 0]
    if not prices:
        return {"error": "no valid prices"}
    
    stats = PriceStats(
        min_price=min(prices), max_price=max(prices),
        avg_price=round(statistics.mean(prices), 2),
        median_price=round(statistics.median(prices), 2),
        total_listings=len(prices),
        price_range=f"${min(prices):,.0f} - ${max(prices):,.0f}"
    )
    
    from ai_analysis import analyze_pricing
    ai_data = analyze_pricing(products, stats, api_key=DEEPSEEK_API_KEY)
    
    result = {
        "suggested_price": ai_data.suggested_price,
        "reason": ai_data.reason,
        "risk_level": ai_data.risk_level,
        "competitor_insight": ai_data.competitor_insight,
        "currency": products[0].currency if products else "ARS",
    }
    
    _cache_set(q, site, result, prefix="ai")
    return result




@app.post("/api/referral/claim")
async def claim_referral(data: dict, user=Depends(get_current_user)):
    """新用户注册后用邀请码领取奖励"""
    if not user:
        raise HTTPException(401, "Iniciá sesión primero")
    code = data.get("code", "").strip().upper()
    if not code or len(code) != 6:
        return {"ok": False, "message": "Código de invitación inválido"}
    referrer_id = _find_user_by_referral(code)
    if not referrer_id:
        return {"ok": False, "message": "Código de invitación inválido"}
    if referrer_id == user["id"]:
        return {"ok": False, "message": "No podés invitarte a vos mismo"}
    # 检查是否已领过
    from database import api as _api
    existing = _api("GET", "usage_records", f"?user_id=eq.{user['id']}&action=eq.referral_claimed&limit=1")
    if existing and isinstance(existing, list) and len(existing) > 0:
        return {"ok": False, "message": "Ya reclamaste el bonus por invitación"}
    # 给邀请者加奖励
    _api("POST", "usage_records", data={"user_id": referrer_id, "action": "referral_reward", "cost": -REFERRAL_BONUS})
    # 标记已领取
    _api("POST", "usage_records", data={"user_id": user["id"], "action": "referral_claimed", "cost": 0})
    return {"ok": True, "bonus": REFERRAL_BONUS, "message": f"¡Has recibido {REFERRAL_BONUS} búsquedas gratis por invitación!"}

@app.get("/api/referral/code")
async def get_referral_code(user=Depends(get_current_user)):
    """获取当前用户的邀请码"""
    if not user:
        raise HTTPException(401, "Iniciá sesión primero")
    code = _make_referral_code(user["id"])
    bonus = _get_ref_bonus(user["id"])
    return {"code": code, "bonus_earned": bonus, "share_url": f"https://mlprecios.com?ref={code}"}

@app.get("/api/autocomplete")
async def autocomplete(q: str = "", site: str = "MLA"):
    import requests as req
    # Try official API first
    try:
        r = req.get(f"https://api.mercadolibre.com/sites/{site}/autosuggest?q={q}", timeout=5)
        if r.status_code == 200:
            return r.json()
    except:
        pass
    return {"suggested_queries": []}
@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0"}


# ─── 支付 Webhook ─────────────────────────────────────────

@app.post("/api/payment/mp/webhook")
async def mp_webhook(request: Request):
    from payment import mp_handle_webhook
    body = await request.json()
    result = mp_handle_webhook(body)
    return {"ok": result}

@app.post("/api/payment/stripe/webhook")
async def stripe_webhook(request: Request):
    from payment import stripe_handle_webhook
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    result = stripe_handle_webhook(payload, sig)
    return {"ok": result}

# ─── 卖家商品面板 ────────────────────────────────────────

@app.get("/api/seller/products")
def seller_list(category: str = Query(None), min_margin: float = Query(None),
                max_margin: float = Query(None), sort_by: str = Query("created_at"),
                sort_dir: str = Query("desc"), limit: int = Query(100), offset: int = Query(0),
                user=Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Inicia sesion primero")
    import sys; sys.path.insert(0, "/var/www/mlprecios/data")
    import seller
    return seller.list_products(user["id"], category, min_margin, max_margin, sort_by, sort_dir, limit, offset)

@app.post("/api/seller/products")
def seller_create(data: dict, user=Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Inicia sesion primero")
    if not data.get("title") or not data.get("selling_price"):
        raise HTTPException(400, "Faltan campos requeridos (title, selling_price)")
    import sys; sys.path.insert(0, "/var/www/mlprecios/data")
    import seller
    return seller.create_product(user["id"], data)

@app.patch("/api/seller/products/{product_id}")
def seller_update(product_id: str, data: dict, user=Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Inicia sesion primero")
    import sys; sys.path.insert(0, "/var/www/mlprecios/data")
    import seller
    result = seller.update_product(product_id, user["id"], data)
    if not result:
        raise HTTPException(404, "Producto no encontrado")
    return result

@app.delete("/api/seller/products/{product_id}")
def seller_delete(product_id: str, user=Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Inicia sesion primero")
    import sys; sys.path.insert(0, "/var/www/mlprecios/data")
    import seller
    if not seller.delete_product(product_id, user["id"]):
        raise HTTPException(404, "Producto no encontrado")
    return {"ok": True}

@app.get("/api/seller/categories")
def seller_categories(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Inicia sesion primero")
    import sys; sys.path.insert(0, "/var/www/mlprecios/data")
    import seller
    return seller.get_categories(user["id"])
# ─── 静态文件（前端）────────────────────────────────────


FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888, log_level="info")
