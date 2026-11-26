export type MediaProviderEnv = {
  MUX_TOKEN_ID?: string;
  MUX_TOKEN_SECRET?: string;
  MUX_WEBHOOK_SECRET?: string;
  MUX_SIGNING_KEY_ID?: string;
  MUX_SIGNING_PRIVATE_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  SCORM_EXTRACTION_JOB_SECRET?: string;
};

export type ProviderReadiness = {
  configured: boolean;
  missing: string[];
};

export type MediaProviderReadiness = {
  mux: ProviderReadiness;
  r2: ProviderReadiness;
  scormExtraction: ProviderReadiness;
};

export function getMediaProviderReadiness(env: MediaProviderEnv): MediaProviderReadiness {
  return {
    mux: readinessFor(env, ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_WEBHOOK_SECRET", "MUX_SIGNING_KEY_ID", "MUX_SIGNING_PRIVATE_KEY"]),
    r2: readinessFor(env, ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]),
    scormExtraction: readinessFor(env, ["SCORM_EXTRACTION_JOB_SECRET"]),
  };
}

export function readinessText(readiness: ProviderReadiness): string {
  return readiness.configured ? "Ready" : `Missing ${readiness.missing.join(", ")}`;
}

function readinessFor<K extends keyof MediaProviderEnv>(env: MediaProviderEnv, keys: K[]): ProviderReadiness {
  const missing = keys.filter((key) => !env[key]?.trim());

  return {
    configured: missing.length === 0,
    missing,
  };
}
