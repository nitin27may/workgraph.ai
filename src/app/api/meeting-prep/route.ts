import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMeetingPrepContext, getUpcomingMeetings } from "@/lib/graph";
import { isUserAuthorized } from "@/lib/db";
import { generateMeetingPreparations } from "@/lib/preparation-pipeline";
import type { Meeting } from "@/types/meeting";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is authorized to use the app
  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json(
      { error: "Forbidden - You are not authorized to use this application" },
      { status: 403 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const meetingId = searchParams.get("meetingId");
    const useEnhanced = searchParams.get("enhanced") === "true"; // Flag to enable enhanced prep

    // If meetingId is provided, get prep for that specific meeting
    if (meetingId) {
      try {
        const prepContext = await getMeetingPrepContext(session.accessToken, meetingId);

        if (!prepContext) {
          console.error("Meeting prep context not found for ID:", meetingId);
          return NextResponse.json({ error: "Meeting not found or inaccessible" }, { status: 404 });
        }

        // If enhanced mode is requested, run the full preparation pipeline
        if (useEnhanced) {
          console.log('🚀 Enhanced preparation requested for:', meetingId);
          const enhancedPrep = await generateMeetingPreparations(
            prepContext,
            session.user?.email || 'unknown'
          );
          
          return NextResponse.json({
            ...prepContext,
            enhanced: true,
            preparationBrief: enhancedPrep.brief,
            summaries: {
              meetings: enhancedPrep.meetingSummaries,
              emails: enhancedPrep.emailSummaries,
            },
            stats: enhancedPrep.stats,
          });
        }

        return NextResponse.json(prepContext);
      } catch (error: any) {
        console.error("Error fetching meeting prep context:", {
          meetingId,
          error: error?.message,
          statusCode: error?.statusCode,
        });
        
        return NextResponse.json(
          { 
            error: "Failed to fetch meeting preparation context",
            details: error?.message,
          },
          { status: error?.statusCode || 500 }
        );
      }
    }

    // Otherwise, get all upcoming meetings (next 72 hours)
    const now = new Date();
    const next72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const upcomingMeetings = await getUpcomingMeetings(session.accessToken, 3);

    // Filter meetings within next 72 hours and create prep requests
    const prepRequests: Array<{ meetingId: string; meeting: Meeting }> = [];
    for (const meeting of upcomingMeetings) {
      if (!meeting.id) continue;
      const startTime = new Date(meeting.startDateTime);
      if (startTime >= now && startTime <= next72Hours) {
        // TypeScript knows meeting.id is truthy here, but still treats it as potentially undefined
        // So we explicitly type it
        const id: string = meeting.id;
        prepRequests.push({ meetingId: id, meeting });
      }
      if (prepRequests.length >= 3) break;
    }

    // Get prep context for each meeting
    const prepContexts = await Promise.all(
      prepRequests.map(async ({ meetingId }) => {
        try {
          // TypeScript's control flow analysis is not properly inferring the type from the array definition
          // meetingId is guaranteed to be string per the array type, so we suppress the error
          // @ts-expect-error - meetingId is typed as string in prepRequests array definition
          return await getMeetingPrepContext(session.accessToken, meetingId);
        } catch (err) {
          console.error(`Error getting prep for meeting ${meetingId}:`, err);
          return null;
        }
      })
    );

    // Filter out null values
    const validPrepContexts = prepContexts.filter((prep) => prep !== null);

    return NextResponse.json({
      upcomingMeetings: prepRequests.map(r => r.meeting),
      prepContexts: validPrepContexts,
      total: validPrepContexts.length,
    });
  } catch (error) {
    console.error("Error fetching meeting prep:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch meeting prep" },
      { status: 500 }
    );
  }
}
