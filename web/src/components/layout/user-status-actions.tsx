"use client";

import type { CSSProperties } from "react";
import { BookOpen, Keyboard, LogOut, Settings2 } from "lucide-react";
import { Dropdown } from "antd";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { GitHubLink } from "@/components/layout/github-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { DOCS_URL } from "@/constant/env";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts }: UserStatusActionsProps) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const user = useUserStore((state) => state.user);
    const logout = useUserStore((state) => state.logout);
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const gitHubClassName = "size-7 text-base";
    const gitHubStyle = iconStyle;

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
            {user ? (
                <Dropdown
                    menu={{
                        items: [
                            {
                                key: "logout",
                                label: "退出登录",
                                icon: <LogOut className="size-3.5" />,
                                onClick: () => void logout(),
                            },
                        ],
                    }}
                >
                    <button type="button" className={cn(naturalIconClass, "relative text-xs font-medium")} style={iconStyle} title={user.email}>
                        {user.displayName?.[0]?.toUpperCase() || "U"}
                        {user.isAdmin ? <span className="absolute -right-1 -top-1 rounded bg-amber-500 px-1 text-[9px] leading-tight text-white">管理员</span> : null}
                    </button>
                </Dropdown>
            ) : null}
        </div>
    );
}
