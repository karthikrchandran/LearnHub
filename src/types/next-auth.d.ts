import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isPlatformOwner: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    isPlatformOwner: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isPlatformOwner?: boolean;
  }
}
