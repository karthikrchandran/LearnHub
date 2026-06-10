import { provisionOrganization } from "./provisioning";
import type { ProvisionOrganizationRepository } from "./provisioning";

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

const readFormString = (formData: FormData, key: string): string => {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
};

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
