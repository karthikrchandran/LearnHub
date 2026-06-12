import {
  uploadScormPackage,
  type ScormPackageRepository,
} from "./scorm-package-service";

export type ScormPackageActionResult = { status: "success" | "error"; message: string };

export type ScormPackageActionContext = {
  actorId: string;
  organizationId: string;
  courseId: string;
};

export type ScormPackageActionDependencies = {
  getContext(slug: string, courseSlug: string): Promise<ScormPackageActionContext>;
  repository: ScormPackageRepository;
};

export function createScormPackageActions(dependencies: ScormPackageActionDependencies): {
  uploadPackage(slug: string, courseSlug: string, formData: FormData): Promise<ScormPackageActionResult>;
} {
  return {
    async uploadPackage(slug, courseSlug, formData) {
      return runAction(async () => {
        const context = await dependencies.getContext(slug, courseSlug);

        await uploadScormPackage(
          {
            organizationId: context.organizationId,
            courseId: context.courseId,
            actorId: context.actorId,
            originalFileName: readFormString(formData, "originalFileName"),
            contentType: readFormString(formData, "contentType"),
            byteSize: readInteger(formData, "byteSize"),
            launchPath: readFormString(formData, "launchPath"),
            manifestTitle: readOptionalFormString(formData, "manifestTitle"),
          },
          dependencies.repository,
        );

        return "SCORM package metadata saved.";
      });
    },
  };
}

async function runAction(operation: () => Promise<string>): Promise<ScormPackageActionResult> {
  try {
    return { status: "success", message: await operation() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "SCORM package action failed" };
  }
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readOptionalFormString(formData: FormData, key: string): string | null {
  const value = readFormString(formData, key).trim();

  return value || null;
}

function readInteger(formData: FormData, key: string): number {
  return Number(readFormString(formData, key));
}
