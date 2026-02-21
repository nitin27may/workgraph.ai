import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionId?: string;
    error?: string;
  }
}
