"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/use-user-store";
import { Card, Col, Row, Segmented, Spin, Statistic, Table, Tag, Typography } from "antd";
import { DollarOutlined, ShoppingOutlined, TrophyOutlined } from "@ant-design/icons";
import { fetchDashboardStats, type AdminDashboardStats } from "@/services/api/admin-billing";

const { Title } = Typography;

export default function AdminBillingDashboardPage() {

    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);
    useEffect(() => {
        if (hydrated && !user?.isAdmin) router.replace("/");
    }, [hydrated, user, router]);

    const [stats, setStats] = useState<AdminDashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    const load = useCallback(async () => {
        setLoading(true);
        try { setStats(await fetchDashboardStats(days)); } finally { setLoading(false); }
    }, [days]);

    useEffect(() => { void load(); }, [load]);

    if (loading && !stats) return <div className="flex justify-center py-20"><Spin /></div>;
    if (!stats) return null;

    return (
        <div className="h-full overflow-auto bg-background px-6 py-6">
            <div className="mx-auto max-w-6xl">
                <div className="mb-4 flex items-center justify-between">
                    <Title level={4} className="!mb-0">收入仪表盘</Title>
                    <Segmented value={days} onChange={(v) => setDays(v as number)} options={[
                        { label: "7天", value: 7 }, { label: "30天", value: 30 }, { label: "90天", value: 90 },
                    ]} />
                </div>
                <Row gutter={[16, 16]} className="mb-6">
                    <Col xs={12} md={6}><Card><Statistic title="今日收入" prefix="¥" value={stats.summary.today.amount} precision={2} /></Card></Col>
                    <Col xs={12} md={6}><Card><Statistic title="总收入" prefix="¥" value={stats.summary.total.amount} precision={2} /></Card></Col>
                    <Col xs={12} md={6}><Card><Statistic title="今日订单" value={stats.summary.today.orderCount} /></Card></Col>
                    <Col xs={12} md={6}><Card><Statistic title="支付成功率" suffix="%" value={stats.summary.successRate} /></Card></Col>
                </Row>
                <Row gutter={[16, 16]} className="mb-6">
                    <Col xs={12} md={6}><Card><Statistic title="总订单数" value={stats.summary.total.orderCount} /></Card></Col>
                    <Col xs={12} md={6}><Card><Statistic title="平均客单价" prefix="¥" value={stats.summary.avgAmount} precision={2} /></Card></Col>
                    <Col xs={12} md={6}><Card><Statistic title="今日订阅收入" prefix="¥" value={stats.summary.subscriptionToday.amount} precision={2} /></Card></Col>
                    <Col xs={12} md={6}><Card><Statistic title="总订阅收入" prefix="¥" value={stats.summary.subscriptionTotal.amount} precision={2} /></Card></Col>
                </Row>
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                        <Card title="支付渠道分布">
                            <Table
                                size="small"
                                rowKey="paymentType"
                                dataSource={stats.paymentMethods}
                                pagination={false}
                                columns={[
                                    { title: "渠道", dataIndex: "paymentType", key: "paymentType" },
                                    { title: "金额", dataIndex: "amount", key: "amount", render: (v: number) => `¥${v.toFixed(2)}` },
                                    { title: "笔数", dataIndex: "count", key: "count" },
                                    { title: "占比", dataIndex: "percentage", key: "percentage", render: (v: number) => `${v}%` },
                                ]}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} md={12}>
                        <Card title={<span><TrophyOutlined /> 充值排行</span>}>
                            <Table
                                size="small"
                                rowKey="userId"
                                dataSource={stats.leaderboard}
                                pagination={false}
                                columns={[
                                    { title: "用户", dataIndex: "userName", key: "userName", render: (v: string | null, _r: unknown, i: number) => `${i + 1}. ${v || "未知"}` },
                                    { title: "金额", dataIndex: "totalAmount", key: "totalAmount", render: (v: number) => `¥${v.toFixed(2)}` },
                                    { title: "笔数", dataIndex: "orderCount", key: "orderCount" },
                                ]}
                            />
                        </Card>
                    </Col>
                </Row>
            </div>
        </div>
    );
}
