import { getGraphClient, sanitizeOData } from "./client";

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

export interface RelatedEmailMessage extends EmailMessage {
  relevanceScore?: number;
  matchReason?: string;
  fullBody?: string;
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

// Get flagged emails (for follow-ups)
export interface FlaggedEmail extends EmailMessage {
  flag?: {
    flagStatus: "notFlagged" | "complete" | "flagged";
    dueDateTime?: { dateTime: string; timeZone: string };
    startDateTime?: { dateTime: string; timeZone: string };
    completedDateTime?: { dateTime: string; timeZone: string };
  };
}

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
      (email) => `(from/emailAddress/address eq '${sanitizeOData(email)}' or recipients/any(r:r/emailAddress/address eq '${sanitizeOData(email)}'))`
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
