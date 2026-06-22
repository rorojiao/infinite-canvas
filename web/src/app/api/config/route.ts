import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { AiConfig, ModelChannel } from "@/stores/use-config-store";

export const runtime = "nodejs";

/** 隐藏渠道中的 API Key（非管理员不可见，仅用于显示掩码） */
function maskChannels(channels: ModelChannel[]): ModelChannel[] {
    return channels.map((channel) => ({
        ...channel,
        apiKey: channel.apiKey ? maskApiKey(channel.apiKey) : "",
    }));
}

function maskApiKey(key: string): string {
    if (key.length <= 8) return "********";
    return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export async function GET() {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const row = db.prepare("SELECT config, webdav FROM system_config WHERE id = 1").get() as { config: string; webdav: string } | undefined;
    if (!row) return NextResponse.json(null);
    const config = JSON.parse(row.config) as AiConfig;
    // 非管理员隐藏所有 API Key（顶层 legacy 字段 + 各渠道），避免泄露管理员密钥
    if (!user.isAdmin) {
        if (config.apiKey) config.apiKey = maskApiKey(config.apiKey);
        if (Array.isArray(config.channels)) config.channels = maskChannels(config.channels);
    }
    return NextResponse.json({ config, webdav: JSON.parse(row.webdav) });
}

export async function PUT(request: Request) {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: "仅管理员可修改系统配置" }, { status: 403 });
    const body = await request.json();
    const incomingConfig = (body.config || {}) as AiConfig;
    // 保留已存储的 API Key：若前端提交的 key 是掩码值（含 ****），则沿用数据库中的真实 key
    const existingRow = db.prepare("SELECT config FROM system_config WHERE id = 1").get() as { config: string } | undefined;
    const existingConfig = existingRow ? (JSON.parse(existingRow.config) as AiConfig) : null;
    if (existingConfig && Array.isArray(incomingConfig.channels) && Array.isArray(existingConfig.channels)) {
        const existingByKey = new Map(existingConfig.channels.map((ch) => [ch.id, ch.apiKey]));
        incomingConfig.channels = incomingConfig.channels.map((channel) => {
            const stored = existingByKey.get(channel.id);
            // 前端返回的 key 包含掩码标记或为空时，沿用数据库真实值
            if (stored && (!channel.apiKey || channel.apiKey.includes("****"))) {
                return { ...channel, apiKey: stored };
            }
            return channel;
        });
    }
    const config = JSON.stringify(incomingConfig);
    const webdav = JSON.stringify(body.webdav || {});
    const now = new Date().toISOString();
    db.prepare("INSERT OR REPLACE INTO system_config (id, config, webdav, updated_at) VALUES (1, ?, ?, ?)").run(config, webdav, now);
    return NextResponse.json({ ok: true });
}
