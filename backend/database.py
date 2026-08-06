"""数据库：通过 Supabase REST API 操作（不需psycopg2）"""
import os
import time
import requests
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://lzyrulkuerxojuikwpam.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eXJ1bGt1ZXJ4b2p1aWt3cGFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg1MzE3MywiZXhwIjoyMTAwNDI5MTczfQ.BGSasxR0O_ercCWPw06RPSVUkQjSYufh1KIAUc1AiD8")

def h(svc=False):
    key = SUPABASE_KEY if svc else os.environ.get("SUPABASE_ANON_KEY", "")
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=representation"}

def api(method, table, params="", data=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    r = requests.request(method, url, headers=h(True), json=data, timeout=15)
    return r.json() if r.ok else (r.text if not r.ok else [])

def get_user(email):
    users = api("GET", "users", f"?email=eq.{email}&limit=1")
    return users[0] if users else None

def create_user(email, pw_hash, name="", role="user"):
    return api("POST", "users", data={"email":email,"password_hash":pw_hash,"name":name,"role":role})

def get_enabled_plans():
    return api("GET", "subscription_plans", "?enabled=eq.true&order=sort_order.asc")

def get_plan(pid):
    p = api("GET", "subscription_plans", f"?id=eq.{pid}&limit=1")
    if not isinstance(p, list) or not p:
        p = api("GET", "subscription_plans", f"?slug=eq.{pid}&limit=1")
    return p[0] if isinstance(p, list) and p else None

def update_plan(pid, data):
    api("PATCH", "subscription_plans", f"?id=eq.{pid}", data)
    return True

def get_all_plans():
    return api("GET", "subscription_plans", "?order=sort_order.asc")

def get_sub(user_id):
    s = api("GET", "user_subscriptions", f"?user_id=eq.{user_id}&select=*,plan:plan_id(*)&limit=1")
    return s[0] if s else None

def get_usage(user_id, action, since):
    u = api("GET", "usage_records", f"?user_id=eq.{user_id}&action=eq.{action}&created_at=gte.{since.isoformat()}&select=count")
    return u[0]["count"] if u else 0

def get_effective_usage(user_id, since):
    """Get effective search usage counting both search (cost=+1) and referral_reward (cost=-5)"""
    searches = api("GET", "usage_records", f"?user_id=eq.{user_id}&action=eq.search&created_at=gte.{since.isoformat()}&select=cost")
    rewards = api("GET", "usage_records", f"?user_id=eq.{user_id}&action=eq.referral_reward&created_at=gte.{since.isoformat()}&select=cost")
    search_sum = sum(r["cost"] for r in (searches or []) if r.get("cost"))
    reward_sum = sum(r["cost"] for r in (rewards or []) if r.get("cost"))
    return max(0, search_sum + reward_sum)

def add_usage(user_id, action="search"):
    api("POST", "usage_records", data={"user_id":user_id,"action":action,"cost":1})

def get_payments(user_id):
    return api("GET", "payment_records", f"?user_id=eq.{user_id}&order=created_at.desc&limit=20")

def get_all_users():
    return api("GET", "users", "?order=created_at.desc&limit=100")

_STATS_CACHE = {"t": 0.0, "data": None}

def get_stats():
    now = time.time()
    if _STATS_CACHE["data"] is not None and now - _STATS_CACHE["t"] < 60:
        return _STATS_CACHE["data"]
    def count(t, f=""):
        c = api("GET", t, f"?select=count{f}")
        return c[0]["count"] if c else 0
    def today_count(t, f=""):
        today = datetime.utcnow().date().isoformat()
        c = api("GET", t, f"?select=count&created_at=gte.{today}{f}")
        return c[0]["count"] if c else 0
    def revenue():
        ps = api("GET", "payment_records", "?status=eq.completed&select=amount")
        return round(sum(float(p.get("amount", 0)) for p in (ps if isinstance(ps, list) else [])), 2)
    VISIT_OR = "&or=(action.eq.visit_app,action.eq.visit_home)"
    calls = {
        "total_users": (count, ("users",)),
        "active_subs": (count, ("user_subscriptions", "&status=eq.active")),
        "total_searches": (count, ("usage_records", "&action=eq.search")),
        "total_descriptions": (count, ("usage_records", "&action=eq.ai_description")),
        "today_searches": (today_count, ("usage_records", "&action=eq.search")),
        "today_descriptions": (today_count, ("usage_records", "&action=eq.ai_description")),
        "total_payments": (count, ("payment_records", "&status=eq.completed")),
        "revenue": (revenue, ()),
        "today_visits": (today_count, ("usage_records", VISIT_OR)),
        "today_logins": (today_count, ("usage_records", "&action=eq.login")),
        "total_visits": (count, ("usage_records", VISIT_OR)),
        "total_shares": (count, ("usage_records", "&action=eq.share")),
        "today_shares": (today_count, ("usage_records", "&action=eq.share")),
    }
    with ThreadPoolExecutor(max_workers=11) as ex:
        futs = {ex.submit(fn, *args): key for key, (fn, args) in calls.items()}
        result = {name: fut.result() for fut, name in futs.items()}
    _STATS_CACHE.update(t=now, data=result)
    return result

def sum_payments():
    ps = api("GET", "payment_records", "?status=eq.completed&select=amount")
    return round(sum(float(p.get("amount",0)) for p in (ps if isinstance(ps,list) else [])), 2)


def create_payment(user_id, plan_id, provider, amount, currency, status, provider_payment_id, provider_data=None):
    return api("POST", "payment_records", data={
        "user_id": user_id, "plan_id": plan_id, "provider": provider,
        "amount": amount, "currency": currency, "status": status,
        "provider_payment_id": provider_payment_id, "provider_data": provider_data
    })

def upsert_subscription(user_id, plan_id, provider="", payment_subscription_id=""):
    from datetime import timedelta
    existing = get_sub(user_id)
    data = {
        "user_id": user_id, "plan_id": plan_id, "status": "active",
        "payment_provider": provider, "payment_subscription_id": payment_subscription_id,
        "expires_at": (datetime.utcnow() + timedelta(days=30)).isoformat()
    }
    if existing:
        return api("PATCH", "user_subscriptions", f"?user_id=eq.{user_id}", data)
    return api("POST", "user_subscriptions", data=data)
def get_settings():
    s = api("GET", "system_settings")
    if not isinstance(s, list):
        return {}
    return {x["key"]: x["value"] for x in s} if s else {}

def set_setting(key, val):
    api("POST", "system_settings", data={"key":key,"value":val},
        headers_extra={"Prefer": "resolution=merge-duplicates"})
    return True


# ─── 活动追踪（访问/登录埋点）────────────────────────────

def track_event(action, user_id=None):
    """记录一条活动事件（visit_home / visit_app / login 等）"""
    try:
        data = {"action": action, "cost": 0}
        if user_id:
            data["user_id"] = user_id
        return api("POST", "usage_records", data=data)
    except Exception:
        return None

def get_recent_activity(limit=15):
    try:
        recs = api("GET", "usage_records", f"?order=created_at.desc&limit={limit}&select=id,user_id,action,created_at")
        users = api("GET", "users", "?limit=300&select=id,email")
        email_map = {u["id"]: u.get("email", "?") for u in (users or []) if u.get("id")}
        out = []
        for r in (recs or []):
            out.append({
                "time": r.get("created_at", ""),
                "action": r.get("action", ""),
                "email": email_map.get(r.get("user_id"), "anon"),
            })
        return out
    except Exception:
        return []

def get_daily_activity(days=7):
    try:
        since = (datetime.utcnow() - timedelta(days=days - 1)).date().isoformat()
        recs = api("GET", "usage_records", f"?created_at=gte.{since}&select=created_at,action&limit=2000")
        daily = {}
        for r in (recs or []):
            d = (r.get("created_at") or "")[:10]
            if not d:
                continue
            bucket = daily.setdefault(d, {"date": d, "visits": 0, "logins": 0, "searches": 0})
            a = r.get("action", "")
            if a in ("visit_app", "visit_home"):
                bucket["visits"] += 1
            elif a == "login":
                bucket["logins"] += 1
            elif a == "search":
                bucket["searches"] += 1
        return [daily[k] for k in sorted(daily)][-days:]
    except Exception:
        return []
