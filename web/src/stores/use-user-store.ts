"use client";

import { create } from "zustand";
import { apiGetMe, apiLogout, type AuthUser } from "@/services/api/auth";

export type LocalUser = AuthUser & { avatarUrl?: string };

type UserStore = {
    user: LocalUser | null;
    hydrated: boolean;
    fetchUser: () => Promise<void>;
    setUser: (user: LocalUser | null) => void;
    /** 由 AI 代理响应头驱动的实时额度更新（避免徽章显示陈旧值） */
    updateQuota: (quota: number, usedQuota: number) => void;
    logout: () => Promise<void>;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    hydrated: false,
    fetchUser: async () => {
        const user = await apiGetMe();
        set({ user: user as LocalUser | null, hydrated: true });
    },
    setUser: (user) => set({ user }),
    updateQuota: (quota, usedQuota) =>
        set((state) => (state.user ? { user: { ...state.user, quota, usedQuota } } : {})),
    logout: async () => {
        await apiLogout();
        set({ user: null });
        window.location.href = "/login";
    },
}));
