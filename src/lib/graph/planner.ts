import type {
  PlannerPlan,
  PlannerBucket,
  PlannerTask,
  CreatePlannerTaskRequest,
} from "@/types/meeting";
import { getGraphClient } from "./client";

// Map To Do importance levels to Planner priority numbers
// Planner: 1=Urgent, 3=Important, 5=Medium, 9=Low
export function importanceToPlannerPriority(
  importance: "low" | "normal" | "high"
): number {
  switch (importance) {
    case "high":
      return 3;
    case "normal":
      return 5;
    case "low":
      return 9;
    default:
      return 5;
  }
}

export async function getPlannerPlans(
  accessToken: string
): Promise<PlannerPlan[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api("/me/planner/plans").get();
    return (response.value || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      owner: p.owner || "",
      createdDateTime: p.createdDateTime || "",
    }));
  } catch (error) {
    console.error("Error fetching planner plans:", error);
    throw new Error("Failed to fetch planner plans");
  }
}

export async function getPlannerBuckets(
  accessToken: string,
  planId: string
): Promise<PlannerBucket[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api(`/planner/plans/${planId}/buckets`)
      .get();
    return (response.value || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      planId: b.planId || planId,
    }));
  } catch (error) {
    console.error("Error fetching planner buckets:", error);
    throw new Error("Failed to fetch planner buckets");
  }
}

export async function createPlannerTask(
  accessToken: string,
  taskData: CreatePlannerTaskRequest
): Promise<PlannerTask> {
  const client = getGraphClient(accessToken);

  try {
    // Build task payload
    const payload: Record<string, any> = {
      planId: taskData.planId,
      title: taskData.title,
      priority: taskData.priority ?? 5,
    };

    if (taskData.bucketId) {
      payload.bucketId = taskData.bucketId;
    }

    if (taskData.dueDateTime) {
      payload.dueDateTime = taskData.dueDateTime;
    }

    if (taskData.assigneeIds && taskData.assigneeIds.length > 0) {
      payload.assignments = {};
      for (const id of taskData.assigneeIds) {
        payload.assignments[id] = {
          "@odata.type": "#microsoft.graph.plannerAssignment",
          orderHint: " !",
        };
      }
    }

    const task = await client.api("/planner/tasks").post(payload);

    // Planner API quirk: description (body) requires a separate PATCH to task details
    if (taskData.body) {
      try {
        // Get current details to retrieve the ETag
        const details = await client
          .api(`/planner/tasks/${task.id}/details`)
          .get();

        await client
          .api(`/planner/tasks/${task.id}/details`)
          .header("If-Match", details["@odata.etag"])
          .patch({
            description: taskData.body,
          });
      } catch (detailsError) {
        console.error("Error setting task description:", detailsError);
        // Non-fatal: the task was created, just without description
      }
    }

    return {
      id: task.id,
      planId: task.planId,
      bucketId: task.bucketId,
      title: task.title,
      percentComplete: task.percentComplete || 0,
      priority: task.priority || 5,
      dueDateTime: task.dueDateTime,
      assignments: task.assignments,
    };
  } catch (error) {
    console.error("Error creating planner task:", error);
    throw new Error("Failed to create planner task");
  }
}

export async function createMultiplePlannerTasks(
  accessToken: string,
  tasks: CreatePlannerTaskRequest[]
): Promise<{
  created: PlannerTask[];
  failed: { task: CreatePlannerTaskRequest; error: string }[];
}> {
  const created: PlannerTask[] = [];
  const failed: { task: CreatePlannerTaskRequest; error: string }[] = [];

  // Sequential to avoid throttling
  for (const taskData of tasks) {
    try {
      const task = await createPlannerTask(accessToken, taskData);
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
