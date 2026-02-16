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

    return (response.value || []).map((member: { id: string; displayName: string; userId: string; email: string; roles?: string[] }) => ({
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
  try {
    if (emailAddresses.length === 0) {
      return [];
    }

    const allChats = await getChats(accessToken, 50);
    const targetEmails = new Set(emailAddresses.map((e) => e.toLowerCase()));

    // Batch member lookups with concurrency limit
    const BATCH_SIZE = 10;
    const relevantChats: TeamsChat[] = [];

    for (let i = 0; i < allChats.length && relevantChats.length < 10; i += BATCH_SIZE) {
      const batch = allChats.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (chat) => {
          try {
            const members = await getChatMembers(accessToken, chat.id);
            const memberEmails = members.map((m) => m.email?.toLowerCase()).filter((e): e is string => !!e);
            const hasRelevantMember = memberEmails.some((email) => targetEmails.has(email));
            return hasRelevantMember ? chat : null;
          } catch {
            return null;
          }
        })
      );

      for (const chat of results) {
        if (chat && relevantChats.length < 10) {
          relevantChats.push(chat);
        }
      }
    }

    return relevantChats;
  } catch (error) {
    console.error("Error fetching recent chats with people:", error);
    return [];
  }
}
