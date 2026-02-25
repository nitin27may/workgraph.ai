import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUserAuthorized } from "@/lib/db";
import { parseBody, createPlannerTaskSchema, batchCreatePlannerTasksSchema } from "@/lib/validations";
import { createPlannerTask, createMultiplePlannerTasks } from "@/lib/graph/planner";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Support both single task and batch creation
    if (body.tasks) {
      const parsed = parseBody(batchCreatePlannerTasksSchema, body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }

      const result = await createMultiplePlannerTasks(
        session.accessToken,
        parsed.data.tasks
      );

      return NextResponse.json(result);
    } else {
      const parsed = parseBody(createPlannerTaskSchema, body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }

      const task = await createPlannerTask(session.accessToken, parsed.data);
      return NextResponse.json({ task });
    }
  } catch (error) {
    console.error("Error creating planner task(s):", error);
    return NextResponse.json(
      { error: "Failed to create planner task(s)", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
