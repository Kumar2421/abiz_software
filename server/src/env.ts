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

  // "lax" when the API shares an origin with the app (Netlify function under
  // /api). "none" only when it is on another domain.
  COOKIE_SAMESITE: z.enum(["lax", "none"]).default("lax"),

  // Whether the session cookie carries the Secure flag. Defaults to on in
  // production. Browsers reject Secure cookies over plain http, so running a
  // production build against http://localhost needs this set to false.
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),

  // Where chat attachments live.
  //   local    - server/.data/uploads, development only (wiped on redeploy)
  //   supabase - Supabase Storage bucket, survives deploys and scales out
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  SUPABASE_URL: z.string().optional(),
  // Service role key: server-side only, bypasses row level security.
  // Never expose this to the browser.
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("attachments"),

  // Razorpay. Leave blank until the account is ready — the billing routes then
  // report "not configured" instead of failing in a confusing way.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  // Set in the Razorpay dashboard when creating the webhook. Without it the
  // webhook cannot be trusted and is rejected.
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Free trial length for a brand-new account. 0 means pay upfront: the
  // account is EXPIRED from the moment it is created, so it can read the
  // dashboard but cannot send until payment succeeds.
  TRIAL_DAYS: z.coerce.number().int().min(0).default(0),

  // When false, checkout is refused while the current trial or paid term is
  // still running — a customer may only pay once it has ended. Set true to
  // let people buy early instead of waiting for expiry.
  ALLOW_EARLY_PAYMENT: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  // Shared secret for POST /api/automation/cron/run-scheduled. Without it the
  // endpoint refuses to run, so reminders never fire from an unguarded call.
  CRON_SECRET: z.string().optional(),
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

if (env.STORAGE_DRIVER === "supabase") {
  const missing = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const).filter(
    (name) => !env[name],
  );
  if (missing.length) {
    console.error(`STORAGE_DRIVER=supabase requires: ${missing.join(", ")}`);
    process.exit(1);
  }
}

if (env.NODE_ENV === "production" && env.STORAGE_DRIVER === "local") {
  console.warn(
    "STORAGE_DRIVER=local in production: attachments are lost on redeploy and " +
      "are not shared between instances. Use supabase.",
  );
}

/** Comma-separated origins are allowed so preview deploys can be added. */
export const clientOrigins = env.CLIENT_ORIGIN.split(",").map((o) => o.trim());
