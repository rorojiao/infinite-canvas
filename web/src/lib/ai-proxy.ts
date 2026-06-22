import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";

/**
 * 客户端 AI 代理助手：所有 AI 生成请求经由 /api/ai/[...path] 服务端代理转发，
 * 服务端负责注入渠道 API Key 并强制执行用户配额。
 */

/** 从完整 URL 中提取 pathname + search（去掉 origin） */
function urlToPath(fullUrl: string): string {
    try {
        const parsed = new URL(fullUrl);
        return parsed.pathname + parsed.search;
    } catch {
        return fullUrl;
    }
}

/** 构建 OpenAI 格式的代理 URL */
export function openaiProxyUrl(config: AiConfig, path: string): string {
    const fullUrl = buildApiUrl(config.baseUrl, path);
    return `/api/ai/${config.channelId || "default"}/openai${urlToPath(fullUrl)}`;
}

/** 构建 Seedance / 火山格式任务代理 URL（同属 OpenAI 兼容协议） */
export function seedanceProxyUrl(config: AiConfig, taskId?: string): string {
    const suffix = taskId ? `/${encodeURIComponent(taskId)}` : "";
    const fullUrl = buildApiUrl(config.baseUrl, `/contents/generations/tasks${suffix}`);
    return `/api/ai/${config.channelId || "default"}/openai${urlToPath(fullUrl)}`;
}

/** 构建 Gemini 格式的代理 URL */
export function geminiProxyUrl(config: AiConfig, action?: "generateContent" | "streamGenerateContent"): string {
    const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const geminiBase = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/v1beta") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1beta`;
    const modelName = (config.model || "").trim().replace(/^models\//, "");
    const fullUrl = action ? `${geminiBase}/models/${encodeURIComponent(modelName)}:${action}` : `${geminiBase}/models`;
    return `/api/ai/${config.channelId || "default"}/gemini${urlToPath(fullUrl)}`;
}

/** OpenAI 格式请求头（不含 Authorization，由代理服务端注入） */
export function openaiProxyHeaders(_config: AiConfig, contentType?: string): Record<string, string> {
    return { ...(contentType ? { "Content-Type": contentType } : {}) };
}

/** Gemini 格式请求头（不含 x-goog-api-key，由代理服务端注入） */
export function geminiProxyHeaders(): Record<string, string> {
    return { "Content-Type": "application/json" };
}
