import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { shareTaskViaEmail, assignTaskToUser } from "@/lib/graph";
import { isUserAuthorized } from "@/lib/db";

// POST /api/tasks/share - Share a task with another user
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is authorized
  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json(
      { error: "Forbidden - You are not authorized to use this application" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { 
      taskTitle, 
      taskBody, 
      taskBodyHtml,
      recipientEmail, 
      ccRecipients,
      meetingSubject,
      emailSubject,
      // For assigning as a new task
      assignAsTask,
      dueDateTime,
      importance,
    } = body;

    if (!taskTitle || !recipientEmail) {
      return NextResponse.json(
        { error: "Task title and recipient email are required" },
        { status: 400 }
      );
    }

    // Use emailSubject if provided, otherwise fall back to taskTitle
    const subject = emailSubject || taskTitle;

    if (assignAsTask) {
      // Try to assign the task to the user (creates a new task notification)
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
      // Just share via email
      await shareTaskViaEmail(
        session.accessToken,
        subject,
        taskBody || "",
        recipientEmail,
        meetingSubject,
        taskBodyHtml,
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
}
