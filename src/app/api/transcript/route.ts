import { NextRequest, NextResponse } from "next/server";
import { getOnlineMeetingTranscript } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";
import { onlineMeetingIdSchema, parseBody } from "@/lib/validations";

export const POST = withAuth(async (request: NextRequest, session) => {
  try {
    const body = await request.json();
    const parsed = parseBody(onlineMeetingIdSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { onlineMeetingId } = parsed.data;

    const transcript = await getOnlineMeetingTranscript(
      session.accessToken,
      onlineMeetingId
    );

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript not available", transcript: null },
        { status: 404 }
      );
    }

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Error fetching transcript:", error);
    return NextResponse.json(
      { error: "Failed to fetch transcript" },
      { status: 500 }
    );
  }
});
