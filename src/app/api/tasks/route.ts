import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { 
  getAllTasks, 
  getTaskLists, 
  getTasks, 
  createTask, 
  createMultipleTasks 
} from "@/lib/graph";
import { isUserAuthorized } from "@/lib/db";
import { createTaskSchema, batchCreateTasksSchema, parseBody } from "@/lib/validations";
import type { CreateTaskRequest } from "@/types/meeting";

// GET /api/tasks - Get all tasks for the user
export async function GET(request: NextRequest) {
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
    const searchParams = request.nextUrl.searchParams;
    const listId = searchParams.get("listId");
    const includeAll = searchParams.get("all") === "true";

    if (includeAll) {
      // Get all tasks from all lists
      const allTasks = await getAllTasks(session.accessToken);
      return NextResponse.json({ tasksByList: allTasks });
    } else if (listId) {
      // Get tasks from specific list
      const tasks = await getTasks(session.accessToken, listId);
      return NextResponse.json({ tasks });
    } else {
      // Get tasks from default list
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
}

// POST /api/tasks - Create one or more tasks
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

    // Check if it's a batch request (array of tasks)
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
      // Single task creation
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
}
