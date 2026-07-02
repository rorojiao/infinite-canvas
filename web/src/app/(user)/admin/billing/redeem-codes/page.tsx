"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/use-user-store";
import { App, Button, Form, Input, InputNumber, Modal, Segmented, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import { fetchRedeemCodes, generateRedeemCodes } from "@/services/api/admin-billing";

const { Title, Paragraph, Text } = Typography;

export default function AdminRedeemCodesPage() {
    const { message } = App.useApp();

    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);
    useEffect(() => {
        if (hydrated && !user?.isAdmin) router.replace("/");
    }, [hydrated, user, router]);

    const [codes, setCodes] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState("all");
    const [genOpen, setGenOpen] = useState(false);
    const [genForm] = Form.useForm();
    const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try { setCodes(await fetchRedeemCodes(filter === "all" ? undefined : filter)); }
        catch (e) { message.error(e instanceof Error ? e.message : "加载失败"); }
        finally { setLoading(false); }
    }, [filter, message]);

    useEffect(() => { void load(); }, [load]);

    const handleGenerate = async () => {
        const values = await genForm.validateFields();
        try {
            const result = await generateRedeemCodes({
                count: Number(values.count) || 1,
                type: values.type || "quota",
                value: Number(values.value) || 0,
                expiresInDays: values.expiresInDays ? Number(values.expiresInDays) : undefined,
                notes: values.notes,
            });
            setGeneratedCodes(result);
            message.success(`成功生成 ${result.length} 个兑换码`);
            void load();
        } catch (e) { message.error(e instanceof Error ? e.message : "生成失败"); }
    };

    const columns: ColumnsType<Record<string, unknown>> = [
        { title: "兑换码", dataIndex: "code", key: "code", render: (v: string) => <Text copyable code className="!text-xs">{v}</Text> },
        { title: "类型", dataIndex: "type", key: "type", width: 80, render: (v: string) => v === "subscription" ? <Tag color="blue">订阅</Tag> : <Tag>额度</Tag> },
        { title: "面值", dataIndex: "value", key: "value", width: 80 },
        { title: "状态", dataIndex: "status", key: "status", width: 80, render: (v: string) => v === "used" ? <Tag color="red">已使用</Tag> : <Tag color="green">未使用</Tag> },
        { title: "使用者", dataIndex: "used_by", key: "used_by", width: 120, render: (v: string | null) => v || "-" },
        { title: "创建时间", dataIndex: "created_at", key: "created_at", width: 160, render: (v: string) => new Date(v).toLocaleString("zh-CN") },
    ];

    return (
        <div className="h-full overflow-auto bg-background px-6 py-6">
            <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex items-center justify-between">
                    <Title level={4} className="!mb-0">兑换码管理</Title>
                    <Space>
                        <Segmented value={filter} onChange={(v) => setFilter(v as string)} options={[
                            { label: "全部", value: "all" }, { label: "未使用", value: "unused" }, { label: "已使用", value: "used" },
                        ]} />
                        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
                        <Button type="primary" onClick={() => setGenOpen(true)}>批量生成</Button>
                    </Space>
                </div>
                <Table rowKey="code" columns={columns} dataSource={codes} loading={loading} pagination={{ pageSize: 20 }} size="middle" scroll={{ x: 600 }} />
            </div>

            <Modal title="批量生成兑换码" open={genOpen} onCancel={() => { setGenOpen(false); setGeneratedCodes(null); genForm.resetFields(); }} onOk={handleGenerate} okText="生成" cancelText="关闭">
                {!generatedCodes ? (
                    <Form form={genForm} layout="vertical" initialValues={{ count: 1, type: "quota", value: 10 }}>
                        <Form.Item name="count" label="生成数量" rules={[{ required: true }]}>
                            <InputNumber min={1} max={1000} className="!w-full" />
                        </Form.Item>
                        <Form.Item name="type" label="类型">
                            <Segmented options={[{ label: "额度", value: "quota" }, { label: "订阅", value: "subscription" }]} />
                        </Form.Item>
                        <Form.Item name="value" label="面值（额度数 / 订阅天数）">
                            <InputNumber min={1} className="!w-full" />
                        </Form.Item>
                        <Form.Item name="expiresInDays" label="有效期天数（可选）">
                            <InputNumber min={1} className="!w-full" />
                        </Form.Item>
                        <Form.Item name="notes" label="备注">
                            <Input />
                        </Form.Item>
                    </Form>
                ) : (
                    <Space direction="vertical" className="w-full">
                        <Paragraph>已生成 {generatedCodes.length} 个兑换码：</Paragraph>
                        {generatedCodes.map((code) => <Text key={code} copyable code className="!text-xs">{code}</Text>)}
                    </Space>
                )}
            </Modal>
        </div>
    );
}
