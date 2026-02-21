import { NextRequest, NextResponse } from "next/server";
import { getUserMeetings, checkMeetingTranscripts, getCurrentUser, getGraphClient } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (request: NextRequest, session) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const meetingId = searchParams.get("id");

    // If fetching a specific meeting by ID
    if (meetingId) {
      const client = getGraphClient(session.accessToken);

      try {
        const event = await client
          .api(`/me/calendar/events/${meetingId}`)
          .select("id,subject,start,end,organizer,attendees,isOnlineMeeting,onlineMeeting,onlineMeetingProvider")
          .get();

        if (!event.isOnlineMeeting) {
          return NextResponse.json(
            { error: "Not an online meeting" },
            { status: 404 }
          );
        }

        const meeting = {
          id: event.id,
          subject: event.subject || "Untitled Meeting",
          startDateTime: event.start.dateTime,
          endDateTime: event.end.dateTime,
          organizer: event.organizer,
          participants: event.attendees ? {
            attendees: event.attendees.map((a: any) => ({ emailAddress: a.emailAddress }))
          } : undefined,
          hasTranscript: false,
          joinWebUrl: event.onlineMeeting?.joinUrl,
          onlineMeetingId: event.onlineMeeting?.joinUrl?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0],
        };

        return NextResponse.json({ meeting });
      } catch (error: any) {
        console.error("Error fetching meeting by ID:", {
          meetingId,
          statusCode: error?.statusCode,
          code: error?.code,
          message: error?.message,
          body: error?.body,
        });

        if (error?.statusCode === 403 || error?.statusCode === 404) {
          console.log("Direct fetch failed, searching in user's calendar...");

          try {
            const now = new Date();
            const futureDate = new Date(now);
            futureDate.setDate(futureDate.getDate() + 90);

            const eventsResponse = await client
              .api("/me/calendar/events")
              .filter(
                `start/dateTime ge '${now.toISOString()}' and start/dateTime le '${futureDate.toISOString()}' and isOnlineMeeting eq true`
              )
              .select("id,subject,start,end,organizer,attendees,isOnlineMeeting,onlineMeeting,onlineMeetingProvider")
              .top(100)
              .get();

            const foundEvent = eventsResponse.value?.find((e: any) =>
              e.id === meetingId ||
              e.onlineMeeting?.joinUrl?.includes(meetingId)
            );

            if (foundEvent) {
              const meeting = {
                id: foundEvent.id,
                subject: foundEvent.subject || "Untitled Meeting",
                startDateTime: foundEvent.start.dateTime,
                endDateTime: foundEvent.end.dateTime,
                organizer: foundEvent.organizer,
                participants: foundEvent.attendees ? {
                  attendees: foundEvent.attendees.map((a: any) => ({ emailAddress: a.emailAddress }))
                } : undefined,
                hasTranscript: false,
                joinWebUrl: foundEvent.onlineMeeting?.joinUrl,
                onlineMeetingId: foundEvent.onlineMeeting?.joinUrl?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0],
              };

              return NextResponse.json({ meeting });
            }
          } catch (searchError) {
            console.error("Search in calendar also failed:", searchError);
          }
        }

        return NextResponse.json(
          {
            error: error?.statusCode === 403
              ? "Access denied to this meeting. You may not have permission to view it."
              : "Meeting not found",
            details: error?.message,
          },
          { status: error?.statusCode || 404 }
        );
      }
    }

    // Otherwise, fetch all meetings (existing logic)
    const daysBack = parseInt(searchParams.get("daysBack") || "30");
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const user = await getCurrentUser(session.accessToken);

    const meetings = await getUserMeetings(session.accessToken, {
      daysBack,
      startDate,
      endDate,
    });

    const transcriptInfo = await checkMeetingTranscripts(session.accessToken, meetings);

    const meetingsWithTranscripts = meetings.map((meeting) => {
      const info = transcriptInfo.get(meeting.id);
      return {
        ...meeting,
        hasTranscript: info?.hasTranscript || false,
        onlineMeetingId: info?.onlineMeetingId,
      };
    });

    return NextResponse.json({
      meetings: meetingsWithTranscripts,
      total: meetingsWithTranscripts.length,
    });
  } catch (error) {
    console.error("Error in meetings API:", error);
    return NextResponse.json(
      { error: "Failed to fetch meetings" },
      { status: 500 }
    );
  }
});
