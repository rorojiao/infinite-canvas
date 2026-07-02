import type {
    PaymentProvider, PaymentType, CreatePaymentRequest, CreatePaymentResponse,
    PaymentNotification, RefundRequest, RefundResponse,
} from "../../types";
import { createPayment, refund, type EasyPayConfig } from "./client";
import { verifySign } from "./sign";

export class EasyPayProvider implements PaymentProvider {
    readonly providerKey = "easypay";
    readonly supportedTypes: PaymentType[] = ["alipay", "wxpay"];
    readonly defaultLimits = {
        alipay: { singleMax: 1000, dailyMax: 10000 },
        wxpay: { singleMax: 1000, dailyMax: 10000 },
    };

    constructor(
        readonly name: string,
        private config: EasyPayConfig,
        readonly instanceId?: string,
    ) {}

    async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
        const result = await createPayment(
            {
                outTradeNo: request.orderId,
                amount: request.amount.toFixed(2),
                paymentType: request.paymentType,
                clientIp: request.clientIp || "127.0.0.1",
                productName: request.subject,
                returnUrl: request.returnUrl,
                isMobile: request.isMobile,
            },
            this.config,
        );
        return {
            tradeNo: result.trade_no,
            payUrl: (request.isMobile && result.payurl2) || result.payurl,
            qrCode: result.qrcode,
        };
    }

    async verifyNotification(rawBody: string | Buffer, _headers: Record<string, string>): Promise<PaymentNotification> {
        const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
        const searchParams = new URLSearchParams(body);
        const params: Record<string, string> = {};
        for (const [key, value] of searchParams.entries()) params[key] = value;

        const sign = params.sign || "";
        const paramsForSign: Record<string, string> = {};
        for (const [key, value] of Object.entries(params)) {
            if (key !== "sign" && key !== "sign_type" && value !== undefined && value !== null) {
                paramsForSign[key] = value;
            }
        }

        if (!verifySign(paramsForSign, this.config.pkey, sign)) {
            throw new Error("EasyPay notification signature verification failed");
        }
        if (params.pid && params.pid !== this.config.pid) {
            throw new Error(`EasyPay notification pid mismatch: expected ${this.config.pid}, got ${params.pid}`);
        }

        const amount = parseFloat(params.money || "0");
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error(`EasyPay notification invalid amount: ${params.money}`);
        }

        return {
            tradeNo: params.trade_no || "",
            orderId: params.out_trade_no || "",
            amount,
            status: params.trade_status === "TRADE_SUCCESS" ? "success" : "failed",
            rawData: params,
        };
    }

    async refund(request: RefundRequest): Promise<RefundResponse> {
        await refund(request.tradeNo, request.orderId, request.amount.toFixed(2), this.config);
        return { refundId: `${request.tradeNo}-refund`, status: "success" };
    }

    async cancelPayment(): Promise<void> {
        // EasyPay does not support cancelling payments
    }
}
