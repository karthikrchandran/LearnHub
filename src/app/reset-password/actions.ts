"use server";

import { createPrismaPasswordResetRepository } from "@/modules/auth/prisma-repositories";
import {
  createCompletePasswordResetAction,
  createRequestPasswordResetAction,
} from "@/modules/auth/server-actions";

export async function requestPasswordResetFormAction(_previousState: unknown, formData: FormData) {
  const [{ env }, { prisma }, { createEmailProviderFromEnv }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/prisma"),
    import("@/modules/providers/email/email-provider"),
  ]);
  const emailProvider = createEmailProviderFromEnv(env, process.env.NODE_ENV);

  return createRequestPasswordResetAction({
    repository: createPrismaPasswordResetRepository(prisma),
    now: () => new Date(),
    sendResetEmail: async ({ email, rawToken, expiresAt }) => {
      const resetUrl = `${env.APP_BASE_URL}/reset-password/${rawToken}`;

      await emailProvider.send({
        to: email,
        subject: "Reset your LearnHub password",
        html: `<p>Reset your LearnHub password: <a href="${resetUrl}">${resetUrl}</a></p>`,
        text: `Reset your LearnHub password: ${resetUrl}. This link expires at ${expiresAt.toISOString()}.`,
      });
    },
  })(formData);
}

export async function completePasswordResetFormAction(_previousState: unknown, formData: FormData) {
  const { prisma } = await import("@/lib/prisma");

  return createCompletePasswordResetAction({
    repository: createPrismaPasswordResetRepository(prisma),
    now: () => new Date(),
  })(formData);
}
