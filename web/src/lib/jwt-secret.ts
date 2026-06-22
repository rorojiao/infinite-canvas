const DEV_JWT_SECRET = "infinite-canvas-dev-secret-change-in-production";

let jwtKey: Uint8Array | null | undefined;

export function getJwtKey(): Uint8Array;
export function getJwtKey(options: { allowMissing: true }): Uint8Array | null;
export function getJwtKey(options?: { allowMissing?: boolean }) {
    if (jwtKey !== undefined) return jwtKey;
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : DEV_JWT_SECRET);
    if (!secret) {
        if (options?.allowMissing) return null;
        throw new Error("JWT_SECRET is required in production");
    }
    jwtKey = new TextEncoder().encode(secret);
    return jwtKey;
}
