import { parseAndValidateUserImportCsv } from "./csv-import";
import type { UserImportPlan } from "./csv-import";
import { commitUserImport } from "./user-import";
import type { CommitUserImportRepository } from "./user-import";

export type OrganizationImportContext = {
  organizationId: string;
  allowedEmailDomains: string[];
  existingManagerEmails: string[];
};

export type UserImportActionResult = {
  status: "success" | "error";
  message: string;
  plan?: UserImportPlan;
  importedCount?: number;
};

type ValidateUserImportDependencies = {
  getOrganizationImportContext(slug: string): Promise<OrganizationImportContext | null>;
};

type CommitUserImportDependencies = ValidateUserImportDependencies & {
  getActor(): Promise<{ userId: string }>;
  repository: CommitUserImportRepository;
  now(): Date;
};

const readFormString = (formData: FormData, key: string): string => {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
};

export function createValidateUserImportAction(dependencies: ValidateUserImportDependencies) {
  return async function validateUserImportAction(slug: string, formData: FormData): Promise<UserImportActionResult> {
    const context = await dependencies.getOrganizationImportContext(slug);

    if (!context) {
      return { status: "error", message: "Organization was not found" };
    }

    const plan = parseAndValidateUserImportCsv({
      csv: readFormString(formData, "userCsv"),
      allowedEmailDomains: context.allowedEmailDomains,
      existingManagerEmails: context.existingManagerEmails,
    });

    if (plan.errors.length > 0) {
      return { status: "error", message: "CSV has validation errors.", plan };
    }

    return { status: "success", message: `CSV is valid for ${plan.rows.length} users.`, plan };
  };
}

export function createCommitUserImportAction(dependencies: CommitUserImportDependencies) {
  return async function commitUserImportAction(slug: string, formData: FormData): Promise<UserImportActionResult> {
    const context = await dependencies.getOrganizationImportContext(slug);

    if (!context) {
      return { status: "error", message: "Organization was not found" };
    }

    const plan = parseAndValidateUserImportCsv({
      csv: readFormString(formData, "userCsv"),
      allowedEmailDomains: context.allowedEmailDomains,
      existingManagerEmails: context.existingManagerEmails,
    });

    if (plan.errors.length > 0) {
      return { status: "error", message: "CSV has validation errors.", plan };
    }

    try {
      const actor = await dependencies.getActor();
      const result = await commitUserImport(
        {
          organizationId: context.organizationId,
          actorId: actor.userId,
          plan,
          now: dependencies.now(),
        },
        dependencies.repository,
      );

      return {
        status: "success",
        message: `Imported ${result.importedCount} users.`,
        importedCount: result.importedCount,
      };
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "User import failed", plan };
    }
  };
}
