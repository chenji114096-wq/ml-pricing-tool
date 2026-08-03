# ML Precios — Analizador de Precios con IA

**🌐 Live: [https://mlprecios.com](https://mlprecios.com)** — Free to start, no credit card required. Search any product and get price intelligence in seconds.

Mercado Libre 卖家定价分析工具。输入产品名，自动抓取全平台同款产品的价格数据，用 AI 给出建议定价，还能自动生成西语商品描述。

## 📂 项目结构

```
ml-pricing-tool/
├── backend/            # FastAPI 后端
│   ├── main.py         # API 入口（搜索、定价分析、描述生成）
│   ├── crawler.py      # ML 数据爬虫
│   ├── ai_analysis.py  # AI 分析模块（DeepSeek API + 规则引擎兜底）
│   ├── models.py       # 数据模型
│   └── requirements.txt
├── frontend/           # 前端页面
│   ├── index.html      # 主页面
│   ├── style.css       # 样式
│   └── app.js          # 前端逻辑
├── README.md
└── deploy.sh
```

## 🚀 快速启动

### 1. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置 DeepSeek API Key（可选）

```bash
export DEEPSEEK_API_KEY="sk-your-key-here"
```

不配也能用，会自动走规则引擎。

### 3. 启动后端

```bash
cd backend
uvicorn main:app --reload --port 8000 --host 0.0.0.0
```

### 4. 打开前端

直接用浏览器打开 `frontend/index.html`

或者在服务器上部署：

```bash
python3 -m http.server 8080 --directory frontend
```

然后访问 `http://localhost:8080`

## 🔌 API 接口

### 搜索 + 定价分析

```
GET /api/search?q=samsung%20s24%20ultra&site=MLA
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `q` | 商品关键词（西语） | 必填 |
| `site` | MLA=阿根廷, MLB=巴西, MLM=墨西哥 | MLA |

返回：价格统计 + AI 建议定价

### 生成西语描述

```
GET /api/describe?title=iPhone 15 Pro&price=1599999
```

| 参数 | 说明 |
|------|------|
| `title` | 产品标题 |
| `price` | 价格 |
| `features` | 特性（逗号分隔，可选） |

## 🛠 后续开发（在 Cursor 中做）

### 第一阶段：让数据跑起来
1. **注册 ML 开发者账号** → https://developers.mercadolibre.com/
2. 获取 `access_token` 替换爬虫的 HTML 解析方式
3. 测试阿根廷和巴西站的数据能否拉通

### 第二阶段：完善功能
4. **历史价格曲线** — 存每天的价格数据，画出走势
5. **多品类支持** — 加服装、家居等其他品类
6. **卖家排行榜** — 哪个卖家卖得最好、定价策略分析

### 第三阶段：商业运营
7. 加 Stripe 支付 → $19/月
8. 加用户注册/登录
9. 投放 Google Ads（西语关键词）

## ⚙️ 爬虫说明

当前爬虫支持两种模式：

1. **HTML 解析（默认）** — 直接爬 ML 搜索页，无需 API Key
2. **官方 API** — 注册开发者后替换 crawler.py 中的实现

如果从国内网络爬拉美站点不通，建议：
- 部署到海外 VPS（$5/月的 DigitalOcean 即可）
- 或在本机用 Cursor 开发时，本地网络可能直连拉美

## 💡 用 Cursor 开发 Tips

1. 用 Cursor 打开 `ml-pricing-tool/` 目录
2. 先跑 `pip install -r requirements.txt`
3. 终端运行 `uvicorn backend.main:app --reload`
4. 浏览器开前端测试
5. 改 `crawler.py` 优化爬虫逻辑
6. 改 `frontend/` 优化界面

有问题问 Cursor 的 AI 就行。
