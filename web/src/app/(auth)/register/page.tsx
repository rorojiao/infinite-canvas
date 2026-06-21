"use client";

import { useState } from "react";
import Link from "next/link";
import { App, Button, Card, Form, Input } from "antd";
import { apiRegister } from "@/services/api/auth";

export default function RegisterPage() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);

    const onFinish = async ({ email, password, displayName }: { email: string; password: string; displayName?: string }) => {
        setLoading(true);
        try {
            await apiRegister(email, password, displayName);
            message.success("注册成功");
            window.location.href = "/";
        } catch (error) {
            message.error(error instanceof Error ? error.message : "注册失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-dvh items-center justify-center bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] px-4 dark:bg-[radial-gradient(rgba(245,245,244,.18)_1px,transparent_1px)]">
            <Card className="w-full max-w-sm border-stone-200 dark:border-stone-800" styles={{ body: { padding: "2rem" } }}>
                <div className="mb-8 text-center">
                    <Link href="/" className="text-2xl font-semibold text-stone-950 dark:text-stone-100">
                        无限画布
                    </Link>
                    <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">创建新账户</p>
                </div>
                <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
                    <Form.Item name="displayName" label="昵称（可选）">
                        <Input size="large" placeholder="你的昵称" />
                    </Form.Item>
                    <Form.Item name="email" label="邮箱" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效的邮箱" }]}>
                        <Input size="large" placeholder="your@email.com" autoComplete="email" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "密码至少 6 位" }]}>
                        <Input.Password size="large" placeholder="设置密码" autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" size="large" htmlType="submit" loading={loading} block className="mt-2">
                        注册
                    </Button>
                </Form>
                <div className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
                    已有账户？{" "}
                    <Link href="/login" className="font-medium text-stone-950 underline-offset-4 hover:underline dark:text-stone-100">
                        登录
                    </Link>
                </div>
            </Card>
        </div>
    );
}
