import crypto from "node:crypto";

export function generateSign(params: Record<string, string>, pkey: string): string {
    const filtered = Object.entries(params)
        .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== "" && value !== undefined && value !== null)
        .sort(([a], [b]) => a.localeCompare(b));
    const queryString = filtered.map(([key, value]) => `${key}=${value}`).join("&");
    return crypto.createHash("md5").update(queryString + pkey).digest("hex");
}

export function verifySign(params: Record<string, string>, pkey: string, sign: string): boolean {
    const expected = generateSign(params, pkey);
    if (expected.length !== sign.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sign));
}
