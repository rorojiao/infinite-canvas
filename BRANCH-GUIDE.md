# 分支管理说明

本项目使用两个长期分支管理内部版本和对外收费版本。

## 分支结构

| 分支 | 用途 | 付费系统 | 说明 |
|------|------|---------|------|
| `main` | 公司内部使用 | 无 | 多用户 + 配额管理，不包含充值/支付功能 |
| `commercial` | 对外收费版本 | 有 | 在 main 基础上增加完整商业化系统（充值/订阅/兑换码/支付） |

## 两者的区别

`commercial` 分支相比 `main` 额外包含：

- **充值套餐**：一次性额度包（体验/基础/标准/专业）
- **订阅会员**：月度/季度/年度订阅计划
- **支付集成**：EasyPay（易支付聚合）+ Stripe（海外信用卡）
- **兑换码系统**：管理员批量生成，用户兑换
- **优惠码系统**：注册赠送额度
- **收入仪表盘**：日/周/月收入统计、渠道分布、排行榜
- **订单管理**：完整生命周期（创建→支付→充值→退款）
- **风控限额**：三层限额（单笔/每日用户/每日渠道）

## 同步流程

当 `main` 上修复了 bug 或新增了画布功能后，同步到 `commercial`：

```bash
git checkout commercial
git merge main
# 解决冲突（通常仅在 db.ts、register/route.ts 等共用文件上）
git push fork commercial
```

反过来不需要同步 — `commercial` 的付费功能不会合并回 `main`。

## 部署

- **内部版本**：使用 `main` 分支构建 Docker 镜像
- **收费版本**：使用 `commercial` 分支构建，需额外配置支付商凭证

收费版本部署前需在管理后台 `/admin/billing/payment-config` 配置 EasyPay 或 Stripe 凭证。

## 商业化系统设计文档

完整的设计方案和对标分析见 [docs/commercialization-design.md](docs/commercialization-design.md)。
