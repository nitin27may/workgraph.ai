import { getGraphClient } from "./client";
import type { Meeting } from "@/types/meeting";
import { DEFAULT_DAYS_BACK, DEFAULT_MAX_RESULTS, MAX_EVENTS } from "./helpers";

// Calendar event with online meeting info
export interface CalendarEvent {
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
    const daysBack = options.daysBack || DEFAULT_DAYS_BACK;
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
      .top(MAX_EVENTS)
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

    return meetings.slice(0, DEFAULT_MAX_RESULTS);
  } catch (error) {
    console.error("Error fetching meetings:", error);
    throw new Error("Failed to fetch meetings");
  }
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
  top: number = MAX_EVENTS
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
