import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().url().optional(),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(32).default("desarrollo-solamente-cambiar-esta-clave"),
  DEMO_MODE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DEMO_ADMIN_KEY: z.string().min(16).optional(),
  API_KEYS: z.string().optional(),
  WHATSAPP_CLOUD_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  PAYMENTS_PROVIDER: z.enum(["mock", "wompi"]).default("mock"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`CONFIGURACION_INVALIDA: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  if (result.data.NODE_ENV === "production" && result.data.JWT_SECRET === "desarrollo-solamente-cambiar-esta-clave")
    throw new Error("CONFIGURACION_INVALIDA: JWT_SECRET es obligatorio en producción");
  if (result.data.DEMO_MODE && !result.data.DEMO_ADMIN_KEY)
    throw new Error("CONFIGURACION_INVALIDA: DEMO_ADMIN_KEY es obligatorio con DEMO_MODE=true");
  return result.data;
}
