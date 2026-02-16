import { z } from "zod";

// ============ Shared Helpers ============

/** Parse and validate a Zod schema against data, returning typed result or error response */
export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    return { success: false, error: message };
  }
  return { success: true, data: result.data };
}

// ============ Transcript / Attendance ============

export const onlineMeetingIdSchema = z.object({
  onlineMeetingId: z.string().min(1, "onlineMeetingId is required"),
});

// ============ Summarize ============

export const summarizeSchema = z.object({
  callRecordId: z.string().optional(),
  sessionId: z.string().optional(),
  onlineMeetingId: z.string().optional(),
  subject: z.string().max(500).optional(),
  startDateTime: z.string().optional(),
  endDateTime: z.string().optional(),
});

// ============ Prompts ============

export const createPromptSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(1000).nullable().optional(),
  systemPrompt: z.string().min(1, "System prompt is required").max(10000),
  userPromptTemplate: z.string().min(1, "User prompt template is required").max(10000),
  isDefault: z.boolean().optional().default(false),
});

export const updatePromptSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  systemPrompt: z.string().min(1).max(10000).optional(),
  userPromptTemplate: z.string().min(1).max(10000).optional(),
  isDefault: z.boolean().optional(),
});

// ============ Tasks ============

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  body: z.string().max(5000).optional(),
  dueDateTime: z.string().optional(),
  importance: z.enum(["low", "normal", "high"]).optional(),
  listId: z.string().optional(),
  meetingSubject: z.string().max(500).optional(),
  meetingId: z.string().optional(),
});

export const batchCreateTasksSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1).max(500),
    body: z.string().max(5000).optional(),
    dueDateTime: z.string().optional(),
    importance: z.enum(["low", "normal", "high"]).optional(),
    listId: z.string().optional(),
  })).min(1).max(50),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.enum(["notStarted", "inProgress", "completed"]).optional(),
  importance: z.enum(["low", "normal", "high"]).optional(),
});

export const shareTaskSchema = z.object({
  taskTitle: z.string().min(1, "Task title is required").max(500),
  taskBody: z.string().max(5000).optional().default(""),
  taskBodyHtml: z.string().max(10000).optional().default(""),
  recipientEmail: z.string().email("Invalid recipient email"),
  ccRecipients: z.array(z.string().email()).optional().default([]),
  meetingSubject: z.string().max(500).optional().default(""),
  emailSubject: z.string().max(500).optional().default(""),
  assignAsTask: z.boolean().optional().default(false),
  dueDateTime: z.string().optional(),
  importance: z.enum(["low", "normal", "high"]).optional().default("normal"),
});

// ============ Users ============

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().max(200).optional().default(""),
  role: z.enum(["admin", "user"]).optional().default("user"),
});

export const updateUserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().max(200).optional(),
  role: z.enum(["admin", "user"]).optional(),
  isActive: z.union([z.boolean(), z.number().transform(v => !!v)]).optional(),
});

// ============ Query Params ============

export const meetingsQuerySchema = z.object({
  id: z.string().optional(),
  daysBack: z.coerce.number().int().min(1).max(365).optional().default(30),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const peopleQuerySchema = z.object({
  q: z.string().min(2, "Query must be at least 2 characters").max(100),
});
