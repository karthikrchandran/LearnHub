"use server";

import { createPrismaInvitationRepository } from "@/modules/auth/prisma-repositories";
import { createActivateInvitationAction } from "@/modules/auth/server-actions";

export async function activateInvitationFormAction(_previousState: unknown, formData: FormData) {
  const { prisma } = await import("@/lib/prisma");

  return createActivateInvitationAction({
    repository: createPrismaInvitationRepository(prisma),
    now: () => new Date(),
  })(formData);
}
