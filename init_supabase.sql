-- =============================================
-- ML Precios - Supabase 数据库初始化脚本
-- 用法：打开 Supabase 控制台 → SQL Editor → 粘贴运行
-- =============================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT DEFAULT '',
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    supabase_user_id UUID
);

-- 2. 订阅套餐表
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    price_monthly NUMERIC DEFAULT 0,
    price_yearly NUMERIC DEFAULT 0,
    search_limit_monthly INTEGER DEFAULT 0,
    include_ai_description BOOLEAN DEFAULT FALSE,
    enabled BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 用户订阅表
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES subscription_plans(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    started_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    payment_provider TEXT DEFAULT '',
    payment_subscription_id TEXT DEFAULT '',
    UNIQUE(user_id)
);

-- 4. 用量记录表
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL DEFAULT 'search',
    cost INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. 支付记录表
CREATE TABLE IF NOT EXISTS payment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES subscription_plans(id),
    provider TEXT NOT NULL DEFAULT '',
    amount NUMERIC NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    provider_payment_id TEXT DEFAULT '',
    provider_data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. 系统开关表
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT '',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_usage_user_action ON usage_records(user_id, action, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_user ON payment_records(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plan_enabled ON subscription_plans(enabled);

-- =============================================
-- 种子数据
-- =============================================

-- 默认套餐（4个）
INSERT INTO subscription_plans (slug, name, description, price_monthly, price_yearly, search_limit_monthly, include_ai_description, enabled, sort_order)
VALUES
    ('free', 'Free', '每日3次搜索，基础价格统计', 0, 0, 90, FALSE, TRUE, 1),
    ('pro', 'Pro', '无限搜索 + AI定价建议 + AI商品描述', 19.99, 199.99, -1, TRUE, TRUE, 2),
    ('enterprise', 'Enterprise', '全部功能 + API接入 + 专属支持', 99.99, 999.99, -1, TRUE, TRUE, 3),
    ('pay_per_search', '按次付费', '充值搜索次数，无需月费', 0, 0, 0, TRUE, TRUE, 4)
ON CONFLICT (slug) DO NOTHING;

-- 管理员账号（密码: admin123）
INSERT INTO users (email, password_hash, name, role)
VALUES ('admin@mlprecios.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Admin', 'admin')
ON CONFLICT (email) DO NOTHING;

-- =============================================
-- Row Level Security（可选，建议开启所有表RLS后禁用public写入）
-- =============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
