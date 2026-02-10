import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { setDefaultPrompt } from "@/lib/db";

// POST /api/prompts/[id]/set-default - Set a prompt as default
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const success = setDefaultPrompt(id, session.user.email);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to set default prompt" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting default prompt:", error);
    return NextResponse.json(
      { error: "Failed to set default prompt" },
      { status: 500 }
    );
  }
}
