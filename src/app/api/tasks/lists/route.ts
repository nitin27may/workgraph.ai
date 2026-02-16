import { NextRequest, NextResponse } from "next/server";
import { getTaskLists } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (_request: NextRequest, session) => {
  try {
    const lists = await getTaskLists(session.accessToken);
    return NextResponse.json({ lists });
  } catch (error) {
    console.error("Error fetching task lists:", error);
    return NextResponse.json(
      { error: "Failed to fetch task lists" },
      { status: 500 }
    );
  }
});
