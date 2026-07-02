import { NextResponse } from "next/server";
import { getForSaleQuotaPackages, getForSaleSubscriptionPlans } from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function GET() {
    return NextResponse.json({
        quotaPackages: getForSaleQuotaPackages(),
        subscriptionPlans: getForSaleSubscriptionPlans(),
    });
}
