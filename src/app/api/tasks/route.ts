import { NextRequest, NextResponse } from "next/server";
import {
  getAllTasks,
  getTasks,
  createTask,
  createMultipleTasks
} from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";
import { createTaskSchema, batchCreateTasksSchema, parseBody } from "@/lib/validations";
import type { CreateTaskRequest } from "@/types/meeting";

export const GET = withAuth(async (request: NextRequest, session) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const listId = searchParams.get("listId");
    const includeAll = searchParams.get("all") === "true";

    if (includeAll) {
      const allTasks = await getAllTasks(session.accessToken);
      return NextResponse.json({ tasksByList: allTasks });
    } else if (listId) {
      const tasks = await getTasks(session.accessToken, listId);
      return NextResponse.json({ tasks });
    } else {
      const tasks = await getTasks(session.accessToken);
      return NextResponse.json({ tasks });
    }
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request: NextRequest, session) => {
  try {
    const body = await request.json();

    if (body.tasks) {
      const parsed = parseBody(batchCreateTasksSchema, body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      const tasks: CreateTaskRequest[] = parsed.data.tasks;
      const result = await createMultipleTasks(session.accessToken, tasks);

      return NextResponse.json({
        success: true,
        created: result.created,
        failed: result.failed,
        message: `Created ${result.created.length} tasks${result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}`,
      });
    } else {
      const parsed = parseBody(createTaskSchema, body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      const taskData: CreateTaskRequest = parsed.data;

      const task = await createTask(session.accessToken, taskData);

      return NextResponse.json({
        success: true,
        task,
        message: "Task created successfully",
      });
    }
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
});
