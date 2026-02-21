import type { Meeting } from "@/types/meeting";
import type { TodoTask } from "@/types/meeting";
import { getTodayDateRange } from "./helpers";
import { getUpcomingMeetings, getYesterdayMeetings } from "./calendar";
import { getFlaggedEmails, getUnreadImportantEmails } from "./email";
import type { FlaggedEmail, EmailMessage } from "./email";
import { getTodaysImportantTasks } from "./tasks";

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

// Get comprehensive daily digest with parallel fetching
export async function getDailyDigest(accessToken: string): Promise<DailyDigest> {
  try {
    const now = new Date();
    const { start: todayStart } = getTodayDateRange();

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

    // Filter to only future meetings
    const futureMeetings = (upcomingMeetings as Meeting[]).filter(
      meeting => new Date(meeting.startDateTime) > now
    );

    return {
      date: todayStart.toISOString(),
      meetings: futureMeetings,
      followUpEmails: flaggedEmails as FlaggedEmail[],
      tasks: tasks,
      importantEmails: unreadImportant as EmailMessage[],
      actionItems: [],
    };
  } catch (error) {
    console.error("Error getting daily digest:", error);
    throw new Error("Failed to get daily digest");
  }
}
