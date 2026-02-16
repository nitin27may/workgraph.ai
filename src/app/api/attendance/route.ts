import { NextRequest, NextResponse } from "next/server";
import { getMeetingAttendanceReport } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";
import { onlineMeetingIdSchema, parseBody } from "@/lib/validations";

export const POST = withAuth(async (request: NextRequest, session) => {
  try {
    const body = await request.json();
    const parsed = parseBody(onlineMeetingIdSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { onlineMeetingId } = parsed.data;

    const attendanceReport = await getMeetingAttendanceReport(
      session.accessToken,
      onlineMeetingId
    );

    if (!attendanceReport) {
      return NextResponse.json(
        { error: "Attendance report not available", attendanceReport: null },
        { status: 404 }
      );
    }

    return NextResponse.json({ attendanceReport });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return NextResponse.json(
      { error: "Failed to fetch attendance report" },
      { status: 500 }
    );
  }
});
