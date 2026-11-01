import { createHash } from "node:crypto";
import { apiKeys, createDb } from "@pedidos/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAuth, initializeAuth, login, principalFromApiKey, refresh } from "./auth.js";
import { loadEnv } from "./env.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("auth PostgreSQL", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const rawApiKey = `${tenantId}.automation-secret`;
  const direct = databaseUrl ? createDb(databaseUrl) : undefined;
  const env = loadEnv({
    NODE_ENV: "test", DATABASE_URL: databaseUrl,
    JWT_SECRET: "postgres-test-secret-with-thirty-two-characters",
  });

  beforeAll(async () => {
    await initializeAuth(env);
    await direct!.db.insert(apiKeys).values({
      tenantId, name: "Integración", keyHash: createHash("sha256").update(rawApiKey).digest("hex"), scopes: ["orders:read"],
    }).onConflictDoNothing();
  });
  afterAll(async () => { await closeAuth(); await direct!.close(); });

  it("autentica usuario, rota refresh y carga API key por tenant", async () => {
    const session = await login("arepa-express", "admin@arepa.test", "Cambiar123!", env);
    expect(session?.principal.tenantId).toBe(tenantId);
    const rotated = await refresh(session!.refreshToken, env);
    await expect(refresh(session!.refreshToken, env)).rejects.toThrow("TOKEN_REVOCADO");
    expect(rotated.accessToken).toBeTruthy();
    expect((await principalFromApiKey(rawApiKey, env))?.scopes).toEqual(["orders:read"]);
  });
});
