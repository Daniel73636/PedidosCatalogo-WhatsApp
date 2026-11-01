import { createHash, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { Env } from "./env.js";

export type Role = "owner" | "cashier" | "kitchen" | "courier";
export interface Principal { subject: string; tenantId: string; role: Role; scopes: string[] }
interface User extends Principal { email: string; passwordHash: string }

const users = new Map<string, User>();
const revokedRefreshTokens = new Set<string>();

export async function seedDemoUser() {
  if (users.size) return;
  users.set("admin@arepa.test", {
    subject: "demo-owner",
    tenantId: "11111111-1111-4111-8111-111111111111",
    role: "owner",
    scopes: ["*"],
    email: "admin@arepa.test",
    passwordHash: await hash("Cambiar123!", 12),
  });
}

const secret = (env: Env) => new TextEncoder().encode(env.JWT_SECRET);
const sign = (principal: Principal, env: Env, type: "access" | "refresh", expiresIn: string) =>
  new SignJWT({ tenantId: principal.tenantId, role: principal.role, scopes: principal.scopes, type })
    .setProtectedHeader({ alg: "HS256" }).setSubject(principal.subject).setJti(randomUUID())
    .setIssuedAt().setExpirationTime(expiresIn).sign(secret(env));

export async function login(email: string, password: string, env: Env) {
  const user = users.get(email.toLowerCase());
  if (!user || !(await compare(password, user.passwordHash))) return undefined;
  const principal: Principal = { subject: user.subject, tenantId: user.tenantId, role: user.role, scopes: user.scopes };
  return { principal, accessToken: await sign(principal, env, "access", "15m"), refreshToken: await sign(principal, env, "refresh", "7d") };
}

export async function verifyToken(token: string, env: Env, expected: "access" | "refresh") {
  const { payload } = await jwtVerify(token, secret(env));
  if (payload.type !== expected || !payload.sub || !payload.tenantId || !payload.role) throw new Error("TOKEN_INVALIDO");
  if (expected === "refresh" && payload.jti && revokedRefreshTokens.has(payload.jti)) throw new Error("TOKEN_REVOCADO");
  return {
    subject: payload.sub, tenantId: String(payload.tenantId), role: payload.role as Role,
    scopes: Array.isArray(payload.scopes) ? payload.scopes.map(String) : [],
    jti: payload.jti,
  };
}

export async function refresh(refreshToken: string, env: Env) {
  const principal = await verifyToken(refreshToken, env, "refresh");
  if (principal.jti) revokedRefreshTokens.add(principal.jti);
  return {
    accessToken: await sign(principal, env, "access", "15m"),
    refreshToken: await sign(principal, env, "refresh", "7d"),
  };
}

export function principalFromApiKey(rawKey: string, env: Env): Principal | undefined {
  const digest = createHash("sha256").update(rawKey).digest("hex");
  const configured = (env.API_KEYS ?? "").split(",").filter(Boolean);
  for (const record of configured) {
    const [tenantId, expectedDigest, scopes = ""] = record.split(":");
    if (tenantId && expectedDigest === digest)
      return { subject: `api-key:${digest.slice(0, 8)}`, tenantId, role: "owner", scopes: scopes.split("|") };
  }
  if (env.DEMO_MODE && rawKey === env.DEMO_ADMIN_KEY)
    return { subject: "demo-key", tenantId: "11111111-1111-4111-8111-111111111111", role: "owner", scopes: ["*"] };
  return undefined;
}
