import { NextRequest, NextResponse } from "next/server";
import { shareTaskViaEmail, assignTaskToUser } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";
import { shareTaskSchema, parseBody } from "@/lib/validations";

export const POST = withAuth(async (request: NextRequest, session) => {
  try {
    const body = await request.json();
    const parsed = parseBody(shareTaskSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const {
      taskTitle,
      taskBody,
      taskBodyHtml,
      recipientEmail,
      ccRecipients,
      meetingSubject,
      emailSubject,
      assignAsTask,
      dueDateTime,
      importance,
    } = parsed.data;

    const subject = emailSubject || taskTitle;

    if (assignAsTask) {
      const result = await assignTaskToUser(
        session.accessToken,
        recipientEmail,
        {
          title: taskTitle,
          body: taskBody,
          dueDateTime,
          importance,
          meetingSubject,
        }
      );

      return NextResponse.json(result);
    } else {
      // If HTML body is provided, use it directly with isHtml flag
      const body = taskBodyHtml || taskBody || "";
      const isHtml = !!taskBodyHtml;
      await shareTaskViaEmail(
        session.accessToken,
        subject,
        body,
        recipientEmail,
        meetingSubject,
        isHtml,
        ccRecipients
      );

      return NextResponse.json({
        success: true,
        method: "email",
        message: `Task shared with ${recipientEmail} via email`,
      });
    }
  } catch (error) {
    console.error("Error sharing task:", error);
    return NextResponse.json(
      { error: "Failed to share task" },
      { status: 500 }
    );
  }
});
