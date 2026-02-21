import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUserAuthorized, isAdmin } from "@/lib/db";

/** Session with guaranteed accessToken and user email */
export type AuthenticatedSession = Session & {
  accessToken: string;
  user: { email: string; name?: string | null; image?: string | null };
};

/**
 * Wraps an API handler with standard auth: accessToken + isUserAuthorized.
 * Works with both static and dynamic routes (preserves extra args like { params }).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAuth<Args extends any[]>(
  handler: (req: NextRequest, session: AuthenticatedSession, ...args: Args) => Promise<NextResponse>
): (req: NextRequest, ...args: Args) => Promise<NextResponse> {
  return async (req: NextRequest, ...args: Args) => {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { authorized } = isUserAuthorized(session.user.email);
    if (!authorized) {
      return NextResponse.json(
        { error: "Forbidden - You are not authorized to use this application" },
        { status: 403 }
      );
    }

    return handler(req, session as AuthenticatedSession, ...args);
  };
}

/**
 * Wraps an API handler with admin auth: accessToken + isAdmin.
 * Works with both static and dynamic routes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAdminAuth<Args extends any[]>(
  handler: (req: NextRequest, session: AuthenticatedSession, ...args: Args) => Promise<NextResponse>
): (req: NextRequest, ...args: Args) => Promise<NextResponse> {
  return async (req: NextRequest, ...args: Args) => {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin(session.user.email)) {
      return NextResponse.json(
        { error: "Forbidden - Admin access required" },
        { status: 403 }
      );
    }

    return handler(req, session as AuthenticatedSession, ...args);
  };
}
