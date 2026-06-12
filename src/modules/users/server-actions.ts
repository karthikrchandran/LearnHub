import { parseAndValidateUserImportCsv } from "./csv-import";
import type { UserImportPlan } from "./csv-import";
import {
  issueOrganizationUserPasswordReset,
  resendOrganizationUserInvitation,
  updateOrganizationUserLifecycle,
  type OrganizationUserLifecycleRepository,
} from "./lifecycle";
import { commitUserImport } from "./user-import";
import type { CommitUserImportRepository } from "./user-import";
import type { MembershipAuthContext } from "../auth/permissions";

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

export type UserLifecycleActionResult = {
  status: "success" | "error";
  message: string;
};

type ValidateUserImportDependencies = {
  getOrganizationImportContext(slug: string): Promise<OrganizationImportContext | null>;
};

type CommitUserImportDependencies = ValidateUserImportDependencies & {
  getActor(): Promise<{ userId: string }>;
  repository: CommitUserImportRepository;
  now(): Date;
};

type UserLifecycleActionDependencies = {
  getActor(): Promise<MembershipAuthContext>;
  getOrganizationIdBySlug(slug: string): Promise<string | null>;
  repository: OrganizationUserLifecycleRepository;
};

type ResendInvitationActionDependencies = UserLifecycleActionDependencies & {
  now(): Date;
};

type IssuePasswordResetActionDependencies = UserLifecycleActionDependencies & {
  sendPasswordReset(input: {
    email: string;
    rawToken: string;
    expiresAt: Date;
  }): Promise<void> | void;
  now(): Date;
};

const readFormString = (formData: FormData, key: string): string => {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
};

const readFormStringList = (formData: FormData, key: string): string[] =>
  formData.getAll(key).filter((value): value is string => typeof value === "string");

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

export function createUpdateOrganizationUserLifecycleAction(
  dependencies: UserLifecycleActionDependencies,
) {
  return async function updateOrganizationUserLifecycleAction(
    slug: string,
    formData: FormData,
  ): Promise<UserLifecycleActionResult> {
    const organizationId = await dependencies.getOrganizationIdBySlug(slug);

    if (!organizationId) {
      return { status: "error", message: "Organization was not found" };
    }

    try {
      await updateOrganizationUserLifecycle(
        {
          actor: await dependencies.getActor(),
          organizationId,
          membershipId: readFormString(formData, "membershipId"),
          changes: {
            roles: readLifecycleRoles(formData),
            managerMembershipId: readFormString(formData, "managerMembershipId"),
            employeeId: readFormString(formData, "employeeId"),
            department: readFormString(formData, "department"),
            title: readFormString(formData, "title"),
            status: readLifecycleStatus(formData),
          },
        },
        dependencies.repository,
      );

      return { status: "success", message: "User updated." };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "User update failed",
      };
    }
  };
}

export function createResendOrganizationUserInvitationAction(
  dependencies: ResendInvitationActionDependencies,
) {
  return async function resendOrganizationUserInvitationAction(
    slug: string,
    formData: FormData,
  ): Promise<UserLifecycleActionResult> {
    const organizationId = await dependencies.getOrganizationIdBySlug(slug);

    if (!organizationId) {
      return { status: "error", message: "Organization was not found" };
    }

    try {
      await resendOrganizationUserInvitation(
        {
          actor: await dependencies.getActor(),
          organizationId,
          membershipId: readFormString(formData, "membershipId"),
          now: dependencies.now(),
        },
        dependencies.repository,
      );

      return { status: "success", message: "Invitation resent." };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Invitation resend failed",
      };
    }
  };
}

export function createIssueOrganizationUserPasswordResetAction(
  dependencies: IssuePasswordResetActionDependencies,
) {
  return async function issueOrganizationUserPasswordResetAction(
    slug: string,
    formData: FormData,
  ): Promise<UserLifecycleActionResult> {
    const organizationId = await dependencies.getOrganizationIdBySlug(slug);

    if (!organizationId) {
      return { status: "error", message: "Organization was not found" };
    }

    try {
      const reset = await issueOrganizationUserPasswordReset(
        {
          actor: await dependencies.getActor(),
          organizationId,
          membershipId: readFormString(formData, "membershipId"),
          now: dependencies.now(),
        },
        dependencies.repository,
      );

      await dependencies.sendPasswordReset(reset);

      return { status: "success", message: "Password reset issued." };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Password reset issue failed",
      };
    }
  };
}

function readLifecycleRoles(formData: FormData) {
  return readFormStringList(formData, "roles") as Array<"ADMIN" | "MANAGER" | "LEARNER">;
}

function readLifecycleStatus(formData: FormData): "INVITED" | "ACTIVE" | "INACTIVE" {
  const status = readFormString(formData, "status");

  return status === "INVITED" || status === "INACTIVE" ? status : "ACTIVE";
}
