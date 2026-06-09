import type { UserStatus } from "@prisma/client";

import { normalizeEmail } from "./email";
import { verifyPassword } from "../../lib/auth/password";

export type CredentialLoginInput = {
  email: string;
  password: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string | null;
  status: UserStatus;
  isPlatformOwner: boolean;
};

export type CredentialRepository = {
  findUserByEmail(email: string): Promise<AuthenticatedUser | null>;
};

export async function authenticateWithPassword(
  input: CredentialLoginInput,
  repository: CredentialRepository,
): Promise<AuthenticatedUser | null> {
  const user = await repository.findUserByEmail(normalizeEmail(input.email));

  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    return null;
  }

  const validPassword = await verifyPassword(input.password, user.passwordHash);

  return validPassword ? user : null;
}
