import type { TodoTask, TodoTaskList, CreateTaskRequest } from "@/types/meeting";
import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "./client";
import { DEFAULT_MAX_RESULTS, getTodayDateRange } from "./helpers";

// Shared helper to query tasks across all task lists with a filter
async function queryAllTaskLists(
  accessToken: string,
  client: Client,
  filter: string,
  select?: string
): Promise<TodoTask[]> {
  const lists = await getTaskLists(accessToken);

  const results = await Promise.all(
    lists.map(async (list) => {
      try {
        let query = client
          .api(`/me/todo/lists/${list.id}/tasks`)
          .filter(filter);

        if (select) {
          query = query.select(select);
        }

        const response = await query.get();
        return (response.value || []).map((t: TodoTask) => ({
          ...t,
          listName: list.displayName,
          listId: list.id,
        }));
      } catch (err) {
        console.error(`Error fetching tasks for list ${list.displayName}:`, err);
        return [];
      }
    })
  );

  return results.flat();
}

// Get all task lists for the user
export async function getTaskLists(accessToken: string): Promise<TodoTaskList[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api("/me/todo/lists")
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching task lists:", error);
    throw new Error("Failed to fetch task lists");
  }
}

// Get tasks from a specific list (or default list)
export async function getTasks(
  accessToken: string,
  listId?: string
): Promise<TodoTask[]> {
  const client = getGraphClient(accessToken);

  try {
    // If no listId provided, get the default task list first
    let targetListId = listId;
    if (!targetListId) {
      const lists = await getTaskLists(accessToken);
      const defaultList = lists.find(l => l.wellknownListName === "defaultList") || lists[0];
      if (!defaultList) {
        return [];
      }
      targetListId = defaultList.id;
    }

    const response = await client
      .api(`/me/todo/lists/${targetListId}/tasks`)
      .filter("status ne 'completed'")
      .orderby("createdDateTime desc")
      .top(DEFAULT_MAX_RESULTS)
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching tasks:", error);
    throw new Error("Failed to fetch tasks");
  }
}

// Get all tasks from all lists
export async function getAllTasks(accessToken: string): Promise<{ list: TodoTaskList; tasks: TodoTask[] }[]> {
  const client = getGraphClient(accessToken);

  try {
    const lists = await getTaskLists(accessToken);

    return await Promise.all(
      lists.map(async (list) => {
        try {
          const response = await client
            .api(`/me/todo/lists/${list.id}/tasks`)
            .orderby("createdDateTime desc")
            .top(DEFAULT_MAX_RESULTS)
            .get();

          return { list, tasks: response.value || [] };
        } catch (err) {
          console.error(`Error fetching tasks for list ${list.displayName}:`, err);
          return { list, tasks: [] };
        }
      })
    );
  } catch (error) {
    console.error("Error fetching all tasks:", error);
    throw new Error("Failed to fetch all tasks");
  }
}

// Create a new task
export async function createTask(
  accessToken: string,
  taskData: CreateTaskRequest
): Promise<TodoTask> {
  const client = getGraphClient(accessToken);

  try {
    // Get target list ID
    let targetListId = taskData.listId;
    if (!targetListId) {
      const lists = await getTaskLists(accessToken);
      const defaultList = lists.find(l => l.wellknownListName === "defaultList") || lists[0];
      if (!defaultList) {
        throw new Error("No task list found");
      }
      targetListId = defaultList.id;
    }

    // Build task body with meeting context if provided
    let bodyContent = taskData.body || "";
    if (taskData.meetingSubject) {
      bodyContent = `Created from meeting: ${taskData.meetingSubject}\n\n${bodyContent}`;
    }

    const taskPayload: {
      title: string;
      body?: { content: string; contentType: string };
      importance: "low" | "normal" | "high";
      dueDateTime?: { dateTime: string; timeZone: string };
    } = {
      title: taskData.title,
      importance: taskData.importance || "normal",
    };

    if (bodyContent) {
      taskPayload.body = {
        content: bodyContent,
        contentType: "text",
      };
    }

    if (taskData.dueDateTime) {
      taskPayload.dueDateTime = {
        dateTime: taskData.dueDateTime,
        timeZone: "UTC",
      };
    }

    const response = await client
      .api(`/me/todo/lists/${targetListId}/tasks`)
      .post(taskPayload);

    return response;
  } catch (error) {
    console.error("Error creating task:", error);
    throw new Error("Failed to create task");
  }
}

// Create multiple tasks at once
export async function createMultipleTasks(
  accessToken: string,
  tasks: CreateTaskRequest[]
): Promise<{ created: TodoTask[]; failed: { task: CreateTaskRequest; error: string }[] }> {
  const created: TodoTask[] = [];
  const failed: { task: CreateTaskRequest; error: string }[] = [];

  for (const taskData of tasks) {
    try {
      const task = await createTask(accessToken, taskData);
      created.push(task);
    } catch (error) {
      failed.push({
        task: taskData,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { created, failed };
}

// Update a task
export async function updateTask(
  accessToken: string,
  listId: string,
  taskId: string,
  updates: Partial<Pick<TodoTask, "title" | "status" | "importance">>
): Promise<TodoTask> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api(`/me/todo/lists/${listId}/tasks/${taskId}`)
      .patch(updates);

    return response;
  } catch (error) {
    console.error("Error updating task:", error);
    throw new Error("Failed to update task");
  }
}

// Delete a task
export async function deleteTask(
  accessToken: string,
  listId: string,
  taskId: string
): Promise<void> {
  const client = getGraphClient(accessToken);

  try {
    await client
      .api(`/me/todo/lists/${listId}/tasks/${taskId}`)
      .delete();
  } catch (error) {
    console.error("Error deleting task:", error);
    throw new Error("Failed to delete task");
  }
}

// Get tasks due today
export async function getTasksDueToday(
  accessToken: string
): Promise<{ list: TodoTaskList; tasks: TodoTask[] }[]> {
  const client = getGraphClient(accessToken);

  try {
    const lists = await getTaskLists(accessToken);
    const { start: todayStart, end: todayEnd } = getTodayDateRange();

    const results = await Promise.all(
      lists.map(async (list) => {
        try {
          const response = await client
            .api(`/me/todo/lists/${list.id}/tasks`)
            .filter(
              `status ne 'completed' and dueDateTime/dateTime ge '${todayStart.toISOString()}' and dueDateTime/dateTime le '${todayEnd.toISOString()}'`
            )
            .orderby("dueDateTime/dateTime asc")
            .get();

          const tasks = response.value || [];
          return tasks.length > 0 ? { list, tasks } : null;
        } catch (err) {
          console.error(`Error fetching tasks due today for list ${list.displayName}:`, err);
          return null;
        }
      })
    );

    return results.filter((r): r is { list: TodoTaskList; tasks: TodoTask[] } => r !== null);
  } catch (error) {
    console.error("Error fetching tasks due today:", error);
    throw new Error("Failed to fetch tasks due today");
  }
}

// Get overdue tasks
export async function getOverdueTasks(
  accessToken: string
): Promise<{ list: TodoTaskList; tasks: TodoTask[] }[]> {
  const client = getGraphClient(accessToken);

  try {
    const lists = await getTaskLists(accessToken);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const results = await Promise.all(
      lists.map(async (list) => {
        try {
          const response = await client
            .api(`/me/todo/lists/${list.id}/tasks`)
            .filter(`status ne 'completed' and dueDateTime/dateTime lt '${now.toISOString()}'`)
            .orderby("dueDateTime/dateTime asc")
            .get();

          const tasks = response.value || [];
          return tasks.length > 0 ? { list, tasks } : null;
        } catch (err) {
          console.error(`Error fetching overdue tasks for list ${list.displayName}:`, err);
          return null;
        }
      })
    );

    return results.filter((r): r is { list: TodoTaskList; tasks: TodoTask[] } => r !== null);
  } catch (error) {
    console.error("Error fetching overdue tasks:", error);
    throw new Error("Failed to fetch overdue tasks");
  }
}

// Get tasks due today or high priority
export async function getTodaysImportantTasks(
  accessToken: string
): Promise<TodoTask[]> {
  const client = getGraphClient(accessToken);

  try {
    const { end: todayEnd } = getTodayDateRange();

    const tasks = await queryAllTaskLists(
      accessToken,
      client,
      `status ne 'completed' and (dueDateTime/dateTime le '${todayEnd.toISOString()}' or importance eq 'high')`,
      "id,title,status,importance,dueDateTime,body"
    );

    return tasks;
  } catch (error) {
    console.error("Error fetching important tasks:", error);
    return [];
  }
}
