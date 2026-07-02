import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
    const keyHex = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY || "";
    if (keyHex) return Buffer.from(keyHex, "hex");
    const jwtSecret = process.env.JWT_SECRET || "infinite-canvas-dev-secret-change-in-production";
    return crypto.createHash("sha256").update(jwtSecret).digest();
}

/** 加密 JSON 配置 */
export function encryptConfig(data: Record<string, unknown>): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const json = JSON.stringify(data);
    const encryptedData = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encryptedData]).toString("base64");
}

/** 解密 JSON 配置 */
export function decryptConfig(encrypted: string): Record<string, string> {
    const key = getEncryptionKey();
    const buf = Buffer.from(encrypted, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encryptedData = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
}
