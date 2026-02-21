"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

function SessionErrorHandler({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // If there's a token refresh error, sign out and redirect to login
    if (session?.error === "RefreshAccessTokenError") {
      console.error("Token refresh failed, redirecting to login");
      // Clear the session and redirect to home/login
      router.push("/");
      // Force a sign out
      window.location.href = "/api/auth/signout?callbackUrl=/";
    }
  }, [session, router]);

  return <>{children}</>;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider
      // Refetch session every 5 minutes to check token status
      refetchInterval={5 * 60}
      // Refetch when window gains focus
      refetchOnWindowFocus={true}
    >
      <SessionErrorHandler>{children}</SessionErrorHandler>
    </NextAuthSessionProvider>
  );
}
