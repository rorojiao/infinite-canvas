"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Segmented, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import { fetchMyOrders, cancelOrder, type UserOrder } from "@/services/api/billing";

const { Title } = Typography;

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
    PENDING: { text: "待支付", color: "orange" },
    PAID: { text: "已支付", color: "blue" },
    RECHARGING: { text: "充值中", color: "processing" },
    COMPLETED: { text: "已完成", color: "success" },
    EXPIRED: { text: "已过期", color: "default" },
    CANCELLED: { text: "已取消", color: "default" },
    FAILED: { text: "失败", color: "error" },
    REFUNDED: { text: "已退款", color: "purple" },
    REFUNDING: { text: "退款中", color: "processing" },
    REFUND_FAILED: { text: "退款失败", color: "error" },
};

const ORDER_TYPE_LABELS: Record<string, string> = {
    quota: "额度充值",
    subscription: "订阅会员",
};

export default function OrdersPage() {
    const router = useRouter();
    const { message, modal } = App.useApp();
    const [orders, setOrders] = useState<UserOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<string>("all");

    const loadOrders = useCallback(async () => {
        setLoading(true);
        try {
            const status = filter === "all" ? undefined : filter;
            setOrders(await fetchMyOrders(status));
        } catch (e) {
            message.error(e instanceof Error ? e.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, [filter, message]);

    useEffect(() => { void loadOrders(); }, [loadOrders]);

    const handleCancel = (order: UserOrder) => {
        modal.confirm({
            title: "确认取消订单？",
            content: `订单金额 ¥${order.amount}`,
            okText: "取消订单",
            okButtonProps: { danger: true },
            cancelText: "保留",
            onOk: async () => {
                try {
                    await cancelOrder(order.id);
                    message.success("订单已取消");
                    void loadOrders();
                } catch (e) {
                    message.error(e instanceof Error ? e.message : "取消失败");
                }
            },
        });
    };

    const columns: ColumnsType<UserOrder> = [
        {
            title: "类型",
            dataIndex: "order_type",
            key: "type",
            width: 100,
            render: (v: string) => ORDER_TYPE_LABELS[v] || v,
        },
        {
            title: "金额",
            dataIndex: "amount",
            key: "amount",
            width: 100,
            render: (v: number) => `¥${v}`,
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 100,
            render: (v: string) => {
                const label = STATUS_LABELS[v] || { text: v, color: "default" };
                return <Tag color={label.color}>{label.text}</Tag>;
            },
        },
        {
            title: "支付方式",
            dataIndex: "payment_type",
            key: "payment_type",
            width: 80,
        },
        {
            title: "创建时间",
            dataIndex: "created_at",
            key: "created_at",
            width: 170,
            render: (v: string) => new Date(v).toLocaleString("zh-CN"),
        },
        {
            title: "操作",
            key: "actions",
            width: 100,
            render: (_, record) =>
                record.status === "PENDING" ? (
                    <Button type="link" size="small" danger onClick={() => handleCancel(record)}>取消</Button>
                ) : null,
        },
    ];

    return (
        <div className="h-full overflow-auto bg-background px-6 py-6">
            <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex items-center justify-between">
                    <Title level={4} className="!mb-0">我的订单</Title>
                    <Space>
                        <Segmented
                            value={filter}
                            onChange={(v) => setFilter(v as string)}
                            options={[
                                { label: "全部", value: "all" },
                                { label: "待支付", value: "PENDING" },
                                { label: "已完成", value: "COMPLETED" },
                            ]}
                        />
                        <Button icon={<ReloadOutlined />} onClick={loadOrders} loading={loading}>刷新</Button>
                    </Space>
                </div>
                <Table<UserOrder>
                    rowKey="id"
                    columns={columns}
                    dataSource={orders}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    size="middle"
                />
                <div className="mt-4">
                    <Button type="link" onClick={() => router.push("/billing")}>← 返回充值</Button>
                </div>
            </div>
        </div>
    );
}
