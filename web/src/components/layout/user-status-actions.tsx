"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Keyboard, LogOut, Settings2, UserCog } from "lucide-react";
import { Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { GitHubLink } from "@/components/layout/github-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { DOCS_URL } from "@/constant/env";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { formatQuota, remainingQuota } from "@/lib/quota";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts }: UserStatusActionsProps) {
    const router = useRouter();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const user = useUserStore((state) => state.user);
    const logout = useUserStore((state) => state.logout);
    const fetchUser = useUserStore((state) => state.fetchUser);
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const gitHubClassName = "size-7 text-base";
    const gitHubStyle = iconStyle;

    const menuItems: MenuProps["items"] = [
        ...(user?.isAdmin
            ? [
                  {
                      key: "admin-users",
                      label: "用户管理",
                      icon: <UserCog className="size-3.5" />,
                      onClick: () => router.push("/admin/users"),
                  },
              ]
            : []),
        {
            key: "logout",
            label: "退出登录",
            icon: <LogOut className="size-3.5" />,
            onClick: () => void logout(),
        },
    ];

    // 剩余额度展示（管理员显示"无限"）
    const showQuota = user && typeof user.quota === "number";
    const remaining = user ? remainingQuota(user.quota ?? 0, user.usedQuota ?? 0) : 0;
    const quotaLabel = user ? formatQuota(remaining) : "";
    const quotaLow = remaining !== -1 && remaining <= 0;

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label="文档" title="文档">
                <BookOpen className="size-4" />
            </a>
            {showConfig && user?.isAdmin ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="系统配置" title="系统配置（管理员）">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            <VersionReleaseModal style={versionStyle} />
            <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", gitHubClassName)} style={gitHubStyle} />
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {showQuota ? (
                <Tooltip title={user?.quota === -1 ? "无限额度（点击刷新）" : `总额度 ${user?.quota}，已用 ${user?.usedQuota ?? 0}（点击刷新）`}>
                    <button
                        type="button"
                        onClick={() => void fetchUser()}
                        className={cn(
                            "inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-xs font-medium tabular-nums transition hover:opacity-80",
                            quotaLow ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-stone-500/10 text-stone-600 dark:text-stone-300",
                        )}
                        style={iconStyle}
                    >
                        {quotaLow ? "额度不足" : `剩余 ${quotaLabel}`}
                    </button>
                </Tooltip>
            ) : null}
            {user ? (
                <Dropdown menu={{ items: menuItems }}>
                    <button type="button" className={cn(naturalIconClass, "relative text-xs font-medium")} style={iconStyle} title={user.email}>
                        {user.displayName?.[0]?.toUpperCase() || "U"}
                        {user.isAdmin ? <span className="absolute -right-1 -top-1 rounded bg-amber-500 px-1 text-[9px] leading-tight text-white">管理员</span> : null}
                    </button>
                </Dropdown>
            ) : null}
        </div>
    );
}
