"""AI 分析模块
用 DeepSeek API 做：
1. 定价策略分析（建议定价 + 理由）
2. 西语商品描述自动生成
"""
from typing import List
from models import Product, PriceStats, AIAnalysis

# DeepSeek API
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_API_KEY = ""  # TODO: 从环境变量读取


def analyze_pricing(products: List[Product], stats: PriceStats, api_key: str = None) -> AIAnalysis:
    """
    用 AI 分析定价数据，给出建议定价和西语商品描述
    如果 API Key 没配，走规则引擎兜底
    """
    key = api_key or DEEPSEEK_API_KEY

    try:
        return _deepseek_analysis(products, stats, key)
    except Exception as e:
        print(f"[AI] API 调用失败: {e}，回退到规则引擎")
        return _rule_based_analysis(products, stats)



_desc_cache = {}

def generate_description(product_title: str, price: float, currency: str,
                         features: List[str] = None, api_key: str = None) -> str:
    """用 AI 生成西语商品描述"""
    cache_key = f"{product_title}_{price}_{currency}"
    if cache_key in _desc_cache:
        return _desc_cache[cache_key]
    
    key = api_key or DEEPSEEK_API_KEY
    if not key:
        return _template_description(product_title, price, currency, features)
    try:
        result = _deepseek_description(product_title, price, currency, features, key)
        if result and len(result) > 20:
            _desc_cache[cache_key] = result
        return result
    except Exception as e:
        print(f"[DESC ERROR] {e}")
        return _template_description(product_title, price, currency, features)


# ========================
# DeepSeek API 调用
# ========================

def _deepseek_analysis(products: List[Product], stats: PriceStats, api_key: str) -> AIAnalysis:
    """调 DeepSeek 做定价分析"""
    import requests
    import json

    # 取前 10 个商品作为样本
    samples = [{"title": p.title, "price": p.price} for p in products[:10]]

    currency = products[0].currency if products else "ARS"

    prompt = f"""
Eres un analista de precios para Mercado Libre en Latinoamérica.

Datos del mercado para este producto:
- Precio mínimo: {stats.min_price:.0f} {currency}
- Precio máximo: {stats.max_price:.0f} {currency}
- Precio promedio: {stats.avg_price:.0f} {currency}
- Precio mediano: {stats.median_price:.0f} {currency}
- Total de listings: {stats.total_listings}

Muestras de productos:
{json.dumps(samples, ensure_ascii=False, indent=2)}

Responde en español con:
1. PRECIO_SUGERIDO: [número - precio recomendado]
2. MOTIVO: [explicación breve de por qué ese precio]
3. RIESGO: [bajo/medio/alto]
4. INSIGHT: [observación competitiva útil para el vendedor]
"""

    resp = requests.post(
        DEEPSEEK_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": "deepseek-v4-flash",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 200,
        },
        timeout=15,
    )
    resp.raise_for_status()
    text = resp.json()["choices"][0]["message"]["content"]

    # 解析 AI 回复
    suggested = stats.median_price
    reason = text
    risk = "medio"
    insight = ""

    for line in text.split("\n"):
        line = line.strip()
        if "PRECIO_SUGERIDO" in line:
            nums = re.findall(r'[\d.]+', line)
            if nums:
                suggested = float(nums[0])
        elif "RIESGO" in line:
            risk = "bajo" if "bajo" in line.lower() else "medio" if "medio" in line.lower() else "alto"
        elif "INSIGHT" in line:
            insight = line.split(":", 1)[-1].strip() if ":" in line else ""

    description = ""  # 定价分析不需要描述
    return AIAnalysis(
        suggested_price=suggested,
        reason=reason,
        risk_level=risk,
        competitor_insight=insight,
        description_es=description,
    )


def _deepseek_description(title: str, price: float, currency: str,
                          features: List[str] = None, api_key: str = None) -> str:
    """用 DeepSeek 生成西语商品描述"""
    import requests
    import json

    feat_text = "\n".join([f"- {f}" for f in (features or [])])

    prompt = f"""
Eres un redactor experto en descripciones de productos para Mercado Libre.

Genera una descripción de producto en español (argentino) para:
Producto: {title}
Precio: {price:.0f} {currency}

Características:
{feat_text}

Requisitos:
- 3-4 párrafos
- Tono profesional pero cercano
- Incluir beneficios para el comprador
- Llamado a la acción al final
- NO usar emojis
- NO incluir precio en la descripción
"""

    resp = requests.post(
        DEEPSEEK_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": "deepseek-v4-flash",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "max_tokens": 200,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


# ========================
# 规则引擎兜底（无 API Key 时用）
# ========================

import re
import random


def _rule_based_analysis(products: List[Product], stats: PriceStats) -> AIAnalysis:
    """规则引擎：无 AI 时也给出有意义的分析"""
    # 建议定价 = 中位数略低（有竞争力）
    suggested = stats.median_price * 0.95

    # 找最便宜的卖家
    cheapest = min(products, key=lambda p: p.price) if products else None
    expensive = max(products, key=lambda p: p.price) if products else None

    # 获取货币
    currency = products[0].currency if products else "ARS"

    # 竞争强度判断
    listing_count = stats.total_listings
    if listing_count > 30:
        risk = "alto"
        insight = f"El mercado tiene {listing_count} listings. Competencia alta. "
        if cheapest:
            insight += f"El precio más bajo es {cheapest.price:.0f} {currency}."
    elif listing_count > 10:
        risk = "medio"
        insight = f"Mercado con {listing_count} listings. Competencia moderada."
    else:
        risk = "bajo"
        insight = f"Solo {listing_count} listings. Nicho con poca competencia."

    if cheapest and expensive:
        range_str = f"{cheapest.price:.0f} - {expensive.price:.0f} {currency}"
    else:
        range_str = f"{stats.min_price:.0f} - {stats.max_price:.0f} {currency}"

    reason = (
        f"Basado en {stats.total_listings} listings en Mercado Libre. "
        f"Rango de precios: {range_str}. "
        f"Precio mediano del mercado: {stats.median_price:.0f} {currency}. "
        f"Precio sugerido: {suggested:.0f} {currency} "
        f"({((suggested / max(stats.median_price, 1)) - 1) * 100:+.1f}% vs mediana)."
    )

    # 生成模板西语描述
    sample_title = products[0].title if products else "Producto"
    description = _template_description(sample_title, suggested, currency)

    return AIAnalysis(
        suggested_price=round(suggested, 2),
        reason=reason,
        risk_level=risk,
        competitor_insight=insight,
        description_es=description,
    )


def _template_description(title: str, price: float, currency: str,
                          features: List[str] = None) -> str:
    """模板描述（无 AI 时备用）"""
    feat_text = ""
    if features:
        for f in features[:5]:
            feat_text += f"\n✅ {f}"

    templates = [
        f"""Descripción del Producto

{title}

¿Buscas un producto de calidad? ¡Has llegado al lugar indicado!

Este producto ofrece el equilibrio perfecto entre calidad y precio. Diseñado para satisfacer las necesidades más exigentes del mercado actual.

Características destacadas:{feat_text}

¡Aprovecha esta oferta única en Mercado Libre! Compra con total confianza.

⚠️ Importante: Este producto es nuevo y original. Envío rápido a todo el país.""",

        f"""{title}

La mejor relación calidad-precio del mercado.

Ya sea para uso personal o profesional, este producto está diseñado para superar tus expectativas. Fabricado con materiales de primera calidad y con los más altos estándares de control.

¡No dejes pasar esta oportunidad! Haz tu pedido ahora y recíbelo en la puerta de tu casa.

🔹 Producto 100% original
🔹 Garantía incluida
🔹 Envío rápido""",
    ]

    return random.choice(templates)
