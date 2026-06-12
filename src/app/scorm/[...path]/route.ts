import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ScormContentRouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(_request: Request, { params }: ScormContentRouteContext): Promise<Response> {
  const { path } = await params;

  if (!isSafePath(path)) {
    return new Response("Invalid SCORM content path", { status: 400 });
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
