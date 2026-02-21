import { NextRequest, NextResponse } from "next/server";
import { getDailyDigest } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (_request: NextRequest, session) => {
  try {
    const digest = await getDailyDigest(session.accessToken);
    return NextResponse.json(digest);
  } catch (error) {
    console.error("Error fetching daily digest:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch daily digest" },
      { status: 500 }
    );
  }
});
