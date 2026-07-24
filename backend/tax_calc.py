"""税费 + 汇率为 + 利润计算模块 — ML 卖家到手价"""
from dataclasses import dataclass
from typing import Optional

# ═══════════════════════════════════════════════════════════
# 汇率（USD 对各本地货币）— 可替换为实时 API
# ═══════════════════════════════════════════════════════════
FX = {
    "ARS": 1250.0,   # 1 USD = 1250 ARS (蓝美元近似)
    "BRL": 5.50,     # 1 USD = 5.50 BRL
    "MXN": 18.5,     # 1 USD = 18.5 MXN
    "CLP": 950.0,    # 1 USD = 950 CLP
    "UYU": 42.0,     # 1 USD = 42 UYU
    "PEN": 3.80,     # 1 USD = 3.80 PEN
    "USD": 1.0,
}

# ═══════════════════════════════════════════════════════════
# ML 佣金率（按站点 × 类别 × 信誉等级）
# 实际会浮动，这里用常见范围
# ═══════════════════════════════════════════════════════════
ML_FEES = {
    "MLA": {"default": 0.13, "premium": 0.11, "classic": 0.16},    # 阿根廷 11-16%
    "MLB": {"default": 0.14, "premium": 0.12, "classic": 0.18},    # 巴西 12-18%
    "MLM": {"default": 0.15, "premium": 0.13, "classic": 0.175},   # 墨西哥 13-17.5%
    "MLC": {"default": 0.13, "premium": 0.11, "classic": 0.16},    # 智利 11-16%
    "MLU": {"default": 0.12, "premium": 0.10, "classic": 0.15},    # 乌拉圭 10-15%
}

# ═══════════════════════════════════════════════════════════
# 各国税率 (IVA / VAT)
# ═══════════════════════════════════════════════════════════
TAXES = {
    "MLA": {"iva": 0.21, "income": 0.05, "name": "IVA (Argentina)"},
    "MLB": {"iva": 0.17, "income": 0.05, "name": "ICMS/ISS (Brasil)"},
    "MLM": {"iva": 0.16, "income": 0.03, "name": "IVA (México)"},
    "MLC": {"iva": 0.19, "income": 0.04, "name": "IVA (Chile)"},
    "MLU": {"iva": 0.22, "income": 0.04, "name": "IVA (Uruguay)"},
}

# ═══════════════════════════════════════════════════════════
# 运费估算（按国家，普通快递大概金额，单位 USD）
# ═══════════════════════════════════════════════════════════
SHIPPING_EST = {
    "MLA": 4.0,
    "MLB": 3.5,
    "MLM": 3.0,
    "MLC": 3.5,
    "MLU": 4.0,
}

@dataclass
class ProfitCalc:
    selling_price: float       # 售价（本地货币）
    currency: str              # ARS/BRL/MXN...
    ml_fee: float              # ML 佣金（本地货币）
    shipping_cost: float       # 运费（本地货币）
    tax_amount: float          # 税费（本地货币）
    net_profit: float          # 到手利润（本地货币）
    profit_margin: float       # 利润率 %
    price_usd: float           # 折合美元
    net_usd: float             # 到手美元
    breakdown: dict            # 详细拆分

def calc_profit(selling_price: float, currency: str = "ARS", cost_price: float = 0,
                seller_level: str = "default") -> ProfitCalc:
    """计算到手利润 & 利润率"""
    site = currency  # MLA→ARS 映射（currency 就是站点代码三位字母版）
    
    # 找对应站点
    for s in TAXES:
        if s == site or s == currency:
            site_key = s
            break
    else:
        site_key = "MLA"  # 默认阿根廷

    # 汇率
    fx = FX.get(currency, 1.0)
    
    # ML 佣金
    fee_rate = ML_FEES.get(site_key, {}).get(seller_level, 0.13)
    ml_fee = selling_price * fee_rate
    
    # 运费（折本地货币）
    shipping_usd = SHIPPING_EST.get(site_key, 4.0)
    shipping = shipping_usd * fx
    
    # 税费（IVA）
    tax_config = TAXES.get(site_key, {"iva": 0.21, "income": 0.05})
    iva = selling_price * tax_config["iva"]
    income_tax = selling_price * tax_config["income"]
    total_tax = iva + income_tax
    
    # 如果有成本价，从这里算
    base = cost_price if cost_price > 0 else 0
    
    # 到手利润
    net = selling_price - ml_fee - shipping - total_tax - base
    margin = (net / selling_price * 100) if selling_price > 0 else 0
    
    return ProfitCalc(
        selling_price=selling_price,
        currency=currency,
        ml_fee=round(ml_fee, 2),
        shipping_cost=round(shipping, 2),
        tax_amount=round(total_tax, 2),
        net_profit=round(net, 2),
        profit_margin=round(margin, 1),
        price_usd=round(selling_price / fx, 2),
        net_usd=round(net / fx, 2),
        breakdown={
            "price": round(selling_price, 2),
            "ml_commission": {"rate": f"{fee_rate*100:.0f}%", "amount": round(ml_fee, 2)},
            "shipping": {"usd": shipping_usd, "local": round(shipping, 2)},
            "tax": {
                "rate": f"{tax_config['iva']*100:.0f}% IVA + {tax_config.get('income', 0)*100:.0f}%",
                "amount": round(total_tax, 2)
            },
            "cost": round(base, 2),
            "exchange_rate": f"1 USD = {fx:,.0f} {currency}",
        }
    )

def format_profit(p: ProfitCalc) -> str:
    """人类可读摘要"""
    return (
        f"售价 {p.currency} ${p.selling_price:,.0f} "
        f"→ 到手 {p.currency} ${p.net_profit:,.0f} "
        f"(利润率 {p.profit_margin}%) "
        f"[≈ USD ${p.price_usd:,.2f} → USD ${p.net_usd:,.2f}]"
    )
