import { NextRequest, NextResponse } from "next/server";
import { getGraphClient } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";

// Lightweight summary endpoint - just counts, no heavy data
export const GET = withAuth(async (_request: NextRequest, session) => {
  try {
    const client = getGraphClient(session.accessToken);

    const now = new Date();
    const next72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const [meetingsResponse, messagesResponse] = await Promise.allSettled([
      client
        .api("/me/calendar/events")
        .filter(`start/dateTime ge '${now.toISOString()}' and start/dateTime le '${next72Hours.toISOString()}'`)
        .select("id,subject,start,end,isOnlineMeeting")
        .orderby("start/dateTime asc")
        .top(50)
        .get(),
      client
        .api("/me/messages")
        .filter("isRead eq false")
        .select("id")
        .top(20)
        .get(),
    ]);

    let upcomingMeetingsCount = 0;
    let nextMeetingTime = null;
    let hasUpcomingMeeting = false;

    if (meetingsResponse.status === "fulfilled") {
      const meetings = meetingsResponse.value?.value || [];
      const onlineMeetings = meetings.filter((m: any) => m.isOnlineMeeting);
      upcomingMeetingsCount = onlineMeetings.length;

      if (onlineMeetings.length > 0) {
        nextMeetingTime = onlineMeetings[0].start.dateTime;
        const nextMeetingDate = new Date(nextMeetingTime);
        const hoursUntilMeeting = (nextMeetingDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        hasUpcomingMeeting = hoursUntilMeeting <= 4;
      }
    }

    let unreadCount = 0;
    if (messagesResponse.status === "fulfilled") {
      unreadCount = messagesResponse.value?.value?.length || 0;
    }

    return NextResponse.json({
      summary: {
        meetings: {
          count: upcomingMeetingsCount,
          nextMeetingTime,
          hasUpcomingMeeting,
        },
        emails: {
          unreadCount,
        },
      },
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching digest summary:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch summary" },
      { status: 500 }
    );
  }
});
