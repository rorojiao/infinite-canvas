"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import axios from "axios";
import { ProConfigProvider } from "@ant-design/pro-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { ClientRootInit } from "@/components/layout/client-root-init";
import { getAntThemeConfig } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});

export function AppProviders({ children }: { children: ReactNode }) {
    const theme = useThemeStore((state) => state.theme);
    const dark = theme === "dark";
    const fetchUser = useUserStore((state) => state.fetchUser);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.colorScheme = theme;
    }, [dark, theme]);

    // AI 代理响应头驱动的实时额度刷新：任何 /api/ai/ 响应都携带 x-ic-quota-* 头，
    // 通过 axios 与 fetch 双拦截器捕获后更新徽章，避免生成后额度显示陈旧。
    useEffect(() => {
        const applyQuota = (headers: Headers | undefined | null) => {
            if (!headers) return;
            const remaining = headers.get("x-ic-quota-remaining");
            const used = headers.get("x-ic-quota-used");
            if (remaining === null || used === null) return;
            useUserStore.getState().updateQuota(Number(remaining), Number(used));
        };
        const interceptorId = axios.interceptors.response.use((response) => {
            if (response.config.url?.includes("/api/ai/")) applyQuota(response.headers as unknown as Headers);
            return response;
        });
        const originalFetch = window.fetch;
        window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const response = await originalFetch(input, init);
            try {
                const url = typeof input === "string" ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : "";
                if (url.includes("/api/ai/")) applyQuota(response.headers);
            } catch {
                // 忽略 header 读取异常，不影响原始响应
            }
            return response;
        }) as typeof window.fetch;
        return () => {
            axios.interceptors.response.eject(interceptorId);
            window.fetch = originalFetch;
        };
    }, []);

    useEffect(() => {
        void fetchUser();
    }, [fetchUser]);

    return (
        <ConfigProvider locale={zhCN} theme={getAntThemeConfig(dark)}>
            <ProConfigProvider dark={dark}>
                <App>
                    <QueryClientProvider client={queryClient}>
                        <ClientRootInit>{children}</ClientRootInit>
                    </QueryClientProvider>
                </App>
            </ProConfigProvider>
        </ConfigProvider>
    );
}
