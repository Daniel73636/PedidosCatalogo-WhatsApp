import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL es obligatoria");
const migrations = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");
const sql = postgres(url, { max: 1 });
try {
  for (const file of ["0001_tenant_rls.sql", "0002_child_rls_auth_payments.sql"]) {
    await sql.unsafe(await readFile(resolve(migrations, file), "utf8"));
    console.log(`Migración aplicada: ${file}`);
  }
} finally {
  await sql.end();
}
