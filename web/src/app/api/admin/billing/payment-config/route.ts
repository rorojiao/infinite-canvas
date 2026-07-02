import { type NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptConfig, decryptConfig } from "@/lib/payment/crypto";
import { resetPaymentProviders } from "@/lib/payment/init";

export const runtime = "nodejs";

export async function GET() {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const rows = db.prepare("SELECT id, provider_key, name, supported_types, enabled, sort_order, limits, refund_enabled, created_at FROM payment_provider_instances ORDER BY sort_order ASC").all() as Array<{
        id: string; provider_key: string; name: string; supported_types: string; enabled: number;
        sort_order: number; limits: string; refund_enabled: number; created_at: string;
    }>;
    const instances = rows.map((r) => ({
        ...r,
        enabled: Boolean(r.enabled),
        refundEnabled: Boolean(r.refund_enabled),
        // config 不返回（脱敏）
        hasConfig: true,
    }));
    return NextResponse.json({ instances });
}

export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const body = await req.json();
    const { id, providerKey, name, config, supportedTypes, enabled, sortOrder, refundEnabled } = body;
    if (!providerKey || !config) return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });

    const instanceId = id || nanoid();
    const now = new Date().toISOString();
    const encryptedConfig = encryptConfig(config);

    db.prepare(
        `INSERT INTO payment_provider_instances (id, provider_key, name, config, supported_types, enabled, sort_order, limits, refund_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, config=excluded.config, supported_types=excluded.supported_types,
           enabled=excluded.enabled, sort_order=excluded.sort_order, refund_enabled=excluded.refund_enabled, updated_at=excluded.updated_at`,
    ).run(
        instanceId, providerKey, name || `${providerKey} instance`, encryptedConfig,
        supportedTypes || "", enabled !== false ? 1 : 0, sortOrder || 0,
        refundEnabled ? 1 : 0, now, now,
    );

    resetPaymentProviders();
    return NextResponse.json({ ok: true, id: instanceId });
}
