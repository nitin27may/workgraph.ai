import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOnlineMeetingTranscript } from "@/lib/graph";
import { isUserAuthorized } from "@/lib/db";
import { onlineMeetingIdSchema, parseBody } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden - You are not authorized to use this application" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = parseBody(onlineMeetingIdSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { onlineMeetingId } = parsed.data;

    // Fetch transcript
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
}
