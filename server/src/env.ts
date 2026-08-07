import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  CLIENT_ORIGIN: z.string().default("http://localhost:3001"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  DATABASE_URL: z.string().optional(),
  WHATSAPP_DRIVER: z.enum(["mock", "cloud"]).default("mock"),
  META_GRAPH_VERSION: z.string().default("v21.0"),

  // Credentials for `npm run seed`. Local development only — the seed script
  // refuses to run when NODE_ENV is production.
  SEED_ADMIN_LOGIN: z.string().trim().min(1).default("admin"),
  SEED_ADMIN_PASSWORD: z.string().min(6).default("admin123"),
  SEED_COMPANY_NAME: z.string().trim().min(1).default("Abiz Store"),

  // How long a password reset link stays valid.
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  // Encrypts WhatsApp access tokens at rest. Generate 32 bytes of hex:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  // Changing this makes already-stored tokens unreadable — they must be
  // re-entered.
  ENCRYPTION_KEY: z
    .string()
    .min(16, "ENCRYPTION_KEY must be at least 16 characters"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

/** Comma-separated origins are allowed so preview deploys can be added. */
export const clientOrigins = env.CLIENT_ORIGIN.split(",").map((o) => o.trim());
