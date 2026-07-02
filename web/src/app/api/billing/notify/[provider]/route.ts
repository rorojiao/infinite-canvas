import { type NextRequest } from "next/server";
import { handlePaymentNotify } from "@/lib/billing/order-service";
import { getProviderByInstanceId, initPaymentProviders, paymentRegistry } from "@/lib/payment/init";
import type { PaymentProvider } from "@/lib/payment/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getProvider(providerKey: string, instanceId?: string): Promise<PaymentProvider | null> {
    if (instanceId) return getProviderByInstanceId(instanceId);
    initPaymentProviders();
    // 找到第一个匹配 providerKey 的 provider
    for (const p of paymentRegistry.getAllProviders()) {
        if (p.providerKey === providerKey) return p;
    }
    return null;
}

async function handleNotify(req: NextRequest, providerKey: string): Promise<Response> {
    try {
        const instanceId = req.nextUrl.searchParams.get("inst") || undefined;
        const provider = await getProvider(providerKey, instanceId);
        if (!provider) return new Response("Provider not found", { status: 400 });

        // EasyPay 用 GET 回调（query string），Stripe 用 POST（raw body）
        let rawBody = "";
        let headers: Record<string, string> = {};

        if (req.method === "GET") {
            rawBody = req.nextUrl.searchParams.toString();
            headers = Object.fromEntries(req.headers.entries());
        } else {
            rawBody = await req.text();
            headers = Object.fromEntries(req.headers.entries());
        }

        const notification = await provider.verifyNotification(rawBody, headers);
        if (!notification) return new Response("success", { headers: { "Content-Type": "text/plain" } });

        const success = handlePaymentNotify(notification, provider.name);
        return new Response(success ? "success" : "fail", { headers: { "Content-Type": "text/plain" } });
    } catch (e) {
        console.error(`[Payment] Notify error (${providerKey}):`, e);
        return new Response("fail", { status: 500, headers: { "Content-Type": "text/plain" } });
    }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    const { provider } = await params;
    return handleNotify(req, provider);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    const { provider } = await params;
    return handleNotify(req, provider);
}
