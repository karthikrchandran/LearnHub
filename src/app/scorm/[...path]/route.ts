import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

import { getEnv, type Env } from "@/lib/env";
import {
  createR2ObjectStorageProvider,
  type R2ObjectStorageProviderConfig,
} from "@/modules/providers/storage/r2-object-storage-provider";
import {
  createScormContentAccessCookie,
  parseScormContentAccessCookie,
  type ScormContentAccessGrant,
  SCORM_CONTENT_EXPIRES_PARAM,
  SCORM_CONTENT_TOKEN_PARAM,
  scormContentRootKeyFromObjectKey,
  verifyScormContentAccessGrant,
} from "@/modules/scorm/scorm-content-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ScormContentRouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(request: Request, { params }: ScormContentRouteContext): Promise<Response> {
  const { path } = await params;

  if (!isSafePath(path)) {
    return new Response("Invalid SCORM content path", { status: 400 });
  }

  const env = getEnv();
  const storageConfig = optionalR2Config(env);

  if (storageConfig) {
    return serveR2ScormContent({
      request,
      path,
      storageConfig,
      secret: env.NEXTAUTH_SECRET,
    });
  }

  const contentRoot = resolve(join(process.cwd(), ".learnhub", "scorm"));
  const targetPath = resolve(contentRoot, ...path);
  const relativePath = relative(contentRoot, targetPath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return new Response("Invalid SCORM content path", { status: 400 });
  }

  try {
    const fileStat = await stat(targetPath);

    if (!fileStat.isFile()) {
      return new Response("SCORM content not found", { status: 404 });
    }

    const file = await readFile(targetPath);

    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": contentTypeForPath(targetPath),
      },
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      return new Response("SCORM content not found", { status: 404 });
    }

    return new Response("SCORM content read failed", { status: 500 });
  }
}

async function serveR2ScormContent(input: {
  request: Request;
  path: string[];
  storageConfig: R2ObjectStorageProviderConfig;
  secret: string;
}): Promise<Response> {
  const objectKey = input.path.join("/");
  const contentRootKey = scormContentRootKeyFromObjectKey(objectKey);

  if (!contentRootKey) {
    return new Response("Invalid SCORM content path", { status: 400 });
  }

  const now = new Date();
  const url = new URL(input.request.url);
  const queryGrant = readScormContentQueryGrant(url);
  const cookieGrant = parseScormContentAccessCookie(input.request.headers.get("cookie"));
  const grant = queryGrant ?? cookieGrant;

  if (
    !grant ||
    !verifyScormContentAccessGrant({
      contentRootKey,
      expiresAtSeconds: grant.expiresAtSeconds,
      token: grant.token,
      secret: input.secret,
      now,
    })
  ) {
    return new Response("SCORM content access token is required", { status: 403 });
  }

  const provider = createR2ObjectStorageProvider(input.storageConfig);
  const signedReadUrl = await provider.getSignedReadUrl(objectKey);
  const storageResponse = await fetch(signedReadUrl);

  if (storageResponse.status === 404) {
    return new Response("SCORM content not found", { status: 404 });
  }

  if (!storageResponse.ok) {
    return new Response("SCORM content read failed", { status: 502 });
  }

  const headers = new Headers({
    "content-type": storageResponse.headers.get("content-type") ?? contentTypeForPath(objectKey),
  });

  if (queryGrant) {
    headers.append(
      "set-cookie",
      createScormContentAccessCookie({
        grant: queryGrant,
        contentRootKey,
        now,
      }),
    );
  }

  return new Response(storageResponse.body, {
    status: storageResponse.status,
    headers,
  });
}

function readScormContentQueryGrant(url: URL): ScormContentAccessGrant | null {
  const expiresAtSeconds = Number(url.searchParams.get(SCORM_CONTENT_EXPIRES_PARAM));
  const token = url.searchParams.get(SCORM_CONTENT_TOKEN_PARAM);

  if (!Number.isInteger(expiresAtSeconds) || !token) {
    return null;
  }

  return { expiresAtSeconds, token };
}

function isSafePath(path: string[]): boolean {
  return (
    path.length > 0 &&
    path.every(
      (segment) =>
        segment.length > 0 &&
        !segment.includes("\0") &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("/") &&
        !segment.includes("\\") &&
        !isAbsolute(segment),
    )
  );
}

function optionalR2Config(env: Env): R2ObjectStorageProviderConfig | null {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    return null;
  }

  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
  };
}

function contentTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
