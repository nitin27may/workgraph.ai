import { getGraphClient } from "./client";

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
