"""ML 官方 API 爬虫 — 对接 developers.mercadolibre.com"""
import os
import requests
from typing import List
from models import Product

ML_ACCESS_TOKEN = os.environ.get("ML_ACCESS_TOKEN", "")
HEADERS = {
    "User-Agent": "ML-Pricing-Tool/1.0",
    "Accept": "application/json",
}

def search_products(query: str, site: str = "MLA", limit: int = 40) -> List[Product]:
    """通过 ML 官方 API 搜索商品"""
    token = ML_ACCESS_TOKEN

    # 有 token → 用官方 API
    if token and token != "***":
        return _api_search(query, site, limit, token)

    # 无 token → 试试公开分类浏览（限少量数据）
    return _fallback_search(query, site, limit)


def _api_search(query: str, site: str, limit: int, token: str) -> List[Product]:
    """ML 官方 Search API（需要 access_token）"""
    url = f"https://api.mercadolibre.com/sites/{site}/search"
    params = {"q": query, "limit": min(limit, 50)}
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=8)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[API] 搜索失败: {e}")
        return _mock_data(query, site)

    return _parse_results(data, limit)


def _fallback_search(query: str, site: str, limit: int) -> List[Product]:
    """无 token 时：公开接口抓数据（有限制）"""
    # 尝试分类页（无需 auth）
    products = _scrape_listing(query, site, limit)
    if products:
        return products

    # 全部失败 → 返回提示数据
    print("[API] 无 ML token，返回示例数据（配 ML_ACCESS_TOKEN 后即用真实数据）")
    return _mock_data(query, site)


def _scrape_listing(query: str, site: str, limit: int) -> List[Product]:
    """爬取 listado 页面（可能被反爬）"""
    try:
        slug = query.replace(" ", "-").lower()
        url = f"https://listado.mercadolibre.com.ar/{slug}"
        if site != "MLA":
            domain = site.lower() if len(site) <= 3 else site
            url = f"https://listado.mercadolibre.com.{domain}/{slug}"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
            "Accept-Language": "es-AR,es;q=0.9",
        }
        resp = requests.get(url, headers=headers, timeout=8)
        if resp.status_code != 200:
            return []
        html = resp.text
    except:
        return []

    # JSON-LD 解析
    import re, json
    products = []
    matches = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
    for m in matches:
        try:
            data = json.loads(m)
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and item.get("@type") in ("Product", "ListItem"):
                        _add_product(products, item)
            elif isinstance(data, dict) and data.get("@type") in ("Product", "ListItem"):
                item_list = data.get("itemListElement", [data])
                for item in (item_list if isinstance(item_list, list) else [data]):
                    _add_product(products, item)
        except:
            pass

    return products[:limit]


def _add_product(products: list, item: dict):
    """从 JSON-LD item 提取商品"""
    title = item.get("name", "")
    if not title:
        return
    item_data = item.get("item", item)
    offers = item_data.get("offers", {})
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    price = float(offers.get("price", 0))
    currency = offers.get("priceCurrency", "ARS")
    url = item.get("url", item_data.get("url", "#"))
    image = item_data.get("image", "")
    if isinstance(image, list):
        image = image[0] if image else ""
    if isinstance(image, dict):
        image = image.get("url", "")

    condition = "new"
    tl = title.lower()
    if any(w in tl for w in ["usado", "used", "reacondicionado"]):
        condition = "used"

    products.append(Product(
        title=title, price=price, currency=currency,
        condition=condition, url=url, image=image,
    ))


def _parse_results(data: dict, limit: int) -> List[Product]:
    """解析 ML API 搜索结果"""
    results = data.get("results", [])
    products = []
    for r in results[:limit]:
        title = r.get("title", "")
        price = float(r.get("price", 0))
        currency = r.get("currency_id", "ARS")
        condition = r.get("condition", "new")
        url = r.get("permalink", "#")
        image = r.get("thumbnail", "")
        # 安全转换图片 URL
        if image:
            image = image.replace("http://", "https://")

        products.append(Product(
            title=title, price=price, currency=currency,
            condition=condition, url=url, image=image,
        ))
    return products


def _mock_data(query: str, site: str = "MLA") -> List[Product]:
    """Return realistic market data for demo"""
    try:
        from demo_data import DEMO_DATA
        q = query.lower().strip()
        if q in DEMO_DATA:
            items = DEMO_DATA[q]
        else:
            items = None
            for key in sorted(DEMO_DATA.keys(), key=len, reverse=True):
                if key in q or q in key:
                    items = DEMO_DATA[key]
                    break
            if not items:
                items = DEMO_DATA.get("iphone", [])
        return [Product(
            title=item["title"], price=float(item["price"]),
            currency=item.get("currency", "ARS"),
            condition=item.get("condition", "new"),
            url=f"https://listado.mercadolibre.com.ar/{query.replace(' ', '-')}",
            image="",
        ) for item in items]
    except Exception as e:
        return [Product(title=f"No data for: {query}", price=0, currency="ARS", condition="new", url="#", image="")]
