import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTaskLists } from "@/lib/graph";
import { isUserAuthorized } from "@/lib/db";

// GET /api/tasks/lists - Get all task lists for the user
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is authorized
  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json(
      { error: "Forbidden - You are not authorized to use this application" },
      { status: 403 }
    );
  }

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
}
