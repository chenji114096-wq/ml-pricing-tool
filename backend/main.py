"""ML定价工具 - FastAPI后端 v2（Supabase REST API版）"""
import os, statistics, re, json
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Query, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from database import (
    get_user, create_user, get_enabled_plans, get_plan, update_plan,
    get_all_plans, get_sub, get_usage, add_usage, get_payments,
    get_all_users, get_stats, get_settings, set_setting
)
from auth import hash_password, verify_password, create_access_token, decode_token
from crawler import search_products
from ai_analysis import analyze_pricing, generate_description

app = FastAPI(title="ML Precios v2", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")

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
        raise HTTPException(401, "请先登录")
    return user

def require_admin(user=Depends(require_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "需要管理员权限")
    return user

def check_usage(user):
    sub = get_sub(user["id"])
    if not sub:
        return True, "免费：每日3次", 3
    
    plan = sub.get("plan")
    if not plan:
        return True, "免费：每日3次", 3
    
    if not plan.get("enabled"):
        return False, "当前套餐已停用", 0
    
    limit = plan.get("search_limit_monthly", 0)
    if limit < 0:
        return True, "无限", 999
    
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
    used = get_usage(user["id"], "search", start)
    if used >= limit:
        return False, f"本月已用{used}/{limit}次", limit - used
    return True, f"剩余{limit - used}次", limit - used


# ═══════════════════════════════════════════════════════════
# API 路由
# ═══════════════════════════════════════════════════════════

# ─── 认证 ────────────────────────────────────────────────

class AuthBody(BaseModel):
    email: str
    password: str
    name: str = ""

@app.post("/api/auth/register")
def register(body: AuthBody):
    if get_user(body.email):
        raise HTTPException(400, "该邮箱已注册")
    user = create_user(body.email, hash_password(body.password), body.name)
    if isinstance(user, list):
        user = user[0]
    token = create_access_token(user["id"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user.get("name",""), "role": user.get("role","user")}}

@app.post("/api/auth/login")
def login(body: AuthBody):
    user = get_user(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "邮箱或密码错误")
    token = create_access_token(user["id"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user.get("name",""), "role": user.get("role","user")}}

@app.get("/api/auth/me")
def me(user=Depends(get_current_user)):
    if not user:
        return {"user": None}
    return {"user": {"id": user["id"], "email": user["email"], "name": user.get("name",""), "role": user.get("role","user")}}

# ─── 套餐 ────────────────────────────────────────────────

@app.get("/api/plans")
def list_plans():
    return get_enabled_plans()

@app.get("/api/subscription")
def subscription(user=Depends(get_current_user)):
    if not user:
        return {"logged_in": False, "user": None, "plan": "free", "remaining": 3, "message": "未登录"}
    allowed, msg, remain = check_usage(user)
    sub = get_sub(user["id"])
    plan_slug = sub["plan"]["slug"] if sub and sub.get("plan") else "free"
    return {"logged_in": True, "user": {"id": user["id"], "email": user["email"], "name": user.get("name",""), "role": user.get("role","user")}, "plan": plan_slug, "remaining": remain, "message": msg}

# ─── 支付 ────────────────────────────────────────────────

@app.post("/api/checkout")
def checkout(data: dict, user=Depends(require_user)):
    plan = get_plan(data.get("plan_id", ""))
    if not plan or not plan.get("enabled"):
        raise HTTPException(400, "套餐不存在或已停用")
    # 暂无在线支付，返回计划信息
    return {"checkout_url": None, "plan": plan["name"], "amount": plan["price_monthly"], "message": "在线支付待配置，请联系管理员"}

@app.get("/api/payment/history")
def payment_history(user=Depends(require_user)):
    return get_payments(user["id"])

# ─── 管理后台 ────────────────────────────────────────────

@app.get("/api/admin/stats")
def admin_stats(admin=Depends(require_admin)):
    return get_stats()

@app.get("/api/admin/plans")
def admin_plans(admin=Depends(require_admin)):
    plans = get_all_plans()
    for p in plans:
        subs = get_sub(p["id"])
        p["subscriber_count"] = 1 if subs else 0
    return plans

@app.patch("/api/admin/plans/{plan_id}")
def admin_update_plan(plan_id: str, data: dict, admin=Depends(require_admin)):
    update_plan(plan_id, data)
    return {"ok": True}

@app.get("/api/admin/users")
def admin_users(admin=Depends(require_admin)):
    return get_all_users()

@app.get("/api/admin/settings")
def admin_settings(admin=Depends(require_admin)):
    return get_settings()

@app.post("/api/admin/settings")
def admin_set_setting(data: dict, admin=Depends(require_admin)):
    set_setting(data["key"], data.get("value", ""))
    return {"ok": True}

# ─── 核心功能（搜索+分析）──────────────────────────────

@app.get("/api/search")
def search(q: str = Query(...), site: str = Query("MLA"), user=Depends(get_current_user)):
    if not user:
        return JSONResponse(402, {"error":"usage_limit","message":"请先登录","need_payment":True})
    
    allowed, msg, remain = check_usage(user)
    if not allowed:
        return JSONResponse(402, {"error":"usage_limit","message":msg,"need_payment":True})
    
    products = search_products(q, site=site)
    if not products:
        return {"error":"No se encontraron productos","products":[],"stats":None,"ai":None}
    
    prices = [p.price for p in products]
    stats = {"min":min(prices),"max":max(prices),"avg":round(statistics.mean(prices),2),
             "median":round(statistics.median(prices),2),"total":len(prices),
             "range":f"${min(prices):,.0f} - ${max(prices):,.0f}"}
    
    from models import PriceStats
    so = PriceStats(min_price=stats["min"],max_price=stats["max"],avg_price=stats["avg"],
                    median_price=stats["median"],total_listings=stats["total"],price_range=stats["range"])
    ai_data = analyze_pricing(products, so, api_key=DEEPSEEK_API_KEY)
    ai = {"suggested_price":ai_data.suggested_price,"reason":ai_data.reason,
          "risk_level":ai_data.risk_level,"competitor_insight":ai_data.competitor_insight}
    
    add_usage(user["id"], "search")
    return {"query":q,"site":site,"total":len(products),
            "products":[{"title":p.title,"price":p.price,"currency":p.currency,
                         "condition":p.condition,"url":p.url,"image":getattr(p,'image','')} for p in products[:20]],
            "stats":stats,"ai":ai,"usage":{"remaining":msg}}

@app.get("/api/describe")
def describe(title: str = Query(...), price: float = Query(0), currency: str = Query("ARS"),
             features: Optional[str] = Query(None), user=Depends(require_user)):
    feat_list = [f.strip() for f in features.split(",")] if features else []
    desc = generate_description(title, price, currency, feat_list, api_key=DEEPSEEK_API_KEY)
    add_usage(user["id"], "describe")
    return {"title": title, "description_es": desc}

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0"}

# ─── 静态文件（前端）────────────────────────────────────

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888, log_level="info")
