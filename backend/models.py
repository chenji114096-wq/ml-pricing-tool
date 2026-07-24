"""数据模型"""
from pydantic import BaseModel
from typing import List, Optional

class Product(BaseModel):
    title: str
    price: float
    currency: str
    condition: str  # new / used
    url: str
    image: str = ""
    seller_name: Optional[str] = None
    seller_sales: Optional[int] = None
    free_shipping: bool = False

class PriceStats(BaseModel):
    min_price: float
    max_price: float
    avg_price: float
    median_price: float
    total_listings: int
    price_range: str  # 价格区间描述
    recommendation: Optional[str] = None  # AI 建议定价

class AIAnalysis(BaseModel):
    suggested_price: float
    reason: str  # 定价理由（西语）
    risk_level: str  # bajo / medio / alto
    competitor_insight: str  # 竞争洞察
    description_es: str  # AI 生成西语商品描述
