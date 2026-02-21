import { getGraphClient, sanitizeOData } from "./client";
import type { CreateTaskRequest } from "@/types/meeting";

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
        .filter(`startswith(displayName,'${sanitizeOData(query)}') or startswith(mail,'${sanitizeOData(query)}')`)
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

export async function getCurrentUser(accessToken: string) {
  const client = getGraphClient(accessToken);
  return await client.api("/me").get();
}

// Share a task by sending it to another user's email
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
