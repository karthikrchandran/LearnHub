import { createHash, createHmac } from "node:crypto";

import type {
  ObjectStorageProvider,
  PutObjectInput,
  StoredObject,
} from "./object-storage-provider";
import { normalizeObjectKey } from "../../storage/storage-keys";

export type R2ObjectStorageProviderConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  now?: () => Date;
  fetch?: typeof fetch;
  defaultExpiresInSeconds?: number;
};

export function createR2ObjectStorageProvider(config: R2ObjectStorageProviderConfig): ObjectStorageProvider {
  const fetcher = config.fetch ?? fetch;

  return {
    async getSignedReadUrl(key) {
      return createSignedUrl({
        config,
        method: "GET",
        key: normalizeObjectKey(key),
      });
    },
    async getSignedWriteUrl(input) {
      return createSignedUrl({
        config,
        method: "PUT",
        key: normalizeObjectKey(input.key),
        contentType: input.contentType,
        expiresInSeconds: input.expiresInSeconds,
      });
    },
    async putObject(input: PutObjectInput): Promise<StoredObject> {
      const key = normalizeObjectKey(input.key);
      const url = await this.getSignedWriteUrl({
        key,
        contentType: input.contentType,
      });
      const response = await fetcher(url, {
        method: "PUT",
        headers: {
          "content-type": input.contentType,
        },
        body: input.body as BodyInit,
      });

      if (!response.ok) {
        throw new Error(`R2 object write failed with status ${response.status}`);
      }

      return { key, url };
    },
    async deleteObject(key): Promise<void> {
      const url = createSignedUrl({
        config,
        method: "DELETE",
        key: normalizeObjectKey(key),
      });
      const response = await fetcher(url, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(`R2 object delete failed with status ${response.status}`);
      }
    },
  };
}

type SignedUrlInput = {
  config: R2ObjectStorageProviderConfig;
  method: "GET" | "PUT" | "DELETE";
  key: string;
  contentType?: string;
  expiresInSeconds?: number;
};

function createSignedUrl(input: SignedUrlInput): string {
  const now = input.config.now?.() ?? new Date();
  const amzDate = toAmzDate(now);
  const datestamp = amzDate.slice(0, 8);
  const expiresInSeconds = String(input.expiresInSeconds ?? input.config.defaultExpiresInSeconds ?? 900);
  const credentialScope = `${datestamp}/auto/s3/aws4_request`;
  const credential = `${input.config.accessKeyId}/${credentialScope}`;
  const host = `${input.config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodePathSegment(input.config.bucketName)}/${encodeObjectKey(input.key)}`;
  const canonicalHeaders = signedHeadersForRequest({
    host,
    contentType: input.method === "PUT" ? input.contentType : undefined,
  });
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": expiresInSeconds,
    "X-Amz-SignedHeaders": canonicalHeaders.signedHeaders,
  });
  const canonicalQuery = [...query.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`)
    .join("&");
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders.canonicalHeaders,
    canonicalHeaders.signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(signingKey(input.config.secretAccessKey, datestamp), stringToSign);

  query.set("X-Amz-Signature", signature);

  return `https://${host}${canonicalUri}?${query.toString()}`;
}

function signedHeadersForRequest(input: { host: string; contentType?: string }): {
  canonicalHeaders: string;
  signedHeaders: string;
} {
  const headers = input.contentType
    ? [
        ["content-type", normalizeHeaderValue(input.contentType)],
        ["host", input.host],
      ]
    : [["host", input.host]];

  return {
    canonicalHeaders: headers.map(([name, value]) => `${name}:${value}\n`).join(""),
    signedHeaders: headers.map(([name]) => name).join(";"),
  };
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function signingKey(secretAccessKey: string, datestamp: string): Buffer {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, datestamp);
  const regionKey = hmacBuffer(dateKey, "auto");
  const serviceKey = hmacBuffer(regionKey, "s3");

  return hmacBuffer(serviceKey, "aws4_request");
}

function hmacBuffer(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodePathSegment).join("/");
}

function encodePathSegment(value: string): string {
  return rfc3986(value);
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
