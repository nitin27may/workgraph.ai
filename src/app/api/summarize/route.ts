import { NextRequest, NextResponse } from "next/server";
import { getOnlineMeetingTranscript } from "@/lib/graph";
import { summarizeTranscript } from "@/lib/openai";
import { saveUsageMetrics } from "@/lib/db";
import { withAuth } from "@/lib/api-auth";
import { summarizeSchema, parseBody } from "@/lib/validations";

export const POST = withAuth(async (request: NextRequest, session) => {
  try {
    const body = await request.json();
    const parsed = parseBody(summarizeSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { callRecordId, sessionId, onlineMeetingId, subject, startDateTime, endDateTime } = parsed.data;

    let transcript: string | null = null;

    // Try Online Meetings API first (preferred)
    if (onlineMeetingId) {
      console.log("Fetching transcript using Online Meetings API for:", onlineMeetingId);
      transcript = await getOnlineMeetingTranscript(session.accessToken, onlineMeetingId);
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
      subject || "Untitled Meeting",
      startDateTime || new Date().toISOString(),
      endDateTime,
      {
        name: session.user.name ?? undefined,
        email: session.user.email,
      }
    );

    // Save usage metrics to SQLite
    try {
      const savedRecord = saveUsageMetrics(metrics);
      console.log('Usage saved to database:', savedRecord.id);
    } catch (dbError) {
      console.error('Failed to save usage metrics:', dbError);
    }

    return NextResponse.json({
      ...summary,
      _metrics: metrics,
    });
  } catch (error) {
    console.error("Error in summarize API:", error);
    return NextResponse.json(
      { error: "Failed to summarize meeting" },
      { status: 500 }
    );
  }
});
