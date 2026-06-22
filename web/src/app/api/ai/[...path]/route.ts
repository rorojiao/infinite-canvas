import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, consumeQuota, refundQuota } from "@/lib/auth";
import type { AiConfig, ModelChannel } from "@/stores/use-config-store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_BODY_SIZE = 100 * 1024 * 1024; // 100MB 请求体上限

type ResolvedChannel = { baseUrl: string; apiKey: string; apiFormat: string };

/** 从 system_config 中按 ID 查找渠道配置 */
function resolveChannel(channelId: string): ResolvedChannel | null {
    const row = db.prepare("SELECT config FROM system_config WHERE id = 1").get() as { config: string } | undefined;
    if (!row) return null;
    try {
        const config = JSON.parse(row.config) as AiConfig;
        const channels: ModelChannel[] = Array.isArray(config.channels) ? config.channels : [];
        const channel = channels.find((item) => item.id === channelId);
        if (!channel) return null;
        return { baseUrl: channel.baseUrl, apiKey: channel.apiKey, apiFormat: channel.apiFormat };
    } catch {
        return null;
    }
}

/** 提取渠道 origin（scheme://host[:port]） */
function channelOrigin(baseUrl: string): string {
    try {
        return new URL(baseUrl.trim()).origin;
    } catch {
        return baseUrl.trim().replace(/\/+$/, "");
    }
}

/** 限制图片数量到合理范围 */
function clampImageCount(n: number): number {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(n)) || 1));
}

/** 根据路径、方法和请求体确定本次调用的配额消耗 */
function determineCost(targetPath: string, method: string, bodyText: string, contentType: string): number {
    if (method !== "POST") return 0;
    // 图片生成（JSON body）：消耗 = n
    if (targetPath.includes("/images/generations")) {
        try {
            const json = JSON.parse(bodyText) as { n?: number };
            return clampImageCount(Number(json.n) || 1);
        } catch {
            return 1;
        }
    }
    // 图片编辑（multipart body）：从前 8KB 中提取 n 字段
    if (targetPath.includes("/images/edits")) {
        const head = bodyText.slice(0, 8192);
        const match = head.match(/name="n"\r\n\r\n(\d+)/);
        return clampImageCount(match ? Number(match[1]) : 1);
    }
    // 视频任务创建、音频生成、对话响应、Gemini 内容生成等：消耗 1
    return 1;
}

/** 构建转发到上游的请求头（注入渠道鉴权） */
function buildUpstreamHeaders(req: NextRequest, channel: ResolvedChannel): Headers {
    const headers = new Headers();
    if (channel.apiFormat === "gemini") {
        headers.set("x-goog-api-key", channel.apiKey);
    } else {
        headers.set("Authorization", `Bearer ${channel.apiKey}`);
    }
    const contentType = req.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const accept = req.headers.get("accept");
    if (accept) headers.set("Accept", accept);
    return headers;
}

async function handleProxy(req: NextRequest, segments: string[]): Promise<Response> {
    if (segments.length < 2) {
        return Response.json({ error: "无效的代理路径" }, { status: 400 });
    }
    const session = await getSession();
    if (!session) return Response.json({ error: "未登录" }, { status: 401 });

    const channelId = segments[0];
    // segments[1] 为格式标记（openai/gemini），渠道自身的 apiFormat 决定鉴权头
    const channel = resolveChannel(channelId);
    if (!channel) return Response.json({ error: "渠道不存在或未配置" }, { status: 400 });
    if (!channel.apiKey.trim()) return Response.json({ error: "该渠道尚未配置 API Key，请联系管理员" }, { status: 400 });

    // 重建目标路径与查询串
    const targetPath = "/" + segments.slice(2).join("/");
    const search = new URL(req.url).search;
    const targetUrl = `${channelOrigin(channel.baseUrl)}${targetPath}${search}`;

    // 缓存请求体以确定配额消耗并原样转发
    const method = req.method;
    let bodyBuffer: ArrayBuffer | null = null;
    let bodyText = "";
    if (method !== "GET" && method !== "HEAD") {
        bodyBuffer = await req.arrayBuffer();
        if (bodyBuffer.byteLength > MAX_BODY_SIZE) {
            return Response.json({ error: "请求体过大" }, { status: 413 });
        }
        // 仅解码必要部分用于配额计算（图片编辑的 n 字段在前 8KB 内）
        bodyText = new TextDecoder().decode(new Uint8Array(bodyBuffer, 0, Math.min(bodyBuffer.byteLength, 8192)));
    }
    const cost = determineCost(targetPath, method, bodyText, req.headers.get("content-type") || "");

    // 原子检查并扣除配额（管理员为无限额度 -1）
    if (!consumeQuota(session.id, cost)) {
        return Response.json(
            { error: "配额不足，请联系管理员分配额度", quota: session.quota, usedQuota: session.usedQuota },
            { status: 403 },
        );
    }

    const headers = buildUpstreamHeaders(req, channel);
    const fetchOptions: RequestInit & { duplex?: "half" } = { method, headers };
    if (bodyBuffer) {
        fetchOptions.body = bodyBuffer;
        fetchOptions.duplex = "half";
    }

    let upstream: Response;
    try {
        upstream = await fetch(targetUrl, fetchOptions);
    } catch {
        refundQuota(session.id, cost);
        return Response.json({ error: "请求上游服务失败，请检查渠道配置或稍后重试" }, { status: 502 });
    }

    // 上游返回错误状态：退还配额
    if (!upstream.ok) {
        refundQuota(session.id, cost);
        const errorText = await upstream.text();
        return new Response(errorText, {
            status: upstream.status,
            headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
        });
    }

    // 成功：流式透传上游响应体（支持 SSE / 二进制 / JSON）
    const responseHeaders = new Headers();
    const responseContentType = upstream.headers.get("content-type");
    if (responseContentType) responseHeaders.set("Content-Type", responseContentType);
    const contentDisposition = upstream.headers.get("content-disposition");
    if (contentDisposition) responseHeaders.set("Content-Disposition", contentDisposition);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    return handleProxy(req, path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    return handleProxy(req, path);
}
