# 无限画布商业化会员与充值系统 - 完整设计方案

> 基于 Sub2API + Sub2APIPay 的完整对标分析，针对无限画布（Next.js + SQLite + 次数制配额）架构设计的商业化系统。
> 目标：可直接部署到 infcanvas.gamezipper.com 进行收费运营。

---

## 一、对标分析总结

### 1.1 Sub2API（主平台）商业化模型

| 组件 | Sub2API 实现 | 无限画布对应 |
|------|-------------|-------------|
| 用户余额 | balance (decimal, USD) | quota (integer, 次数制) |
| 已用额度 | 通过 usage_log 累加 | used_quota (integer) |
| 累计充值 | total_recharged (decimal) | total_recharged (integer, 新增) |
| 分组(Group) | rate_multiplier + 日/周/月 USD 限额 | 不需要（单一产品线） |
| 订阅套餐 | SubscriptionPlan + UserSubscription | SubscriptionPlan + UserSubscription |
| 兑换码 | RedeemCode (balance/subscription 类型) | RedeemCode (quota/subscription 类型) |
| 优惠码 | PromoCode (注册赠送) | PromoCode (注册赠送额度) |
| 订单 | PaymentOrder (完整生命周期) | Order (简化版, CNY 计价) |
| 支付商 | PaymentProviderInstance (多实例轮询) | PaymentProviderInstance (多实例) |
| 平台配额 | UserPlatformQuota (按平台 USD 限额) | 不需要（单一 AI 代理） |
| 使用日志 | UsageLog (每次调用记录) | UsageLog (新增, 用于审计) |

### 1.2 Sub2APIPay（支付网关）核心流程

```
用户发起充值 → 校验限额 → 创建 PENDING 订单 → 调用支付商创建支付 → 返回支付URL/二维码
                                                                      ↓
用户完成支付 ← 支付商回调 /api/{provider}/notify → 校验签名 → 更新订单为 PAID
                                                                      ↓
PAID → RECHARGING → 调用主平台充值 API（幂等）→ COMPLETED
         ↑ 失败                                     ↓ 成功
    标记 FAILED                               通知前端刷新余额
```

### 1.3 关键安全机制（Sub2APIPay 已实现，需移植）

- **CAS 乐观锁**：订单状态变更使用 `UPDATE ... WHERE status = ?` 原子操作
- **幂等充值**：充值调用携带 `Idempotency-Key`，防止重复到账
- **先扣后退**：退款时先扣除用户已获得的额度，再调用网关退款，失败时回滚
- **限额三层**：单笔限额 / 每日用户限额 / 每日全平台渠道限额
- **取消频率限制**：防止恶意创建+取消订单
- **待支付订单上限**：防止订单堆积
- **金额校验**：MIN/MAX 充值金额限制
- **手续费**：按渠道配置 fee_rate，payAmount = amount + amount * feeRate

---

## 二、系统架构

### 2.1 整体架构（保持 Next.js 一体化）

```
浏览器
  ↓ HTTPS (Cloudflare Tunnel → CapRover nginx)
Next.js 应用 (port 3000)
  ├── 页面层：用户充值页 / 订阅页 / 管理后台
  ├── API 层：
  │   ├── /api/billing/orders          — 创建/查询订单
  │   ├── /api/billing/plans           — 套餐列表
  │   ├── /api/billing/redeem          — 兑换码兑换
  │   ├── /api/billing/notify/{provider} — 支付回调
  │   ├── /api/admin/billing/orders    — 订单管理
  │   ├── /api/admin/billing/plans     — 套餐管理
  │   ├── /api/admin/billing/redeem-codes — 兑换码管理
  │   └── /api/admin/billing/dashboard  — 收入仪表盘
  └── 数据层：SQLite (better-sqlite3)
```

### 2.2 与现有系统的集成点

- **配额扣减**：复用现有 `consumeQuota()` / `refundQuota()`，充值后直接 `UPDATE users SET quota = quota + ?`
- **AI 代理**：`/api/ai/[...path]` 不变，继续走配额检查
- **用户认证**：复用现有 JWT + cookie session
- **管理员权限**：复用现有 `requireAdmin()`

---

## 三、数据库设计

### 3.1 新增表（SQLite）

```sql
-- 充值套餐（一次性购买额度）
CREATE TABLE IF NOT EXISTS quota_packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL,
    original_price REAL,
    quota INTEGER NOT NULL,
    bonus_quota INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    for_sale INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 订阅套餐（周期性扣费 + 每期额度）
CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL,
    original_price REAL,
    quota_per_period INTEGER NOT NULL,
    validity_days INTEGER NOT NULL,
    validity_unit TEXT DEFAULT 'day',
    features TEXT DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    for_sale INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 用户订阅记录
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    order_id TEXT,
    starts_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    auto_renew INTEGER DEFAULT 0,
    last_quota_granted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usub_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_usub_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_usub_expires ON user_subscriptions(expires_at);

-- 支付订单
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT,
    user_name TEXT,
    amount REAL NOT NULL,
    pay_amount REAL,
    fee_rate REAL DEFAULT 0,
    recharge_code TEXT UNIQUE,
    status TEXT DEFAULT 'PENDING',
    order_type TEXT DEFAULT 'quota',
    package_id TEXT,
    plan_id TEXT,
    subscription_days INTEGER,
    payment_type TEXT NOT NULL,
    payment_trade_no TEXT,
    pay_url TEXT,
    qr_code TEXT,
    provider_instance_id TEXT,
    refund_amount REAL DEFAULT 0,
    refund_reason TEXT,
    refund_at TEXT,
    force_refund INTEGER DEFAULT 0,
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

-- 订单审计日志
CREATE TABLE IF NOT EXISTS order_audit_logs (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    operator TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_order ON order_audit_logs(order_id);

-- 兑换码
CREATE TABLE IF NOT EXISTS redeem_codes (
    code TEXT PRIMARY KEY,
    type TEXT DEFAULT 'quota',
    value INTEGER DEFAULT 0,
    plan_id TEXT,
    status TEXT DEFAULT 'unused',
    used_by TEXT,
    used_at TEXT,
    expires_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    batch_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_redeem_status ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_redeem_batch ON redeem_codes(batch_id);

-- 优惠码（注册赠送）
CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    bonus_quota INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 0,
    used_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    expires_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 支付商实例配置
CREATE TABLE IF NOT EXISTS payment_provider_instances (
    id TEXT PRIMARY KEY,
    provider_key TEXT NOT NULL,
    name TEXT DEFAULT '',
    config TEXT NOT NULL,
    supported_types TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    limits TEXT DEFAULT '',
    refund_enabled INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ppi_key ON payment_provider_instances(provider_key);
CREATE INDEX IF NOT EXISTS idx_ppi_enabled ON payment_provider_instances(enabled);

-- 系统配置（运行时可改）
CREATE TABLE IF NOT EXISTS billing_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
);
```

### 3.2 users 表扩展字段

```sql
ALTER TABLE users ADD COLUMN total_recharged INTEGER DEFAULT 0;
```

---

## 四、支付系统设计

### 4.1 订单状态机（对标 Sub2APIPay）

```
PENDING ──用户支付──> PAID ──充值中──> RECHARGING ──成功──> COMPLETED
   |                    |                    |
   |超时/取消           |                     └──失败──> FAILED
   v                    v
EXPIRED            CANCELLED

COMPLETED ──管理员退款──> REFUND_REQUESTED ──扣减+退款──> REFUNDING ──成功──> REFUNDED
                                                                          └──失败──> REFUND_FAILED
```

终态（不再轮询）：COMPLETED, FAILED, CANCELLED, EXPIRED, REFUNDED, REFUND_FAILED, PARTIALLY_REFUNDED

### 4.2 支付商集成（分层抽象）

```typescript
interface PaymentProvider {
    name: string;
    providerKey: string;
    supportedTypes: string[];
    createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResponse>;
    verifyNotification(rawBody: string, headers: Record<string, string>): Promise<PaymentNotification | null>;
    refund(req: RefundRequest): Promise<RefundResponse>;
}
```

### 4.3 支持的支付渠道（首期）

| 渠道 | provider_key | 适用场景 | 文档参考 |
|------|-------------|---------|---------|
| 易支付（聚合） | easypay | 国内聚合（支付宝+微信） | sub2apipay/lib/easy-pay/ |
| Stripe | stripe | 海外信用卡 | sub2apipay/lib/stripe/ |
| 支付宝直连 | alipay | 国内官方支付宝（二期） | sub2apipay/lib/alipay/ |
| 微信支付直连 | wxpay | 国内官方微信（二期） | sub2apipay/lib/wxpay/ |

### 4.4 回调处理流程

```
支付商 → POST/GET /api/billing/notify/{provider}?inst={instanceId}
    |
    +-- 1. 验证签名（verifyNotification）
    +-- 2. CAS 更新订单 PENDING → PAID
    +-- 3. 记录审计日志
    +-- 4. 异步充值：
    |      PAID → RECHARGING
    |      +- quota 订单：UPDATE users SET quota = quota + package.quota WHERE id = ?
    |      +- subscription 订单：INSERT user_subscriptions + 发放当期额度
    |      +- UPDATE users SET total_recharged = total_recharged + amount
    |      +- 使用 recharge_code 作为幂等键
    +-- 5. RECHARGING → COMPLETED
    +-- 6. 记录审计日志
```

### 4.5 充值幂等性

充值操作使用订单的 `recharge_code` 作为幂等键：
- 充值前检查订单是否已 `COMPLETED`（已充值过）
- 使用 CAS：`UPDATE orders SET status='RECHARGING' WHERE id=? AND status='PAID'`
- 如果 CAS 失败（已被其他回调处理），直接返回成功

---

## 五、套餐与订阅设计

### 5.1 充值套餐示例（Quota Packages）

| 名称 | 价格 | 原价 | 额度 | 赠送 | 定位 |
|------|------|------|------|------|------|
| 体验包 | 9.9 | - | 10 | 0 | 低门槛试用 |
| 基础包 | 29.9 | 39.9 | 50 | 5 | 日常使用 |
| 标准包 | 99 | 129 | 200 | 20 | 高频用户 |
| 专业包 | 299 | 399 | 800 | 100 | 重度用户 |

### 5.2 订阅套餐示例（Subscription Plans）

| 名称 | 月价 | 年价 | 每月额度 | 有效期 | 特性 |
|------|------|------|---------|--------|------|
| 月度会员 | 39/月 | - | 100 | 30天 | 基础功能 |
| 季度会员 | 99/季 | - | 100x3 | 90天 | 优惠~15% |
| 年度会员 | - | 299/年 | 100x12 | 365天 | 优惠~36% |

### 5.3 订阅额度发放机制

- **购买时**：立即创建 `user_subscriptions` 记录，发放首期额度
- **续期**：到期前续费则延长 `expires_at`，发放新周期额度
- **过期处理**：定时任务检查过期订阅，标记为 `expired`（不回收已发放额度）

### 5.4 兑换码系统

- **管理员批量生成**：指定类型（quota/subscription）、面值、数量、有效期
- **用户兑换**：`POST /api/billing/redeem` 输入兑换码
- **安全**：原子 `UPDATE redeem_codes SET status='used', used_by=?, used_at=? WHERE code=? AND status='unused'`

---

## 六、管理后台设计

### 6.1 管理页面结构

```
/admin/billing/
  ├── dashboard         — 收入仪表盘
  ├── orders            — 订单管理（筛选、详情、退款）
  ├── plans             — 套餐管理（增删改充值包+订阅计划）
  ├── redeem-codes      — 兑换码管理（批量生成、查看使用状态）
  └── promo-codes       — 优惠码管理
```

### 6.2 收入仪表盘指标（对标 Sub2APIPay dashboard）

- 今日收入 / 今日订单数 / 今日支付成功率
- 总收入 / 总订单数 / 平均客单价
- 每日收入趋势图（折线图，可切换 7/30/90 天）
- 支付渠道分布（饼图）
- 用户充值排行榜（TOP 10）

### 6.3 订单管理功能

- 筛选：状态 / 支付方式 / 时间范围 / 用户
- 详情：完整订单信息 + 审计日志时间线
- 操作：手动完成（紧急补单）、退款（全额/部分）、取消

### 6.4 退款流程（先扣后退，对标 Sub2APIPay）

```
管理员发起退款 → CAS 锁定 COMPLETED → REFUNDING
    +-- 1. 扣减用户已获得的额度（quota 或订阅天数）
    +-- 2. 调用支付商退款 API
    |      +- 成功 → REFUNDED / PARTIALLY_REFUNDED
    |      +- 失败 → 回滚扣减 → 恢复 COMPLETED + 记录失败
    +-- 3. 审计日志全程记录
```

---

## 七、用户端设计

### 7.1 充值入口

- 用户头像下拉菜单 / 导航栏增加「充值」入口
- 额度不足时（consumeQuota 返回 false）弹出引导充值弹窗

### 7.2 充值页面 /billing

- 当前额度展示
- Tab 切换：充值套餐 / 订阅会员 / 兑换码
- 支付方式选择（支付宝 / 微信 / Stripe）
- 我的订单入口

### 7.3 订单状态页 /billing/orders

- 我的订单列表（状态、金额、时间、操作）
- 待支付订单显示二维码 / 支付链接
- 支付成功后实时刷新（定时轮询）

### 7.4 订阅状态展示

- 用户主页显示当前订阅状态（等级、到期时间、剩余额度）
- 到期前 7 天提醒续费

---

## 八、安全设计

### 8.1 支付安全

| 风险 | 防护措施 |
|------|---------|
| 篡改金额 | 服务端从 DB 读取套餐价格，不信任客户端 amount |
| 重复回调 | recharge_code 幂等键 + CAS 状态锁 |
| 并发突破限额 | 限额校验与订单创建在同一事务内 |
| 签名伪造 | 各支付商 verifyNotification 验证签名 |
| 重放攻击 | 回调验签包含时间戳 + 交易号去重 |
| 退款竞态 | CAS 乐观锁 WHERE status IN (...) |
| 扣减后退款失败 | 先扣后退 + 回滚机制 + 审计日志 |

### 8.2 风控限额

| 限额项 | 配置项 | 默认值 |
|-------|--------|--------|
| 单笔最小金额 | MIN_RECHARGE_AMOUNT | 1 元 |
| 单笔最大金额 | MAX_RECHARGE_AMOUNT | 5000 元 |
| 每日用户累计 | MAX_DAILY_RECHARGE_AMOUNT | 10000 元 |
| 待支付订单数 | MAX_PENDING_ORDERS | 3 |
| 订单超时 | ORDER_TIMEOUT_MINUTES | 10 |
| 取消频率 | CANCEL_RATE_LIMIT | 10次/天 |

### 8.3 API 安全

- 所有充值/订单 API 需登录 session
- 管理后台 API 需管理员权限（requireAdmin()）
- 回调 API 不需要 session（公开端点），但必须验签
- 支付商配置加密存储（AES-256-GCM）

### 8.4 敏感数据保护

- 支付商密钥配置加密后存入 payment_provider_instances.config
- 加密密钥从 PAYMENT_CONFIG_ENCRYPTION_KEY 环境变量读取
- 管理后台展示配置时脱敏

---

## 九、定时任务

### 9.1 订单超时处理

- 每 1 分钟扫描 `status='PENDING' AND expires_at < now()`
- 标记为 EXPIRED，记录审计日志

### 9.2 订阅过期处理

- 每小时扫描 `status='active' AND expires_at < now()`
- 标记为 expired

### 9.3 实现方式

使用 Next.js API Route + cron 外部触发（CapRover 已有定时器），或应用内 setInterval（启动时注册）。

---

## 十、环境变量

```bash
# 支付配置加密密钥（AES-256-GCM）
PAYMENT_CONFIG_ENCRYPTION_KEY=<32-byte-hex>

# 订单限额
ORDER_TIMEOUT_MINUTES=10
MIN_RECHARGE_AMOUNT=1
MAX_RECHARGE_AMOUNT=5000
MAX_DAILY_RECHARGE_AMOUNT=10000
MAX_PENDING_ORDERS=3

# 支付商（逗号分隔）
PAYMENT_PROVIDERS=easypay,stripe

# 易支付
EASY_PAY_PID=
EASY_PAY_PKEY=
EASY_PAY_API_BASE=
EASY_PAY_NOTIFY_URL=https://infcanvas.gamezipper.com/api/billing/notify/easypay
EASY_PAY_RETURN_URL=https://infcanvas.gamezipper.com/billing

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# 站点 URL
NEXT_PUBLIC_APP_URL=https://infcanvas.gamezipper.com
```

---

## 十一、实现文件清单

### 11.1 后端（API Routes + Lib）

```
web/src/lib/billing/
  ├── db-migration.ts           — 新增表迁移
  ├── order-service.ts          — 订单创建/查询/取消/完成
  ├── refund-service.ts         — 退款流程（先扣后退）
  ├── subscription-service.ts   — 订阅生命周期管理
  ├── quota-service.ts          — 充值额度发放
  ├── redeem-service.ts         — 兑换码兑换
  ├── fee.ts                    — 手续费计算
  ├── limits.ts                 — 限额查询
  ├── code-gen.ts               — 充值码生成
  └── config.ts                 — 运行时配置读写

web/src/lib/payment/
  ├── types.ts                  — 统一接口定义
  ├── registry.ts               — 支付商注册表
  ├── load-balancer.ts          — 多实例选择
  └── crypto.ts                 — 配置加解密

web/src/lib/payment/providers/
  ├── easypay/
  │   ├── client.ts
  │   ├── sign.ts
  │   └── provider.ts
  ├── stripe/
  │   └── provider.ts
  ├── alipay/                   — （二期）
  └── wxpay/                    — （二期）

web/src/app/api/billing/
  ├── orders/route.ts
  ├── orders/[id]/route.ts
  ├── orders/my/route.ts
  ├── orders/[id]/cancel/route.ts
  ├── plans/route.ts
  ├── redeem/route.ts
  ├── subscriptions/my/route.ts
  └── notify/[provider]/route.ts

web/src/app/api/admin/billing/
  ├── dashboard/route.ts
  ├── orders/route.ts
  ├── orders/[id]/route.ts
  ├── orders/[id]/refund/route.ts
  ├── plans/route.ts
  ├── plans/[id]/route.ts
  ├── redeem-codes/route.ts
  └── promo-codes/route.ts
```

### 11.2 前端（页面 + 组件 + Store + Service）

```
web/src/app/(user)/billing/
  ├── page.tsx
  ├── orders/page.tsx
  └── components/
      ├── quota-package-card.tsx
      ├── subscription-plan-card.tsx
      ├── payment-method-selector.tsx
      ├── qr-code-modal.tsx
      └── redeem-code-input.tsx

web/src/app/(user)/admin/billing/
  ├── dashboard/page.tsx
  ├── orders/page.tsx
  ├── plans/page.tsx
  └── redeem-codes/page.tsx

web/src/stores/use-billing-store.ts
web/src/services/api/billing-orders.ts
web/src/services/api/billing-plans.ts
web/src/services/api/billing-redeem.ts
```

---

## 十二、与 Sub2API 的对标差异说明

| 对标项 | Sub2API 做法 | 无限画布做法 | 原因 |
|--------|-------------|-------------|------|
| 计费单位 | USD decimal | 次数 integer | 产品是图片生成，按次计费更直观 |
| 分组(Group) | 多分组 + rate_multiplier | 无分组 | 单一产品线，不需要多组路由 |
| 平台配额 | per-platform USD 限额 | 无 | 单一 AI 代理，不需要分平台 |
| 充值方式 | 调用主平台 API 充值余额 | 直接更新本库 quota | 一体化架构，无外部平台 |
| 退款 | 调用主平台 API 扣减余额 | 直接扣减本库 quota | 同上 |
| 使用日志 | 详细 token + cost 记录 | 简化版（channel + cost + time） | 次数制不需要 token 级记账 |
| 数据库 | PostgreSQL | SQLite | 保持现有架构，规模够用 |
| 认证 | 独立 ADMIN_TOKEN | 复用现有 JWT + requireAdmin | 一体化，不需要额外认证 |

---

## 十三、实施计划

### Phase 1: 数据层 + 核心服务（后端）
- DB 迁移（新增表 + users 扩展）
- 订单服务（创建/查询/取消/超时）
- 充值额度发放服务
- 订阅生命周期服务
- 兑换码服务

### Phase 2: 支付集成
- 支付商统一接口 + 注册表
- 易支付 Provider（签名/创建支付/回调验证/退款）
- Stripe Provider（PaymentIntent/webhook/退款）
- 回调处理流程（验签 → CAS → 充值 → 审计）
- 配置加密存储

### Phase 3: 管理后台
- 收入仪表盘
- 订单管理 + 退款
- 套餐管理（增删改）
- 兑换码管理（批量生成）

### Phase 4: 用户端
- 充值中心页面
- 支付二维码 / 跳转
- 订单状态轮询
- 订阅状态展示
- 兑换码输入

### Phase 5: 安全 + 风控
- 限额三层校验
- 取消频率限制
- 订单超时清理定时任务
- 订阅过期定时任务
- 安全审计

### Phase 6: 测试 + 修复
- 支付全流程 E2E 测试（沙箱环境）
- 并发安全测试（同时回调、同时兑换）
- 退款流程测试
- 限额边界测试
- Bug 修复循环
