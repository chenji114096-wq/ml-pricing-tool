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


# ═══════════════════════════════════════════════════════════
# 中国卖家视角：人民币成本利润模型（跨境出口）
# ═══════════════════════════════════════════════════════════
import os as _os

# 人民币汇率（1 USD = ? CNY）— 可用环境变量 FX_CNY 覆盖
CNY_PER_USD = float(_os.environ.get("FX_CNY", "7.2"))

# 进口综合税（关税 + 增值税等，按 CIF 货值估算，跨境电商常用口径）
# 巴西最重（II+IPI+ICMS/PIS/COFINS 综合可达 60%），阿根廷次之，墨西哥/智利较轻
IMPORT_DUTY = {
    "MLA": 0.35,   # 阿根廷：关税 + IVA 21%，电子品类常见 30-40%
    "MLB": 0.60,   # 巴西：进口综合税 55-65%
    "MLM": 0.25,   # 墨西哥：关税 + IVA 16%，综合 20-30%
    "MLC": 0.25,   # 智利：关税 6% + IVA 19%
    "MLU": 0.30,   # 乌拉圭：关税 + IVA
}

# 头程物流（中国→拉美 空运专线，单位 CNY/公斤，1kg 小包常见价格）
HEAD_FREIGHT_CNY = {
    "MLA": 55.0,
    "MLB": 65.0,
    "MLM": 45.0,
    "MLC": 60.0,
    "MLU": 60.0,
}

# 回款提现综合费率（万里汇/连连/Payoneer 等，含汇损，约 0.3-1.2%）
WITHDRAW_RATE = 0.01

# 站点 → 本地货币
SITE_CURRENCY = {"MLA": "ARS", "MLB": "BRL", "MLM": "MXN", "MLC": "CLP", "MLU": "UYU"}


@dataclass
class CNProfitCalc:
    site: str
    currency: str
    selling_price: float     # 本地售价
    revenue_usd: float       # 回款美元
    revenue_cny: float       # 回款人民币
    cost_cny: float          # 采购成本（CNY）
    freight_cny: float       # 头程运费（CNY）
    duty_cny: float          # 进口税（CNY）
    ml_fee_cny: float        # 平台佣金（折 CNY）
    withdraw_cny: float      # 提现费（CNY）
    total_cost_cny: float    # 总成本（CNY）
    net_cny: float           # 净利润（CNY）
    margin: float            # 净利率 %
    roi: float               # 投入回报率 %（净利润 ÷ 采购+头程）
    breakdown: dict


def _cn_site_key(site_or_currency):
    for s in TAXES:
        if s == site_or_currency:
            return s
    return "MLA"


def calc_profit_cn(selling_price: float, site: str = "MLA", cost_cny: float = 0,
                   freight_cny: float = None, weight_kg: float = 1.0,
                   seller_level: str = "default") -> CNProfitCalc:
    """中国卖家视角利润：采购价(CNY) + 头程(CNY) → 净利润/ROI"""
    site_key = _cn_site_key(site)
    currency = SITE_CURRENCY.get(site_key, "ARS")
    fx = FX.get(currency, 1250.0)
    fee_rate = ML_FEES.get(site_key, {}).get(seller_level, 0.13)

    if freight_cny is None:
        freight_cny = HEAD_FREIGHT_CNY.get(site_key, 55.0) * weight_kg

    # 进口税按 CIF（货值+运费）估算
    duty_cny = (cost_cny + freight_cny) * IMPORT_DUTY.get(site_key, 0.30)
    fixed_cny = cost_cny + freight_cny + duty_cny

    revenue_usd = selling_price / fx
    revenue_cny = revenue_usd * CNY_PER_USD
    ml_fee_cny = revenue_cny * fee_rate
    withdraw_cny = revenue_cny * WITHDRAW_RATE
    total_cost_cny = fixed_cny + ml_fee_cny + withdraw_cny
    net_cny = revenue_cny - total_cost_cny
    margin = (net_cny / revenue_cny * 100) if revenue_cny > 0 else 0
    invest = cost_cny + freight_cny
    roi = (net_cny / invest * 100) if invest > 0 else 0

    return CNProfitCalc(
        site=site_key,
        currency=currency,
        selling_price=round(selling_price, 2),
        revenue_usd=round(revenue_usd, 2),
        revenue_cny=round(revenue_cny, 2),
        cost_cny=round(cost_cny, 2),
        freight_cny=round(freight_cny, 2),
        duty_cny=round(duty_cny, 2),
        ml_fee_cny=round(ml_fee_cny, 2),
        withdraw_cny=round(withdraw_cny, 2),
        total_cost_cny=round(total_cost_cny, 2),
        net_cny=round(net_cny, 2),
        margin=round(margin, 1),
        roi=round(roi, 1),
        breakdown={
            "site": site_key,
            "currency": currency,
            "exchange": f"1 USD = {fx:,.0f} {currency}",
            "fx": fx,
            "cny_rate": f"1 USD = ¥{CNY_PER_USD:.2f}",
            "commission_rate": f"{fee_rate*100:.0f}%",
            "duty_rate": f"{IMPORT_DUTY.get(site_key, 0.30)*100:.0f}%",
        },
    )


def suggest_price_cn(site: str = "MLA", cost_cny: float = 0, freight_cny: float = None,
                     weight_kg: float = 1.0, target_margin: float = 0.20,
                     seller_level: str = "default") -> float:
    """反推建议售价（本地货币）：给定目标净利率 → 需要卖多少钱"""
    site_key = _cn_site_key(site)
    currency = SITE_CURRENCY.get(site_key, "ARS")
    fx = FX.get(currency, 1250.0)
    fee_rate = ML_FEES.get(site_key, {}).get(seller_level, 0.13)
    if freight_cny is None:
        freight_cny = HEAD_FREIGHT_CNY.get(site_key, 55.0) * weight_kg
    duty_cny = (cost_cny + freight_cny) * IMPORT_DUTY.get(site_key, 0.30)
    fixed_cny = cost_cny + freight_cny + duty_cny
    denom = 1 - fee_rate - WITHDRAW_RATE - target_margin
    if denom <= 0:
        denom = 0.05
    revenue_cny = fixed_cny / denom
    return revenue_cny / CNY_PER_USD * fx


def cn_verdict(margin: float) -> str:
    """中国卖家机会判断"""
    if margin >= 30:
        return "strong"    # 强机会
    if margin >= 15:
        return "ok"        # 可做
    if margin >= 5:
        return "caution"   # 谨慎
    return "no"            # 不建议
