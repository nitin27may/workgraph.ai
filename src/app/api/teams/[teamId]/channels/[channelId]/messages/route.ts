import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { getChannelMessages } from "@/lib/graph/teams";

// GET /api/teams/[teamId]/channels/[channelId]/messages
export const GET = withAuth(
  async (
    req: NextRequest,
    session,
    {
      params,
    }: { params: Promise<{ teamId: string; channelId: string }> }
  ) => {
    const { teamId, channelId } = await params;
    const top = Number(new URL(req.url).searchParams.get("top") || "25");

    try {
      const messages = await getChannelMessages(
        session.accessToken,
        teamId,
        channelId,
        Math.min(top, 50) // cap at 50
      );
      return NextResponse.json({ messages });
    } catch (error) {
      console.error(`Error fetching messages for ${teamId}/${channelId}:`, error);
      return NextResponse.json(
        { error: "Failed to fetch channel messages" },
        { status: 500 }
      );
    }
  }
);
