import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtKey } from "./lib/jwt-secret";

const COOKIE_NAME = "ic-auth-token";
const PUBLIC_PATHS = ["/login", "/register"];

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
    const token = request.cookies.get(COOKIE_NAME)?.value;
    let authenticated = false;

    if (token) {
        const jwtKey = getJwtKey({ allowMissing: true });
        try {
            if (jwtKey) {
                await jwtVerify(token, jwtKey);
                authenticated = true;
            }
        } catch {
            authenticated = false;
        }
    }

    if (isPublic && authenticated) {
        return NextResponse.redirect(new URL("/", request.url));
    }
    if (!isPublic && !authenticated) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.svg|.*\\..*|login|register).*)"],
};
