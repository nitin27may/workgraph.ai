import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/db";
import { Client } from "@microsoft/microsoft-graph-client";
import https from "https";

// Create a custom fetch that ignores TLS errors
const customFetch = (url: string, options: RequestInit = {}) => {
  const agent = new https.Agent({ rejectUnauthorized: false });
  return fetch(url, { ...options, agent } as RequestInit);
};

function getGraphClient(accessToken: string) {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
    fetchOptions: {
      agent: new https.Agent({ rejectUnauthorized: false }),
    },
  });
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  const client = getGraphClient(session.accessToken);
  const results: Record<string, unknown> = {};

  try {
    // 1. Try to get call records
    try {
      const callRecords = await client.api("/communications/callRecords").get();
      results.callRecords = {
        success: true,
        count: callRecords.value?.length || 0,
        sample: callRecords.value?.slice(0, 3),
      };
    } catch (e: unknown) {
      const error = e as Error;
      results.callRecords = { success: false, error: error.message };
    }

    // 2. Try to get online meetings
    try {
      const onlineMeetings = await client.api("/me/onlineMeetings").get();
      results.onlineMeetings = {
        success: true,
        count: onlineMeetings.value?.length || 0,
        sample: onlineMeetings.value?.slice(0, 3),
      };
    } catch (e: unknown) {
      const error = e as Error;
      results.onlineMeetings = { success: false, error: error.message };
    }

    // 3. Try calendar events from today
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const events = await client
        .api("/me/calendar/events")
        .filter(`start/dateTime ge '${today.toISOString()}'`)
        .top(10)
        .select("id,subject,start,end,isOnlineMeeting,onlineMeeting,onlineMeetingProvider")
        .get();
      
      results.calendarEvents = {
        success: true,
        count: events.value?.length || 0,
        events: events.value?.map((e: { subject: string; isOnlineMeeting: boolean; onlineMeeting: unknown }) => ({
          subject: e.subject,
          isOnlineMeeting: e.isOnlineMeeting,
          onlineMeetingDetails: e.onlineMeeting,
        })),
      };
    } catch (e: unknown) {
      const error = e as Error;
      results.calendarEvents = { success: false, error: error.message };
    }

    // 4. Try to get meeting by joinWebUrl if we have one
    const searchParams = request.nextUrl.searchParams;
    const joinUrl = searchParams.get("joinUrl");
    if (joinUrl) {
      try {
        const encodedUrl = encodeURIComponent(joinUrl);
        const meeting = await client
          .api(`/me/onlineMeetings?$filter=JoinWebUrl eq '${encodedUrl}'`)
          .get();
        results.meetingByJoinUrl = {
          success: true,
          meeting: meeting.value?.[0],
        };

        // If we got a meeting, try to get its transcripts
        if (meeting.value?.[0]?.id) {
          try {
            const transcripts = await client
              .api(`/me/onlineMeetings/${meeting.value[0].id}/transcripts`)
              .get();
            results.transcripts = {
              success: true,
              count: transcripts.value?.length || 0,
              transcripts: transcripts.value,
            };
          } catch (e: unknown) {
            const error = e as Error;
            results.transcripts = { success: false, error: error.message };
          }
        }
      } catch (e: unknown) {
        const error = e as Error;
        results.meetingByJoinUrl = { success: false, error: error.message };
      }
    }

    // 5. Check permissions by getting /me
    try {
      const me = await client.api("/me").get();
      results.user = { success: true, email: me.mail || me.userPrincipalName };
    } catch (e: unknown) {
      const error = e as Error;
      results.user = { success: false, error: error.message };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error("Debug error:", error);
    return NextResponse.json(
      { error: "Debug failed", details: String(error) },
      { status: 500 }
    );
  }
}
