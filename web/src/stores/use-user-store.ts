"use client";

import { create } from "zustand";
import { apiGetMe, apiLogout, type AuthUser } from "@/services/api/auth";

export type LocalUser = AuthUser & { avatarUrl?: string };

type UserStore = {
    user: LocalUser | null;
    hydrated: boolean;
    fetchUser: () => Promise<void>;
    setUser: (user: LocalUser | null) => void;
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
    logout: async () => {
        await apiLogout();
        set({ user: null });
        window.location.href = "/login";
    },
}));
