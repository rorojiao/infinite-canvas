# 项目记忆 - infinite-canvas 多用户系统

> 此文件记录本项目的关键部署/运维状态、踩过的坑、调试经验。
> 由 Hermes 在 2026-06-22 端到端测试后写入。
> **不要轻易修改**：这是项目知识资产，与代码一起版本管理。

---

## 当前部署状态（2026-06-23 更新）

| 项目 | 值 |
|------|-----|
| 部署地址 | https://infcanvas.gamezipper.com（HTTPS，Let's Encrypt 证书） |
| 备用域名 | http://infinite-canvas.gamezipper.com（仅 HTTP，无证书） |
| 服务器 | 43.172.69.197 (CapRover，原 10.10.30.217 已迁移) |
| Docker 镜像 | infinite-canvas:multi-user-v9（本地构建） |
| GitHub | https://github.com/rorojiao/infinite-canvas（fork 自 basketikun） |
| 管理员账号 | rorojiao@gmail.com（密码用户设定） |
| 数据库 | SQLite，bind mount 到 host `/captain/data/infinite-canvas` |
| 反代 | nginx `/api/sub2api/` → sub2api upstream（300s timeout） |

## 系统架构

```
用户浏览器
  ↓ HTTPS
Cloudflare Tunnel (cloudflared, 31deaf7a)
  ↓
CapRover captain-nginx
  ├─ /api/sub2api/* → 反代 → sub2api (gpt-image-2 等)
  └─ 其他 /* → Next.js standalone (port 3000)
                ↓
                SQLite bind mount: /captain/data/infinite-canvas → /app/data
```

## 权限模型（参照 Sub2API）

| 数据类型 | 读 | 写 | 存储 |
|---------|---|---|------|
| AI 配置（模型渠道 + API Key） | 所有用户 | **仅管理员** | system_config 表（全局 1 行） |
| 画布 | **仅自己** | **仅自己** | canvases 表（按 user_id 隔离） |
| 素材库 | 所有用户 | **仅管理员** | assets 表（user_id='__system__'） |
| 用户 | 自己 | 自己 | users 表（bcrypt 哈希） |

## 配额执行模型（v6/v7 新增，核心安全层）

所有 AI 生成请求**必须**经由服务端代理路由 `/api/ai/[...path]`，客户端不直接持有 API Key：

```
客户端 → POST /api/ai/{channelId}/{format}/{...targetPath}
            │
            ├─ 1. getSession() 鉴权（401 未登录）
            ├─ 2. resolveChannel(channelId)：从 system_config 取真实 baseUrl+apiKey（400 渠道不存在/无key）
            ├─ 3. determineCost()：GET=0；/images/generations 解析 body.n；/images/edits 解析 multipart n；其余 POST=1
            ├─ 4. consumeQuota()：原子 UPDATE 检查并扣减（quota=-1 管理员无限）
            │       └─ 不足 → 403 {"error":"配额不足...","quota","usedQuota"}
            ├─ 5. 注入鉴权头（Bearer/x-goog-api-key）转发到上游，流式回传
            └─ 6. 上游 4xx/5xx 或网络错误 → refundQuota() 退还
```

| 配额语义 | 值 |
|---------|---|
| `quota = -1` | 无限额度（管理员） |
| `quota = 0` | 新注册用户默认（必须管理员分配后才能用 AI） |
| `used_quota` | 已消耗量 |
| 成本 | 图片生成=n（张数），其余 POST=1，GET=0 |

**关键文件**：
- `web/src/lib/quota.ts` — `UNLIMITED_QUOTA` 常量与格式化函数
- `web/src/lib/auth.ts` — `consumeQuota()` / `refundQuota()` / `requireAdmin()`
- `web/src/app/api/ai/[...path]/route.ts` — 代理核心（maxDuration=300，流式透传）
- `web/src/lib/ai-proxy.ts` — 客户端代理 URL/请求头构建（不含 key）
- `web/src/services/api/{image,video,audio}.ts` — 已全部改走代理

**v8/v9 修复（2026-06-23 PM review）**：①管理员降级收回无限额度 ②注册校验密码≥6/邮箱格式 ③代理响应附配额头+客户端拦截器实时刷新徽章 ④上游 4xx 计费不退还（仅 5xx/网络错误退还），消除并发放大窗口（quota=3 并发10：通过 6→3）。

**⚠️ 2026-06-23 修复的安全漏洞**：`/api/config` GET 原先只对 `channels[].apiKey` 脱敏，顶层 `config.apiKey`（legacy 字段）明文泄露给非管理员。已修复为两者都脱敏。

## 关键技术决策

- **后端**：Next.js 16 API Routes（不要单独 Go 后端）
- **数据库**：SQLite（better-sqlite3，lazy Proxy 避免 build 时 SQLITE_BUSY）
- **认证**：JWT + bcryptjs，HttpOnly Cookie，7 天有效
- **AI 通道**：OpenAI 兼容协议 → sub2api 网关
- **首注册用户 = 管理员**（无显式注册管理员流程）

## ⚠️ 踩过的坑（按严重程度排序）

### 1. Sub2API Key 不可信用户提供的字符串（2026-06-22）
用户说 key 是 `sk-c5e...`，实际 DB 里是 `sk-ec0a...`。**永远从 DB 读真实 key**：
```bash
CID=$(docker ps --filter name=srv-captain--sub2api-postgres -q | head -1)
docker exec $CID psql -U sub2api -d sub2api -t -A -c "SELECT key FROM api_keys WHERE id=4;"
```

### 2. nginx 反代 `/api/sub2api/` location 块容易丢
CapRover 重写 captain.conf 时会丢失自定义 location。**必须用 watcher 自动重注入**。

### 3. better-sqlite3 不能用 bun standalone 构建
- bun 预编译不支持 native modules
- 用 node:22-bookworm-slim + npm install（加 --legacy-peer-deps）+ curl 装 bun + bun run build

### 4. db.ts 模块加载时建库 → SQLITE_BUSY
用 Proxy 懒加载：
```typescript
export const db = new Proxy({} as Database.Database, {
    get(_target, prop) { return getDb()[prop as keyof Database.Database]; }
});
```

### 5. proxy_read_timeout 默认 60s 不够 AI 生图（504）
AI 生图 52-72 秒。改为 300s：
```nginx
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
send_timeout 300s;
proxy_buffering off;
```

### 6. canvasImageCount 默认 3 → 触发 sub2api 风控
改为默认 1（少生成，降低风控）。

### 7. cloudflared QUIC 抖动断连 → 530
修复：`systemctl restart cloudflared`。

### 8. nginx-watcher 双保险机制
- inotify watcher（systemd service）：实时触发
- 定时器兜底（systemd timer，每 5min）：inotify 漏触发时自动恢复

### 9. 浏览器调试 XHR 必须装 XHR interceptor（不是 fetch）
axios 默认用 XMLHttpRequest，不是 fetch()。包装 window.XMLHttpRequest 来捕获所有 axios 调用。

### 10. 容器重建后数据丢失
DB bind mount 必须配置：`/captain/data/infinite-canvas:/app/data`。

## 运维脚本

### 重建镜像
```bash
cd /infinite-canvas
docker build -t infinite-canvas:multi-user-v9 .
```

### 部署新版本
```bash
JWT=$(cat /infinite-canvas/.jwt_secret)
docker service update --image infinite-canvas:multi-user-v9 --env-add JWT_SECRET=*** srv-captain--infinite-canvas
```

### 检查 nginx 反代是否生效
```bash
curl -sk https://infcanvas.gamezipper.com/api/sub2api/v1/models
# 应该返回 401（需要 API key），不是 404（Next.js 页面）
```

### 检查 watcher
```bash
systemctl status nginx-watcher
systemctl list-timers nginx-watcher*
```

### 手动注入 location（紧急用）
```bash
# /usr/local/bin/nginx-proxy-watch.sh 会自动注入
# 或手动：
awk '/server_name  infcanvas\.gamezipper\.com;/{in_block=1}
     in_block && /^        location \/ \{$/ {print block; in_block=0}
     {print}' /captain/generated/nginx/conf.d/captain.conf > /tmp/c.tmp
NID=$(docker ps --filter name=captain-nginx -q | head -1)
docker exec $NID nginx -t && docker exec $NID nginx -s reload
```

### 真实 sub2api Key 获取
```bash
CID=$(docker ps --filter name=srv-captain--sub2api-postgres -q | head -1)
docker exec $CID psql -U sub2api -d sub2api -t -A -c "SELECT key FROM api_keys WHERE id=4;"
```

## 故障速查

| 症状 | 根因 | 修复 |
|------|------|------|
| 浏览器 404（HTML 页面） | nginx /api/sub2api/ location 块丢失 | watcher 重新注入或手动注入 |
| 浏览器 504 | proxy_read_timeout 默认 60s 太短 | 改为 300s |
| 200 + INVALID_API_KEY | 用户给的 key 是错的 | 从 sub2api DB 读真实 key |
| 530 错误 | cloudflared QUIC 抖动 | `systemctl restart cloudflared` |
| 401 邮箱或密码错误 | DB 重建后首个注册用户不是 admin | 重新注册或 DB 修改 is_admin=1 |
| 容器重建后数据丢失 | DB bind mount 没配置 | 重新配置 docker service mount |

## 端到端验证清单（已通过）

- [x] 管理员登录 + 看到配置按钮 + "管理员" 徽章
- [x] 普通用户注册 + 登录
- [x] 普通用户读配置（200）
- [x] 普通用户改配置（403 "仅管理员可修改系统配置"）
- [x] 普通用户读素材（200）
- [x] 普通用户改素材（403 "仅管理员可修改共享素材库"）
- [x] 画布创建（PUT）
- [x] 画布隔离（user 看不到 admin 的画布）
- [x] 容器重建后数据持久化（DB bind mount 工作）
- [x] AI 配置 admin PUT（保存真实 key）
- [x] 浏览器画布生图（200, 72.3s, 2.97 MB PNG）
- [x] nginx 反代 `/api/sub2api/` 持久化（watcher + 5min timer）

## 关键文件路径

```
/Users/jiaojunze/working/AI_projects/infinite-canvas/
├── web/src/lib/db.ts                    # SQLite 初始化（懒加载 Proxy）
├── web/src/lib/auth.ts                  # JWT + bcrypt + getSession()
├── web/src/proxy.ts                     # Next.js middleware
├── web/src/app/api/auth/{register,login,logout,me}/route.ts
├── web/src/app/api/config/route.ts      # GET 全员 / PUT 仅 admin
├── web/src/app/api/canvas/{route.ts, [id]/route.ts}  # 用户隔离
├── web/src/app/api/assets/route.ts      # __system__ 共享素材
├── web/src/components/layout/user-status-actions.tsx  # 配置按钮仅 admin
├── web/src/stores/use-config-store.ts   # canvasImageCount=1
├── Dockerfile                            # node22-slim + npm + bun
├── docker-compose.yml                   # bind mount + JWT_SECRET
└── PROJECT-MEMORY.md                    # ← 此文件
```

## 服务端配置

```
/infinite-canvas/                          # 服务器上的项目目录
├── .jwt_secret                              # JWT 签名密钥
├── Dockerfile                                # 同上
└── data/ (via bind mount)
/captain/data/infinite-canvas/             # host 持久化数据
├── infinite-canvas.db
├── infinite-canvas.db-wal
└── infinite-canvas.db-shm

/usr/local/bin/nginx-proxy-watch.sh          # nginx location 自动注入
/etc/systemd/system/nginx-watcher.service
/etc/systemd/system/nginx-watcher-periodic.timer  # 5min 兜底
/etc/systemd/system/cloudflared.service      # Cloudflare Tunnel
```

---

**最后更新**：2026-06-23 by 多用户配额系统 E2E 测试通过（31/31 + 安全脱敏 4/4）
**维护者**：rorojiao + Hermes Agent
