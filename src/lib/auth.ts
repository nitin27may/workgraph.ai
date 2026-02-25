import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import { randomBytes } from "crypto";
import { tokenCache } from "./token-cache";

async function refreshAccessToken(token: {
  sessionId?: string;
  error?: string;
}) {
  if (!token.sessionId) {
    console.error("No session ID for token refresh");
    return { ...token, error: "RefreshAccessTokenError" };
  }

  // Retrieve token data from cache
  const tokenData = tokenCache.get(token.sessionId);
  if (!tokenData || !tokenData.refreshToken) {
    console.error("No refresh token found in cache");
    return { ...token, error: "RefreshAccessTokenError" };
  }

  try {
    const response = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.AZURE_AD_CLIENT_ID!,
          client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
          grant_type: "refresh_token",
          refresh_token: tokenData.refreshToken!,
        }),
      }
    );

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    // Update cache with refreshed tokens
    const newTokenData = {
      accessToken: refreshedTokens.access_token,
      refreshToken: refreshedTokens.refresh_token ?? tokenData.refreshToken,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
    };
    tokenCache.set(token.sessionId, newTokenData);

    return {
      ...token,
      error: undefined,
    };
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: [
            // Core authentication
            "openid",
            "email",
            "profile",
            "offline_access",
            // User profile
            "User.Read",
            "User.ReadBasic.All",
            "People.Read",
            // Calendar
            "Calendars.Read",
            "Calendars.ReadWrite",
            // Online Meetings & Transcripts
            "OnlineMeetings.Read",
            "CallRecordings.Read.All",
            "OnlineMeetingTranscript.Read.All",
            // Email
            "Mail.Read",
            "Mail.ReadWrite",
            "Mail.Send",
            // Teams Chat
            "Chat.Read",
            "ChatMessage.Send",
            // Tasks
            "Tasks.ReadWrite",
            // Files & SharePoint
            "Files.Read.All",
            "Sites.Read.All",
          ].join(" "),
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      // Initial sign in - store tokens in cache
      if (account) {
        // Generate unique session ID
        const sessionId = randomBytes(32).toString("hex");
        token.sessionId = sessionId;
        token.sub = user?.id || token.sub;

        // Store tokens in server-side cache
        const tokenData = {
          accessToken: account.access_token!,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000,
        };
        tokenCache.set(sessionId, tokenData);
      }

      // Check if we need to refresh the token
      const sessionId = token.sessionId as string | undefined;
      if (sessionId) {
        const tokenData = tokenCache.get(sessionId);
        
        // If no token data in cache or token expired, try to refresh
        if (!tokenData || Date.now() >= tokenData.accessTokenExpires - 5 * 60 * 1000) {
          return refreshAccessToken(token);
        }
      }

      return token;
    },
    async session({ session, token }) {
      // Retrieve access token from cache for API calls
      const sessionId = token.sessionId as string | undefined;
      if (sessionId) {
        const tokenData = tokenCache.get(sessionId);
        if (tokenData) {
          session.accessToken = tokenData.accessToken;
        }
      }
      session.error = token.error as string | undefined;
      return session;
    },
  },
  events: {
    async signOut(message) {
      // Clean up cached tokens on sign out
      if ("token" in message && message.token) {
        const sessionId = message.token.sessionId as string | undefined;
        if (sessionId) {
          tokenCache.delete(sessionId);
        }
      }
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/",
    error: "/auth/error",
  },
  debug: process.env.NODE_ENV === "development",
};
