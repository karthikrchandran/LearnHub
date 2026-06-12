import { createHmac, timingSafeEqual } from "node:crypto";

export const SCORM_CONTENT_EXPIRES_PARAM = "lh_scorm_expires";
export const SCORM_CONTENT_TOKEN_PARAM = "lh_scorm_token";
export const SCORM_CONTENT_COOKIE_NAME = "learnhub_scorm_access";

const defaultScormContentAccessTtlSeconds = 15 * 60;

export type ScormContentAccessGrant = {
  expiresAtSeconds: number;
  token: string;
};

export function appendScormContentAccessToken(input: {
  launchUrl: string;
  secret: string;
  now: Date;
  ttlSeconds?: number;
}): string {
  const url = new URL(input.launchUrl, "http://learnhub.local");
  const objectKey = decodeURIComponent(url.pathname.replace(/^\/scorm\//, ""));
  const contentRootKey = scormContentRootKeyFromObjectKey(objectKey);

  if (!contentRootKey) {
    throw new Error("SCORM launch URL must target extracted package content");
  }

  const grant = createScormContentAccessGrant({
    contentRootKey,
    secret: input.secret,
    now: input.now,
    ttlSeconds: input.ttlSeconds,
  });
  const tokenizedPath = [
    "",
    "scorm",
    "_access",
    String(grant.expiresAtSeconds),
    grant.token,
    ...objectKey.split("/"),
  ].join("/");

  return `${tokenizedPath}${url.search}${url.hash}`;
}

export function createScormContentAccessGrant(input: {
  contentRootKey: string;
  secret: string;
  now: Date;
  ttlSeconds?: number;
}): ScormContentAccessGrant {
  const ttlSeconds = input.ttlSeconds ?? defaultScormContentAccessTtlSeconds;
  const expiresAtSeconds = Math.floor(input.now.getTime() / 1000) + ttlSeconds;

  return {
    expiresAtSeconds,
    token: signScormContentRoot({
      contentRootKey: input.contentRootKey,
      expiresAtSeconds,
      secret: input.secret,
    }),
  };
}

export function verifyScormContentAccessGrant(input: {
  contentRootKey: string;
  expiresAtSeconds: number;
  token: string;
  secret: string;
  now: Date;
}): boolean {
  if (!Number.isInteger(input.expiresAtSeconds) || input.expiresAtSeconds <= 0) {
    return false;
  }

  if (input.expiresAtSeconds < Math.floor(input.now.getTime() / 1000)) {
    return false;
  }

  const expected = signScormContentRoot({
    contentRootKey: input.contentRootKey,
    expiresAtSeconds: input.expiresAtSeconds,
    secret: input.secret,
  });

  return timingSafeEqualString(input.token, expected);
}

export function scormContentRootKeyFromObjectKey(objectKey: string): string | null {
  const parts = objectKey.split("/");

  if (
    parts.length < 8 ||
    parts[0] !== "org" ||
    !parts[1] ||
    parts[2] !== "courses" ||
    !parts[3] ||
    parts[4] !== "scorm" ||
    !parts[5] ||
    parts[6] !== "content"
  ) {
    return null;
  }

  return parts.slice(0, 7).join("/");
}

export function createScormContentAccessCookie(input: {
  grant: ScormContentAccessGrant;
  contentRootKey: string;
  now: Date;
}): string {
  const maxAgeSeconds = Math.max(0, input.grant.expiresAtSeconds - Math.floor(input.now.getTime() / 1000));
  const value = encodeURIComponent(`${input.grant.expiresAtSeconds}.${input.grant.token}`);

  return `${SCORM_CONTENT_COOKIE_NAME}=${value}; Path=/scorm/${input.contentRootKey}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax`;
}

export function parseScormContentAccessCookie(value: string | null): ScormContentAccessGrant | null {
  if (!value) {
    return null;
  }

  const cookie = value
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SCORM_CONTENT_COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  return parseScormContentAccessGrant(decodeURIComponent(cookie.slice(SCORM_CONTENT_COOKIE_NAME.length + 1)));
}

export function parseScormContentAccessGrant(value: string): ScormContentAccessGrant | null {
  const separator = value.indexOf(".");

  if (separator <= 0) {
    return null;
  }

  const expiresAtSeconds = Number(value.slice(0, separator));
  const token = value.slice(separator + 1);

  if (!Number.isInteger(expiresAtSeconds) || !token) {
    return null;
  }

  return { expiresAtSeconds, token };
}

function signScormContentRoot(input: {
  contentRootKey: string;
  expiresAtSeconds: number;
  secret: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.contentRootKey}:${input.expiresAtSeconds}`)
    .digest("base64url");
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
