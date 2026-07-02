import type Database from "better-sqlite3";

const BILLING_DDL = `
CREATE TABLE IF NOT EXISTS quota_packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL,
    original_price REAL,
    quota INTEGER NOT NULL,
    bonus_quota INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    for_sale INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL,
    original_price REAL,
    quota_per_period INTEGER NOT NULL,
    validity_days INTEGER NOT NULL,
    validity_unit TEXT NOT NULL DEFAULT 'day',
    features TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    for_sale INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    order_id TEXT,
    starts_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    auto_renew INTEGER NOT NULL DEFAULT 0,
    last_quota_granted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usub_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_usub_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_usub_expires ON user_subscriptions(expires_at);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT,
    user_name TEXT,
    amount REAL NOT NULL,
    pay_amount REAL,
    fee_rate REAL NOT NULL DEFAULT 0,
    recharge_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    order_type TEXT NOT NULL DEFAULT 'quota',
    package_id TEXT,
    plan_id TEXT,
    subscription_days INTEGER,
    payment_type TEXT NOT NULL,
    payment_trade_no TEXT,
    pay_url TEXT,
    qr_code TEXT,
    provider_instance_id TEXT,
    refund_amount REAL NOT NULL DEFAULT 0,
    refund_reason TEXT,
    refund_at TEXT,
    force_refund INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    paid_at TEXT,
    completed_at TEXT,
    failed_at TEXT,
    failed_reason TEXT,
    cancelled_at TEXT,
    client_ip TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_paid ON orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);

CREATE TABLE IF NOT EXISTS order_audit_logs (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    operator TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_order ON order_audit_logs(order_id);

CREATE TABLE IF NOT EXISTS redeem_codes (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'quota',
    value INTEGER NOT NULL DEFAULT 0,
    plan_id TEXT,
    status TEXT NOT NULL DEFAULT 'unused',
    used_by TEXT,
    used_at TEXT,
    expires_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    batch_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_redeem_status ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_redeem_batch ON redeem_codes(batch_id);

CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    bonus_quota INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_provider_instances (
    id TEXT PRIMARY KEY,
    provider_key TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    config TEXT NOT NULL,
    supported_types TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    limits TEXT NOT NULL DEFAULT '',
    refund_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ppi_key ON payment_provider_instances(provider_key);
CREATE INDEX IF NOT EXISTS idx_ppi_enabled ON payment_provider_instances(enabled);

CREATE TABLE IF NOT EXISTS billing_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
);
`;

/** 为 users 表追加 billing 相关列 */
function migrateUsersBillingColumns(db: Database.Database) {
    const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    const has = (name: string) => columns.some((c) => c.name === name);
    if (!has("total_recharged")) {
        db.exec("ALTER TABLE users ADD COLUMN total_recharged INTEGER NOT NULL DEFAULT 0");
    }
}

/** 首次启动时插入默认套餐数据 */
function seedDefaultPackages(db: Database.Database) {
    const count = (db.prepare("SELECT COUNT(*) as count FROM quota_packages").get() as { count: number }).count;
    if (count > 0) return;
    const now = new Date().toISOString();
    const packages = [
        ["pkg_trial", "体验包", "", 9.9, null, 10, 0, 0],
        ["pkg_basic", "基础包", "", 29.9, 39.9, 50, 5, 1],
        ["pkg_standard", "标准包", "", 99, 129, 200, 20, 2],
        ["pkg_pro", "专业包", "", 299, 399, 800, 100, 3],
    ];
    const plans = [
        ["sub_monthly", "月度会员", "", 39, null, 100, 30, "day", '["基础功能"]', 0],
        ["sub_quarterly", "季度会员", "", 99, 117, 100, 90, "day", '["优惠约15%"]', 1],
        ["sub_yearly", "年度会员", "", 299, 468, 100, 365, "day", '["优惠约36%"]', 2],
    ];
    const insertPkg = db.prepare(
        "INSERT INTO quota_packages (id, name, description, price, original_price, quota, bonus_quota, sort_order, for_sale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    );
    for (const [id, name, desc, price, origPrice, quota, bonus, sort] of packages) {
        insertPkg.run(id, name, desc, price, origPrice, quota, bonus, sort, now, now);
    }
    const insertPlan = db.prepare(
        "INSERT INTO subscription_plans (id, name, description, price, original_price, quota_per_period, validity_days, validity_unit, features, sort_order, for_sale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    );
    for (const [id, name, desc, price, origPrice, quota, days, unit, features, sort] of plans) {
        insertPlan.run(id, name, desc, price, origPrice, quota, days, unit, features, sort, now, now);
    }
}

/** 启动时执行 billing 相关迁移 */
export function runBillingMigration(db: Database.Database) {
    db.exec(BILLING_DDL);
    migrateUsersBillingColumns(db);
    seedDefaultPackages(db);
}
