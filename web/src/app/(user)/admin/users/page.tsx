"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Spin, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { createAdminUser, deleteAdminUser, fetchAdminUsers, updateAdminUser, type AdminUser } from "@/services/api/admin-users";
import { UNLIMITED_QUOTA } from "@/lib/quota";
import { useUserStore } from "@/stores/use-user-store";

const { Title, Text } = Typography;

type AddFormValues = { email: string; password: string; displayName?: string; quota: number };
type EditFormValues = { displayName?: string; password?: string; quota: number; resetUsedQuota: boolean; isAdmin: boolean };

export default function AdminUsersPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [addForm] = Form.useForm<AddFormValues>();
    const [editForm] = Form.useForm<EditFormValues>();

    // 非管理员重定向到首页
    useEffect(() => {
        if (hydrated && !user?.isAdmin) router.replace("/");
    }, [hydrated, user, router]);

    const accessDenied = hydrated && !user?.isAdmin;

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            setUsers(await fetchAdminUsers());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    const handleAdd = async () => {
        try {
            const values = await addForm.validateFields();
            setSubmitting(true);
            await createAdminUser({ ...values, quota: Number(values.quota) || 0 });
            message.success("用户创建成功");
            setAddOpen(false);
            addForm.resetFields();
            void loadUsers();
        } catch (error) {
            if (error instanceof Error && error.message) message.error(error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const openEdit = (user: AdminUser) => {
        setEditTarget(user);
        editForm.setFieldsValue({
            displayName: user.displayName,
            password: "",
            quota: user.quota,
            resetUsedQuota: false,
            isAdmin: user.isAdmin,
        });
    };

    const handleEdit = async () => {
        if (!editTarget) return;
        try {
            const values = await editForm.validateFields();
            setSubmitting(true);
            const update: Record<string, unknown> = {
                displayName: values.displayName,
                quota: Number(values.quota),
                isAdmin: values.isAdmin,
            };
            if (values.password) update.password = values.password;
            if (values.resetUsedQuota) update.usedQuota = 0;
            await updateAdminUser(editTarget.id, update);
            message.success("用户信息已更新");
            setEditTarget(null);
            editForm.resetFields();
            void loadUsers();
        } catch (error) {
            if (error instanceof Error && error.message) message.error(error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (user: AdminUser) => {
        try {
            await deleteAdminUser(user.id);
            message.success(`已删除用户 ${user.email}`);
            void loadUsers();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        }
    };

    const columns: ColumnsType<AdminUser> = [
        {
            title: "邮箱",
            dataIndex: "email",
            key: "email",
            ellipsis: true,
        },
        {
            title: "昵称",
            dataIndex: "displayName",
            key: "displayName",
            ellipsis: true,
        },
        {
            title: "角色",
            key: "role",
            width: 100,
            render: (_, record) => (record.isAdmin ? <Tag color="amber">管理员</Tag> : <Tag>普通用户</Tag>),
        },
        {
            title: "总额度",
            key: "quota",
            width: 100,
            render: (_, record) => (record.quota === UNLIMITED_QUOTA ? <Text type="success">无限</Text> : <Text>{record.quota}</Text>),
        },
        {
            title: "已用",
            dataIndex: "usedQuota",
            key: "usedQuota",
            width: 80,
        },
        {
            title: "剩余",
            key: "remaining",
            width: 80,
            render: (_, record) =>
                record.quota === UNLIMITED_QUOTA ? <Text type="success">∞</Text> : <Text type={record.quota - record.usedQuota > 0 ? undefined : "danger"}>{Math.max(0, record.quota - record.usedQuota)}</Text>,
        },
        {
            title: "注册时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 170,
            render: (value: string) => (value ? new Date(value).toLocaleString("zh-CN") : "-"),
        },
        {
            title: "操作",
            key: "actions",
            width: 140,
            render: (_, record) => (
                <Space>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                    </Tooltip>
                    <Popconfirm title={`确认删除用户 ${record.email}？`} description="该用户的画布数据将一并删除" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(record)}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="h-full overflow-auto bg-background px-6 py-6">
            {accessDenied ? (
                <div className="flex h-full items-center justify-center">
                    <Spin tip="无权访问，正在跳转..." />
                </div>
            ) : (
                <>
                    <div className="mx-auto max-w-6xl">
                        <div className="mb-4 flex items-center justify-between">
                            <Title level={4} className="!mb-0">
                                <UserOutlined className="mr-2" />
                                用户管理
                            </Title>
                            <Space>
                                <Button icon={<ReloadOutlined />} onClick={loadUsers} loading={loading}>
                                    刷新
                                </Button>
                                <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
                                    添加用户
                                </Button>
                            </Space>
                        </div>
                        <Table<AdminUser>
                            rowKey="id"
                            columns={columns}
                            dataSource={users}
                            loading={loading}
                            pagination={{ pageSize: 20, showSizeChanger: false }}
                            size="middle"
                            scroll={{ x: 800 }}
                        />
                    </div>

                    {/* 添加用户弹窗 */}
                    <Modal title="添加用户" open={addOpen} onCancel={() => setAddOpen(false)} onOk={handleAdd} confirmLoading={submitting} okText="创建" cancelText="取消" destroyOnClose>
                        <Form form={addForm} layout="vertical" initialValues={{ quota: 0 }} preserve={false}>
                            <Form.Item name="email" label="邮箱" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效邮箱" }]}>
                                <Input placeholder="user@example.com" autoComplete="off" />
                            </Form.Item>
                            <Form.Item name="displayName" label="昵称（可选）">
                                <Input placeholder="留空则使用邮箱前缀" />
                            </Form.Item>
                            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "密码至少 6 位" }]}>
                                <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
                            </Form.Item>
                            <Form.Item name="quota" label="可用额度（-1 为无限）" tooltip="新用户默认额度为 0，需管理员分配后才能使用 AI 功能">
                                <InputNumber min={-1} max={1000000} className="!w-full" placeholder="0" />
                            </Form.Item>
                        </Form>
                    </Modal>

                    {/* 编辑用户弹窗 */}
                    <Modal title={`编辑用户 - ${editTarget?.email ?? ""}`} open={Boolean(editTarget)} onCancel={() => setEditTarget(null)} onOk={handleEdit} confirmLoading={submitting} okText="保存" cancelText="取消" destroyOnClose>
                        <Form form={editForm} layout="vertical" preserve={false}>
                            <Form.Item name="displayName" label="昵称" rules={[{ required: true, message: "请输入昵称" }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item name="password" label="重置密码（留空不修改）">
                                <Input.Password placeholder="留空保持原密码" autoComplete="new-password" />
                            </Form.Item>
                            <Form.Item name="quota" label="可用额度（-1 为无限）" tooltip="设为 0 则该用户无法使用 AI 生成功能">
                                <InputNumber min={-1} max={1000000} className="!w-full" />
                            </Form.Item>
                            <Form.Item name="resetUsedQuota" valuePropName="checked" label="重置已用额度">
                                <Switch />
                            </Form.Item>
                            <Form.Item name="isAdmin" valuePropName="checked" label="管理员权限">
                                <Switch />
                            </Form.Item>
                        </Form>
                    </Modal>
                </>
            )}
        </div>
    );
}
