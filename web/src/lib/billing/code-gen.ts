import crypto from "node:crypto";
import { RECHARGE_CODE_PREFIX } from "./constants";

/** 生成唯一充值码（用于订单幂等键） */
export function generateRechargeCode(orderId: string): string {
    const random = crypto.randomBytes(4).toString("hex");
    const truncatedId = orderId.replace(/-/g, "").slice(0, 16);
    return `${RECHARGE_CODE_PREFIX}${truncatedId}${random}`;
}

/** 生成兑换码（大写字母+数字，去除易混淆字符） */
export function generateRedeemCode(length: number = 12): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(length);
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length];
    }
    return result;
}

/** 批量生成兑换码（去重） */
export function generateRedeemCodes(count: number, length: number = 12): string[] {
    const codes = new Set<string>();
    while (codes.size < count) {
        codes.add(generateRedeemCode(length));
    }
    return [...codes];
}
