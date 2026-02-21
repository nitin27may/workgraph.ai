import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // If token has error (like RefreshAccessTokenError), redirect to home to re-authenticate
    if (token?.error) {
      console.log(`Token error detected on ${path}, redirecting to login`);
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("error", "SessionExpired");
      return NextResponse.redirect(url);
    }

    // Admin routes protection
    const isAdmin = token?.email?.toLowerCase() === process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase();
    if (path.startsWith("/admin") && !isAdmin) {
      console.log(`Unauthorized admin access attempt by ${token?.email}`);
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Allow access if token exists, has a session ID, and doesn't have an error
        return !!token && !!token.sessionId && !token.error;
      },
    },
    pages: {
      signIn: "/",
    },
  }
);

// Protect all routes except public ones
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - / (home/login page)
     * - /api/auth/* (auth endpoints)
     * - /_next/* (Next.js internals)
     * - /favicon.ico, /robots.txt (static files)
     */
    "/((?!api/auth|_next|favicon.ico|robots.txt).*)",
  ],
};
