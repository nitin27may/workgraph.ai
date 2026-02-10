import { Client } from "@microsoft/microsoft-graph-client";
import type { Meeting, CallRecord } from "@/types/meeting";
import https from "https";

// Custom fetch that bypasses TLS verification for development
// (needed for corporate proxies with self-signed certs)
const customFetch = (url: string | URL | Request, options?: RequestInit) => {
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });
  return fetch(url, { ...options, agent } as RequestInit);
};

export function getGraphClient(accessToken: string) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
    fetchOptions: {
      agent: new https.Agent({ rejectUnauthorized: false }),
    },
  });
}

// Calendar event with online meeting info
interface CalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer: { emailAddress: { name: string; address: string } };
  attendees?: Array<{ emailAddress: { name: string; address: string } }>;
  isOnlineMeeting: boolean;
  onlineMeeting?: {
    joinUrl: string;
  };
  onlineMeetingProvider?: string;
}

export async function getUserMeetings(
  accessToken: string,
  options: { daysBack?: number; startDate?: string; endDate?: string } = {}
): Promise<Meeting[]> {
  const client = getGraphClient(accessToken);
  
  // Calculate date range
  let filterStartDate: Date;
  let filterEndDate: Date;
  
  if (options.startDate && options.endDate) {
    // Use custom date range
    filterStartDate = new Date(options.startDate);
    filterStartDate.setHours(0, 0, 0, 0);
    filterEndDate = new Date(options.endDate);
    filterEndDate.setHours(23, 59, 59, 999);
  } else {
    // Default: last N days including today
    const daysBack = options.daysBack || 30;
    filterStartDate = new Date();
    filterStartDate.setDate(filterStartDate.getDate() - daysBack);
    filterStartDate.setHours(0, 0, 0, 0);
    filterEndDate = new Date();
    filterEndDate.setHours(23, 59, 59, 999);
  }

  try {
    // Use calendar events API - filter by date range, then filter online meetings client-side
    const response = await client
      .api("/me/calendar/events")
      .filter(`start/dateTime ge '${filterStartDate.toISOString()}' and start/dateTime le '${filterEndDate.toISOString()}'`)
      .orderby("start/dateTime desc")
      .top(100)
      .select("id,subject,start,end,organizer,attendees,isOnlineMeeting,onlineMeeting,onlineMeetingProvider")
      .get();

    const events: CalendarEvent[] = response.value || [];
    
    // Filter for online meetings only (Teams, Skype, etc.)
    const onlineMeetings = events.filter(event => event.isOnlineMeeting);
    
    // Transform calendar events to our Meeting format
    const meetings: Meeting[] = onlineMeetings.map((event) => ({
      id: event.id,
      subject: event.subject || "Untitled Meeting",
      startDateTime: event.start.dateTime,
      endDateTime: event.end.dateTime,
      organizer: event.organizer,
      participants: event.attendees ? {
        attendees: event.attendees.map(a => ({ emailAddress: a.emailAddress }))
      } : undefined,
      hasTranscript: false, // Will be updated when we check recordings
      joinWebUrl: event.onlineMeeting?.joinUrl,
    }));

    // Sort by start date descending (latest first) to ensure correct order after filtering
    meetings.sort((a, b) => 
      new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime()
    );

    return meetings.slice(0, 50);
  } catch (error) {
    console.error("Error fetching meetings:", error);
    throw new Error("Failed to fetch meetings");
  }
}

// Get online meeting details by join URL
export async function getOnlineMeetingByJoinUrl(
  accessToken: string,
  joinWebUrl: string
): Promise<{ id: string; hasTranscript: boolean } | null> {
  const client = getGraphClient(accessToken);

  try {
    // Encode the join URL for the filter
    const encodedUrl = encodeURIComponent(joinWebUrl);
    const response = await client
      .api(`/me/onlineMeetings`)
      .filter(`JoinWebUrl eq '${joinWebUrl}'`)
      .get();

    if (!response.value || response.value.length === 0) {
      return null;
    }

    const meetingId = response.value[0].id;

    // Check if transcripts exist
    try {
      const transcripts = await client
        .api(`/me/onlineMeetings/${meetingId}/transcripts`)
        .get();

      return {
        id: meetingId,
        hasTranscript: transcripts.value && transcripts.value.length > 0,
      };
    } catch {
      return { id: meetingId, hasTranscript: false };
    }
  } catch (error) {
    console.error("Error getting online meeting by join URL:", error);
    return null;
  }
}

// Check transcripts for multiple meetings in parallel
export async function checkMeetingTranscripts(
  accessToken: string,
  meetings: Meeting[]
): Promise<Map<string, { onlineMeetingId?: string; hasTranscript: boolean }>> {
  const results = new Map<string, { onlineMeetingId?: string; hasTranscript: boolean }>();

  // Process meetings with joinWebUrl
  const meetingsWithJoinUrl = meetings.filter(m => m.joinWebUrl);
  
  // Check in parallel (batch of 5 to avoid rate limiting)
  const batchSize = 5;
  for (let i = 0; i < meetingsWithJoinUrl.length; i += batchSize) {
    const batch = meetingsWithJoinUrl.slice(i, i + batchSize);
    const promises = batch.map(async (meeting) => {
      if (!meeting.joinWebUrl) return;
      
      const result = await getOnlineMeetingByJoinUrl(accessToken, meeting.joinWebUrl);
      if (result) {
        results.set(meeting.id, {
          onlineMeetingId: result.id,
          hasTranscript: result.hasTranscript,
        });
      } else {
        results.set(meeting.id, { hasTranscript: false });
      }
    });
    
    await Promise.all(promises);
  }

  return results;
}

export async function getCallRecords(
  accessToken: string,
  userId: string
): Promise<CallRecord[]> {
  const client = getGraphClient(accessToken);

  try {
    // Try to get call records - this API may have limited access
    const response = await client
      .api("/communications/callRecords")
      .get();

    const records = response.value || [];
    
    // Filter by organizer client-side if needed
    return records.slice(0, 50);
  } catch (error) {
    console.error("Error fetching call records:", error);
    return [];
  }
}

export async function getMeetingTranscript(
  accessToken: string,
  callRecordId: string,
  sessionId: string
): Promise<string | null> {
  const client = getGraphClient(accessToken);

  try {
    // Get transcript list
    const transcripts = await client
      .api(
        `/communications/callRecords/${callRecordId}/sessions/${sessionId}/transcripts`
      )
      .get();

    if (!transcripts.value || transcripts.value.length === 0) {
      return null;
    }

    const transcriptId = transcripts.value[0].id;

    // Get transcript content
    const contentStream = await client
      .api(
        `/communications/callRecords/${callRecordId}/transcripts/${transcriptId}/content`
      )
      .get();

    return contentStream;
  } catch (error) {
    console.error("Error fetching transcript:", error);
    return null;
  }
}

// Get transcript using Online Meetings API (preferred method)
export async function getOnlineMeetingTranscript(
  accessToken: string,
  onlineMeetingId: string
): Promise<string | null> {
  const client = getGraphClient(accessToken);

  try {
    // Get list of transcripts for the meeting
    const transcriptsResponse = await client
      .api(`/me/onlineMeetings/${onlineMeetingId}/transcripts`)
      .get();

    if (!transcriptsResponse.value || transcriptsResponse.value.length === 0) {
      console.log("No transcripts found for meeting:", onlineMeetingId);
      return null;
    }

    const transcriptId = transcriptsResponse.value[0].id;
    console.log("Found transcript:", transcriptId);

    // Get transcript content - use direct fetch for binary content
    const transcriptUrl = `https://graph.microsoft.com/v1.0/me/onlineMeetings/${onlineMeetingId}/transcripts/${transcriptId}/content?$format=text/vtt`;
    
    const response = await customFetch(transcriptUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch transcript content:", response.status, response.statusText);
      const errorText = await response.text();
      console.error("Error details:", errorText);
      return null;
    }

    const content = await response.text();
    console.log("Transcript content length:", content.length);
    
    if (!content || content.length === 0) {
      console.log("Transcript content is empty");
      return null;
    }

    return content;
  } catch (error) {
    console.error("Error fetching online meeting transcript:", error);
    return null;
  }
}

// Get meeting attendance report
export async function getMeetingAttendanceReport(
  accessToken: string,
  onlineMeetingId: string
): Promise<{
  totalParticipantCount: number;
  attendees: Array<{
    emailAddress: { name: string; address: string };
    totalAttendanceInSeconds: number;
    role: string;
    attended: boolean;
  }>;
} | null> {
  const client = getGraphClient(accessToken);

  try {
    // Get attendance reports for the meeting
    const reportsResponse = await client
      .api(`/me/onlineMeetings/${onlineMeetingId}/attendanceReports`)
      .get();

    if (!reportsResponse.value || reportsResponse.value.length === 0) {
      console.log("No attendance reports found for meeting:", onlineMeetingId);
      return null;
    }

    // Get the most recent attendance report
    const reportId = reportsResponse.value[0].id;
    
    // Get attendance records from the report
    const recordsResponse = await client
      .api(`/me/onlineMeetings/${onlineMeetingId}/attendanceReports/${reportId}/attendanceRecords`)
      .get();

    if (!recordsResponse.value) {
      return null;
    }

    const attendees = recordsResponse.value.map((record: {
      identity?: { displayName?: string };
      emailAddress?: string;
      totalAttendanceInSeconds?: number;
      role?: string;
    }) => ({
      emailAddress: {
        name: record.identity?.displayName || "Unknown",
        address: record.emailAddress || "",
      },
      totalAttendanceInSeconds: record.totalAttendanceInSeconds || 0,
      role: record.role || "Attendee",
      attended: true,
    }));

    return {
      totalParticipantCount: attendees.length,
      attendees,
    };
  } catch (error) {
    console.error("Error fetching attendance report:", error);
    return null;
  }
}

export async function getCurrentUser(accessToken: string) {
  const client = getGraphClient(accessToken);
  return await client.api("/me").get();
}

// ==========================================
// Microsoft To Do Tasks API Functions
// ==========================================

import type { TodoTask, TodoTaskList, CreateTaskRequest } from "@/types/meeting";

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
      .top(50)
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
    const results: { list: TodoTaskList; tasks: TodoTask[] }[] = [];

    for (const list of lists) {
      try {
        const response = await client
          .api(`/me/todo/lists/${list.id}/tasks`)
          .orderby("createdDateTime desc")
          .top(50)
          .get();

        results.push({
          list,
          tasks: response.value || [],
        });
      } catch (err) {
        console.error(`Error fetching tasks for list ${list.displayName}:`, err);
        results.push({ list, tasks: [] });
      }
    }

    return results;
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

// Search for people in the organization (contacts, colleagues, etc.)
export interface PersonSearchResult {
  id: string;
  displayName: string;
  emailAddress: string;
  jobTitle?: string;
  department?: string;
  userPrincipalName?: string;
}

export async function searchPeople(
  accessToken: string,
  query: string,
  top: number = 10
): Promise<PersonSearchResult[]> {
  const client = getGraphClient(accessToken);

  try {
    // Use the /me/people endpoint which returns relevant people based on communication patterns
    // This includes contacts, colleagues, and people you've interacted with
    // Note: The property is 'scoredEmailAddresses' not 'emailAddresses'
    const response = await client
      .api("/me/people")
      .search(query)
      .top(top)
      .select("id,displayName,scoredEmailAddresses,jobTitle,department,userPrincipalName")
      .get();

    const people: PersonSearchResult[] = (response.value || [])
      .filter((person: { scoredEmailAddresses?: Array<{ address: string }> }) => 
        person.scoredEmailAddresses && person.scoredEmailAddresses.length > 0
      )
      .map((person: { 
        id: string; 
        displayName: string; 
        scoredEmailAddresses: Array<{ address: string }>; 
        jobTitle?: string; 
        department?: string;
        userPrincipalName?: string;
      }) => ({
        id: person.id,
        displayName: person.displayName,
        emailAddress: person.scoredEmailAddresses[0]?.address,
        jobTitle: person.jobTitle,
        department: person.department,
        userPrincipalName: person.userPrincipalName,
      }));

    return people;
  } catch (error) {
    console.error("Error searching people:", error);
    // Fallback to users endpoint if people API fails (requires User.Read.All or User.ReadBasic.All)
    try {
      const usersResponse = await client
        .api("/users")
        .filter(`startswith(displayName,'${query}') or startswith(mail,'${query}')`)
        .top(top)
        .select("id,displayName,mail,jobTitle,department,userPrincipalName")
        .get();

      return (usersResponse.value || [])
        .filter((user: { mail?: string }) => user.mail)
        .map((user: { 
          id: string; 
          displayName: string; 
          mail: string; 
          jobTitle?: string; 
          department?: string;
          userPrincipalName?: string;
        }) => ({
          id: user.id,
          displayName: user.displayName,
          emailAddress: user.mail,
          jobTitle: user.jobTitle,
          department: user.department,
          userPrincipalName: user.userPrincipalName,
        }));
    } catch (fallbackError) {
      console.error("Fallback user search also failed:", fallbackError);
      return [];
    }
  }
}

// Share a task by sending it to another user's email
// Note: Microsoft To Do doesn't support direct task sharing via API
// Instead, we'll create a task in the target user's list using delegated permissions
// or use email/Teams message to share task details
export async function shareTaskViaEmail(
  accessToken: string,
  taskTitle: string,
  taskBody: string,
  recipientEmail: string,
  meetingSubject?: string,
  isHtml?: boolean,
  ccRecipients?: string[]
): Promise<void> {
  const client = getGraphClient(accessToken);

  try {
    // If the body is already HTML, use it directly; otherwise wrap in simple HTML
    const emailContent = isHtml 
      ? taskBody 
      : `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #0078d4; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Task Shared with You</h2>
  <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
    <p style="margin: 0 0 10px 0;"><strong style="color: #333;">Task:</strong></p>
    <p style="margin: 0; font-size: 16px; color: #1a1a1a;">${taskTitle}</p>
  </div>
  ${taskBody ? `
  <div style="margin: 15px 0;">
    <p style="margin: 0 0 10px 0;"><strong style="color: #333;">Details:</strong></p>
    <p style="line-height: 1.6; white-space: pre-wrap;">${taskBody}</p>
  </div>
  ` : ''}
  ${meetingSubject ? `
  <div style="margin: 15px 0; padding: 10px; background-color: #e8f4fd; border-left: 3px solid #0078d4; border-radius: 4px;">
    <p style="margin: 0;"><strong>From Meeting:</strong> ${meetingSubject}</p>
  </div>
  ` : ''}
  <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;" />
  <p style="color: #888; font-size: 12px; text-align: center;">
    <em>This task was shared from the Meeting Summarizer app.</em>
  </p>
</div>
      `;

    // Build CC recipients array if provided
    const ccRecipientsArray = ccRecipients?.map(email => ({
      emailAddress: { address: email }
    })) || [];

    await client
      .api("/me/sendMail")
      .post({
        message: {
          subject: taskTitle,
          body: {
            contentType: "HTML",
            content: emailContent,
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail,
              },
            },
          ],
          ...(ccRecipientsArray.length > 0 && { ccRecipients: ccRecipientsArray }),
        },
        saveToSentItems: true,
      });
  } catch (error) {
    console.error("Error sharing task via email:", error);
    throw new Error("Failed to share task");
  }
}

// Create a task in another user's task list (requires appropriate permissions)
export async function assignTaskToUser(
  accessToken: string,
  targetUserEmail: string,
  taskData: CreateTaskRequest
): Promise<{ success: boolean; method: string; message: string }> {
  // Microsoft To Do doesn't support cross-user task creation directly
  // We'll share the task via email as a fallback
  try {
    await shareTaskViaEmail(
      accessToken,
      taskData.title,
      taskData.body || "",
      targetUserEmail,
      taskData.meetingSubject
    );
    
    return {
      success: true,
      method: "email",
      message: `Task shared with ${targetUserEmail} via email`,
    };
  } catch (error) {
    console.error("Error assigning task to user:", error);
    return {
      success: false,
      method: "email",
      message: error instanceof Error ? error.message : "Failed to share task",
    };
  }
}

// ==========================================
// Email (Outlook) API Functions
// ==========================================

export interface EmailMessage {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients?: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  bodyPreview: string;
  body?: { content: string; contentType: string };
  hasAttachments: boolean;
  importance: string;
  isRead: boolean;
}

export interface EmailFolder {
  id: string;
  displayName: string;
  parentFolderId: string;
  childFolderCount: number;
  unreadItemCount: number;
  totalItemCount: number;
}

// List messages
export async function getMessages(
  accessToken: string,
  options?: {
    top?: number;
    skip?: number;
    filter?: string;
    orderBy?: string;
    select?: string[];
  }
): Promise<EmailMessage[]> {
  const client = getGraphClient(accessToken);

  try {
    let query = client.api("/me/messages");

    if (options?.top) query = query.top(options.top);
    if (options?.skip) query = query.skip(options.skip);
    if (options?.filter) query = query.filter(options.filter);
    if (options?.orderBy) query = query.orderby(options.orderBy);
    if (options?.select) query = query.select(options.select.join(","));

    const response = await query.get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching messages:", error);
    throw new Error("Failed to fetch messages");
  }
}

// Get specific message
export async function getMessage(
  accessToken: string,
  messageId: string,
  includeBody: boolean = false
): Promise<EmailMessage | null> {
  const client = getGraphClient(accessToken);

  try {
    let query = client.api(`/me/messages/${messageId}`);
    
    if (includeBody) {
      query = query.select("*");
    }

    return await query.get();
  } catch (error) {
    console.error("Error fetching message:", error);
    return null;
  }
}

// Send email
export async function sendEmail(
  accessToken: string,
  options: {
    subject: string;
    body: string;
    toRecipients: string[];
    ccRecipients?: string[];
    bccRecipients?: string[];
    contentType?: "Text" | "HTML";
    saveToSentItems?: boolean;
  }
): Promise<void> {
  const client = getGraphClient(accessToken);

  try {
    await client.api("/me/sendMail").post({
      message: {
        subject: options.subject,
        body: {
          contentType: options.contentType || "HTML",
          content: options.body,
        },
        toRecipients: options.toRecipients.map(email => ({
          emailAddress: { address: email },
        })),
        ccRecipients: options.ccRecipients?.map(email => ({
          emailAddress: { address: email },
        })),
        bccRecipients: options.bccRecipients?.map(email => ({
          emailAddress: { address: email },
        })),
      },
      saveToSentItems: options.saveToSentItems ?? true,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email");
  }
}

// Create draft
export async function createDraft(
  accessToken: string,
  options: {
    subject: string;
    body: string;
    toRecipients?: string[];
    contentType?: "Text" | "HTML";
  }
): Promise<EmailMessage> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api("/me/messages").post({
      subject: options.subject,
      body: {
        contentType: options.contentType || "HTML",
        content: options.body,
      },
      toRecipients: options.toRecipients?.map(email => ({
        emailAddress: { address: email },
      })),
    });
  } catch (error) {
    console.error("Error creating draft:", error);
    throw new Error("Failed to create draft");
  }
}

// Search messages
export async function searchMessages(
  accessToken: string,
  searchQuery: string,
  top: number = 25
): Promise<EmailMessage[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api("/me/messages")
      .search(`"${searchQuery}"`)
      .top(top)
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error searching messages:", error);
    throw new Error("Failed to search messages");
  }
}

// List folders
export async function getMailFolders(accessToken: string): Promise<EmailFolder[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api("/me/mailFolders").get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching mail folders:", error);
    throw new Error("Failed to fetch mail folders");
  }
}

// Move message to folder
export async function moveMessage(
  accessToken: string,
  messageId: string,
  destinationFolderId: string
): Promise<EmailMessage> {
  const client = getGraphClient(accessToken);

  try {
    return await client
      .api(`/me/messages/${messageId}/move`)
      .post({ destinationId: destinationFolderId });
  } catch (error) {
    console.error("Error moving message:", error);
    throw new Error("Failed to move message");
  }
}

// ==========================================
// Teams Chats API Functions
// ==========================================

export interface TeamsChat {
  id: string;
  topic: string | null;
  createdDateTime: string;
  lastUpdatedDateTime: string;
  chatType: "oneOnOne" | "group" | "meeting";
  webUrl?: string;
}

export interface ChatMessage {
  id: string;
  messageType: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  body: { content: string; contentType: string };
  from: {
    user?: { displayName: string; id: string };
  };
  mentions?: Array<{ mentioned: { user: { displayName: string; id: string } } }>;
}

export interface ChatMember {
  id: string;
  displayName: string;
  userId: string;
  email?: string;
  roles: string[];
}

// List user's chats
export async function getChats(
  accessToken: string,
  top: number = 50
): Promise<TeamsChat[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api("/me/chats")
      .top(top)
      .orderby("lastUpdatedDateTime desc")
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching chats:", error);
    throw new Error("Failed to fetch chats");
  }
}

// Get specific chat
export async function getChat(
  accessToken: string,
  chatId: string
): Promise<TeamsChat | null> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api(`/me/chats/${chatId}`).get();
  } catch (error) {
    console.error("Error fetching chat:", error);
    return null;
  }
}

// List messages in chat
export async function getChatMessages(
  accessToken: string,
  chatId: string,
  top: number = 50
): Promise<ChatMessage[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api(`/me/chats/${chatId}/messages`)
      .top(top)
      .orderby("createdDateTime desc")
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    throw new Error("Failed to fetch chat messages");
  }
}

// Send message to chat
export async function sendChatMessage(
  accessToken: string,
  chatId: string,
  content: string,
  contentType: "text" | "html" = "text"
): Promise<ChatMessage> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api(`/chats/${chatId}/messages`).post({
      body: {
        contentType,
        content,
      },
    });
  } catch (error) {
    console.error("Error sending chat message:", error);
    throw new Error("Failed to send chat message");
  }
}

// Get chat members
export async function getChatMembers(
  accessToken: string,
  chatId: string
): Promise<ChatMember[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api(`/chats/${chatId}/members`).get();

    return (response.value || []).map((member: any) => ({
      id: member.id,
      displayName: member.displayName,
      userId: member.userId,
      email: member.email,
      roles: member.roles || [],
    }));
  } catch (error) {
    console.error("Error fetching chat members:", error);
    throw new Error("Failed to fetch chat members");
  }
}

// ==========================================
// Calendar API Functions (Enhanced)
// ==========================================

export interface CalendarEventDetailed {
  id: string;
  subject: string;
  body: { content: string; contentType: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  organizer: { emailAddress: { name: string; address: string } };
  attendees?: Array<{
    emailAddress: { name: string; address: string };
    status: { response: string; time: string };
    type: string;
  }>;
  isOnlineMeeting: boolean;
  onlineMeeting?: { joinUrl: string };
  categories?: string[];
  importance: string;
  sensitivity: string;
  showAs: string;
  responseStatus: { response: string; time: string };
}

export interface Calendar {
  id: string;
  name: string;
  color: string;
  canEdit: boolean;
  canShare: boolean;
  canViewPrivateItems: boolean;
  owner: { name: string; address: string };
}

// Get calendar events with enhanced details
export async function getCalendarEvents(
  accessToken: string,
  options?: {
    startDateTime?: string;
    endDateTime?: string;
    top?: number;
    filter?: string;
    select?: string[];
  }
): Promise<CalendarEventDetailed[]> {
  const client = getGraphClient(accessToken);

  try {
    let query = client.api("/me/events");

    if (options?.filter) {
      query = query.filter(options.filter);
    } else if (options?.startDateTime && options?.endDateTime) {
      query = query.filter(
        `start/dateTime ge '${options.startDateTime}' and end/dateTime le '${options.endDateTime}'`
      );
    }

    if (options?.top) query = query.top(options.top);
    if (options?.select) query = query.select(options.select.join(","));

    query = query.orderby("start/dateTime asc");

    const response = await query.get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    throw new Error("Failed to fetch calendar events");
  }
}

// Get specific event
export async function getCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<CalendarEventDetailed | null> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api(`/me/events/${eventId}`).get();
  } catch (error) {
    console.error("Error fetching calendar event:", error);
    return null;
  }
}

// Create calendar event
export async function createCalendarEvent(
  accessToken: string,
  event: {
    subject: string;
    body?: { content: string; contentType?: "text" | "html" };
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    location?: { displayName: string };
    attendees?: Array<{ emailAddress: { address: string; name?: string }; type?: string }>;
    isOnlineMeeting?: boolean;
  }
): Promise<CalendarEventDetailed> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api("/me/events").post(event);
  } catch (error) {
    console.error("Error creating calendar event:", error);
    throw new Error("Failed to create calendar event");
  }
}

// Update calendar event
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  updates: Partial<CalendarEventDetailed>
): Promise<CalendarEventDetailed> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api(`/me/events/${eventId}`).patch(updates);
  } catch (error) {
    console.error("Error updating calendar event:", error);
    throw new Error("Failed to update calendar event");
  }
}

// Delete calendar event
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const client = getGraphClient(accessToken);

  try {
    await client.api(`/me/events/${eventId}`).delete();
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    throw new Error("Failed to delete calendar event");
  }
}

// Get calendar view (events in date range)
export async function getCalendarView(
  accessToken: string,
  startDateTime: string,
  endDateTime: string,
  top: number = 100
): Promise<CalendarEventDetailed[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api("/me/calendarView")
      .query({
        startDateTime,
        endDateTime,
      })
      .top(top)
      .orderby("start/dateTime")
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching calendar view:", error);
    throw new Error("Failed to fetch calendar view");
  }
}

// List calendars
export async function getCalendars(accessToken: string): Promise<Calendar[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api("/me/calendars").get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching calendars:", error);
    throw new Error("Failed to fetch calendars");
  }
}

// ==========================================
// OneDrive Files API Functions
// ==========================================

export interface DriveItem {
  id: string;
  name: string;
  size: number;
  createdDateTime: string;
  lastModifiedDateTime: string;
  webUrl: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { id: string; path: string };
  createdBy?: { user: { displayName: string } };
  lastModifiedBy?: { user: { displayName: string } };
}

export interface Drive {
  id: string;
  driveType: string;
  name?: string;
  owner: { user: { displayName: string } };
  quota?: {
    total: number;
    used: number;
    remaining: number;
    deleted: number;
    state: string;
  };
}

// Get root drive
export async function getDrive(accessToken: string): Promise<Drive> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api("/me/drive").get();
  } catch (error) {
    console.error("Error fetching drive:", error);
    throw new Error("Failed to fetch drive");
  }
}

// List files in root
export async function getDriveRootChildren(
  accessToken: string,
  top: number = 100
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api("/me/drive/root/children")
      .top(top)
      .orderby("lastModifiedDateTime desc")
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching root children:", error);
    throw new Error("Failed to fetch files");
  }
}

// Get file/folder by path
export async function getDriveItemByPath(
  accessToken: string,
  path: string
): Promise<DriveItem | null> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api(`/me/drive/root:/${path}`).get();
  } catch (error) {
    console.error("Error fetching drive item by path:", error);
    return null;
  }
}

// List children of a folder by path
export async function getDriveItemChildrenByPath(
  accessToken: string,
  path: string,
  top: number = 100
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api(`/me/drive/root:/${path}:/children`)
      .top(top)
      .orderby("lastModifiedDateTime desc")
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching folder children:", error);
    throw new Error("Failed to fetch folder contents");
  }
}

// Get file by ID
export async function getDriveItem(
  accessToken: string,
  itemId: string
): Promise<DriveItem | null> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api(`/me/drive/items/${itemId}`).get();
  } catch (error) {
    console.error("Error fetching drive item:", error);
    return null;
  }
}

// Download file content (returns URL for download)
export async function getDriveItemDownloadUrl(
  accessToken: string,
  itemId: string
): Promise<string | null> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api(`/me/drive/items/${itemId}`).get();
    return response["@microsoft.graph.downloadUrl"] || null;
  } catch (error) {
    console.error("Error fetching download URL:", error);
    return null;
  }
}

// Search files
export async function searchDriveItems(
  accessToken: string,
  query: string,
  top: number = 50
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api(`/me/drive/root/search(q='${query}')`)
      .top(top)
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error searching drive items:", error);
    throw new Error("Failed to search files");
  }
}

// Get recent files
export async function getRecentFiles(
  accessToken: string,
  top: number = 25
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api("/me/drive/recent").top(top).get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching recent files:", error);
    throw new Error("Failed to fetch recent files");
  }
}

// Get shared files
export async function getSharedFiles(
  accessToken: string,
  top: number = 50
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api("/me/drive/sharedWithMe").top(top).get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching shared files:", error);
    throw new Error("Failed to fetch shared files");
  }
}

// Create folder
export async function createFolder(
  accessToken: string,
  folderName: string,
  parentPath?: string
): Promise<DriveItem> {
  const client = getGraphClient(accessToken);

  try {
    const endpoint = parentPath
      ? `/me/drive/root:/${parentPath}:/children`
      : "/me/drive/root/children";

    return await client.api(endpoint).post({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    });
  } catch (error) {
    console.error("Error creating folder:", error);
    throw new Error("Failed to create folder");
  }
}

// Delete file or folder
export async function deleteDriveItem(
  accessToken: string,
  itemId: string
): Promise<void> {
  const client = getGraphClient(accessToken);

  try {
    await client.api(`/me/drive/items/${itemId}`).delete();
  } catch (error) {
    console.error("Error deleting drive item:", error);
    throw new Error("Failed to delete item");
  }
}

// ==========================================
// Productivity Features: Daily Digest & Follow-ups
// ==========================================

export interface FlaggedEmail extends EmailMessage {
  flag?: {
    flagStatus: "notFlagged" | "complete" | "flagged";
    dueDateTime?: { dateTime: string; timeZone: string };
    startDateTime?: { dateTime: string; timeZone: string };
    completedDateTime?: { dateTime: string; timeZone: string };
  };
}

export interface ActionItem {
  id: string;
  text: string;
  meetingId: string;
  meetingSubject: string;
  meetingDate: string;
  extractedAt: string;
}

export interface DailyDigest {
  date: string;
  meetings: Meeting[];
  followUpEmails: FlaggedEmail[];
  tasks: TodoTask[];
  importantEmails: EmailMessage[];
  actionItems: ActionItem[];
}

export interface MeetingPrep {
  meeting: Meeting;
  context: {
    relatedEmails: (EmailMessage & { fullBody?: string; relevanceScore?: number; matchReason?: string })[]; // Emails matching meeting subject/keywords with full bodies
    relatedMeetings: (Meeting & { transcript?: string; summary?: any; relevanceScore?: number })[]; // Past meetings with similar topics, their transcripts, and summaries
    recentChats: TeamsChat[];       // Recent chats with attendees
    attendeeInfo: PersonSearchResult[];
  };
  relevance: {
    emailCount: number;
    meetingCount: number;
    topKeywords: string[];
    confidence: 'high' | 'medium' | 'low';  // Based on amount of related content found
  };
}

// Get flagged emails (for follow-ups)
export async function getFlaggedEmails(
  accessToken: string,
  options?: {
    includeCompleted?: boolean;
    dueDate?: "today" | "overdue" | "upcoming" | "all";
  }
): Promise<FlaggedEmail[]> {
  const client = getGraphClient(accessToken);

  try {
    // Simplified: get recent emails and filter client-side (more reliable)
    const response = await client
      .api("/me/messages")
      .select("id,subject,from,toRecipients,receivedDateTime,bodyPreview,importance,isRead,hasAttachments,flag")
      .orderby("receivedDateTime desc")
      .top(100)
      .get();

    const allMessages: FlaggedEmail[] = response.value || [];
    
    // Filter client-side for flagged emails
    const flaggedMessages = allMessages.filter(msg => 
      msg.flag?.flagStatus === 'flagged' || (options?.includeCompleted && msg.flag?.flagStatus === 'complete')
    );

    // Further filter by date if needed
    if (options?.dueDate && options.dueDate !== "all" && flaggedMessages.length > 0) {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      return flaggedMessages.filter(email => {
        if (!email.flag?.dueDateTime) return false;
        
        const dueDate = new Date(email.flag.dueDateTime.dateTime);
        
        if (options.dueDate === "today") {
          return dueDate >= todayStart && dueDate <= todayEnd;
        } else if (options.dueDate === "overdue") {
          return dueDate < todayStart;
        } else if (options.dueDate === "upcoming") {
          return dueDate > todayEnd;
        }
        
        return false;
      }).slice(0, 50);
    }

    return flaggedMessages.slice(0, 50);
  } catch (error) {
    console.error("Error fetching flagged emails:", error);
    return []; // Don't throw, return empty array
  }
}

// Get unread important emails (Focused Inbox)
export async function getUnreadImportantEmails(
  accessToken: string,
  top: number = 20
): Promise<EmailMessage[]> {
  const client = getGraphClient(accessToken);

  try {
    // Try focused inbox first, fallback to all unread
    try {
      const response = await client
        .api("/me/messages")
        .filter("isRead eq false and inferenceClassification eq 'focused'")
        .select("id,subject,from,toRecipients,receivedDateTime,bodyPreview,importance,isRead,hasAttachments")
        .orderby("receivedDateTime desc")
        .top(top)
        .get();
      return response.value || [];
    } catch (focusedError) {
      // Fallback: just get unread emails if focused inbox isn't available
      console.log("Focused inbox not available, falling back to unread emails");
      const response = await client
        .api("/me/messages")
        .filter("isRead eq false")
        .select("id,subject,from,toRecipients,receivedDateTime,bodyPreview,importance,isRead,hasAttachments")
        .orderby("receivedDateTime desc")
        .top(top)
        .get();
      return response.value || [];
    }
  } catch (error) {
    console.error("Error fetching unread emails:", error);
    return []; // Don't throw, return empty array
  }
}

// Get tasks due today
export async function getTasksDueToday(
  accessToken: string
): Promise<{ list: TodoTaskList; tasks: TodoTask[] }[]> {
  const client = getGraphClient(accessToken);

  try {
    const lists = await getTaskLists(accessToken);
    const results: { list: TodoTaskList; tasks: TodoTask[] }[] = [];

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    for (const list of lists) {
      try {
        const response = await client
          .api(`/me/todo/lists/${list.id}/tasks`)
          .filter(
            `status ne 'completed' and dueDateTime/dateTime ge '${todayStart.toISOString()}' and dueDateTime/dateTime le '${todayEnd.toISOString()}'`
          )
          .orderby("dueDateTime/dateTime asc")
          .get();

        const tasks = response.value || [];
        if (tasks.length > 0) {
          results.push({ list, tasks });
        }
      } catch (err) {
        console.error(`Error fetching tasks due today for list ${list.displayName}:`, err);
      }
    }

    return results;
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
    const results: { list: TodoTaskList; tasks: TodoTask[] }[] = [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const list of lists) {
      try {
        const response = await client
          .api(`/me/todo/lists/${list.id}/tasks`)
          .filter(`status ne 'completed' and dueDateTime/dateTime lt '${now.toISOString()}'`)
          .orderby("dueDateTime/dateTime asc")
          .get();

        const tasks = response.value || [];
        if (tasks.length > 0) {
          results.push({ list, tasks });
        }
      } catch (err) {
        console.error(`Error fetching overdue tasks for list ${list.displayName}:`, err);
      }
    }

    return results;
  } catch (error) {
    console.error("Error fetching overdue tasks:", error);
    throw new Error("Failed to fetch overdue tasks");
  }
}

// Get upcoming meetings (today and future)
export async function getUpcomingMeetings(
  accessToken: string,
  daysAhead: number = 1
): Promise<Meeting[]> {
  try {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return await getUserMeetings(accessToken, {
      startDate: now.toISOString(),
      endDate: futureDate.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching upcoming meetings:", error);
    throw new Error("Failed to fetch upcoming meetings");
  }
}

// Get recent emails with specific people
export async function getRecentEmailsWithPeople(
  accessToken: string,
  emailAddresses: string[],
  daysBack: number = 7
): Promise<EmailMessage[]> {
  const client = getGraphClient(accessToken);

  try {
    if (emailAddresses.length === 0) {
      return [];
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Build filter for each email address
    const filters = emailAddresses.map(
      (email) => `(from/emailAddress/address eq '${email}' or recipients/any(r:r/emailAddress/address eq '${email}'))`
    );
    const filterString = filters.join(" or ");

    const response = await client
      .api("/me/messages")
      .filter(`(${filterString}) and receivedDateTime ge ${startDate.toISOString()}`)
      .select("id,subject,from,toRecipients,receivedDateTime,bodyPreview,importance,isRead")
      .orderby("receivedDateTime desc")
      .top(20)
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching recent emails with people:", error);
    // Fallback: search approach if filter fails
    try {
      const searchResults: EmailMessage[] = [];
      for (const email of emailAddresses.slice(0, 3)) {
        // Limit to 3 people
        const results = await searchMessages(accessToken, email, 5);
        searchResults.push(...results);
      }
      return searchResults;
    } catch {
      return [];
    }
  }
}

// Get recent chats with specific people
export async function getRecentChatsWithPeople(
  accessToken: string,
  emailAddresses: string[]
): Promise<TeamsChat[]> {
  const client = getGraphClient(accessToken);

  try {
    if (emailAddresses.length === 0) {
      return [];
    }

    // Get all recent chats
    const allChats = await getChats(accessToken, 50);

    // Filter chats that include the specified people
    // Note: This is a simple implementation - you might want to check chat members
    const relevantChats: TeamsChat[] = [];

    for (const chat of allChats) {
      try {
        const members = await getChatMembers(accessToken, chat.id);
        const memberEmails = members.map((m) => m.email?.toLowerCase()).filter(Boolean);

        // Check if any of the target email addresses are in this chat
        const hasRelevantMember = emailAddresses.some((email) =>
          memberEmails.includes(email.toLowerCase())
        );

        if (hasRelevantMember) {
          relevantChats.push(chat);
        }

        if (relevantChats.length >= 10) break; // Limit to 10 chats
      } catch (err) {
        // Skip chats we can't access
        continue;
      }
    }

    return relevantChats;
  } catch (error) {
    console.error("Error fetching recent chats with people:", error);
    return [];
  }
}

// Get tasks due today or high priority
export async function getTodaysImportantTasks(
  accessToken: string
): Promise<TodoTask[]> {
  const client = getGraphClient(accessToken);

  try {
    const lists = await getTaskLists(accessToken);
    const allTasks: TodoTask[] = [];

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    for (const list of lists) {
      try {
        const response = await client
          .api(`/me/todo/lists/${list.id}/tasks`)
          .filter(
            `status ne 'completed' and (dueDateTime/dateTime le '${todayEnd.toISOString()}' or importance eq 'high')`
          )
          .select("id,title,status,importance,dueDateTime,body")
          .orderby("importance desc,dueDateTime/dateTime asc")
          .get();

        const tasks = response.value || [];
        allTasks.push(
          ...tasks.map((t: TodoTask) => ({
            ...t,
            listName: list.displayName,
            listId: list.id,
          }))
        );
      } catch (err) {
        console.error(`Error fetching tasks for list ${list.displayName}:`, err);
      }
    }

    return allTasks;
  } catch (error) {
    console.error("Error fetching important tasks:", error);
    return [];
  }
}

// Get yesterday's meetings
export async function getYesterdayMeetings(
  accessToken: string
): Promise<Meeting[]> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    return await getUserMeetings(accessToken, {
      startDate: yesterday.toISOString(),
      endDate: yesterdayEnd.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching yesterday's meetings:", error);
    return [];
  }
}

// Extract action items from meetings (placeholder - can be enhanced with AI)
export async function extractActionItems(
  meetings: Meeting[]
): Promise<ActionItem[]> {
  // For now, return empty array
  // This can be enhanced with AI to parse meeting transcripts/summaries
  // and extract actual action items
  return [];
  
  // Future implementation could:
  // 1. Get meeting transcripts
  // 2. Use OpenAI to extract action items
  // 3. Parse patterns like "TODO:", "ACTION:", "@person needs to..."
  // const actionItems: ActionItem[] = [];
  // for (const meeting of meetings) {
  //   const transcript = await getMeetingTranscript(...);
  //   const extracted = await extractWithAI(transcript);
  //   actionItems.push(...extracted);
  // }
  // return actionItems;
}

// Get comprehensive daily digest with parallel fetching
export async function getDailyDigest(accessToken: string): Promise<DailyDigest> {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Parallel fetching for performance - use allSettled to not fail if one part fails
    const results = await Promise.allSettled([
      // 1. Upcoming meetings (next 72 hours)
      getUpcomingMeetings(accessToken, 3),
      
      // 2. Follow-up emails (flagged, due today or overdue)
      getFlaggedEmails(accessToken, { dueDate: "all" }),
      
      // 3. Tasks due today or high priority
      getTodaysImportantTasks(accessToken),
      
      // 4. Unread important emails (focused inbox)
      getUnreadImportantEmails(accessToken, 5),
      
      // 5. Yesterday's meetings for action items
      getYesterdayMeetings(accessToken),
    ]);

    const upcomingMeetings = results[0].status === 'fulfilled' ? results[0].value : [];
    const flaggedEmails = results[1].status === 'fulfilled' ? results[1].value : [];
    const tasks = results[2].status === 'fulfilled' ? results[2].value : [];
    const unreadImportant = results[3].status === 'fulfilled' ? results[3].value : [];
    const yesterdayMeetings = results[4].status === 'fulfilled' ? results[4].value : [];

    // Filter to only future meetings
    const futureMeetings = (upcomingMeetings as Meeting[]).filter(
      meeting => new Date(meeting.startDateTime) > now
    );

    // Extract action items from yesterday's meetings
    const actionItems = await extractActionItems(yesterdayMeetings);

    return {
      date: todayStart.toISOString(),
      meetings: futureMeetings,
      followUpEmails: flaggedEmails as FlaggedEmail[],
      tasks: tasks,
      importantEmails: unreadImportant as EmailMessage[],
      actionItems: actionItems,
    };
  } catch (error) {
    console.error("Error getting daily digest:", error);
    throw new Error("Failed to get daily digest");
  }
}

// Get meeting prep context
export async function getMeetingPrepContext(
  accessToken: string,
  meetingId: string
): Promise<MeetingPrep | null> {
  try {
    // Get the specific meeting
    const client = getGraphClient(accessToken);
    let meeting;
    
    try {
      // Try direct fetch first
      meeting = await client.api(`/me/calendar/events/${meetingId}`).get();
    } catch (error: any) {
      console.error("Direct meeting fetch failed in prep context:", {
        meetingId,
        statusCode: error?.statusCode,
        message: error?.message,
      });
      
      // If 403/404, search in user's calendar
      if (error?.statusCode === 403 || error?.statusCode === 404) {
        console.log("Searching for meeting in user's calendar...");
        
        const now = new Date();
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + 90);
        
        const eventsResponse = await client
          .api("/me/calendar/events")
          .filter(
            `start/dateTime ge '${now.toISOString()}' and start/dateTime le '${futureDate.toISOString()}' and isOnlineMeeting eq true`
          )
          .select("id,subject,start,end,organizer,attendees,isOnlineMeeting,onlineMeeting,onlineMeetingProvider")
          .top(100)
          .get();
        
        // Try to find the meeting by ID match
        meeting = eventsResponse.value?.find((e: any) => 
          e.id === meetingId || 
          e.onlineMeeting?.joinUrl?.includes(meetingId)
        );
        
        if (!meeting) {
          console.error("Meeting not found in calendar search");
          return null;
        }
        
        console.log("Found meeting in calendar search:", meeting.subject);
      } else {
        throw error;
      }
    }

    if (!meeting) {
      return null;
    }

    // Transform to our Meeting type
    const meetingData: Meeting = {
      id: meeting.id,
      subject: meeting.subject || "Untitled Meeting",
      startDateTime: meeting.start.dateTime,
      endDateTime: meeting.end.dateTime,
      organizer: meeting.organizer,
      participants: meeting.attendees
        ? {
            attendees: meeting.attendees.map((a: any) => ({ emailAddress: a.emailAddress })),
          }
        : undefined,
      hasTranscript: false,
      joinWebUrl: meeting.onlineMeeting?.joinUrl,
    };

    // Get attendee email addresses
    const attendeeEmails = meeting.attendees
      ? meeting.attendees.map((a: any) => a.emailAddress.address).filter(Boolean)
      : [];

    // Extract keywords from current meeting subject for relevance matching
    const extractKeywords = (text: string): Set<string> => {
      // Common words to ignore
      const stopWords = new Set([
        'meeting', 'call', 'sync', 'discussion', 'session', 'review', 'update',
        'weekly', 'daily', 'monthly', 'standup', 'check', 'in', 'the', 'a', 'an',
        'and', 'or', 'but', 'for', 'with', 'on', 'at', 'to', 'from', 'of', 'by', 'q1', 'q2', 'q3', 'q4'
      ]);
      
      return new Set(
        text
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ') // Remove punctuation
          .split(/\s+/)
          .filter(word => word.length > 2 && !stopWords.has(word))
      );
    };

    const currentMeetingKeywords = extractKeywords(meeting.subject || '');
    const topKeywords = Array.from(currentMeetingKeywords).slice(0, 5);

    console.log('Meeting prep keywords:', topKeywords);

    // Calculate subject similarity score (0-1)
    const getSubjectSimilarity = (subject1: string, subject2: string): number => {
      const keywords1 = extractKeywords(subject1);
      const keywords2 = extractKeywords(subject2);
      
      if (keywords1.size === 0 || keywords2.size === 0) return 0;
      
      const intersection = new Set([...keywords1].filter(k => keywords2.has(k)));
      const union = new Set([...keywords1, ...keywords2]);
      
      return intersection.size / union.size; // Jaccard similarity
    };

    // Search emails by keywords from meeting subject
    let relatedEmails: EmailMessage[] = [];
    
    if (topKeywords.length > 0) {
      try {
        // Search for emails matching each keyword
        const emailSearchPromises = topKeywords.slice(0, 3).map(keyword => 
          searchMessages(accessToken, keyword, 10).catch(() => [])
        );
        
        const emailResults = await Promise.all(emailSearchPromises);
        const allEmails = emailResults.flat();
        
        // Deduplicate by ID and filter by relevance
        const emailMap = new Map<string, EmailMessage & { relevanceScore: number; matchReason: string }>();
        for (const email of allEmails) {
          if (!emailMap.has(email.id)) {
            // Calculate relevance score
            const subjectSimilarity = getSubjectSimilarity(
              meeting.subject || '',
              email.subject || ''
            );
            
            // Include if subject similarity > 0.15 or from/to includes attendees
            const isFromAttendee = attendeeEmails.some((addr: string) => 
              email.from?.emailAddress.address.toLowerCase() === addr.toLowerCase()
            );
            
            const matchReason = subjectSimilarity > 0.15 
              ? `Topic match (${(subjectSimilarity * 100).toFixed(0)}%)`
              : isFromAttendee 
              ? 'From attendee' 
              : '';
            
            if (subjectSimilarity > 0.15 || isFromAttendee) {
              emailMap.set(email.id, { ...email, relevanceScore: subjectSimilarity, matchReason });
              console.log(`✓ Relevant email: "${email.subject}" (similarity: ${subjectSimilarity.toFixed(2)}, from attendee: ${isFromAttendee})`);
            } else {
              console.log(`✗ Filtered out: "${email.subject}" (similarity: ${subjectSimilarity.toFixed(2)}, from attendee: ${isFromAttendee})`);
            }
          }
        }
        
        relatedEmails = Array.from(emailMap.values()).slice(0, 15);
        console.log(`Found ${relatedEmails.length} related emails out of ${allEmails.length} search results`);
        
        // Fetch full body for ALL related emails
        const emailsWithBodies = await Promise.all(
          relatedEmails.map(async (email) => {
            try {
              const fullEmail = await getMessage(accessToken, email.id, true);
              if (fullEmail?.body?.content) {
                return { 
                  ...email, 
                  fullBody: fullEmail.body.content,
                  relevanceScore: email.relevanceScore,
                  matchReason: email.matchReason
                };
              }
            } catch (err) {
              console.error(`Error fetching full email body for ${email.id}:`, err);
            }
            return email;
          })
        );
        
        relatedEmails = emailsWithBodies;
      } catch (error) {
        console.error('Error searching related emails:', error);
      }
    }

    // Get context in parallel
    const [recentChats, allMeetings] = await Promise.all([
      getRecentChatsWithPeople(accessToken, attendeeEmails),
      getUserMeetings(accessToken, { daysBack: 60 }),
    ]);

    // Filter previous meetings with similar subjects
    const attendeeEmailSet = new Set(attendeeEmails.map((e: string) => e.toLowerCase()));
    const relatedMeetings = allMeetings
      .filter((m) => {
        if (m.id === meetingId) return false; // Skip current meeting
        if (!m.participants?.attendees) return false;

        const meetingAttendees = m.participants.attendees
          .map((a) => a.emailAddress.address.toLowerCase())
          .filter(Boolean);

        // Check if at least 1 attendee overlaps (more lenient)
        const overlap = meetingAttendees.filter((email) => attendeeEmailSet.has(email));
        if (overlap.length < 1) return false;

        // Check subject similarity - must have at least 15% similarity or common keyword
        const similarity = getSubjectSimilarity(meeting.subject || '', m.subject || '');
        
        // Also check for exact keyword matches
        const hasCommonKeyword = currentMeetingKeywords.size > 0 && 
          [...currentMeetingKeywords].some(keyword => 
            (m.subject || '').toLowerCase().includes(keyword)
          );
        
        return similarity > 0.15 || hasCommonKeyword;
      })
      .slice(0, 8);

    console.log(`Found ${relatedMeetings.length} related meetings`);

    // Fetch transcripts for ALL related meetings
    const meetingsWithTranscripts = await Promise.all(
      relatedMeetings.map(async (meeting) => {
        try {
          // Check if meeting has transcript IDs available
          if (meeting.callRecordId && meeting.sessionId) {
            const transcript = await getMeetingTranscript(
              accessToken, 
              meeting.callRecordId, 
              meeting.sessionId
            );
            if (transcript) {
              return { ...meeting, transcript };
            }
          }
        } catch (err) {
          console.error(`Error fetching transcript for meeting ${meeting.id}:`, err);
        }
        return meeting;
      })
    );

    const relatedMeetingsWithTranscripts = meetingsWithTranscripts;

    // Note: Meeting summaries are generated on-demand, not stored
    // If summaries are needed, they can be fetched via /api/summarize for each meeting
    // For now, meetings are included without summaries to keep preparation brief generation fast

    // Get attendee info
    const attendeeInfo: PersonSearchResult[] = [];
    for (const email of attendeeEmails.slice(0, 5)) {
      try {
        const people = await searchPeople(accessToken, email, 1);
        if (people.length > 0) {
          attendeeInfo.push(people[0]);
        }
      } catch (err) {
        // Skip if can't find person
        continue;
      }
    }

    // Calculate confidence based on related content found
    const totalRelatedCount = relatedEmails.length + relatedMeetings.length;
    let confidence: 'high' | 'medium' | 'low';
    if (totalRelatedCount >= 10) {
      confidence = 'high';
    } else if (totalRelatedCount >= 5) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      meeting: meetingData,
      context: {
        relatedEmails: relatedEmails,
        relatedMeetings: relatedMeetingsWithTranscripts,
        recentChats: recentChats.slice(0, 5),
        attendeeInfo,
      },
      relevance: {
        emailCount: relatedEmails.length,
        meetingCount: relatedMeetingsWithTranscripts.length,
        topKeywords,
        confidence,
      },
    };
  } catch (error) {
    console.error("Error getting meeting prep context:", error);
    return null;
  }
}
