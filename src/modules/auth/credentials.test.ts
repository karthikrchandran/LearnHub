import { describe, expect, it } from "vitest";

import { authenticateWithPassword, type CredentialRepository } from "./credentials";
import { hashPassword } from "../../lib/auth/password";

describe("authenticateWithPassword", () => {
  it("normalizes email and authenticates active users with a valid password", async () => {
    const passwordHash = await hashPassword("CorrectPassword123!");
    const lookedUpEmails: string[] = [];
    const user = await authenticateWithPassword(
      { email: "  Admin@Acme.TEST ", password: "CorrectPassword123!" },
      {
        findUserByEmail: async (email) => {
          lookedUpEmails.push(email);

          return {
            id: "user_1",
            email: "admin@acme.test",
            firstName: "Asha",
            lastName: "Admin",
            passwordHash,
            status: "ACTIVE",
            isPlatformOwner: false,
          };
        },
      },
    );

    expect(lookedUpEmails).toEqual(["admin@acme.test"]);
    expect(user?.id).toBe("user_1");
  });

  it("rejects missing users", async () => {
    await expect(
      authenticateWithPassword(
        { email: "missing@acme.test", password: "CorrectPassword123!" },
        { findUserByEmail: async () => null },
      ),
    ).resolves.toBeNull();
  });

  it("rejects inactive, invited, and passwordless users", async () => {
    const passwordHash = await hashPassword("CorrectPassword123!");
    const repositoryFor = (status: "ACTIVE" | "INVITED" | "INACTIVE", hash: string | null): CredentialRepository => ({
      findUserByEmail: async () => ({
        id: "user_2",
        email: "learner@acme.test",
        firstName: "Leela",
        lastName: "Learner",
        passwordHash: hash,
        status,
        isPlatformOwner: false,
      }),
    });

    await expect(
      authenticateWithPassword(
        { email: "learner@acme.test", password: "CorrectPassword123!" },
        repositoryFor("INVITED", passwordHash),
      ),
    ).resolves.toBeNull();
    await expect(
      authenticateWithPassword(
        { email: "learner@acme.test", password: "CorrectPassword123!" },
        repositoryFor("INACTIVE", passwordHash),
      ),
    ).resolves.toBeNull();
    await expect(
      authenticateWithPassword(
        { email: "learner@acme.test", password: "CorrectPassword123!" },
        repositoryFor("ACTIVE", null),
      ),
    ).resolves.toBeNull();
  });

  it("rejects invalid passwords", async () => {
    const passwordHash = await hashPassword("CorrectPassword123!");

    await expect(
      authenticateWithPassword(
        { email: "learner@acme.test", password: "WrongPassword123!" },
        {
          findUserByEmail: async () => ({
            id: "user_2",
            email: "learner@acme.test",
            firstName: "Leela",
            lastName: "Learner",
            passwordHash,
            status: "ACTIVE",
            isPlatformOwner: false,
          }),
        },
      ),
    ).resolves.toBeNull();
  });
});
