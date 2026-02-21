import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { getTeamChannels } from "@/lib/graph/teams";

// GET /api/teams/[teamId]/channels — list channels for a team
export const GET = withAuth(
  async (_req: NextRequest, session, { params }: { params: Promise<{ teamId: string }> }) => {
    const { teamId } = await params;

    try {
      const channels = await getTeamChannels(session.accessToken, teamId);
      return NextResponse.json({ channels });
    } catch (error) {
      console.error(`Error fetching channels for team ${teamId}:`, error);
      return NextResponse.json(
        { error: "Failed to fetch channels" },
        { status: 500 }
      );
    }
  }
);
