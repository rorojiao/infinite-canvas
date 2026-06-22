export type AuthUser = { id: string; email: string; displayName: string; isAdmin?: boolean; quota?: number; usedQuota?: number };

export async function apiLogin(email: string, password: string): Promise<AuthUser> {
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "登录失败");
    return data;
}

export async function apiRegister(email: string, password: string, displayName?: string): Promise<AuthUser> {
    const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "注册失败");
    return data;
}

export async function apiLogout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
}

export async function apiGetMe(): Promise<AuthUser | null> {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
}
