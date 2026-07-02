import { generateSign } from "./sign";

export interface EasyPayCreateResponse {
    code: number;
    msg?: string;
    trade_no: string;
    payurl?: string;
    payurl2?: string;
    qrcode?: string;
    img?: string;
}

export interface EasyPayQueryResponse {
    code: number;
    msg?: string;
    trade_no: string;
    out_trade_no: string;
    type: string;
    pid: string;
    money: string;
    status: number;
    endtime?: string;
}

export interface EasyPayConfig {
    pid: string;
    pkey: string;
    apiBase: string;
    notifyUrl: string;
    returnUrl: string;
    cid?: string;
    cidAlipay?: string;
    cidWxpay?: string;
}

export async function createPayment(opts: {
    outTradeNo: string;
    amount: string;
    paymentType: string;
    clientIp: string;
    productName: string;
    returnUrl?: string;
    isMobile?: boolean;
}, config: EasyPayConfig): Promise<EasyPayCreateResponse> {
    const params: Record<string, string> = {
        pid: config.pid,
        type: opts.paymentType,
        out_trade_no: opts.outTradeNo,
        notify_url: config.notifyUrl,
        return_url: opts.returnUrl || config.returnUrl,
        name: opts.productName,
        money: opts.amount,
        clientip: opts.clientIp,
    };
    const cid = opts.paymentType === "alipay"
        ? config.cidAlipay || config.cid
        : config.cidWxpay || config.cid;
    if (cid) params.cid = cid;
    if (opts.isMobile) params.device = "mobile";
    params.sign = generateSign(params, config.pkey);
    params.sign_type = "MD5";

    const response = await fetch(`${config.apiBase}/mapi.php`, {
        method: "POST",
        body: new URLSearchParams(params),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10_000),
    });
    const data = (await response.json()) as EasyPayCreateResponse;
    if (data.code !== 1) throw new Error(`EasyPay create payment failed: ${data.msg || "unknown error"}`);
    return data;
}

export async function refund(tradeNo: string, outTradeNo: string, money: string, config: EasyPayConfig): Promise<void> {
    const params = new URLSearchParams({
        pid: config.pid,
        key: config.pkey,
        trade_no: tradeNo,
        out_trade_no: outTradeNo,
        money,
    });
    const response = await fetch(`${config.apiBase}/api.php?act=refund`, {
        method: "POST",
        body: params,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json() as { code: number; msg?: string };
    if (data.code !== 1) throw new Error(`EasyPay refund failed: ${data.msg || "unknown error"}`);
}
