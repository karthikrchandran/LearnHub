import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { authenticateWithPassword } from "@/modules/auth/credentials";

const localNextAuthSecret = "learnhub-local-secret";
const nextAuthSecret =
  process.env.NEXTAUTH_SECRET?.trim() ||
  (process.env.NODE_ENV !== "production" ? localNextAuthSecret : undefined);

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const { prisma } = await import("@/lib/prisma");
        const { createPrismaLoginThrottleRepository, isLoginRateLimited, resetLoginRateLimit } = await import(
          "@/modules/auth/login-rate-limit"
        );
        const normalizedEmail = credentials.email.trim().toLowerCase();
        const requestHeaders = request.headers ?? {};
        const readHeader = (name: string) => {
          const value = requestHeaders[name];
          return Array.isArray(value) ? value.at(-1) : value;
        };
        const forwardedFor = readHeader("x-forwarded-for");
        const ipAddress = readHeader("cf-connecting-ip") ?? readHeader("x-real-ip") ??
          (typeof forwardedFor === "string" ? forwardedFor.split(",").at(-1)?.trim() : undefined) ?? "unknown";
        const throttleScope = { ipAddress, normalizedEmail };
        const throttleRepository = createPrismaLoginThrottleRepository(prisma);

        if (await isLoginRateLimited(throttleScope, throttleRepository)) {
          return null;
        }

        const user = await authenticateWithPassword(
          {
            email: credentials.email,
            password: credentials.password,
          },
          {
            findUserByEmail: (email) =>
              prisma.user.findUnique({
                where: { email },
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  passwordHash: true,
                  status: true,
                  isPlatformOwner: true,
                },
              }),
          },
        );

        if (!user) {
          return null;
        }

        await resetLoginRateLimit(throttleScope, throttleRepository);

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          isPlatformOwner: user.isPlatformOwner,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isPlatformOwner = user.isPlatformOwner;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? token.sub ?? "";
        session.user.isPlatformOwner = token.isPlatformOwner ?? false;
      }

      return session;
    },
  },
};
