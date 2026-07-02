"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/use-user-store";
import { App, Button, Modal, Form, Input, InputNumber, Segmented, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import { fetchAdminOrders, refundOrder } from "@/services/api/admin-billing";

const { Title, Text } = Typography;

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
    PENDING: { text: "待支付", color: "orange" }, PAID: { text: "已支付", color: "blue" },
    RECHARGING: { text: "充值中", color: "processing" }, COMPLETED: { text: "已完成", color: "success" },
    EXPIRED: { text: "已过期", color: "default" }, CANCELLED: { text: "已取消", color: "default" },
    FAILED: { text: "失败", color: "error" }, REFUNDED: { text: "已退款", color: "purple" },
    REFUNDING: { text: "退款中", color: "processing" }, REFUND_FAILED: { text: "退款失败", color: "error" },
};

export default function AdminBillingOrdersPage() {
    const { message, modal } = App.useApp();

    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);
    useEffect(() => {
        if (hydrated && !user?.isAdmin) router.replace("/");
    }, [hydrated, user, router]);

    const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState("all");
    const [refundTarget, setRefundTarget] = useState<Record<string, unknown> | null>(null);
    const [refundForm] = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);
        try { setOrders(await fetchAdminOrders(filter === "all" ? undefined : filter)); }
        catch (e) { message.error(e instanceof Error ? e.message : "加载失败"); }
        finally { setLoading(false); }
    }, [filter, message]);

    useEffect(() => { void load(); }, [load]);

    const handleRefund = async () => {
        if (!refundTarget) return;
        const values = await refundForm.validateFields();
        try {
            await refundOrder(refundTarget.id as string, values.reason || "管理员退款");
            message.success("退款成功");
            setRefundTarget(null);
            refundForm.resetFields();
            void load();
        } catch (e) { message.error(e instanceof Error ? e.message : "退款失败"); }
    };

    const columns: ColumnsType<Record<string, unknown>> = [
        { title: "用户", dataIndex: "user_email", key: "user_email", ellipsis: true },
        { title: "金额", dataIndex: "amount", key: "amount", width: 80, render: (v: number) => `¥${v}` },
        { title: "类型", dataIndex: "order_type", key: "type", width: 80, render: (v: string) => v === "subscription" ? "订阅" : "充值" },
        { title: "状态", dataIndex: "status", key: "status", width: 90, render: (v: string) => { const l = STATUS_LABELS[v] || { text: v, color: "default" }; return <Tag color={l.color}>{l.text}</Tag>; } },
        { title: "支付方式", dataIndex: "payment_type", key: "payment_type", width: 70 },
        { title: "创建时间", dataIndex: "created_at", key: "created_at", width: 160, render: (v: string) => new Date(v).toLocaleString("zh-CN") },
        { title: "操作", key: "actions", width: 80, render: (_: unknown, record: Record<string, unknown>) => {
            const status = record.status as string;
            if (["COMPLETED", "REFUND_FAILED"].includes(status)) {
                return <Button type="link" size="small" danger onClick={() => setRefundTarget(record)}>退款</Button>;
            }
            return null;
        }},
    ];

    return (
        <div className="h-full overflow-auto bg-background px-6 py-6">
            <div className="mx-auto max-w-6xl">
                <div className="mb-4 flex items-center justify-between">
                    <Title level={4} className="!mb-0">订单管理</Title>
                    <Space>
                        <Segmented value={filter} onChange={(v) => setFilter(v as string)} options={[
                            { label: "全部", value: "all" }, { label: "待支付", value: "PENDING" },
                            { label: "已完成", value: "COMPLETED" }, { label: "已退款", value: "REFUNDED" },
                        ]} />
                        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
                    </Space>
                </div>
                <Table rowKey="id" columns={columns} dataSource={orders} loading={loading} pagination={{ pageSize: 20 }} size="middle" scroll={{ x: 800 }} />
            </div>

            <Modal title="退款确认" open={Boolean(refundTarget)} onCancel={() => setRefundTarget(null)} onOk={handleRefund} okText="确认退款" okButtonProps={{ danger: true }} cancelText="取消">
                {refundTarget && (
                    <Form form={refundForm} layout="vertical">
                        <Text>订单金额：¥{String(refundTarget.amount)}　用户：{String(refundTarget.user_email ?? "")}</Text>
                        <Form.Item name="reason" label="退款原因" className="!mt-4">
                            <Input.TextArea placeholder="请输入退款原因（可选）" />
                        </Form.Item>
                    </Form>
                )}
            </Modal>
        </div>
    );
}
