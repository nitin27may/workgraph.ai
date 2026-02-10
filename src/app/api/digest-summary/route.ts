import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUserAuthorized } from "@/lib/db";
import { getGraphClient } from "@/lib/graph";

// Lightweight summary endpoint - just counts, no heavy data
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json(
      { error: "Forbidden - You are not authorized to use this application" },
      { status: 403 }
    );
  }

  try {
    const client = getGraphClient(session.accessToken);

    // Get counts in parallel
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    const next72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const [meetingsResponse, messagesResponse] = await Promise.allSettled([
      // Get meetings for next 72 hours
      client
        .api("/me/calendar/events")
        .filter(`start/dateTime ge '${now.toISOString()}' and start/dateTime le '${next72Hours.toISOString()}'`)
        .select("id,subject,start,end,isOnlineMeeting")
        .orderby("start/dateTime asc")
        .top(50)
        .get(),
      
      // Get recent messages to check for unread
      client
        .api("/me/messages")
        .filter("isRead eq false")
        .select("id")
        .top(20)
        .get(),
    ]);

    // Process meetings
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
        hasUpcomingMeeting = hoursUntilMeeting <= 4; // Alert if within 4 hours
      }
    }

    // Unread emails count
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
}
