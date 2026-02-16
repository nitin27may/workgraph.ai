import { NextRequest, NextResponse } from "next/server";
import { getFlaggedEmails, getUnreadImportantEmails } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (request: NextRequest, session) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dueDate = searchParams.get("dueDate") as "today" | "overdue" | "upcoming" | "all" | null;
    const includeCompleted = searchParams.get("includeCompleted") === "true";

    const [flaggedEmails, unreadImportant] = await Promise.all([
      getFlaggedEmails(session.accessToken, {
        dueDate: dueDate || "all",
        includeCompleted,
      }),
      getUnreadImportantEmails(session.accessToken, 20),
    ]);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const categorized = {
      dueToday: flaggedEmails.filter((email) => {
        if (!email.flag?.dueDateTime) return false;
        const dueDate = new Date(email.flag.dueDateTime.dateTime);
        return dueDate >= todayStart && dueDate <= todayEnd;
      }),
      overdue: flaggedEmails.filter((email) => {
        if (!email.flag?.dueDateTime) return false;
        const dueDate = new Date(email.flag.dueDateTime.dateTime);
        return dueDate < todayStart;
      }),
      upcoming: flaggedEmails.filter((email) => {
        if (!email.flag?.dueDateTime) return false;
        const dueDate = new Date(email.flag.dueDateTime.dateTime);
        return dueDate > todayEnd;
      }),
      noDueDate: flaggedEmails.filter((email) => !email.flag?.dueDateTime),
      unreadImportant,
    };

    return NextResponse.json({
      flagged: flaggedEmails,
      categorized,
      total: {
        flagged: flaggedEmails.length,
        dueToday: categorized.dueToday.length,
        overdue: categorized.overdue.length,
        upcoming: categorized.upcoming.length,
        unreadImportant: unreadImportant.length,
      },
    });
  } catch (error) {
    console.error("Error fetching email follow-ups:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch email follow-ups" },
      { status: 500 }
    );
  }
});
