import { NextRequest, NextResponse } from "next/server";
import { getUserPromptTemplates, createPromptTemplate } from "@/lib/db";
import { withAuth } from "@/lib/api-auth";
import { createPromptSchema, parseBody } from "@/lib/validations";

export const GET = withAuth(async (_request: NextRequest, session) => {
  try {
    const prompts = getUserPromptTemplates(session.user.email);
    return NextResponse.json(prompts);
  } catch (error) {
    console.error("Error fetching prompts:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompts" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request: NextRequest, session) => {
  try {
    const body = await request.json();
    const parsed = parseBody(createPromptSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { name, description, systemPrompt, userPromptTemplate, isDefault } = parsed.data;

    const prompt = createPromptTemplate(
      name,
      description || null,
      systemPrompt,
      userPromptTemplate,
      isDefault || false,
      session.user.email
    );

    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    console.error("Error creating prompt:", error);
    return NextResponse.json(
      { error: "Failed to create prompt" },
      { status: 500 }
    );
  }
});
