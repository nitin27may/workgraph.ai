import { NextRequest, NextResponse } from "next/server";
import {
  getPromptTemplateById,
  updatePromptTemplate,
  deletePromptTemplate,
} from "@/lib/db";
import { withAuth } from "@/lib/api-auth";
import { updatePromptSchema, parseBody } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_request: NextRequest, session, context: RouteContext) => {
  try {
    const { id: idParam } = await context.params;
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const prompt = getPromptTemplateById(id, session.user.email);
    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    return NextResponse.json(prompt);
  } catch (error) {
    console.error("Error fetching prompt:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt" },
      { status: 500 }
    );
  }
});

export const PUT = withAuth(async (request: NextRequest, session, context: RouteContext) => {
  try {
    const { id: idParam } = await context.params;
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = parseBody(updatePromptSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { name, description, systemPrompt, userPromptTemplate, isDefault } = parsed.data;

    const success = updatePromptTemplate(id, session.user.email, {
      name,
      description,
      systemPrompt,
      userPromptTemplate,
      isDefault,
    });

    if (!success) {
      return NextResponse.json(
        { error: "Failed to update prompt or prompt not found" },
        { status: 404 }
      );
    }

    const updatedPrompt = getPromptTemplateById(id, session.user.email);
    return NextResponse.json(updatedPrompt);
  } catch (error) {
    console.error("Error updating prompt:", error);
    return NextResponse.json(
      { error: "Failed to update prompt" },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (_request: NextRequest, session, context: RouteContext) => {
  try {
    const { id: idParam } = await context.params;
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const success = deletePromptTemplate(id, session.user.email);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to delete prompt or prompt not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting prompt:", error);
    return NextResponse.json(
      { error: "Failed to delete prompt" },
      { status: 500 }
    );
  }
});
