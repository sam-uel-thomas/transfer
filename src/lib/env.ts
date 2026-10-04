import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See SETUP.md and .env.example.`);
  }
  return value;
}

/** Read lazily so `next build` works before every secret is configured. */
export const env = {
  get appUrl() {
    return required("APP_URL").replace(/\/+$/, "");
  },
  get allowedEmail() {
    return required("ALLOWED_EMAIL").trim().toLowerCase();
  },
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get r2AccountId() {
    return required("R2_ACCOUNT_ID");
  },
  get r2AccessKeyId() {
    return required("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey() {
    return required("R2_SECRET_ACCESS_KEY");
  },
  get r2Bucket() {
    return required("R2_BUCKET");
  },
  get resendApiKey() {
    return required("RESEND_API_KEY");
  },
  get emailFrom() {
    return required("EMAIL_FROM");
  },
  get cookieSecret() {
    const value = required("COOKIE_SECRET");
    if (value.length < 32) {
      throw new Error("COOKIE_SECRET must be at least 32 characters.");
    }
    return value;
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
};
