import { NextRequest, NextResponse } from "next/server";
import { updateTask, deleteTask } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";
import { updateTaskSchema, parseBody } from "@/lib/validations";

type RouteContext = { params: Promise<{ listId: string; taskId: string }> };

export const PATCH = withAuth(async (request: NextRequest, session, context: RouteContext) => {
  try {
    const { listId, taskId } = await context.params;
    const body = await request.json();
    const parsed = parseBody(updateTaskSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const updates = parsed.data;

    const task = await updateTask(session.accessToken, listId, taskId, updates);

    return NextResponse.json({
      success: true,
      task,
      message: "Task updated successfully",
    });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (request: NextRequest, session, context: RouteContext) => {
  try {
    const { listId, taskId } = await context.params;

    await deleteTask(session.accessToken, listId, taskId);

    return NextResponse.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
});
