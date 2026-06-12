import { z } from "zod";

const localDatabaseUrl = "postgresql://learnhub:learnhub@localhost:5432/learnhub?schema=public";
const localBaseUrl = "http://localhost:3000";
const localNextAuthSecret = "learnhub-local-secret";
const placeholderNextAuthSecret = "replace-with-a-local-secret";

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }

  return value;
}, z.boolean().default(false));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  APP_BASE_URL: z.string().url(),
  EMAIL_PROVIDER: z.enum(["console", "smtp", "api-provider"]),
  EMAIL_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: booleanFromEnv,
  EMAIL_API_ENDPOINT: z.string().url().optional(),
  EMAIL_API_TOKEN: z.string().optional(),
  NOTIFICATION_JOBS_SECRET: z.string().optional(),
  MUX_TOKEN_ID: z.string().optional(),
  MUX_TOKEN_SECRET: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  CREDLY_ORGANIZATION_ID: z.string().optional(),
  CREDLY_API_TOKEN: z.string().optional(),
}).superRefine((value, context) => {
  if (value.EMAIL_PROVIDER === "smtp" && !value.SMTP_HOST?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["SMTP_HOST"],
      message: "SMTP_HOST is required when EMAIL_PROVIDER is smtp.",
    });
  }

  if (value.EMAIL_PROVIDER === "smtp" && !value.EMAIL_FROM?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["EMAIL_FROM"],
      message: "EMAIL_FROM is required when EMAIL_PROVIDER is smtp.",
    });
  }

  if (value.EMAIL_PROVIDER === "api-provider" && !value.EMAIL_API_ENDPOINT?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["EMAIL_API_ENDPOINT"],
      message: "EMAIL_API_ENDPOINT is required when EMAIL_PROVIDER is api-provider.",
    });
  }

  if (value.EMAIL_PROVIDER === "api-provider" && !value.EMAIL_API_TOKEN?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["EMAIL_API_TOKEN"],
      message: "EMAIL_API_TOKEN is required when EMAIL_PROVIDER is api-provider.",
    });
  }

  if (value.EMAIL_PROVIDER === "api-provider" && !value.EMAIL_FROM?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["EMAIL_FROM"],
      message: "EMAIL_FROM is required when EMAIL_PROVIDER is api-provider.",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

const valueOrUndefined = (value: string | undefined) => (value && value.trim().length > 0 ? value : undefined);

const buildEnvSource = (source: NodeJS.ProcessEnv) => {
  const isProduction = source.NODE_ENV === "production";

  return {
    DATABASE_URL: valueOrUndefined(source.DATABASE_URL) ?? (!isProduction ? localDatabaseUrl : undefined),
    NEXTAUTH_SECRET:
      valueOrUndefined(source.NEXTAUTH_SECRET) ?? (!isProduction ? localNextAuthSecret : undefined),
    NEXTAUTH_URL: valueOrUndefined(source.NEXTAUTH_URL) ?? (!isProduction ? localBaseUrl : undefined),
    APP_BASE_URL: valueOrUndefined(source.APP_BASE_URL) ?? (!isProduction ? localBaseUrl : undefined),
    EMAIL_PROVIDER: valueOrUndefined(source.EMAIL_PROVIDER) ?? (!isProduction ? "console" : undefined),
    EMAIL_FROM: source.EMAIL_FROM,
    SMTP_HOST: source.SMTP_HOST,
    SMTP_PORT: valueOrUndefined(source.SMTP_PORT) ?? (!isProduction ? "587" : undefined),
    SMTP_USER: source.SMTP_USER,
    SMTP_PASSWORD: source.SMTP_PASSWORD,
    SMTP_SECURE: source.SMTP_SECURE,
    EMAIL_API_ENDPOINT: source.EMAIL_API_ENDPOINT,
    EMAIL_API_TOKEN: source.EMAIL_API_TOKEN,
    NOTIFICATION_JOBS_SECRET: source.NOTIFICATION_JOBS_SECRET,
    MUX_TOKEN_ID: source.MUX_TOKEN_ID,
    MUX_TOKEN_SECRET: source.MUX_TOKEN_SECRET,
    R2_ACCOUNT_ID: source.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: source.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: source.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: source.R2_BUCKET_NAME,
    CREDLY_ORGANIZATION_ID: source.CREDLY_ORGANIZATION_ID,
    CREDLY_API_TOKEN: source.CREDLY_API_TOKEN,
  };
};

export const getEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsedEnv = envSchema.parse(buildEnvSource(source));

  if (source.NODE_ENV === "production" && parsedEnv.NEXTAUTH_SECRET === placeholderNextAuthSecret) {
    throw new Error("NEXTAUTH_SECRET must be changed from the placeholder value in production.");
  }

  if (source.NODE_ENV === "production" && !parsedEnv.NOTIFICATION_JOBS_SECRET?.trim()) {
    throw new Error("NOTIFICATION_JOBS_SECRET is required in production.");
  }

  if (source.NODE_ENV === "production" && parsedEnv.EMAIL_PROVIDER === "console") {
    throw new Error("Console email provider cannot be used in production.");
  }

  return parsedEnv;
};

export const env = new Proxy({} as Env, {
  get(_target, property) {
    if (typeof property !== "string") {
      return undefined;
    }

    return getEnv()[property as keyof Env];
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv());
  },
  getOwnPropertyDescriptor(_target, property) {
    if (typeof property !== "string") {
      return undefined;
    }

    return {
      configurable: true,
      enumerable: true,
      value: getEnv()[property as keyof Env],
    };
  },
}) as Env;
