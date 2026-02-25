import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUserAuthorized } from "@/lib/db";
import { getPlannerBuckets } from "@/lib/graph/planner";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { planId } = await params;

  if (!planId) {
    return NextResponse.json({ error: "planId is required" }, { status: 400 });
  }

  try {
    const buckets = await getPlannerBuckets(session.accessToken, planId);
    return NextResponse.json({ buckets });
  } catch (error) {
    console.error("Error fetching planner buckets:", error);
    return NextResponse.json(
      { error: "Failed to fetch planner buckets", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
