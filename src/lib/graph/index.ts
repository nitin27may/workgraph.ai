// Re-export everything from all modules for backward compatibility
// Existing `import { ... } from "@/lib/graph"` statements continue to work

export { customFetch, getGraphClient, sanitizeOData } from "./client";

export {
  DEFAULT_DAYS_BACK,
  DEFAULT_MAX_RESULTS,
  MAX_EVENTS,
  TRANSCRIPT_BATCH_SIZE,
  SIMILARITY_THRESHOLD,
  MAX_RELATED_EMAILS,
  MAX_RELATED_MEETINGS,
  MAX_PREP_ATTENDEES,
  PREP_DAYS_BACK,
  getTodayDateRange,
  extractKeywords,
  getSubjectSimilarity,
} from "./helpers";

export {
  getUserMeetings,
  getCalendarEvents,
  getCalendarEvent,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarView,
  getCalendars,
  getUpcomingMeetings,
  getYesterdayMeetings,
} from "./calendar";
export type { CalendarEvent, CalendarEventDetailed, Calendar } from "./calendar";

export {
  getOnlineMeetingByJoinUrl,
  checkMeetingTranscripts,
  getOnlineMeetingTranscript,
  getMeetingAttendanceReport,
} from "./meetings";

export {
  getTaskLists,
  getTasks,
  getAllTasks,
  createTask,
  createMultipleTasks,
  updateTask,
  deleteTask,
  getTasksDueToday,
  getOverdueTasks,
  getTodaysImportantTasks,
} from "./tasks";

export {
  getMessages,
  getMessage,
  sendEmail,
  createDraft,
  searchMessages,
  getMailFolders,
  moveMessage,
  getFlaggedEmails,
  getUnreadImportantEmails,
  getRecentEmailsWithPeople,
} from "./email";
export type { EmailMessage, RelatedEmailMessage, EmailFolder, FlaggedEmail } from "./email";

export {
  getChats,
  getChat,
  getChatMessages,
  sendChatMessage,
  getChatMembers,
  getRecentChatsWithPeople,
} from "./chat";
export type { TeamsChat, ChatMessage, ChatMember } from "./chat";

export {
  searchPeople,
  getCurrentUser,
  shareTaskViaEmail,
  assignTaskToUser,
} from "./people";
export type { PersonSearchResult } from "./people";

export {
  getDrive,
  getDriveRootChildren,
  getDriveItemByPath,
  getDriveItemChildrenByPath,
  getDriveItem,
  getDriveItemDownloadUrl,
  searchDriveItems,
  getRecentFiles,
  getSharedFiles,
  createFolder,
  deleteDriveItem,
} from "./files";
export type { DriveItem, Drive } from "./files";

export { getDailyDigest } from "./digest";
export type { DailyDigest, ActionItem } from "./digest";

export { getMeetingPrepContext } from "./meeting-prep";
export type { MeetingPrep } from "./meeting-prep";
