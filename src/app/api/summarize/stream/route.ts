import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUserAuthorized } from "@/lib/db";
import { getOnlineMeetingTranscript } from "@/lib/graph";
import { summarizeTranscriptStream, type StreamEvent } from "@/lib/openai-stream";
import { saveUsageMetrics } from "@/lib/db";
import { summarizeSchema, parseBody } from "@/lib/validations";

export const dynamic = "force-dynamic";

function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  // Auth check (manual since withAuth returns NextResponse, not raw Response)
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session?.user?.email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { authorized } = isUserAuthorized(session.user.email);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const parsed = parseBody(summarizeSchema, body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { onlineMeetingId, subject, startDateTime, endDateTime } = parsed.data;

  // Fetch transcript before starting the stream
  let transcript: string | null = null;
  if (onlineMeetingId) {
    transcript = await getOnlineMeetingTranscript(session.accessToken, onlineMeetingId);
  }

  if (!transcript) {
    return new Response(JSON.stringify({ error: "Transcript not available" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const capturedTranscript = transcript;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const generator = summarizeTranscriptStream(
          capturedTranscript,
          subject || "Untitled Meeting",
          startDateTime || new Date().toISOString(),
          endDateTime,
          {
            name: session.user?.name ?? undefined,
            email: session.user?.email ?? undefined,
          }
        );

        for await (const event of generator) {
          const sseEvent = mapToSSE(event);
          controller.enqueue(encoder.encode(sseEvent));

          // Save usage metrics when we get them
          if (event.type === "metrics") {
            try {
              const metricsData = event.data as Record<string, unknown>;
              const tokenUsage = metricsData.tokenUsage as {
                promptTokens: number;
                completionTokens: number;
                totalTokens: number;
              };
              saveUsageMetrics({
                meetingSubject: subject || "Untitled Meeting",
                meetingDate: startDateTime || new Date().toISOString(),
                meetingDurationMinutes: null,
                transcriptLength: capturedTranscript.length,
                transcriptWordCount: capturedTranscript.trim().split(/\s+/).length,
                tokenUsage,
                processingTimeMs: metricsData.processingTimeMs as number,
                model: metricsData.model as string,
                timestamp: new Date().toISOString(),
                requestedBy: session.user?.name ?? undefined,
                requestedByEmail: session.user?.email ?? undefined,
              });
            } catch (dbError) {
              console.error("Failed to save streaming usage metrics:", dbError);
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Stream failed";
        controller.enqueue(
          encoder.encode(encodeSSE("error", { message: errorMsg }))
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function mapToSSE(event: StreamEvent): string {
  switch (event.type) {
    case "status":
      return encodeSSE("status", { stage: event.stage });
    case "summary":
      return encodeSSE("summary", { delta: event.delta });
    case "structured":
      return encodeSSE("structured", event.data);
    case "metrics":
      return encodeSSE("metrics", event.data);
    case "error":
      return encodeSSE("error", { message: event.message });
    case "done":
      return encodeSSE("done", {});
  }
}
