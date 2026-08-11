import { provisionOrganization } from "./provisioning";
import type { ProvisionOrganizationRepository } from "./provisioning";
import {
  updateOrganizationBranding,
  updateOrganizationReportAccess,
  updateOrganizationSettings,
  type OrganizationBrandingInput,
  type OrganizationSettingsInput,
  type OrganizationSettingsRepository,
} from "./settings";
import type { MembershipAuthContext } from "../auth/permissions";

export type ProvisionOrganizationActionResult =
  | {
      status: "success";
      message: string;
      organizationSlug: string;
    }
  | {
      status: "error";
      message: string;
    };

type ProvisionOrganizationActionDependencies = {
  getActor(): Promise<{ userId: string; isPlatformOwner: boolean }>;
  repository: ProvisionOrganizationRepository;
};

export type UpdateOrganizationSettingsActionResult =
  | {
      status: "success";
      message: string;
      organizationSlug: string;
    }
  | {
      status: "error";
      message: string;
    };

export type UpdateOrganizationBrandingActionResult = {
  status: "success" | "error";
  message: string;
};

export type UpdateOrganizationReportAccessActionResult = {
  status: "success" | "error";
  message: string;
};

type UpdateOrganizationSettingsActionDependencies = {
  getActor(): Promise<MembershipAuthContext>;
  getOrganizationIdBySlug(slug: string): Promise<string | null>;
  repository: OrganizationSettingsRepository;
};

const readFormString = (formData: FormData, key: string): string => {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
};

const readFormBoolean = (formData: FormData, key: string): boolean =>
  readFormString(formData, key) === "true";

const readAllowedEmailDomains = (formData: FormData): string[] =>
  readFormString(formData, "allowedEmailDomains")
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);

export function createProvisionOrganizationAction(dependencies: ProvisionOrganizationActionDependencies) {
  return async function provisionOrganizationAction(formData: FormData): Promise<ProvisionOrganizationActionResult> {
    const actor = await dependencies.getActor();

    try {
      const result = await provisionOrganization(
        {
          actor,
          name: readFormString(formData, "name"),
          slug: readFormString(formData, "slug"),
          allowedEmailDomains: readFormString(formData, "allowedEmailDomains")
            .split(",")
            .map((domain) => domain.trim())
            .filter(Boolean),
          logoUrl: readFormString(formData, "logoUrl"),
          primaryColor: readFormString(formData, "primaryColor"),
          accentColor: readFormString(formData, "accentColor"),
          enrollmentPolicy:
            readFormString(formData, "enrollmentPolicy") === "ASSIGNMENT_AND_SELF_ENROLLMENT"
              ? "ASSIGNMENT_AND_SELF_ENROLLMENT"
              : "ASSIGNMENT_ONLY",
          globalLibraryEnabled: readFormString(formData, "globalLibraryEnabled") === "true",
        },
        dependencies.repository,
      );

      return {
        status: "success",
        message: "Organization created.",
        organizationSlug: result.slug,
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Organization creation failed",
      };
    }
  };
}

export function createUpdateOrganizationSettingsAction(
  dependencies: UpdateOrganizationSettingsActionDependencies,
) {
  return async function updateOrganizationSettingsAction(
    slug: string,
    formData: FormData,
  ): Promise<UpdateOrganizationSettingsActionResult> {
    const organizationId = await dependencies.getOrganizationIdBySlug(slug);

    if (!organizationId) {
      return { status: "error", message: "Organization was not found" };
    }

    try {
      const actor = await dependencies.getActor();
      const result = await updateOrganizationSettings(
        {
          actor,
          organizationId,
          settings: readOrganizationSettingsForm(formData),
        },
        dependencies.repository,
      );

      return {
        status: "success",
        message: "Organization settings updated.",
        organizationSlug: result.slug,
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Organization settings update failed",
      };
    }
  };
}

export function createUpdateOrganizationBrandingAction(
  dependencies: UpdateOrganizationSettingsActionDependencies,
) {
  return async function updateOrganizationBrandingAction(
    slug: string,
    formData: FormData,
  ): Promise<UpdateOrganizationBrandingActionResult> {
    const organizationId = await dependencies.getOrganizationIdBySlug(slug);

    if (!organizationId) {
      return { status: "error", message: "Organization was not found" };
    }

    try {
      const actor = await dependencies.getActor();

      await updateOrganizationBranding(
        {
          actor,
          organizationId,
          branding: readOrganizationBrandingForm(formData),
        },
        dependencies.repository,
      );

      return {
        status: "success",
        message: "Organization branding updated.",
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Organization branding update failed",
      };
    }
  };
}

export function createUpdateOrganizationReportAccessAction(
  dependencies: UpdateOrganizationSettingsActionDependencies,
) {
  return async function updateOrganizationReportAccessAction(
    slug: string,
    formData: FormData,
  ): Promise<UpdateOrganizationReportAccessActionResult> {
    const organizationId = await dependencies.getOrganizationIdBySlug(slug);

    if (!organizationId) {
      return { status: "error", message: "Organization was not found" };
    }

    try {
      const actor = await dependencies.getActor();

      await updateOrganizationReportAccess(
        {
          actor,
          organizationId,
          reportAccess: {
            allowManagerReports: readFormBoolean(formData, "allowManagerReports"),
            allowUserReports: readFormBoolean(formData, "allowUserReports"),
            allowCsvExports: readFormBoolean(formData, "allowCsvExports"),
          },
        },
        dependencies.repository,
      );

      return {
        status: "success",
        message: "Report access settings updated.",
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Report access settings update failed",
      };
    }
  };
}

function readOrganizationSettingsForm(formData: FormData): OrganizationSettingsInput {
  return {
    name: readFormString(formData, "name"),
    slug: readFormString(formData, "slug"),
    status: readFormString(formData, "status") === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    allowedEmailDomains: readAllowedEmailDomains(formData),
    logoUrl: readFormString(formData, "logoUrl"),
    primaryColor: readFormString(formData, "primaryColor"),
    accentColor: readFormString(formData, "accentColor"),
    enrollmentPolicy:
      readFormString(formData, "enrollmentPolicy") === "ASSIGNMENT_AND_SELF_ENROLLMENT"
        ? "ASSIGNMENT_AND_SELF_ENROLLMENT"
        : "ASSIGNMENT_ONLY",
    globalLibraryEnabled: readFormBoolean(formData, "globalLibraryEnabled"),
    allowAdminBranding: readFormBoolean(formData, "allowAdminBranding"),
    allowManagerReports: readFormBoolean(formData, "allowManagerReports"),
    allowUserReports: readFormBoolean(formData, "allowUserReports"),
    allowCsvExports: readFormBoolean(formData, "allowCsvExports"),
  };
}

function readOrganizationBrandingForm(formData: FormData): OrganizationBrandingInput {
  return {
    logoUrl: readFormString(formData, "logoUrl"),
    primaryColor: readFormString(formData, "primaryColor"),
    accentColor: readFormString(formData, "accentColor"),
  };
}
