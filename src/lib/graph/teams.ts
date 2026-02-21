import { getGraphClient } from "./client";

export interface Team {
  id: string;
  displayName: string;
  description: string | null;
  internalId?: string;
  webUrl?: string;
}

export interface TeamChannel {
  id: string;
  displayName: string;
  description: string | null;
  webUrl?: string;
  membershipType?: "standard" | "private" | "shared";
  createdDateTime?: string;
}

export interface ChannelMessage {
  id: string;
  messageType: string;
  createdDateTime: string;
  lastModifiedDateTime?: string;
  subject?: string | null;
  body: { content: string; contentType: "text" | "html" };
  from: {
    user?: { displayName: string; id: string };
  };
  importance?: "normal" | "high" | "urgent";
}

// List teams the user has joined
export async function getJoinedTeams(accessToken: string): Promise<Team[]> {
  const client = getGraphClient(accessToken);
  try {
    const response = await client
      .api("/me/joinedTeams")
      .select("id,displayName,description,webUrl,internalId")
      .get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching joined teams:", error);
    throw new Error("Failed to fetch joined teams");
  }
}

// List channels in a team
export async function getTeamChannels(
  accessToken: string,
  teamId: string
): Promise<TeamChannel[]> {
  const client = getGraphClient(accessToken);
  try {
    const response = await client
      .api(`/teams/${teamId}/channels`)
      .select("id,displayName,description,webUrl,membershipType,createdDateTime")
      .get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching team channels:", error);
    throw new Error("Failed to fetch team channels");
  }
}

// Get recent messages from a channel
export async function getChannelMessages(
  accessToken: string,
  teamId: string,
  channelId: string,
  top: number = 25
): Promise<ChannelMessage[]> {
  const client = getGraphClient(accessToken);
  try {
    const response = await client
      .api(`/teams/${teamId}/channels/${channelId}/messages`)
      .top(top)
      .select("id,messageType,createdDateTime,lastModifiedDateTime,subject,body,from,importance")
      .get();

    // Filter out system messages, keep only real messages
    const messages: ChannelMessage[] = (response.value || []).filter(
      (m: ChannelMessage) => m.messageType === "message"
    );

    return messages;
  } catch (error) {
    console.error("Error fetching channel messages:", error);
    throw new Error("Failed to fetch channel messages");
  }
}

// Search channel messages across all channels of a team for matching keywords
export async function searchChannelMessages(
  accessToken: string,
  teamId: string,
  keywords: string[],
  top: number = 10
): Promise<ChannelMessage[]> {
  if (keywords.length === 0) return [];

  try {
    const channels = await getTeamChannels(accessToken, teamId);
    const results: ChannelMessage[] = [];

    // Limit to first 5 channels to avoid throttling
    const channelSample = channels.slice(0, 5);

    await Promise.all(
      channelSample.map(async (channel) => {
        try {
          const messages = await getChannelMessages(accessToken, teamId, channel.id, 50);

          for (const msg of messages) {
            const content = (msg.body.content || "").toLowerCase();
            const matched = keywords.some((kw) => content.includes(kw.toLowerCase()));
            if (matched) {
              results.push(msg);
            }
          }
        } catch {
          // Silently skip channels with permission errors
        }
      })
    );

    return results.slice(0, top);
  } catch (error) {
    console.error("Error searching channel messages:", error);
    return [];
  }
}
