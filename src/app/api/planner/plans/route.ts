import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUserAuthorized } from "@/lib/db";
import { getPlannerPlans } from "@/lib/graph/planner";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const plans = await getPlannerPlans(session.accessToken);
    return NextResponse.json({ plans });
  } catch (error) {
    console.error("Error fetching planner plans:", error);
    return NextResponse.json(
      { error: "Failed to fetch planner plans", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
