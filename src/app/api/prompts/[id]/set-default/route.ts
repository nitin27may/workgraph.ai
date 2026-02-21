import { NextRequest, NextResponse } from "next/server";
import { setDefaultPrompt } from "@/lib/db";
import { withAuth } from "@/lib/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withAuth(async (_request: NextRequest, session, context: RouteContext) => {
  try {
    const { id: idParam } = await context.params;
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
});
