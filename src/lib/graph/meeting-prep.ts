import type { Meeting } from "@/types/meeting";
import { getGraphClient } from "./client";
import {
  extractKeywords,
  getSubjectSimilarity,
  SIMILARITY_THRESHOLD,
  MAX_RELATED_EMAILS,
  MAX_RELATED_MEETINGS,
  MAX_PREP_ATTENDEES,
  PREP_DAYS_BACK,
  MAX_EVENTS,
} from "./helpers";
import { getUserMeetings } from "./calendar";
import { getOnlineMeetingTranscript } from "./meetings";
import { searchMessages, getMessage } from "./email";
import type { EmailMessage, RelatedEmailMessage } from "./email";
import { getRecentChatsWithPeople } from "./chat";
import type { TeamsChat } from "./chat";
import { searchPeople } from "./people";
import type { PersonSearchResult } from "./people";
import { getJoinedTeams, searchChannelMessages } from "./teams";
import type { ChannelMessage } from "./teams";

export interface MeetingPrep {
  meeting: Meeting;
  context: {
    relatedEmails: (EmailMessage & { fullBody?: string; relevanceScore?: number; matchReason?: string })[];
    relatedMeetings: (Meeting & { transcript?: string; summary?: Record<string, unknown>; relevanceScore?: number })[];
    recentChats: TeamsChat[];
    attendeeInfo: PersonSearchResult[];
    channelMessages: ChannelMessage[];
  };
  relevance: {
    emailCount: number;
    meetingCount: number;
    channelMessageCount: number;
    topKeywords: string[];
    confidence: 'high' | 'medium' | 'low';
  };
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
          .top(MAX_EVENTS)
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
    const attendeeEmails: string[] = meeting.attendees
      ? meeting.attendees.map((a: { emailAddress: { address: string } }) => a.emailAddress.address).filter(Boolean)
      : [];

    const currentMeetingKeywords = extractKeywords(meeting.subject || '');
    const topKeywords = Array.from(currentMeetingKeywords).slice(0, 5);

    console.log('Meeting prep keywords:', topKeywords);

    // Search emails by keywords from meeting subject
    let relatedEmails: RelatedEmailMessage[] = [];

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

            // Include if subject similarity > threshold or from/to includes attendees
            const isFromAttendee = attendeeEmails.some((addr: string) =>
              email.from?.emailAddress.address.toLowerCase() === addr.toLowerCase()
            );

            const matchReason = subjectSimilarity > SIMILARITY_THRESHOLD
              ? `Topic match (${(subjectSimilarity * 100).toFixed(0)}%)`
              : isFromAttendee
              ? 'From attendee'
              : '';

            if (subjectSimilarity > SIMILARITY_THRESHOLD || isFromAttendee) {
              emailMap.set(email.id, { ...email, relevanceScore: subjectSimilarity, matchReason });
              console.log(`Relevant email: "${email.subject}" (similarity: ${subjectSimilarity.toFixed(2)}, from attendee: ${isFromAttendee})`);
            } else {
              console.log(`Filtered out: "${email.subject}" (similarity: ${subjectSimilarity.toFixed(2)}, from attendee: ${isFromAttendee})`);
            }
          }
        }

        relatedEmails = Array.from(emailMap.values()).slice(0, MAX_RELATED_EMAILS);
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

    // Search Teams channel messages for meeting keywords (best-effort — requires new scopes)
    let channelMessages: ChannelMessage[] = [];
    if (topKeywords.length > 0) {
      try {
        const teams = await getJoinedTeams(accessToken);
        // Search up to 3 teams to avoid throttling
        const teamSample = teams.slice(0, 3);
        const channelResults = await Promise.all(
          teamSample.map((team) =>
            searchChannelMessages(accessToken, team.id, topKeywords, 5).catch(() => [])
          )
        );
        channelMessages = channelResults.flat().slice(0, 10);
        console.log(`Found ${channelMessages.length} relevant channel messages`);
      } catch (err) {
        // Scope may not be granted yet — log and continue
        console.warn("Could not fetch Teams channel messages (scope may be pending re-auth):", err);
      }
    }

    // Get context in parallel
    const [recentChats, allMeetings] = await Promise.all([
      getRecentChatsWithPeople(accessToken, attendeeEmails),
      getUserMeetings(accessToken, { daysBack: PREP_DAYS_BACK }),
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

        // Check subject similarity - must have at least threshold similarity or common keyword
        const similarity = getSubjectSimilarity(meeting.subject || '', m.subject || '');

        // Also check for exact keyword matches
        const hasCommonKeyword = currentMeetingKeywords.size > 0 &&
          [...currentMeetingKeywords].some(keyword =>
            (m.subject || '').toLowerCase().includes(keyword)
          );

        return similarity > SIMILARITY_THRESHOLD || hasCommonKeyword;
      })
      .slice(0, MAX_RELATED_MEETINGS);

    console.log(`Found ${relatedMeetings.length} related meetings`);

    // Fetch transcripts for ALL related meetings
    const meetingsWithTranscripts = await Promise.all(
      relatedMeetings.map(async (meeting) => {
        try {
          // Check if meeting has an online meeting ID for transcript retrieval
          if (meeting.onlineMeetingId) {
            const transcript = await getOnlineMeetingTranscript(
              accessToken,
              meeting.onlineMeetingId
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

    // Get attendee info in parallel
    const attendeeResults = await Promise.all(
      attendeeEmails.slice(0, MAX_PREP_ATTENDEES).map(async (email) => {
        try {
          const people = await searchPeople(accessToken, email, 1);
          return people.length > 0 ? people[0] : null;
        } catch {
          return null;
        }
      })
    );
    const attendeeInfo = attendeeResults.filter((p): p is PersonSearchResult => p !== null);

    // Calculate confidence based on related content found
    const totalRelatedCount = relatedEmails.length + relatedMeetings.length + channelMessages.length;
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
        channelMessages,
      },
      relevance: {
        emailCount: relatedEmails.length,
        meetingCount: relatedMeetingsWithTranscripts.length,
        channelMessageCount: channelMessages.length,
        topKeywords,
        confidence,
      },
    };
  } catch (error) {
    console.error("Error getting meeting prep context:", error);
    return null;
  }
}
