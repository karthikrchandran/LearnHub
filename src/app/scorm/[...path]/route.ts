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

  const pathGrant = readScormContentPathGrant(path);
  const contentPath = pathGrant?.path ?? path;
  const env = getEnv();
  const storageConfig = optionalR2Config(env);

  if (storageConfig) {
    return serveR2ScormContent({
      request,
      path: contentPath,
      pathGrant: pathGrant?.grant ?? null,
      storageConfig,
      secret: env.NEXTAUTH_SECRET,
    });
  }

  const contentRoot = resolve(join(process.cwd(), ".learnhub", "scorm"));
  const targetPath = resolve(contentRoot, ...contentPath);
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
    const contentType = contentTypeForPath(targetPath);

    return scormContentResponse(file, contentType);
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
  pathGrant: ScormContentAccessGrant | null;
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
  const grant = input.pathGrant ?? queryGrant ?? cookieGrant;

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

  const contentType = storageResponse.headers.get("content-type") ?? contentTypeForPath(objectKey);
  const headers = scormContentHeaders(contentType);

  if (queryGrant && !input.pathGrant) {
    headers.append(
      "set-cookie",
      createScormContentAccessCookie({
        grant: queryGrant,
        contentRootKey,
        now,
      }),
    );
  }

  if (isHtmlContent(contentType)) {
    return new Response(injectScormBridgeBootstrap(await storageResponse.text()), {
      status: storageResponse.status,
      headers,
    });
  }

  return new Response(storageResponse.body, { status: storageResponse.status, headers });
}

function readScormContentPathGrant(path: string[]): { path: string[]; grant: ScormContentAccessGrant } | null {
  if (path[0] !== "_access") {
    return null;
  }

  const expiresAtSeconds = Number(path[1]);
  const token = path[2];
  const contentPath = path.slice(3);

  if (!Number.isInteger(expiresAtSeconds) || !token || contentPath.length === 0) {
    return null;
  }

  return {
    path: contentPath,
    grant: {
      expiresAtSeconds,
      token,
    },
  };
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

function scormContentResponse(body: Buffer, contentType: string): Response {
  if (isHtmlContent(contentType)) {
    return new Response(injectScormBridgeBootstrap(body.toString("utf8")), {
      headers: scormContentHeaders(contentType),
    });
  }

  return new Response(new Uint8Array(body), {
    headers: scormContentHeaders(contentType),
  });
}

function scormContentHeaders(contentType: string): Headers {
  return new Headers({
    "content-type": contentType,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
}

function isHtmlContent(contentType: string): boolean {
  return contentType.toLowerCase().includes("text/html");
}

function injectScormBridgeBootstrap(html: string): string {
  const script = `<script>${scormBridgeBootstrapScript()}</script>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${script}</head>`);
  }

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }

  return `${script}${html}`;
}

function scormBridgeBootstrapScript(): string {
  return `
(() => {
  if (window.API) return;

  const allowedCmiKeys = new Set([
    "cmi.core.lesson_status",
    "cmi.core.score.raw",
    "cmi.core.session_time",
    "cmi.core.exit",
    "cmi.core.lesson_location",
    "cmi.suspend_data",
    "cmi.comments",
  ]);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  let cmiData = {};
  let initialized = false;
  let lastError = "0";

  try {
    const encoded = hash.get("lh_scorm_state");
    const parsed = encoded ? JSON.parse(decodeURIComponent(encoded)) : {};
    cmiData = Object.fromEntries(Object.entries(parsed).filter((entry) => typeof entry[1] === "string"));
  } catch {
    cmiData = {};
  }

  function sync(commit) {
    window.parent.postMessage({
      type: "learnhub:scorm:cmi",
      cmiData,
      commit: Boolean(commit),
    }, "*");
  }

  function errorText(code) {
    switch (code) {
      case "0":
        return "No error";
      case "101":
        return "General exception";
      case "301":
        return "Not initialized";
      case "401":
        return "Unsupported data model element";
      default:
        return "Unknown SCORM error";
    }
  }

  window.API = {
    LMSInitialize() {
      initialized = true;
      lastError = "0";
      return "true";
    },
    LMSFinish() {
      if (!initialized) {
        lastError = "301";
        return "false";
      }

      sync(true);
      initialized = false;
      lastError = "0";
      return "true";
    },
    LMSGetValue(key) {
      if (!allowedCmiKeys.has(key)) {
        lastError = "401";
        return "";
      }

      lastError = "0";
      return cmiData[key] || "";
    },
    LMSSetValue(key, value) {
      if (!initialized) {
        lastError = "301";
        return "false";
      }

      if (!allowedCmiKeys.has(key)) {
        lastError = "401";
        return "false";
      }

      cmiData = { ...cmiData, [key]: String(value) };
      sync(false);
      lastError = "0";
      return "true";
    },
    LMSCommit() {
      if (!initialized) {
        lastError = "301";
        return "false";
      }

      sync(true);
      lastError = "0";
      return "true";
    },
    LMSGetLastError() {
      return lastError;
    },
    LMSGetErrorString(code) {
      return errorText(code);
    },
    LMSGetDiagnostic(code) {
      return errorText(code || lastError);
    },
  };
})();
`;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
