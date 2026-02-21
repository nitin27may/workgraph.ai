import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { getJoinedTeams } from "@/lib/graph/teams";

// GET /api/teams — list teams the user has joined
export const GET = withAuth(async (_req, session) => {
  try {
    const teams = await getJoinedTeams(session.accessToken);
    return NextResponse.json({ teams });
  } catch (error) {
    console.error("Error fetching joined teams:", error);
    return NextResponse.json(
      { error: "Failed to fetch teams" },
      { status: 500 }
    );
  }
});
