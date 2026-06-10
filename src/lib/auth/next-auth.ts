import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { authenticateWithPassword } from "@/modules/auth/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const { prisma } = await import("@/lib/prisma");
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
