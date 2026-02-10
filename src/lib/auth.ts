import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

async function refreshAccessToken(token: {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  error?: string;
}) {
  try {
    const url = `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AZURE_AD_CLIENT_ID!,
        client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
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
            // Files
            "Files.Read",
            "Files.ReadWrite",
          ].join(" "),
        },
      },
      // Custom profile to avoid network fetch issues
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name || profile.preferred_username || profile.email,
          email: profile.email || profile.preferred_username,
          image: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Store access token in JWT
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at;
      }

      // Return previous token if not expired
      if (Date.now() < (token.accessTokenExpires as number) * 1000) {
        return token;
      }

      // Access token expired, refresh it
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      // Send access token to client
      session.accessToken = token.accessToken as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/auth/error",
  },
};
