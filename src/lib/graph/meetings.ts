import { getGraphClient, customFetch, sanitizeOData } from "./client";
import type { Meeting } from "@/types/meeting";
import { TRANSCRIPT_BATCH_SIZE } from "./helpers";

// Get online meeting details by join URL
export async function getOnlineMeetingByJoinUrl(
  accessToken: string,
  joinWebUrl: string
): Promise<{ id: string; hasTranscript: boolean } | null> {
  const client = getGraphClient(accessToken);

  try {
    // Encode the join URL for the filter
    const response = await client
      .api(`/me/onlineMeetings`)
      .filter(`JoinWebUrl eq '${sanitizeOData(joinWebUrl)}'`)
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

  // Check in parallel (batch to avoid rate limiting)
  for (let i = 0; i < meetingsWithJoinUrl.length; i += TRANSCRIPT_BATCH_SIZE) {
    const batch = meetingsWithJoinUrl.slice(i, i + TRANSCRIPT_BATCH_SIZE);
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
