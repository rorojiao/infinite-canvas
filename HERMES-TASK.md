# 无限画布多用户系统开发指令

## 项目背景

无限画布（infinite-canvas）是一个纯前端 Next.js 16 应用（App Router + React 19 + TypeScript + Ant Design 6 + Tailwind + Zustand + localforage）。

**当前架构问题：**
- 没有任何用户认证系统
- 所有数据（画布、图片、素材、AI配置）存在浏览器 localforage 中
- 部署在公网（infcanvas.gamezipper.com），任何人都能访问并使用
- AI API Key 暴露在前端

**目标：**
1. 添加完整的用户注册/登录系统（邮箱+密码）
2. 每个用户的画布数据隔离
3. 生产级安全（JWT auth、密码哈希、数据隔离）
4. 部署到现有 CapRover（10.10.30.217）替换当前版本

## 技术方案

### 后端：Next.js API Routes（不需要单独的 Go 后端）

利用 Next.js 16 的 App Router API Routes 在同一个应用中实现后端逻辑：
- `/api/auth/register` - 用户注册
- `/api/auth/login` - 用户登录
- `/api/auth/me` - 获取当前用户
- `/api/auth/logout` - 登出
- `/api/canvas` - 画布 CRUD（按用户隔离）
- `/api/assets` - 素材 CRUD（按用户隔离）
- `/api/config` - AI 配置存储（按用户隔离，API Key 加密）

### 数据库：SQLite（通过 better-sqlite3）

选择 SQLite 而非 PostgreSQL，因为：
- 零配置，随应用启动自动创建
- 单文件，方便备份
- 足够支撑团队使用
- 与现有 Docker 部署兼容

### 认证：JWT + HTTP-only Cookie

- 注册/登录后返回 JWT token
- Token 存在 HTTP-only cookie 中（防 XSS）
- 密码使用 bcrypt 哈希
- JWT secret 从环境变量读取

## 详细实现步骤

### 第一步：安装依赖

```bash
cd web && bun add better-sqlite3 bcryptjs jose && bun add -D @types/bcryptjs @types/better-sqlite3
```

### 第二步：创建数据库层

创建 `web/src/lib/db.ts`：
- 初始化 SQLite 数据库（路径：`/app/data/infinite-canvas.db`）
- 自动建表：users、canvases、assets、user_configs
- users 表：id, email, password_hash, display_name, created_at
- canvases 表：id, user_id, name, data(JSON), created_at, updated_at
- assets 表：id, user_id, type, name, data(JSON), created_at
- user_configs 表：id, user_id, ai_config(JSON), updated_at

### 第三步：创建认证系统

创建 `web/src/lib/auth.ts`：
- `hashPassword(password)` - bcrypt 哈希
- `verifyPassword(password, hash)` - 验证密码
- `createToken(userId)` - 创建 JWT
- `verifyToken(token)` - 验证 JWT
- `getSession()` - 从 cookie 获取当前用户

创建 API Routes：
- `web/src/app/api/auth/register/route.ts`
- `web/src/app/api/auth/login/route.ts`
- `web/src/app/api/auth/me/route.ts`
- `web/src/app/api/auth/logout/route.ts`

### 第四步：创建数据 API Routes

- `web/src/app/api/canvas/route.ts` - GET（列表）/ POST（创建）
- `web/src/app/api/canvas/[id]/route.ts` - GET / PUT / DELETE
- `web/src/app/api/assets/route.ts` - GET / POST
- `web/src/app/api/config/route.ts` - GET / PUT

所有 API 都通过 `getSession()` 获取当前用户，确保数据隔离。

### 第五步：修改前端

1. 创建登录/注册页面：`web/src/app/(auth)/login/page.tsx`、`web/src/app/(auth)/register/page.tsx`
2. 修改 `web/src/stores/use-user-store.ts`：添加 `fetchUser`、`login`、`register`、`logout` 方法
3. 添加认证守卫：未登录用户跳转到 `/login`
4. 修改数据存储：从 localforage 改为调用后端 API
5. AI 配置存储改为后端（加密 API Key）

### 第六步：修改 Dockerfile

- 安装 better-sqlite3 编译依赖
- 添加数据卷 `/app/data`
- 添加 `JWT_SECRET` 环境变量

### 第七步：修改 docker-compose.yml

```yaml
services:
  app:
    image: infinite-canvas:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - JWT_SECRET=your-secret-key-here
      - ADMIN_EMAIL=admin@easyjoy.com  # 可选：预设管理员
    restart: unless-stopped
```

## 重要约束

1. **遵循 AGENTS.md 的所有规范**
2. **不要修改画布编辑器核心逻辑**（canvas/ 目录下的组件、stores、utils）
3. **保持现有的 UI/UX 风格**（Ant Design + Tailwind + 深色主题）
4. **前端业务数据需要浏览器本地持久化时仍用 localforage**（临时缓存/离线），但核心数据必须在服务端
5. **图片数据**：暂时仍存 localforage（因为图片较大），但画布项目结构（画布列表、名称）存服务端
6. **代码保持最少行数**，遵循项目已有写法
7. **页面文案保持中文**

## 文件结构

```
web/src/
├── app/
│   ├── (auth)/              # 新增：认证页面
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── api/
│   │   ├── auth/            # 新增：认证 API
│   │   │   ├── register/route.ts
│   │   │   ├── login/route.ts
│   │   │   ├── me/route.ts
│   │   │   └── logout/route.ts
│   │   ├── canvas/          # 新增：画布 API
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── assets/          # 新增：素材 API
│   │   │   └── route.ts
│   │   ├── config/          # 新增：配置 API
│   │   │   └── route.ts
│   │   └── prompts/         # 已有：提示词 API
│   │       └── route.ts
│   ├── (user)/              # 已有：用户页面（需加认证守卫）
│   │   ├── canvas/
│   │   ├── image/
│   │   ├── video/
│   │   ├── assets/
│   │   └── prompts/
│   └── layout.tsx           # 已有：根布局
├── lib/
│   ├── db.ts                # 新增：SQLite 数据库
│   ├── auth.ts              # 新增：认证工具
│   └── ...
├── stores/
│   ├── use-user-store.ts    # 修改：添加认证逻辑
│   └── ...
├── components/
│   ├── layout/
│   │   └── auth-guard.tsx   # 新增：认证守卫组件
│   └── ...
└── middleware.ts            # 新增：Next.js middleware（路由保护）
```

## 测试要求

开发完成后必须验证：
1. 注册新用户 → 自动登录 → 跳转到首页
2. 登出 → 跳转到登录页
3. 登录已有用户 → 看到自己的画布
4. 用户 A 的画布不会被用户 B 看到
5. AI 配置（API Key）保存在服务端，不会暴露给其他用户
6. 未登录用户访问任何页面都会被重定向到登录页
