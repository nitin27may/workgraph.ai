import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withAuth } from "@/lib/api-auth";
import { 
  getMeetingPrepContext, 
  getUpcomingMeetings,
  getMessage,
  getCalendarEvent,
  getChannelMessages,
  getOnlineMeetingTranscript,
  type EmailMessage,
  type ChannelMessage
} from "@/lib/graph";
import { isUserAuthorized, savePrepUsageMetrics } from "@/lib/db";
import { generateMeetingPreparations } from "@/lib/preparation-pipeline";
import type { Meeting } from "@/types/meeting";

export const GET = withAuth(async (request: NextRequest, session) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const meetingId = searchParams.get("meetingId");
    const useEnhanced = searchParams.get("enhanced") === "true";

    if (meetingId) {
      try {
        const prepContext = await getMeetingPrepContext(session.accessToken, meetingId);

        if (!prepContext) {
          console.error("Meeting prep context not found for ID:", meetingId);
          return NextResponse.json({ error: "Meeting not found or inaccessible" }, { status: 404 });
        }

        if (useEnhanced) {
          console.log('Enhanced preparation requested for:', meetingId);
          const enhancedPrep = await generateMeetingPreparations(
            prepContext,
            session.user?.email || 'unknown'
          );

          // Record prep usage (non-fatal)
          try {
            savePrepUsageMetrics({
              meetingSubject: prepContext.meeting.subject,
              meetingDate: prepContext.meeting.startDateTime,
              totalMeetingsAnalyzed: enhancedPrep.stats.totalMeetings,
              meetingsCached: enhancedPrep.stats.meetingsCached,
              meetingsGenerated: enhancedPrep.stats.meetingsGenerated,
              totalEmailsAnalyzed: enhancedPrep.stats.totalEmails,
              emailsCached: enhancedPrep.stats.emailsCached,
              emailsGenerated: enhancedPrep.stats.emailsGenerated,
              approach: enhancedPrep.approach || 'single-stage',
              layers: enhancedPrep.layers || 1,
              reducedMeetingThreads: enhancedPrep.stats.reducedMeetingThreads,
              reducedEmailThreads: enhancedPrep.stats.reducedEmailThreads,
              tokenUsage: enhancedPrep.stats.briefTokenUsage,
              processingTimeMs: enhancedPrep.stats.processingTimeMs,
              model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
              requestedBy: session.user?.name,
              requestedByEmail: session.user?.email,
            });
          } catch (dbError) {
            console.error('Failed to save prep usage:', dbError);
          }

          return NextResponse.json({
            ...prepContext,
            enhanced: true,
            preparationBrief: enhancedPrep.brief,
            summaries: {
              meetings: enhancedPrep.meetingSummaries,
              emails: enhancedPrep.emailSummaries,
            },
            stats: {
              ...enhancedPrep.stats,
              // Surface brief token usage for the usage tab in the UI
              briefTokenUsage: enhancedPrep.stats.briefTokenUsage,
              reducedMeetingThreads: enhancedPrep.stats.reducedMeetingThreads,
              reducedEmailThreads: enhancedPrep.stats.reducedEmailThreads,
            },
          });
        }

        return NextResponse.json(prepContext);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const statusCode = (error as { statusCode?: number })?.statusCode;
        console.error("Error fetching meeting prep context:", {
          meetingId,
          error: message,
          statusCode,
        });

        return NextResponse.json(
          {
            error: "Failed to fetch meeting preparation context",
            details: message,
          },
          { status: statusCode || 500 }
        );
      }
    }

    // Otherwise, get all upcoming meetings (next 72 hours)
    const now = new Date();
    const next72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const upcomingMeetings = await getUpcomingMeetings(session.accessToken, 3);

    const prepRequests: Array<{ meetingId: string; meeting: Meeting }> = [];
    for (const meeting of upcomingMeetings) {
      if (!meeting.id) continue;
      const startTime = new Date(meeting.startDateTime);
      if (startTime >= now && startTime <= next72Hours) {
        const id: string = meeting.id;
        prepRequests.push({ meetingId: id, meeting });
      }
      if (prepRequests.length >= 3) break;
    }

    const prepContexts = await Promise.all(
      prepRequests.map(async ({ meetingId }) => {
        try {
          return await getMeetingPrepContext(session.accessToken, meetingId);
        } catch (err) {
          console.error(`Error getting prep for meeting ${meetingId}:`, err);
          return null;
        }
      })
    );

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
});

/**
 * POST /api/meeting-prep - Generate meeting preparation with user-selected context
 * Accepts selections and generates preparation brief
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const { meetingId, selections, multiStageSummary } = body;

    if (!meetingId) {
      return NextResponse.json(
        { error: "meetingId is required" },
        { status: 400 }
      );
    }

    if (!selections) {
      return NextResponse.json(
        { error: "selections are required" },
        { status: 400 }
      );
    }

    console.log(`🎯 Processing selected context for meeting ${meetingId}`, {
      meetings: selections.meetingIds?.length || 0,
      emails: selections.emailIds?.length || 0,
      teamChannels: selections.teamChannelIds?.length || 0,
      files: selections.fileIds?.length || 0,
      multiStage: multiStageSummary || false,
    });

    const accessToken = session.accessToken;

    // Fetch target meeting
    const targetMeeting = await getCalendarEvent(accessToken, meetingId);
    if (!targetMeeting) {
      return NextResponse.json(
        { error: "Target meeting not found" },
        { status: 404 }
      );
    }

    // Fetch selected content in parallel
    const [
      selectedMeetings,
      selectedEmails,
      selectedTeamMessages,
      selectedFiles,
    ] = await Promise.all([
      // Fetch selected meetings with transcripts
      selections.meetingIds && selections.meetingIds.length > 0
        ? Promise.all(
            selections.meetingIds.map(async (id: string) => {
              try {
                const meeting = await getCalendarEvent(accessToken, id);
                if (!meeting) return null;

                // Try to get transcript if it's an online meeting
                let transcript = null;
                if (meeting.isOnlineMeeting && meeting.onlineMeeting) {
                  try {
                    transcript = await getOnlineMeetingTranscript(
                      accessToken,
                      id
                    );
                  } catch (err) {
                    console.log(`No transcript available for meeting ${id}`);
                  }
                }

                return {
                  ...meeting,
                  transcript,
                };
              } catch (err) {
                console.error(`Error fetching meeting ${id}:`, err);
                return null;
              }
            })
          ).then((results) => results.filter((m) => m !== null))
        : Promise.resolve([]),

      // Fetch selected emails with full body
      selections.emailIds && selections.emailIds.length > 0
        ? Promise.all(
            selections.emailIds.map(async (id: string) => {
              try {
                return await getMessage(accessToken, id, true); // includeBody = true
              } catch (err) {
                console.error(`Error fetching email ${id}:`, err);
                return null;
              }
            })
          ).then((results) => results.filter((e) => e !== null))
        : Promise.resolve([]),

      // Fetch selected Teams channel messages
      selections.teamChannelIds && selections.teamChannelIds.length > 0
        ? Promise.all(
            selections.teamChannelIds.map(
              async (tc: { teamId: string; channelId: string }) => {
                try {
                  const messages = await getChannelMessages(
                    accessToken,
                    tc.teamId,
                    tc.channelId,
                    { top: 50 }
                  );
                  return {
                    teamId: tc.teamId,
                    channelId: tc.channelId,
                    messages,
                  };
                } catch (err) {
                  console.error(
                    `Error fetching messages for team ${tc.teamId} channel ${tc.channelId}:`,
                    err
                  );
                  return null;
                }
              }
            )
          ).then((results) => results.filter((t) => t !== null))
        : Promise.resolve([]),

      // Fetch selected files (metadata only for now)
      selections.fileIds && selections.fileIds.length > 0
        ? Promise.all(
            selections.fileIds.map(async (id: string) => {
              try {
                // For now, just return file metadata
                // In the future, we can extract content from text-based files
                return { id, name: `File ${id}` }; // Placeholder
              } catch (err) {
                console.error(`Error fetching file ${id}:`, err);
                return null;
              }
            })
          ).then((results) => results.filter((f) => f !== null))
        : Promise.resolve([]),
    ]);

    console.log(`✅ Fetched selected content:`, {
      meetings: selectedMeetings.length,
      emails: selectedEmails.length,
      teamChannels: selectedTeamMessages.length,
      files: selectedFiles.length,
    });

    // Convert CalendarEventDetailed to Meeting type
    const meeting: Meeting = {
      id: targetMeeting.id,
      subject: targetMeeting.subject,
      startDateTime: targetMeeting.start.dateTime,
      endDateTime: targetMeeting.end.dateTime,
      organizer: targetMeeting.organizer,
      participants: targetMeeting.attendees ? {
        attendees: targetMeeting.attendees.map(a => ({ emailAddress: a.emailAddress }))
      } : undefined,
      hasTranscript: false,
      joinWebUrl: targetMeeting.onlineMeeting?.joinUrl,
      onlineMeetingId: targetMeeting.isOnlineMeeting ? targetMeeting.id : undefined,
    };

    // Build custom prep context with selected items matching MeetingPrep interface
    const customContext: any = {
      meeting,
      context: {
        relatedMeetings: selectedMeetings.map((m: any) => ({
          id: m.id,
          subject: m.subject,
          startDateTime: m.start.dateTime,
          endDateTime: m.end.dateTime,
          organizer: m.organizer,
          participants: m.attendees ? {
            attendees: m.attendees.map((a: any) => ({ emailAddress: a.emailAddress }))
          } : undefined,
          transcript: m.transcript,
          hasTranscript: !!m.transcript,
        })),
        relatedEmails: selectedEmails.map((e: any) => ({
          ...e,
          fullBody: e.body?.content || e.bodyPreview,
        })),
        recentChats: [],
        attendeeInfo: [],
      },
      relevance: {
        emailCount: selectedEmails.length,
        meetingCount: selectedMeetings.length,
        topKeywords: [],
        confidence: 'high' as const,
      },
    };

    // Generate preparation using the pipeline
    const enhancedPrep = await generateMeetingPreparations(
      customContext,
      session.user?.email || "unknown",
      multiStageSummary || false // Pass multi-stage flag
    );

    // Record prep usage (non-fatal)
    try {
      savePrepUsageMetrics({
        meetingSubject: targetMeeting.subject,
        meetingDate: targetMeeting.start.dateTime,
        totalMeetingsAnalyzed: enhancedPrep.stats.totalMeetings,
        meetingsCached: enhancedPrep.stats.meetingsCached,
        meetingsGenerated: enhancedPrep.stats.meetingsGenerated,
        totalEmailsAnalyzed: enhancedPrep.stats.totalEmails,
        emailsCached: enhancedPrep.stats.emailsCached,
        emailsGenerated: enhancedPrep.stats.emailsGenerated,
        approach: enhancedPrep.approach || 'single-stage',
        layers: enhancedPrep.layers || 1,
        reducedMeetingThreads: enhancedPrep.stats.reducedMeetingThreads,
        reducedEmailThreads: enhancedPrep.stats.reducedEmailThreads,
        tokenUsage: enhancedPrep.stats.briefTokenUsage,
        processingTimeMs: enhancedPrep.stats.processingTimeMs,
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
        requestedBy: session.user?.name,
        requestedByEmail: session.user?.email,
      });
    } catch (dbError) {
      console.error('Failed to save prep usage:', dbError);
    }

    return NextResponse.json({
      targetMeeting: {
        id: targetMeeting.id,
        subject: targetMeeting.subject,
        startTime: targetMeeting.start.dateTime,
        endTime: targetMeeting.end.dateTime,
      },
      preparationBrief: enhancedPrep.brief,
      summaries: {
        meetings: enhancedPrep.meetingSummaries,
        emails: enhancedPrep.emailSummaries,
      },
      stats: enhancedPrep.stats,
      approach: enhancedPrep.approach || "single-stage",
      enhanced: true,
    });
  } catch (error) {
    console.error("Error in meeting prep POST:", error);
    return NextResponse.json(
      {
        error: "Failed to generate meeting preparation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}