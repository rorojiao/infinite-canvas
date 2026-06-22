/** 无限额度标记值（管理员）。-1 表示不受配额限制。 */
export const UNLIMITED_QUOTA = -1;

/** 判断是否为无限额度 */
export function isUnlimitedQuota(quota: number): boolean {
    return quota === UNLIMITED_QUOTA;
}

/** 计算剩余额度，无限额度返回 -1 */
export function remainingQuota(quota: number, usedQuota: number): number {
    return quota === UNLIMITED_QUOTA ? UNLIMITED_QUOTA : Math.max(0, quota - usedQuota);
}

/** 格式化额度为中文显示文案 */
export function formatQuota(quota: number): string {
    return quota === UNLIMITED_QUOTA ? "无限" : String(quota);
}
