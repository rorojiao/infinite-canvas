export type AdminUser = {
    id: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
    quota: number;
    usedQuota: number;
    createdAt: string;
};

export type AdminUserInput = {
    email: string;
    password: string;
    displayName?: string;
    quota?: number;
};

export type AdminUserUpdate = {
    displayName?: string;
    password?: string;
    quota?: number;
    usedQuota?: number;
    isAdmin?: boolean;
};

export async function fetchAdminUsers(): Promise<AdminUser[]> {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "获取用户列表失败");
    return data.users || [];
}

export async function createAdminUser(input: AdminUserInput): Promise<AdminUser> {
    const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "创建用户失败");
    return data;
}

export async function updateAdminUser(id: string, update: AdminUserUpdate): Promise<void> {
    const res = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "更新用户失败");
}

export async function deleteAdminUser(id: string): Promise<void> {
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "删除用户失败");
}
