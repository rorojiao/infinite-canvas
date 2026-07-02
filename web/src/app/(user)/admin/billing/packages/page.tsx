"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/use-user-store";
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Space, Switch, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchAdminPackages, saveAdminPackage, deleteAdminPackage, fetchAdminSubscriptionPlans, saveAdminSubscriptionPlan, deleteAdminSubscriptionPlan } from "@/services/api/admin-billing";

const { Title } = Typography;

type PackageRow = { id: string; name: string; description: string; price: number; originalPrice: number | null; quota: number; bonusQuota: number; sortOrder: number; forSale: boolean };

export default function AdminPackagesPage() {
    const { message } = App.useApp();

    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);
    useEffect(() => {
        if (hydrated && !user?.isAdmin) router.replace("/");
    }, [hydrated, user, router]);

    const [tab, setTab] = useState<"packages" | "plans">("packages");
    const [packages, setPackages] = useState<PackageRow[]>([]);
    const [plans, setPlans] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(false);
    const [editTarget, setEditTarget] = useState<Record<string, unknown> | null>(null);
    const [form] = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            if (tab === "packages") {
                setPackages(await fetchAdminPackages() as PackageRow[]);
            } else {
                setPlans(await fetchAdminSubscriptionPlans());
            }
        } catch (e) { message.error(e instanceof Error ? e.message : "加载失败"); }
        finally { setLoading(false); }
    }, [tab, message]);

    useEffect(() => { void load(); }, [load]);

    const handleSave = async () => {
        const values = await form.validateFields();
        try {
            if (tab === "packages") {
                await saveAdminPackage({ ...editTarget, ...values });
            } else {
                await saveAdminSubscriptionPlan({ ...editTarget, ...values, features: values.features ? String(values.features).split(",").map((s: string) => s.trim()).filter(Boolean) : [] });
            }
            message.success("保存成功");
            setEditTarget(null);
            form.resetFields();
            void load();
        } catch (e) { message.error(e instanceof Error ? e.message : "保存失败"); }
    };

    const handleDelete = async (id: string) => {
        try {
            if (tab === "packages") await deleteAdminPackage(id);
            else await deleteAdminSubscriptionPlan(id);
            message.success("已删除");
            void load();
        } catch (e) { message.error(e instanceof Error ? e.message : "删除失败"); }
    };

    const openEdit = (record: Record<string, unknown> | null) => {
        setEditTarget(record);
        if (record) {
            form.setFieldsValue(record);
        } else {
            form.resetFields();
        }
    };

    const pkgColumns: ColumnsType<PackageRow> = [
        { title: "名称", dataIndex: "name", key: "name" },
        { title: "价格", dataIndex: "price", key: "price", width: 80, render: (v: number) => `¥${v}` },
        { title: "额度", key: "quota", width: 100, render: (_, r) => `${r.quota}${r.bonusQuota ? `+${r.bonusQuota}` : ""}` },
        { title: "在售", dataIndex: "forSale", key: "forSale", width: 60, render: (v: boolean) => v ? "✓" : "✗" },
        { title: "操作", key: "actions", width: 100, render: (_, r) => (
            <Space>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            </Space>
        )},
    ];

    const planColumns: ColumnsType<Record<string, unknown>> = [
        { title: "名称", dataIndex: "name", key: "name" },
        { title: "价格", dataIndex: "price", key: "price", width: 80, render: (v: number) => `¥${v}` },
        { title: "每期额度", dataIndex: "quotaPerPeriod", key: "quota", width: 90 },
        { title: "有效期(天)", dataIndex: "validityDays", key: "days", width: 100 },
        { title: "操作", key: "actions", width: 100, render: (_, r) => (
            <Space>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id as string)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            </Space>
        )},
    ];

    return (
        <div className="h-full overflow-auto bg-background px-6 py-6">
            <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex items-center justify-between">
                    <Title level={4} className="!mb-0">套餐管理</Title>
                    <Space>
                        <Segmented value={tab} onChange={(v) => setTab(v as "packages" | "plans")} options={[
                            { label: "充值套餐", value: "packages" }, { label: "订阅计划", value: "plans" },
                        ]} />
                        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>新增</Button>
                    </Space>
                </div>
                <Table rowKey="id" columns={tab === "packages" ? pkgColumns as ColumnsType<Record<string, unknown>> : planColumns} dataSource={tab === "packages" ? packages : plans} loading={loading} pagination={false} size="middle" />

                <Modal title={editTarget ? "编辑" : "新增"} open={Boolean(editTarget) || form.getFieldValue("name") !== undefined} onCancel={() => { setEditTarget(null); form.resetFields(); }} onOk={handleSave} okText="保存" cancelText="取消">
                    <Form form={form} layout="vertical">
                        <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="price" label="价格" rules={[{ required: true, message: "请输入价格" }]}>
                            <InputNumber min={0} className="!w-full" />
                        </Form.Item>
                        <Form.Item name="originalPrice" label="原价（划线价，可选）">
                            <InputNumber min={0} className="!w-full" />
                        </Form.Item>
                        {tab === "packages" ? (
                            <>
                                <Form.Item name="quota" label="额度数" rules={[{ required: true }]}>
                                    <InputNumber min={0} className="!w-full" />
                                </Form.Item>
                                <Form.Item name="bonusQuota" label="赠送额度">
                                    <InputNumber min={0} className="!w-full" />
                                </Form.Item>
                            </>
                        ) : (
                            <>
                                <Form.Item name="quotaPerPeriod" label="每期额度" rules={[{ required: true }]}>
                                    <InputNumber min={0} className="!w-full" />
                                </Form.Item>
                                <Form.Item name="validityDays" label="有效期天数" rules={[{ required: true }]}>
                                    <InputNumber min={1} className="!w-full" />
                                </Form.Item>
                                <Form.Item name="features" label="功能特性（逗号分隔）">
                                    <Input placeholder="基础功能,优惠15%" />
                                </Form.Item>
                            </>
                        )}
                        <Form.Item name="sortOrder" label="排序">
                            <InputNumber min={0} className="!w-full" />
                        </Form.Item>
                    </Form>
                </Modal>
            </div>
        </div>
    );
}
