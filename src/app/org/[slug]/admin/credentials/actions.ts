"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { retryCredentialIssuance } from "@/modules/credentials/credential-operations";
import { createPrismaCredentialOperationsRepository } from "@/modules/credentials/prisma-repository";
import { createConfiguredCredlyCredentialProvider } from "@/modules/providers/credentials/credly-provider";
import { revalidatePath } from "next/cache";

export type CredentialOperationActionResult = {
  status: "success" | "error";
  message: string;
};

export async function retryCredentialFormAction(
  slug: string,
  formData: FormData,
): Promise<CredentialOperationActionResult> {
  try {
    const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
    const certificateId = readFormString(formData, "certificateId");
    const providerName = readFormString(formData, "provider");

    if (providerName !== "CREDLY") {
      throw new Error("Unsupported credential provider");
    }

    const provider = createConfiguredCredlyCredentialProvider({
      baseUrl: env.CREDLY_BASE_URL,
      apiToken: env.CREDLY_API_TOKEN,
      organizationId: env.CREDLY_ORGANIZATION_ID,
    });

    if (!provider) {
      throw new Error("Credly provider is not configured");
    }

    const { prisma } = await import("@/lib/prisma");
    const result = await retryCredentialIssuance(
      {
        organizationId,
        certificateId,
        provider: "CREDLY",
        now: new Date(),
      },
      createPrismaCredentialOperationsRepository(prisma),
      provider,
    );

    revalidatePath(`/org/${slug}/admin/credentials`);
    revalidatePath(`/org/${slug}/admin/certificates`);

    return {
      status: result.status === "SUCCEEDED" ? "success" : "error",
      message: result.status === "SUCCEEDED" ? "Credential issued." : result.errorMessage ?? "Credential issuance failed.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Credential retry failed",
    };
  }
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
