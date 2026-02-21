import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import {
  listNotebooks,
  listSections,
  listPages,
  createMeetingNotePage,
  createActionItemsNotePage,
  type MeetingDataForNote,
  type SummaryDataForNote,
  type ActionItemForNote,
} from "@/lib/graph/onenote";
import { z } from "zod";

// GET /api/onenote?resource=notebooks
// GET /api/onenote?resource=sections&notebookId=<id>
// GET /api/onenote?resource=pages&sectionId=<id>
export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get("resource");

  try {
    if (resource === "notebooks" || !resource) {
      const notebooks = await listNotebooks(session.accessToken);
      return NextResponse.json({ notebooks });
    }

    if (resource === "sections") {
      const notebookId = searchParams.get("notebookId");
      if (!notebookId) {
        return NextResponse.json({ error: "notebookId is required" }, { status: 400 });
      }
      const sections = await listSections(session.accessToken, notebookId);
      return NextResponse.json({ sections });
    }

    if (resource === "pages") {
      const sectionId = searchParams.get("sectionId");
      if (!sectionId) {
        return NextResponse.json({ error: "sectionId is required" }, { status: 400 });
      }
      const pages = await listPages(session.accessToken, sectionId);
      return NextResponse.json({ pages });
    }

    return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  } catch (error) {
    console.error("OneNote GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch OneNote data" },
      { status: 500 }
    );
  }
});

const MeetingSchema = z.object({
  subject: z.string(),
  startDateTime: z.string(),
  organizer: z.object({
    emailAddress: z.object({ name: z.string() }),
  }),
  participants: z
    .object({
      attendees: z.array(
        z.object({
          emailAddress: z.object({ name: z.string(), address: z.string() }),
        })
      ),
    })
    .optional(),
});

const CreateMeetingPageSchema = z.object({
  mode: z.literal("meeting").optional().default("meeting"),
  sectionId: z.string().min(1),
  meeting: MeetingSchema,
  summary: z.object({
    keyDecisions: z.array(z.string()),
    actionItems: z.array(
      z.object({
        owner: z.string(),
        task: z.string(),
        deadline: z.string().optional(),
      })
    ),
    nextSteps: z.array(z.string()),
    fullSummary: z.string(),
  }),
});

const CreateActionItemsPageSchema = z.object({
  mode: z.literal("actionItems"),
  sectionId: z.string().min(1),
  meeting: MeetingSchema,
  actionItems: z.array(
    z.object({
      owner: z.string(),
      task: z.string(),
      deadline: z.string().optional(),
    })
  ),
});

const CreatePageSchema = z.discriminatedUnion("mode", [
  CreateMeetingPageSchema,
  CreateActionItemsPageSchema,
]);

// Also accept legacy format (no mode field) as meeting mode
const LegacyCreatePageSchema = z.object({
  sectionId: z.string().min(1),
  meeting: MeetingSchema,
  summary: z.object({
    keyDecisions: z.array(z.string()),
    actionItems: z.array(
      z.object({
        owner: z.string(),
        task: z.string(),
        deadline: z.string().optional(),
      })
    ),
    nextSteps: z.array(z.string()),
    fullSummary: z.string(),
  }),
});

// POST /api/onenote — create a meeting summary or action items page
export const POST = withAuth(async (req, session) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Try discriminated union first, fall back to legacy schema
  const parsed = CreatePageSchema.safeParse(body);
  if (parsed.success) {
    const data = parsed.data;
    try {
      if (data.mode === "actionItems") {
        const page = await createActionItemsNotePage(
          session.accessToken,
          data.sectionId,
          data.meeting as MeetingDataForNote,
          data.actionItems as ActionItemForNote[]
        );
        return NextResponse.json({ page }, { status: 201 });
      } else {
        const page = await createMeetingNotePage(
          session.accessToken,
          data.sectionId,
          data.meeting as MeetingDataForNote,
          data.summary as SummaryDataForNote
        );
        return NextResponse.json({ page }, { status: 201 });
      }
    } catch (error) {
      console.error("OneNote POST error:", error);
      return NextResponse.json(
        { error: "Failed to create OneNote page" },
        { status: 500 }
      );
    }
  }

  // Legacy format (no mode field)
  const legacyParsed = LegacyCreatePageSchema.safeParse(body);
  if (!legacyParsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: legacyParsed.error.issues },
      { status: 400 }
    );
  }

  const { sectionId, meeting, summary } = legacyParsed.data;
  try {
    const page = await createMeetingNotePage(
      session.accessToken,
      sectionId,
      meeting as MeetingDataForNote,
      summary as SummaryDataForNote
    );
    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    console.error("OneNote POST error:", error);
    return NextResponse.json(
      { error: "Failed to create OneNote page" },
      { status: 500 }
    );
  }
});
