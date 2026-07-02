import { db } from "@/lib/db";

const PAID_STATUSES = "'PAID','RECHARGING','COMPLETED','REFUNDING','REFUNDED','REFUND_FAILED'";

function todayStart(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

export function getDashboardStats(days = 30) {
    const now = new Date();
    const todayStartIso = todayStart();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    const todayPaid = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as amount, COUNT(*) as count FROM orders WHERE status IN (${PAID_STATUSES}) AND paid_at >= ?`,
    ).get(todayStartIso) as { amount: number; count: number };

    const totalPaid = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as amount, COUNT(*) as count FROM orders WHERE status IN (${PAID_STATUSES})`,
    ).get() as { amount: number; count: number };

    const todayOrders = (db.prepare("SELECT COUNT(*) as count FROM orders WHERE created_at >= ?").get(todayStartIso) as { count: number }).count;
    const totalOrders = (db.prepare("SELECT COUNT(*) as count FROM orders").get() as { count: number }).count;

    // 每日趋势
    const dailyRows = db.prepare(
        `SELECT DATE(paid_at) as date, SUM(amount) as amount, COUNT(*) as count
         FROM orders WHERE status IN (${PAID_STATUSES}) AND paid_at >= ?
         GROUP BY DATE(paid_at) ORDER BY date`,
    ).all(startDate) as Array<{ date: string; amount: number; count: number }>;

    // 填充空日期
    const dailyMap = new Map(dailyRows.map((r) => [r.date, { amount: r.amount || 0, count: r.count || 0 }]));
    const dailySeries: Array<{ date: string; amount: number; count: number }> = [];
    const cursor = new Date(startDate);
    while (cursor <= now) {
        const dateStr = cursor.toISOString().slice(0, 10);
        const entry = dailyMap.get(dateStr);
        dailySeries.push({ date: dateStr, amount: entry?.amount ?? 0, count: entry?.count ?? 0 });
        cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    // 充值排行榜
    const leaderboard = db.prepare(
        `SELECT user_id, MAX(user_email) as user_email, MAX(user_name) as user_name,
                SUM(amount) as total_amount, COUNT(*) as order_count
         FROM orders WHERE status IN (${PAID_STATUSES}) AND paid_at >= ?
         GROUP BY user_id ORDER BY SUM(amount) DESC LIMIT 10`,
    ).all(startDate) as Array<{
        user_id: string; user_email: string | null; user_name: string | null;
        total_amount: number; order_count: number;
    }>;

    // 支付渠道分布
    const paymentMethods = db.prepare(
        `SELECT payment_type, SUM(amount) as amount, COUNT(*) as count
         FROM orders WHERE status IN (${PAID_STATUSES}) AND paid_at >= ?
         GROUP BY payment_type`,
    ).all(startDate) as Array<{ payment_type: string; amount: number; count: number }>;

    const paymentTotal = paymentMethods.reduce((sum, m) => sum + (m.amount || 0), 0);

    // 订阅统计
    const subTodayPaid = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as amount, COUNT(*) as count FROM orders
         WHERE status IN (${PAID_STATUSES}) AND order_type = 'subscription' AND paid_at >= ?`,
    ).get(todayStartIso) as { amount: number; count: number };
    const subTotalPaid = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as amount, COUNT(*) as count FROM orders
         WHERE status IN (${PAID_STATUSES}) AND order_type = 'subscription'`,
    ).get() as { amount: number; count: number };

    const todayPaidCount = todayPaid.count || 0;
    const totalPaidCount = totalPaid.count || 0;
    const totalPaidAmount = totalPaid.amount || 0;

    return {
        summary: {
            today: { amount: todayPaid.amount || 0, orderCount: todayOrders, paidCount: todayPaidCount },
            total: { amount: totalPaidAmount, orderCount: totalOrders, paidCount: totalPaidCount },
            subscriptionToday: { amount: subTodayPaid.amount || 0, paidCount: subTodayPaid.count || 0 },
            subscriptionTotal: { amount: subTotalPaid.amount || 0, paidCount: subTotalPaid.count || 0 },
            successRate: totalOrders > 0 ? Math.round((totalPaidCount / totalOrders) * 1000) / 10 : 0,
            avgAmount: totalPaidCount > 0 ? Math.round((totalPaidAmount / totalPaidCount) * 100) / 100 : 0,
        },
        dailySeries,
        leaderboard: leaderboard.map((r) => ({
            userId: r.user_id,
            userEmail: r.user_email,
            userName: r.user_name,
            totalAmount: r.total_amount || 0,
            orderCount: r.order_count,
        })),
        paymentMethods: paymentMethods.map((m) => ({
            paymentType: m.payment_type,
            amount: m.amount || 0,
            count: m.count,
            percentage: paymentTotal > 0 ? Math.round((m.amount / paymentTotal) * 1000) / 10 : 0,
        })),
        meta: { days, generatedAt: now.toISOString() },
    };
}
