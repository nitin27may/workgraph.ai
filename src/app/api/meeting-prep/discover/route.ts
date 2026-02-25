import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getCalendarEvent,
  getUserMeetings,
  getMessages,
  deduplicateEmailsByConversation,
  getTeams,
  getTeamChannels,
  getDrive,
  getRecentFiles,
  type EmailMessage,
  type Team,
  type TeamChannel,
} from "@/lib/graph";
import {
  getTrendingDocuments,
  getUsedDocuments,
  getSharedDocuments,
  searchGraphContent,
  deduplicateDocuments,
  normalizeDriveItemToDocument,
  type DiscoveredDocument,
  type DocumentSource,
} from "@/lib/graph/files";
import { classifyRelevance } from "@/lib/openai";
import { getDiscoveryCache, saveDiscoveryCache } from "@/lib/db";

interface DiscoveryCandidate {
  meetings: MeetingCandidate[];
  emails: EmailCandidate[];
  teams: TeamCandidate[];
  files: FileCandidate[];
}

interface MeetingCandidate {
  id: string;
  subject: string;
  startTime: string;
  endTime: string;
  score: number;
  autoSelected: boolean;
  attendeeCount: number;
  hasTranscript?: boolean;
  reasoning: string;
}

interface EmailCandidate {
  id: string;
  subject: string;
  from: string;
  fromEmail: string;
  receivedTime: string;
  score: number;
  autoSelected: boolean;
  hasAttachments: boolean;
  isPartOfChain?: boolean;
  chainEmailCount?: number;
  reasoning: string;
}

interface TeamCandidate {
  id: string;
  name: string;
  description?: string;
  score: number;
  autoSelected: boolean;
  channels: ChannelCandidate[];
  reasoning: string;
}

interface ChannelCandidate {
  id: string;
  displayName: string;
  description?: string;
  selected: boolean;
}

interface FileCandidate {
  id: string;
  name: string;
  path: string;
  modifiedTime: string;
  score: number;
  autoSelected: boolean;
  owner?: string;
  size?: number;
  reasoning: string;
  source?: DocumentSource;
  containerName?: string;
  mimeType?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Authentication
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const accessToken = session.accessToken;
    const searchParams = request.nextUrl.searchParams;
    const meetingId = searchParams.get("meetingId");
    const keywords = searchParams.get("keywords") || undefined;

    if (!meetingId) {
      return NextResponse.json(
        { error: "meetingId is required" },
        { status: 400 }
      );
    }

    // Check cache first (include keywords in cache check)
    const cacheKey = keywords ? `${meetingId}:${keywords}` : meetingId;
    const cached = getDiscoveryCache(cacheKey);
    if (cached) {
      console.log(`✅ Cache hit for meeting ${meetingId} (keywords: ${keywords || 'none'})`);
      return NextResponse.json({
        ...cached.candidates,
        cached: true,
        cacheAge: Math.floor(
          (Date.now() - new Date(cached.createdAt).getTime()) / 1000
        ),
        keywordsApplied: !!keywords,
      });
    }

    console.log(`🔍 Starting discovery for meeting ${meetingId}${keywords ? ` with keywords: ${keywords}` : ''}`);
    const startTime = Date.now();

    // Get target meeting details
    const targetMeeting = await getCalendarEvent(accessToken, meetingId);
    if (!targetMeeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    const targetTitle = targetMeeting.subject;
    console.log(`📋 Target meeting: "${targetTitle}"`);

    // Calculate 30-day window
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Build search query from meeting title + user keywords
    const searchQuery = [targetTitle, keywords].filter(Boolean).join(" ");

    // Fetch candidates from all sources in parallel
    console.log(`⚡ Fetching candidates from all sources (last 30 days)...`);
    const [rawMeetings, rawEmails, rawTeams, rawRecentFiles, trendingDocs, usedDocs, sharedDocs, searchDocs] = await Promise.all([
      // Meetings from last 30 days
      getUserMeetings(accessToken, {
        startDate: thirtyDaysAgo.toISOString(),
        endDate: now.toISOString(),
      }).catch((err) => {
        console.error("Error fetching meetings:", err);
        return [];
      }),

      // Emails from last 30 days
      getMessages(accessToken, {
        top: 200,
        filter: `receivedDateTime ge ${thirtyDaysAgo.toISOString()}`,
        orderBy: "receivedDateTime desc",
        select: [
          "id",
          "subject",
          "from",
          "toRecipients",
          "receivedDateTime",
          "bodyPreview",
          "hasAttachments",
          "conversationId",
        ],
      }).catch((err) => {
        console.error("Error fetching emails:", err);
        return [];
      }),

      // User's teams
      getTeams(accessToken).catch((err) => {
        console.error("Error fetching teams:", err);
        return [];
      }),

      // OneDrive recent files
      getRecentFiles(accessToken, 100).catch((err) => {
        console.error("Error fetching recent files:", err);
        return [];
      }),

      // Trending documents (Insights API)
      getTrendingDocuments(accessToken, 50),

      // Recently used documents (Insights API)
      getUsedDocuments(accessToken, 50),

      // Shared documents (Insights API)
      getSharedDocuments(accessToken, 50),

      // Graph Search content
      searchGraphContent(accessToken, searchQuery, { top: 25 }),
    ]);

    // Normalize recent files to DiscoveredDocument format and merge all file sources
    const recentDocs = rawRecentFiles.map((f) => normalizeDriveItemToDocument(f, "recent"));
    const allDocuments = deduplicateDocuments([
      ...trendingDocs,
      ...sharedDocs,
      ...searchDocs,
      ...usedDocs,
      ...recentDocs,
    ]);

    // Count documents by source for stats
    const fileSources: Record<string, number> = {};
    for (const doc of allDocuments) {
      fileSources[doc.source] = (fileSources[doc.source] || 0) + 1;
    }

    // Filter meetings (exclude the target meeting)
    const filteredMeetings = rawMeetings.filter((m) => m.id !== meetingId);

    // Deduplicate emails (keep only last email per conversation)
    const deduplicatedEmails = deduplicateEmailsByConversation(rawEmails);
    
    // Filter emails with valid from data before classification
    const validEmails = deduplicatedEmails.filter((e) => e.from && e.from.emailAddress);

    console.log(`📊 Fetched: ${filteredMeetings.length} meetings, ${validEmails.length} emails (deduplicated from ${rawEmails.length}), ${rawTeams.length} teams, ${allDocuments.length} files (${Object.entries(fileSources).map(([k,v]) => `${k}:${v}`).join(', ')})`);

    // Classify relevance using GPT in parallel
    console.log(`🤖 Classifying relevance with GPT...`);
    const [meetingScores, emailScores, teamScores, fileScores] =
      await Promise.all([
        filteredMeetings.length > 0
          ? classifyRelevance(
              targetTitle,
              filteredMeetings.map((m) => ({
                id: m.id,
                title: m.subject || "(No subject)",
                metadata: `${new Date(m.startDateTime).toLocaleDateString()} - ${m.participants?.attendees?.length || 0} attendees`,
              })),
              "meetings",
              keywords
            )
          : Promise.resolve([]),

        validEmails.length > 0
          ? classifyRelevance(
              targetTitle,
              validEmails.map((e) => ({
                id: e.id,
                title: e.subject || "(No subject)",
                metadata: `From: ${e.from.emailAddress.name || e.from.emailAddress.address || "Unknown"} - ${new Date(e.receivedDateTime).toLocaleDateString()}`,
              })),
              "emails",
              keywords
            )
          : Promise.resolve([]),

        rawTeams.length > 0
          ? classifyRelevance(
              targetTitle,
              rawTeams.map((t) => ({
                id: t.id,
                title: t.displayName || "Unnamed Team",
                metadata: t.description || "",
              })),
              "teams",
              keywords
            )
          : Promise.resolve([]),

        allDocuments.length > 0
          ? classifyRelevance(
              targetTitle,
              allDocuments.map((f) => ({
                id: f.id,
                title: f.name || "Unnamed File",
                metadata: `Source: ${f.source}${f.containerName ? ` | Container: ${f.containerName}` : ""}${f.owner ? ` | Owner: ${f.owner}` : ""}${f.lastModifiedDateTime ? ` | Modified: ${new Date(f.lastModifiedDateTime).toLocaleDateString()}` : ""}`,
              })),
              "files",
              keywords
            )
          : Promise.resolve([]),
      ]);

    // Apply keyword boost for direct keyword matches in titles
    const keywordList = keywords 
      ? keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
      : [];
    
    const applyKeywordBoost = (
      scores: { id: string; score: number; reasoning: string }[],
      items: { id: string; title: string }[],
      boostAmount: number = 30
    ) => {
      if (keywordList.length === 0) return scores;
      
      return scores.map(score => {
        const item = items.find(i => i.id === score.id);
        if (!item) return score;
        
        const titleLower = item.title.toLowerCase();
        const hasKeywordMatch = keywordList.some(keyword => titleLower.includes(keyword));
        
        if (hasKeywordMatch) {
          const boostedScore = Math.min(score.score + boostAmount, 100);
          return {
            ...score,
            score: boostedScore,
            reasoning: score.reasoning + ` [+${boostAmount} keyword match boost]`,
          };
        }
        return score;
      });
    };

    // Apply keyword boost to all score arrays
    const boostedMeetingScores = applyKeywordBoost(
      meetingScores,
      filteredMeetings.map(m => ({ id: m.id, title: m.subject || "" }))
    );
    const boostedEmailScores = applyKeywordBoost(
      emailScores,
      validEmails.map(e => ({ id: e.id, title: e.subject || "" }))
    );
    const boostedTeamScores = applyKeywordBoost(
      teamScores,
      rawTeams.map(t => ({ id: t.id, title: t.displayName || "" }))
    );
    const boostedFileScores = applyKeywordBoost(
      fileScores,
      allDocuments.map(f => ({ id: f.id, title: f.name || "" }))
    );

    console.log(`🔑 Applied keyword boost to ${keywordList.length} keywords: ${keywordList.join(', ')}`);

    // Build meeting candidates - filter out meetings with missing required fields
    const meetingCandidates: MeetingCandidate[] = filteredMeetings
      .filter((meeting) => meeting.id && meeting.startDateTime)
      .map((meeting) => {
        const score =
          boostedMeetingScores.find((s) => s.id === meeting.id)?.score || 0;
        const reasoning =
          boostedMeetingScores.find((s) => s.id === meeting.id)?.reasoning || "";
        return {
          id: meeting.id,
          subject: meeting.subject || "(No subject)",
          startTime: meeting.startDateTime,
          endTime: meeting.endDateTime,
          score,
          autoSelected: score >= 70,
          attendeeCount: meeting.participants?.attendees?.length || 0,
          hasTranscript: meeting.hasTranscript || !!meeting.onlineMeetingId,
          reasoning,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Build email candidates - use validEmails which is already filtered
    const emailCandidates: EmailCandidate[] = validEmails
      .map((email) => {
        const score = boostedEmailScores.find((s) => s.id === email.id)?.score || 0;
        const reasoning =
          boostedEmailScores.find((s) => s.id === email.id)?.reasoning || "";
        return {
          id: email.id,
          subject: email.subject || "(No subject)",
          from: email.from.emailAddress.name || email.from.emailAddress.address || "Unknown",
          fromEmail: email.from.emailAddress.address || "",
          receivedTime: email.receivedDateTime,
          score,
          autoSelected: score >= 70,
          hasAttachments: email.hasAttachments || false,
          isPartOfChain: (email as any).isPartOfChain,
          chainEmailCount: (email as any).chainEmailCount,
          reasoning,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Build team candidates (fetch channels for high-scoring teams)
    const validTeams = rawTeams.filter((t) => t.id);
    const teamCandidates: TeamCandidate[] = await Promise.all(
      validTeams.map(async (team) => {
        const score = boostedTeamScores.find((s) => s.id === team.id)?.score || 0;
        const reasoning =
          boostedTeamScores.find((s) => s.id === team.id)?.reasoning || "";

        // Fetch channels for teams with score >= 50
        let channels: ChannelCandidate[] = [];
        if (score >= 50 && team.id) {
          try {
            const teamChannels = await getTeamChannels(accessToken, team.id);
            channels = (teamChannels || [])
              .filter((ch) => ch.id)
              .map((ch) => ({
                id: ch.id,
                displayName: ch.displayName || "Unnamed Channel",
                description: ch.description,
                selected: score >= 70, // Auto-select channels if team is highly relevant
              }));
          } catch (err) {
            console.error(`Error fetching channels for team ${team.id}:`, err);
          }
        }

        return {
          id: team.id,
          name: team.displayName || "Unnamed Team",
          description: team.description,
          score,
          autoSelected: score >= 70,
          channels,
          reasoning,
        };
      })
    );
    teamCandidates.sort((a, b) => b.score - a.score);

    // Build file candidates from deduplicated documents
    const fileCandidates: FileCandidate[] = allDocuments
      .filter((doc) => doc.id && doc.name)
      .map((doc) => {
        const score = boostedFileScores.find((s) => s.id === doc.id)?.score || 0;
        const reasoning =
          boostedFileScores.find((s) => s.id === doc.id)?.reasoning || "";
        return {
          id: doc.id,
          name: doc.name || "Unnamed File",
          path: doc.webUrl || doc.name || "",
          modifiedTime: doc.lastModifiedDateTime || "",
          score,
          autoSelected: score >= 70,
          owner: doc.owner || undefined,
          size: doc.size,
          reasoning,
          source: doc.source,
          containerName: doc.containerName,
          mimeType: doc.mimeType,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Calculate stats
    const autoSelectedCount =
      meetingCandidates.filter((m) => m.autoSelected).length +
      emailCandidates.filter((e) => e.autoSelected).length +
      teamCandidates.filter((t) => t.autoSelected).length +
      fileCandidates.filter((f) => f.autoSelected).length;

    const result = {
      targetMeeting: {
        id: targetMeeting.id,
        subject: targetMeeting.subject,
        startTime: targetMeeting.start.dateTime,
        endTime: targetMeeting.end.dateTime,
      },
      candidates: {
        meetings: meetingCandidates,
        emails: emailCandidates,
        teams: teamCandidates,
        files: fileCandidates,
      },
      stats: {
        totalMeetings: meetingCandidates.length,
        totalEmails: emailCandidates.length,
        totalTeams: teamCandidates.length,
        totalFiles: fileCandidates.length,
        autoSelectedCount,
        fileSources,
      },
      cached: false,
      keywordsApplied: !!keywords,
      processingTimeMs: Date.now() - startTime,
    };

    // Cache the results for 30 minutes (include keywords in cache key)
    try {
      saveDiscoveryCache(cacheKey, result, 30);
    } catch (err) {
      console.error("Error saving to cache:", err);
      // Non-fatal, continue
    }

    console.log(`✅ Discovery complete in ${result.processingTimeMs}ms - Found ${autoSelectedCount} auto-selected items`);

    return NextResponse.json(result);
  } catch (error) {
    console.error("❌ Error in discovery endpoint:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    return NextResponse.json(
      {
        error: "Failed to discover meeting context",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
