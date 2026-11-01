import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { apiKeys, createDb, refreshSessions, stores, users as userRows } from "@pedidos/db";
import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { Env } from "./env.js";

export type Role = "owner" | "cashier" | "kitchen" | "courier";
export interface Principal { subject: string; tenantId: string; role: Role; scopes: string[] }
interface User extends Principal { email: string; passwordHash: string }

const users = new Map<string, User>();
const revokedRefreshTokens = new Set<string>();
interface AuthStore {
  findUser(tenantSlug: string, email: string): Promise<User | undefined>;
  saveRefresh(principal: Principal, jti: string, expiresAt: Date): Promise<void>;
  refreshActive(tenantId: string, jti: string): Promise<boolean>;
  revokeRefresh(tenantId: string, jti: string): Promise<void>;
  findApiKey(tenantId: string, digest: string): Promise<Principal | undefined>;
  close(): Promise<void>;
}

class MemoryAuthStore implements AuthStore {
  async findUser(_tenantSlug: string, email: string) { return users.get(email.toLowerCase()); }
  async saveRefresh() {}
  async refreshActive(_tenantId: string, jti: string) { return !revokedRefreshTokens.has(jti); }
  async revokeRefresh(_tenantId: string, jti: string) { revokedRefreshTokens.add(jti); }
  async findApiKey() { return undefined; }
  async close() {}
}

class PostgresAuthStore implements AuthStore {
  private readonly connection;
  constructor(url: string) { this.connection = createDb(url); }
  private async tenant(tx: { execute(query: unknown): Promise<unknown> }, tenantId: string) {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
  }
  async findUser(tenantSlug: string, email: string) {
    return this.connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.store_slug', ${tenantSlug}, true)`);
      const [store] = await tx.select({ tenantId: stores.tenantId }).from(stores).where(eq(stores.slug, tenantSlug)).limit(1);
      if (!store) return undefined;
      await this.tenant(tx as never, store.tenantId);
      const [user] = await tx.select().from(userRows).where(and(
        eq(userRows.tenantId, store.tenantId), eq(userRows.email, email.toLowerCase()), eq(userRows.active, true),
      )).limit(1);
      return user ? {
        subject: user.id, tenantId: user.tenantId, role: user.role as Role, scopes: ["*"],
        email: user.email, passwordHash: user.passwordHash,
      } : undefined;
    });
  }
  async saveRefresh(principal: Principal, jti: string, expiresAt: Date) {
    await this.connection.db.transaction(async (tx) => {
      await this.tenant(tx as never, principal.tenantId);
      await tx.insert(refreshSessions).values({
        tenantId: principal.tenantId, userId: principal.subject,
        tokenIdHash: createHash("sha256").update(jti).digest("hex"), expiresAt,
      });
    });
  }
  async refreshActive(tenantId: string, jti: string) {
    return this.connection.db.transaction(async (tx) => {
      await this.tenant(tx as never, tenantId);
      const [session] = await tx.select({ id: refreshSessions.id }).from(refreshSessions).where(and(
        eq(refreshSessions.tenantId, tenantId),
        eq(refreshSessions.tokenIdHash, createHash("sha256").update(jti).digest("hex")),
        isNull(refreshSessions.revokedAt), gt(refreshSessions.expiresAt, new Date()),
      )).limit(1);
      return Boolean(session);
    });
  }
  async revokeRefresh(tenantId: string, jti: string) {
    await this.connection.db.transaction(async (tx) => {
      await this.tenant(tx as never, tenantId);
      await tx.update(refreshSessions).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(
        eq(refreshSessions.tenantId, tenantId),
        eq(refreshSessions.tokenIdHash, createHash("sha256").update(jti).digest("hex")),
      ));
    });
  }
  async findApiKey(tenantId: string, digest: string) {
    return this.connection.db.transaction(async (tx) => {
      await this.tenant(tx as never, tenantId);
      const [key] = await tx.select().from(apiKeys).where(and(
        eq(apiKeys.tenantId, tenantId), eq(apiKeys.keyHash, digest), isNull(apiKeys.revokedAt),
      )).limit(1);
      return key ? { subject: `api-key:${key.id}`, tenantId, role: "owner" as const, scopes: key.scopes } : undefined;
    });
  }
  async close() { await this.connection.close(); }
}

let authStore: AuthStore = new MemoryAuthStore();

async function seedDemoUser() {
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

export async function initializeAuth(env: Env) {
  if (env.DATABASE_URL && !env.DEMO_MODE) authStore = new PostgresAuthStore(env.DATABASE_URL);
  else { authStore = new MemoryAuthStore(); await seedDemoUser(); }
}

export async function closeAuth() { await authStore.close(); }

const secret = (env: Env) => new TextEncoder().encode(env.JWT_SECRET);
const sign = async (principal: Principal, env: Env, type: "access" | "refresh", expiresIn: string) => {
  const jti = randomUUID();
  const token = await new SignJWT({ tenantId: principal.tenantId, role: principal.role, scopes: principal.scopes, type })
    .setProtectedHeader({ alg: "HS256" }).setSubject(principal.subject).setJti(jti)
    .setIssuedAt().setExpirationTime(expiresIn).sign(secret(env));
  return { token, jti };
};

export async function login(tenantSlug: string, email: string, password: string, env: Env) {
  const user = await authStore.findUser(tenantSlug, email);
  if (!user || !(await compare(password, user.passwordHash))) return undefined;
  const principal: Principal = { subject: user.subject, tenantId: user.tenantId, role: user.role, scopes: user.scopes };
  const [access, refresh] = await Promise.all([sign(principal, env, "access", "15m"), sign(principal, env, "refresh", "7d")]);
  await authStore.saveRefresh(principal, refresh.jti, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  return { principal, accessToken: access.token, refreshToken: refresh.token };
}

export async function verifyToken(token: string, env: Env, expected: "access" | "refresh") {
  const { payload } = await jwtVerify(token, secret(env));
  if (payload.type !== expected || !payload.sub || !payload.tenantId || !payload.role) throw new Error("TOKEN_INVALIDO");
  if (expected === "refresh" && (!payload.jti || !(await authStore.refreshActive(String(payload.tenantId), payload.jti))))
    throw new Error("TOKEN_REVOCADO");
  return {
    subject: payload.sub, tenantId: String(payload.tenantId), role: payload.role as Role,
    scopes: Array.isArray(payload.scopes) ? payload.scopes.map(String) : [],
    jti: payload.jti,
  };
}

export async function refresh(refreshToken: string, env: Env) {
  const principal = await verifyToken(refreshToken, env, "refresh");
  if (principal.jti) await authStore.revokeRefresh(principal.tenantId, principal.jti);
  const access = await sign(principal, env, "access", "15m");
  const nextRefresh = await sign(principal, env, "refresh", "7d");
  await authStore.saveRefresh(principal, nextRefresh.jti, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  return {
    accessToken: access.token,
    refreshToken: nextRefresh.token,
  };
}

export async function principalFromApiKey(rawKey: string, env: Env): Promise<Principal | undefined> {
  const digest = createHash("sha256").update(rawKey).digest("hex");
  const [keyTenantId] = rawKey.split(".");
  if (/^[0-9a-f-]{36}$/i.test(keyTenantId ?? "")) {
    const principal = await authStore.findApiKey(keyTenantId!, digest);
    if (principal) return principal;
  }
  const configured = (env.API_KEYS ?? "").split(",").filter(Boolean);
  for (const record of configured) {
    const [tenantId, expectedDigest, ...scopeParts] = record.split(":");
    const scopes = scopeParts.join(":");
    if (tenantId && expectedDigest === digest)
      return { subject: `api-key:${digest.slice(0, 8)}`, tenantId, role: "owner", scopes: scopes.split("|") };
  }
  if (env.DEMO_MODE && rawKey === env.DEMO_ADMIN_KEY)
    return { subject: "demo-key", tenantId: "11111111-1111-4111-8111-111111111111", role: "owner", scopes: ["*"] };
  return undefined;
}
