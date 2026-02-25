export interface Attendee {
  emailAddress: {
    name: string;
    address: string;
  };
  attended?: boolean;
  totalAttendanceInSeconds?: number;
  role?: string;
}

export interface Meeting {
  id: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  organizer: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  participants?: {
    attendees: Attendee[];
  };
  attendanceReport?: {
    totalParticipantCount: number;
    attendees: Attendee[];
  };
  hasTranscript?: boolean;
  callRecordId?: string;
  sessionId?: string;
  joinWebUrl?: string;
  onlineMeetingId?: string;
}

export interface CallRecord {
  id: string;
  startDateTime: string;
  endDateTime: string;
  sessions: Array<{
    id: string;
    caller: unknown;
    callee: unknown;
  }>;
}

export interface MeetingSummary {
  subject: string;
  date: string;
  keyDecisions: string[];
  actionItems: Array<{
    owner: string;
    task: string;
    deadline?: string;
  }>;
  metrics: string[];
  nextSteps: string[];
  fullSummary: string;
}

export interface MeetingsApiResponse {
  meetings: Meeting[];
  total: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SummarizationMetrics {
  meetingSubject: string;
  meetingDate: string;
  meetingDurationMinutes: number | null;
  transcriptLength: number;
  transcriptWordCount: number;
  tokenUsage: TokenUsage;
  processingTimeMs: number;
  model: string;
  timestamp: string;
  requestedBy?: string;
  requestedByEmail?: string;
}

export interface SummarizationResult {
  summary: MeetingSummary;
  metrics: SummarizationMetrics;
}

// Microsoft To Do Task Types
export interface TodoTask {
  id: string;
  title: string;
  body?: {
    content: string;
    contentType: string;
  };
  status: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
  importance: "low" | "normal" | "high";
  dueDateTime?: {
    dateTime: string;
    timeZone: string;
  };
  createdDateTime: string;
  lastModifiedDateTime: string;
  completedDateTime?: {
    dateTime: string;
    timeZone: string;
  };
  linkedResources?: Array<{
    webUrl: string;
    applicationName: string;
    displayName: string;
  }>;
}

export interface TodoTaskList {
  id: string;
  displayName: string;
  isOwner: boolean;
  isShared: boolean;
  wellknownListName?: string;
}

export interface CreateTaskRequest {
  title: string;
  body?: string;
  dueDateTime?: string;
  importance?: "low" | "normal" | "high";
  listId?: string;
  meetingSubject?: string;
  meetingId?: string;
}

export interface ShareTaskRequest {
  taskId: string;
  listId: string;
  sharedWithEmail: string;
}

export interface TaskActionItem {
  owner: string;
  task: string;
  deadline?: string;
  selected?: boolean;
}

// ============ Planner Types ============

export type TaskDestination = "todo" | "planner";

export interface PlannerPlan {
  id: string;
  title: string;
  owner: string;
  createdDateTime: string;
}

export interface PlannerBucket {
  id: string;
  name: string;
  planId: string;
}

export interface PlannerTask {
  id: string;
  planId: string;
  bucketId?: string;
  title: string;
  percentComplete: number;
  priority: number;
  dueDateTime?: string;
  assignments?: Record<string, { orderHint: string }>;
}

export interface CreatePlannerTaskRequest {
  title: string;
  planId: string;
  bucketId?: string;
  body?: string;
  dueDateTime?: string;
  priority?: number;
  assigneeIds?: string[];
}
