import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMeetingTranscript, getOnlineMeetingTranscript } from "@/lib/graph";
import { summarizeTranscript } from "@/lib/openai";
import { saveUsageMetrics, isUserAuthorized } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is authorized to use the app
  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden - You are not authorized to use this application" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { callRecordId, sessionId, onlineMeetingId, subject, startDateTime, endDateTime } = body;

    let transcript: string | null = null;

    // Try Online Meetings API first (preferred)
    if (onlineMeetingId) {
      console.log("Fetching transcript using Online Meetings API for:", onlineMeetingId);
      transcript = await getOnlineMeetingTranscript(session.accessToken, onlineMeetingId);
    }

    // Fallback to Call Records API
    if (!transcript && callRecordId && sessionId) {
      console.log("Falling back to Call Records API for:", callRecordId);
      transcript = await getMeetingTranscript(session.accessToken, callRecordId, sessionId);
    }

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript not available" },
        { status: 404 }
      );
    }

    // Summarize with Azure OpenAI
    const { summary, metrics } = await summarizeTranscript(
      transcript, 
      subject, 
      startDateTime,
      endDateTime,
      {
        name: session.user?.name ?? undefined,
        email: session.user?.email ?? undefined,
      }
    );

    // Save usage metrics to SQLite
    try {
      const savedRecord = saveUsageMetrics(metrics);
      console.log('📊 Usage saved to database:', savedRecord.id);
    } catch (dbError) {
      console.error('Failed to save usage metrics:', dbError);
      // Don't fail the request if DB save fails
    }

    // Return both summary and metrics to the client
    return NextResponse.json({
      ...summary,
      _metrics: metrics, // Prefixed with _ to indicate metadata
    });
  } catch (error) {
    console.error("Error in summarize API:", error);
    return NextResponse.json(
      { error: "Failed to summarize meeting" },
      { status: 500 }
    );
  }
}
