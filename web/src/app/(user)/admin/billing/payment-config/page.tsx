"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/use-user-store";
import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchPaymentProviders, savePaymentProvider, deletePaymentProvider } from "@/services/api/admin-billing";

const { Title, Text } = Typography;

type ProviderRow = {
    id: string; provider_key: string; name: string; supported_types: string;
    enabled: boolean; sort_order: number; refund_enabled: boolean; created_at: string;
};

export default function PaymentConfigPage() {
    const { message } = App.useApp();

    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);
    useEffect(() => {
        if (hydrated && !user?.isAdmin) router.replace("/");
    }, [hydrated, user, router]);

    const [providers, setProviders] = useState<ProviderRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Record<string, unknown> | null>(null);
    const [form] = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);
        try { setProviders(await fetchPaymentProviders() as ProviderRow[]); }
        catch (e) { message.error(e instanceof Error ? e.message : "加载失败"); }
        finally { setLoading(false); }
    }, [message]);

    useEffect(() => { void load(); }, [load]);

    const handleSave = async () => {
        const values = await form.validateFields();
        try {
            // config 为 JSON 字符串，解析后传给后端加密
            let config: Record<string, unknown>;
            try { config = JSON.parse(values.config); }
            catch { message.error("配置必须是有效的 JSON"); return; }
            await savePaymentProvider({
                ...editTarget,
                providerKey: values.providerKey,
                name: values.name,
                config,
                supportedTypes: values.supportedTypes || "",
                enabled: values.enabled !== false,
                sortOrder: values.sortOrder || 0,
                refundEnabled: values.refundEnabled || false,
            });
            message.success("保存成功");
            setEditOpen(false);
            form.resetFields();
            void load();
        } catch (e) { message.error(e instanceof Error ? e.message : "保存失败"); }
    };

    const handleDelete = async (id: string) => {
        try { await deletePaymentProvider(id); message.success("已删除"); void load(); }
        catch (e) { message.error(e instanceof Error ? e.message : "删除失败"); }
    };

    const columns: ColumnsType<ProviderRow> = [
        { title: "名称", dataIndex: "name", key: "name" },
        { title: "类型", dataIndex: "provider_key", key: "provider_key", width: 100, render: (v: string) => <Tag>{v}</Tag> },
        { title: "支持方式", dataIndex: "supported_types", key: "supported_types", width: 120 },
        { title: "状态", dataIndex: "enabled", key: "enabled", width: 60, render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag> },
        { title: "操作", key: "actions", width: 100, render: (_, r) => (
            <Space>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditTarget(r); form.setFieldsValue({ ...r, providerKey: r.provider_key, supportedTypes: r.supported_types, sortOrder: r.sort_order, refundEnabled: r.refund_enabled }); setEditOpen(true); }} />
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            </Space>
        )},
    ];

    return (
        <div className="h-full overflow-auto bg-background px-6 py-6">
            <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex items-center justify-between">
                    <Title level={4} className="!mb-0">支付渠道配置</Title>
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditTarget(null); form.resetFields(); setEditOpen(true); }}>新增</Button>
                    </Space>
                </div>
                <Table rowKey="id" columns={columns} dataSource={providers} loading={loading} pagination={false} size="middle" />
                <Text type="secondary" className="mt-4 block">
                    EasyPay 配置 JSON 格式：{"{ \"pid\": \"...\", \"pkey\": \"...\", \"apiBase\": \"https://...\", \"notifyUrl\": \"...\", \"returnUrl\": \"...\" }"}<br />
                    Stripe 配置 JSON 格式：{"{ \"secretKey\": \"sk_...\", \"publishableKey\": \"pk_...\", \"webhookSecret\": \"whsec_...\" }"}
                </Text>
            </div>

            <Modal title="支付渠道配置" open={editOpen} onCancel={() => setEditOpen(false)} onOk={handleSave} okText="保存" cancelText="取消" width={600}>
                <Form form={form} layout="vertical" initialValues={{ providerKey: "easypay", enabled: true }}>
                    <Form.Item name="providerKey" label="渠道类型" rules={[{ required: true }]}>
                        <Select options={[{ label: "易支付（EasyPay）", value: "easypay" }, { label: "Stripe", value: "stripe" }]} />
                    </Form.Item>
                    <Form.Item name="name" label="显示名称">
                        <Input placeholder="支付宝A / Stripe主账户" />
                    </Form.Item>
                    <Form.Item name="config" label="配置（JSON）" rules={[{ required: true, message: "请输入配置 JSON" }]}>
                        <Input.TextArea rows={6} placeholder='{"pid":"1000","pkey":"...","apiBase":"https://...","notifyUrl":"https://...","returnUrl":"https://..."}' className="!font-mono !text-xs" />
                    </Form.Item>
                    <Form.Item name="supportedTypes" label="支持方式（逗号分隔，如 alipay,wxpay）">
                        <Input placeholder="alipay,wxpay（Stripe 填 stripe）" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
