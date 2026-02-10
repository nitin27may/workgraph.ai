import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOnlineMeetingTranscript } from "@/lib/graph";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { onlineMeetingId } = body;

    if (!onlineMeetingId) {
      return NextResponse.json(
        { error: "Missing onlineMeetingId" },
        { status: 400 }
      );
    }

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
