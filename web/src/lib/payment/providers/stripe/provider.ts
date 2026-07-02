import type {
    PaymentProvider, PaymentType, CreatePaymentRequest, CreatePaymentResponse,
    PaymentNotification, RefundRequest, RefundResponse, QueryOrderResponse,
} from "../../types";

export interface StripeConfig {
    secretKey: string;
    publishableKey?: string;
    webhookSecret?: string;
}

export class StripeProvider implements PaymentProvider {
    readonly providerKey = "stripe";
    readonly supportedTypes: PaymentType[] = ["stripe"];
    readonly defaultLimits = {
        stripe: { singleMax: 0, dailyMax: 0 },
    };

    private client: unknown = null;

    constructor(
        readonly name: string,
        private config: StripeConfig,
        readonly instanceId?: string,
    ) {}

    private async getClient(): Promise<{
        paymentIntents: {
            create: (params: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<{
                id: string;
                client_secret: string | null;
                status: string;
                amount: number;
                metadata?: Record<string, string>;
            }>;
            retrieve: (id: string) => Promise<{
                id: string;
                status: string;
                amount: number;
                metadata?: Record<string, string>;
            }>;
            cancel: (id: string) => Promise<void>;
        };
        refunds: {
            create: (params: Record<string, unknown>) => Promise<{ id: string; status: string }>;
        };
        webhooks: {
            constructEvent: (payload: Buffer, sig: string, secret: string) => {
                type: string;
                data: { object: { id: string; amount: number; metadata?: Record<string, string> } };
            };
        };
    }> {
        if (this.client) return this.client as never;
        if (!this.config.secretKey) throw new Error("STRIPE_SECRET_KEY not configured");
        const { default: Stripe } = await import("stripe");
        this.client = new Stripe(this.config.secretKey);
        return this.client as never;
    }

    async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
        const stripe = await this.getClient();
        const pi = await stripe.paymentIntents.create(
            {
                amount: Math.round(request.amount * 100),
                currency: "cny",
                automatic_payment_methods: { enabled: true },
                metadata: { orderId: request.orderId },
                description: request.subject,
            },
            { idempotencyKey: `pi-${request.orderId}` },
        );
        return { tradeNo: pi.id, clientSecret: pi.client_secret || undefined, publishableKey: this.config.publishableKey };
    }

    async queryOrder(tradeNo: string): Promise<QueryOrderResponse> {
        const stripe = await this.getClient();
        const pi = await stripe.paymentIntents.retrieve(tradeNo);
        return {
            tradeNo: pi.id,
            status: pi.status === "succeeded" ? "paid" : pi.status === "canceled" ? "failed" : "pending",
            amount: pi.amount / 100,
        };
    }

    async verifyNotification(rawBody: string | Buffer, headers: Record<string, string>): Promise<PaymentNotification | null> {
        const stripe = await this.getClient();
        const webhookSecret = this.config.webhookSecret;
        if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not configured");
        const sig = headers["stripe-signature"] || "";
        const buf = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
        const event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);

        if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
            const pi = event.data.object;
            return {
                tradeNo: pi.id,
                orderId: pi.metadata?.orderId || "",
                amount: pi.amount / 100,
                status: event.type === "payment_intent.succeeded" ? "success" : "failed",
                rawData: event,
            };
        }
        return null;
    }

    async refund(request: RefundRequest): Promise<RefundResponse> {
        const stripe = await this.getClient();
        const refund = await stripe.refunds.create({
            payment_intent: request.tradeNo,
            amount: Math.round(request.amount * 100),
            reason: "requested_by_customer",
        });
        return { refundId: refund.id, status: refund.status === "succeeded" ? "success" : "pending" };
    }

    async cancelPayment(tradeNo: string): Promise<void> {
        const stripe = await this.getClient();
        await stripe.paymentIntents.cancel(tradeNo);
    }
}
