import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMeetingAttendanceReport } from "@/lib/graph";

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
}
