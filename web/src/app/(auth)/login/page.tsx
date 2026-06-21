"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { App, Button, Card, Form, Input } from "antd";
import { apiLogin } from "@/services/api/auth";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);

    const onFinish = async ({ email, password }: { email: string; password: string }) => {
        setLoading(true);
        try {
            await apiLogin(email, password);
            message.success("登录成功");
            const redirect = searchParams.get("redirect") || "/";
            window.location.href = redirect;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item name="email" label="邮箱" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效的邮箱" }]}>
                <Input size="large" placeholder="your@email.com" autoComplete="email" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
                <Input.Password size="large" placeholder="密码" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" size="large" htmlType="submit" loading={loading} block className="mt-2">
                登录
            </Button>
        </Form>
    );
}

export default function LoginPage() {
    return (
        <div className="flex min-h-dvh items-center justify-center bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] px-4 dark:bg-[radial-gradient(rgba(245,245,244,.18)_1px,transparent_1px)]">
            <Card className="w-full max-w-sm border-stone-200 dark:border-stone-800" styles={{ body: { padding: "2rem" } }}>
                <div className="mb-8 text-center">
                    <Link href="/" className="text-2xl font-semibold text-stone-950 dark:text-stone-100">
                        无限画布
                    </Link>
                    <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">登录你的账户</p>
                </div>
                <Suspense>
                    <LoginForm />
                </Suspense>
                <div className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
                    还没有账户？{" "}
                    <Link href="/register" className="font-medium text-stone-950 underline-offset-4 hover:underline dark:text-stone-100">
                        注册
                    </Link>
                </div>
            </Card>
        </div>
    );
}
