import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDailyDigest } from "@/lib/graph";
import { isUserAuthorized } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is authorized to use the app
  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json(
      { error: "Forbidden - You are not authorized to use this application" },
      { status: 403 }
    );
  }

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
}
