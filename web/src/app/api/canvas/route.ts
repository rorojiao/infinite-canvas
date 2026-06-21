import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const rows = db.prepare("SELECT data FROM canvases WHERE user_id = ? ORDER BY updated_at DESC").all(user.id) as { data: string }[];
    const projects = rows.map((row) => JSON.parse(row.data));
    return NextResponse.json(projects);
}

export async function PUT(request: Request) {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const projects = (await request.json()) as { id: string; updatedAt?: string }[];
    const now = new Date().toISOString();
    const insert = db.prepare("INSERT OR REPLACE INTO canvases (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)");
    const deleteStale = db.prepare("DELETE FROM canvases WHERE user_id = ? AND id NOT IN (" + projects.map(() => "?").join(",") + ")");
    db.transaction(() => {
        const ids = projects.map((p) => p.id);
        if (ids.length) {
            deleteStale.run(user.id, ...ids);
        } else {
            db.prepare("DELETE FROM canvases WHERE user_id = ?").run(user.id);
        }
        for (const project of projects) {
            insert.run(project.id, user.id, JSON.stringify(project), project.updatedAt || now);
        }
    })();
    return NextResponse.json({ ok: true });
}
