import { customFetch } from "./client";
import { getGraphClient } from "./client";

export interface OneNoteNotebook {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  isShared: boolean;
  isDefault: boolean;
}

export interface OneNoteSection {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  isDefault: boolean;
}

export interface OneNotePage {
  id: string;
  title: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  webUrl?: string;
  links?: {
    oneNoteClientUrl?: { href: string };
    oneNoteWebUrl?: { href: string };
  };
}

export interface MeetingDataForNote {
  subject: string;
  startDateTime: string;
  organizer: { emailAddress: { name: string } };
  participants?: { attendees: Array<{ emailAddress: { name: string; address: string } }> };
}

export interface SummaryDataForNote {
  keyDecisions: string[];
  actionItems: Array<{ owner: string; task: string; deadline?: string }>;
  nextSteps: string[];
  fullSummary: string;
}

export async function listNotebooks(accessToken: string): Promise<OneNoteNotebook[]> {
  const client = getGraphClient(accessToken);
  try {
    const response = await client
      .api("/me/onenote/notebooks")
      .select("id,displayName,createdDateTime,lastModifiedDateTime,isShared,isDefault")
      .orderby("lastModifiedDateTime desc")
      .get();
    return response.value || [];
  } catch (error) {
    console.error("Error listing OneNote notebooks:", error);
    throw new Error("Failed to list OneNote notebooks");
  }
}

export async function listSections(
  accessToken: string,
  notebookId: string
): Promise<OneNoteSection[]> {
  const client = getGraphClient(accessToken);
  try {
    const response = await client
      .api(`/me/onenote/notebooks/${notebookId}/sections`)
      .select("id,displayName,createdDateTime,lastModifiedDateTime,isDefault")
      .get();
    return response.value || [];
  } catch (error) {
    console.error("Error listing OneNote sections:", error);
    throw new Error("Failed to list OneNote sections");
  }
}

export async function listPages(
  accessToken: string,
  sectionId: string
): Promise<OneNotePage[]> {
  const client = getGraphClient(accessToken);
  try {
    const response = await client
      .api(`/me/onenote/sections/${sectionId}/pages`)
      .select("id,title,createdDateTime,lastModifiedDateTime,webUrl")
      .orderby("lastModifiedDateTime desc")
      .top(20)
      .get();
    return response.value || [];
  } catch (error) {
    console.error("Error listing OneNote pages:", error);
    throw new Error("Failed to list OneNote pages");
  }
}

export async function getPageContent(
  accessToken: string,
  pageId: string
): Promise<string> {
  const client = getGraphClient(accessToken);
  try {
    const content = await client.api(`/me/onenote/pages/${pageId}/content`).get();
    return content;
  } catch (error) {
    console.error("Error getting OneNote page content:", error);
    throw new Error("Failed to get OneNote page content");
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMeetingNoteHtml(
  meeting: MeetingDataForNote,
  summary: SummaryDataForNote
): string {
  const date = new Date(meeting.startDateTime).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const organizer = meeting.organizer.emailAddress.name;
  const attendees =
    meeting.participants?.attendees?.map((a) => a.emailAddress.name).join(", ") || "N/A";

  const decisionsHtml =
    summary.keyDecisions.length > 0
      ? summary.keyDecisions.map((d) => `<li>${escapeHtml(d)}</li>`).join("")
      : "<li>No decisions recorded</li>";

  const actionsHtml =
    summary.actionItems.length > 0
      ? summary.actionItems
          .map(
            (a) =>
              `<tr><td>${escapeHtml(a.owner)}</td><td>${escapeHtml(a.task)}</td><td>${escapeHtml(a.deadline || "—")}</td></tr>`
          )
          .join("")
      : '<tr><td colspan="3">No action items recorded</td></tr>';

  const nextStepsHtml =
    summary.nextSteps.length > 0
      ? summary.nextSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")
      : "<li>No next steps recorded</li>";

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(meeting.subject)} — ${date}</title>
  <meta name="created" content="${new Date().toISOString()}" />
</head>
<body>
  <h1>${escapeHtml(meeting.subject)}</h1>
  <p>
    <strong>Date:</strong> ${date} &nbsp;|&nbsp;
    <strong>Organizer:</strong> ${escapeHtml(organizer)} &nbsp;|&nbsp;
    <strong>Attendees:</strong> ${escapeHtml(attendees)}
  </p>
  <h2>Key Decisions</h2>
  <ul>${decisionsHtml}</ul>
  <h2>Action Items</h2>
  <table border="1" style="border-collapse:collapse;width:100%">
    <thead>
      <tr>
        <th style="padding:6px 10px;text-align:left">Owner</th>
        <th style="padding:6px 10px;text-align:left">Task</th>
        <th style="padding:6px 10px;text-align:left">Deadline</th>
      </tr>
    </thead>
    <tbody>${actionsHtml}</tbody>
  </table>
  <h2>Next Steps</h2>
  <ul>${nextStepsHtml}</ul>
  <h2>Full Summary</h2>
  <p>${escapeHtml(summary.fullSummary)}</p>
</body>
</html>`;
}

export interface ActionItemForNote {
  owner: string;
  task: string;
  deadline?: string;
}

export async function createMeetingNotePage(
  accessToken: string,
  sectionId: string,
  meeting: MeetingDataForNote,
  summary: SummaryDataForNote
): Promise<OneNotePage> {
  const html = buildMeetingNoteHtml(meeting, summary);

  // Graph SDK cannot send raw HTML — use customFetch directly
  const response = await customFetch(
    `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/html",
      },
      body: html,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("Error creating OneNote page:", err);
    throw new Error(`Failed to create OneNote page: ${response.status}`);
  }

  return response.json() as Promise<OneNotePage>;
}

function buildActionItemsNoteHtml(
  meeting: MeetingDataForNote,
  actionItems: ActionItemForNote[]
): string {
  const date = new Date(meeting.startDateTime).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const organizer = meeting.organizer.emailAddress.name;

  const actionsHtml =
    actionItems.length > 0
      ? actionItems
          .map(
            (a) =>
              `<tr><td style="padding:6px 10px">${escapeHtml(a.owner)}</td><td style="padding:6px 10px">${escapeHtml(a.task)}</td><td style="padding:6px 10px">${escapeHtml(a.deadline || "—")}</td></tr>`
          )
          .join("")
      : '<tr><td colspan="3" style="padding:6px 10px">No action items</td></tr>';

  return `<!DOCTYPE html>
<html>
<head>
  <title>Action Items — ${escapeHtml(meeting.subject)} — ${date}</title>
  <meta name="created" content="${new Date().toISOString()}" />
</head>
<body>
  <h1>Action Items: ${escapeHtml(meeting.subject)}</h1>
  <p>
    <strong>Date:</strong> ${date} &nbsp;|&nbsp;
    <strong>Organizer:</strong> ${escapeHtml(organizer)}
  </p>
  <p><strong>${actionItems.length}</strong> action item${actionItems.length !== 1 ? "s" : ""}</p>
  <table border="1" style="border-collapse:collapse;width:100%">
    <thead>
      <tr>
        <th style="padding:6px 10px;text-align:left">Owner</th>
        <th style="padding:6px 10px;text-align:left">Task</th>
        <th style="padding:6px 10px;text-align:left">Deadline</th>
      </tr>
    </thead>
    <tbody>${actionsHtml}</tbody>
  </table>
</body>
</html>`;
}

export async function createActionItemsNotePage(
  accessToken: string,
  sectionId: string,
  meeting: MeetingDataForNote,
  actionItems: ActionItemForNote[]
): Promise<OneNotePage> {
  const html = buildActionItemsNoteHtml(meeting, actionItems);

  const response = await customFetch(
    `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/html",
      },
      body: html,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("Error creating OneNote action items page:", err);
    throw new Error(`Failed to create OneNote page: ${response.status}`);
  }

  return response.json() as Promise<OneNotePage>;
}
