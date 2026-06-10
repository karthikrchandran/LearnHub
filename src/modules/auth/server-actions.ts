import { activateInvitation } from "./invitations";
import type { InvitationRepository } from "./invitations";
import { normalizeEmail } from "./email";
import { completePasswordReset, requestPasswordReset } from "./password-resets";
import type { PasswordResetRepository } from "./password-resets";

export type ActionResult = {
  status: "success" | "error";
  message: string;
};

type RequestPasswordResetDependencies = {
  repository: PasswordResetRepository;
  sendResetEmail(input: { email: string; rawToken: string; expiresAt: Date }): Promise<void> | void;
  now(): Date;
};

type PasswordResetDependencies = {
  repository: PasswordResetRepository;
  now(): Date;
};

type InvitationDependencies = {
  repository: InvitationRepository;
  now(): Date;
};

const readFormString = (formData: FormData, key: string): string => {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
};

export function createRequestPasswordResetAction(dependencies: RequestPasswordResetDependencies) {
  return async function requestPasswordResetAction(formData: FormData): Promise<ActionResult> {
    const email = normalizeEmail(readFormString(formData, "email"));

    if (!email) {
      return { status: "error", message: "Email is required" };
    }

    const token = await requestPasswordReset({ email, now: dependencies.now() }, dependencies.repository);

    if (token) {
      await dependencies.sendResetEmail({
        email,
        rawToken: token.rawToken,
        expiresAt: token.expiresAt,
      });
    }

    return {
      status: "success",
      message: "If an account exists, a reset link has been sent.",
    };
  };
}

export function createCompletePasswordResetAction(dependencies: PasswordResetDependencies) {
  return async function completePasswordResetAction(formData: FormData): Promise<ActionResult> {
    const token = readFormString(formData, "token");
    const password = readFormString(formData, "password");

    if (!token) {
      return { status: "error", message: "Password reset token is required" };
    }

    try {
      await completePasswordReset({ rawToken: token, password, now: dependencies.now() }, dependencies.repository);
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "Password reset failed" };
    }

    return {
      status: "success",
      message: "Password reset. You can sign in with your new password.",
    };
  };
}

export function createActivateInvitationAction(dependencies: InvitationDependencies) {
  return async function activateInvitationAction(formData: FormData): Promise<ActionResult> {
    const token = readFormString(formData, "token");
    const password = readFormString(formData, "password");

    if (!token) {
      return { status: "error", message: "Invitation token is required" };
    }

    try {
      await activateInvitation({ rawToken: token, password, now: dependencies.now() }, dependencies.repository);
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "Invitation activation failed" };
    }

    return {
      status: "success",
      message: "Account activated. You can sign in now.",
    };
  };
}
