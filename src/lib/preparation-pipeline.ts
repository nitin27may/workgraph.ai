/**
 * Preparation Pipeline - Two-stage Summarization
 * 
 * This pipeline handles intelligent meeting preparation by:
 * 1. Checking cache for existing summaries
 * 2. Generating missing summaries in parallel
 * 3. Aggregating insights from all sources
 * 4. Creating a comprehensive preparation brief
 */

import type { MeetingPrep } from "./graph";
import type { MeetingSummary } from "@/types/meeting";
import {
  summarizeTranscriptInChunks,
  summarizeEmail,
  aggregateMeetingThread,
  aggregateEmailThread,
  createPreparationBrief,
  type EmailSummary,
  type PreparationBriefInput,
} from "./openai";
import { getSubjectSimilarity } from "./graph/helpers";
import {
  saveMeetingSummary,
  getMeetingSummaryByMeetingId,
  saveEmailSummary,
  getEmailSummaryById,
  type MeetingSummaryCache,
  type EmailSummaryCache,
} from "./db";

// ============================================
// Pipeline Orchestrator
// ============================================

export interface PreparationResult {
  brief: string;
  meetingSummaries: Array<{
    meetingId: string;
    subject: string;
    date: string;
    summary: MeetingSummary;
    cached: boolean;
  }>;
  emailSummaries: Array<{
    emailId: string;
    subject: string;
    from: string;
    date: string;
    summary: EmailSummary;
    cached: boolean;
  }>;
  stats: {
    totalMeetings: number;
    meetingsCached: number;
    meetingsGenerated: number;
    totalEmails: number;
    emailsCached: number;
    emailsGenerated: number;
    processingTimeMs: number;
    briefTokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    reducedMeetingThreads: number;
    reducedEmailThreads: number;
  };
  approach?: 'single-stage' | 'multi-stage';
  layers?: number; // Number of summarization layers used
}

/**
 * Estimate token count from text (rough approximation)
 * More accurate would use tiktoken library
 */
function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

export async function generateMeetingPreparations(
  context: MeetingPrep,
  userEmail: string,
  multiStage: boolean = false
): Promise<PreparationResult> {
  const startTime = Date.now();

  console.log('🚀 Starting preparation pipeline:', {
    meeting: context.meeting.subject,
    relatedMeetings: context.context.relatedMeetings.length,
    relatedEmails: context.context.relatedEmails.length,
  });

  // ============================================
  // Step 1: Process Related Meetings
  // ============================================
  const meetingSummaries: PreparationResult['meetingSummaries'] = [];
  let meetingsCached = 0;
  let meetingsGenerated = 0;

  // Transcript length threshold for chunked summarization (~4k tokens ≈ 12k chars)
  const LONG_TRANSCRIPT_THRESHOLD = 12000;

  for (const meeting of context.context.relatedMeetings) {
    try {
      // Check cache first
      let cached = getMeetingSummaryByMeetingId(meeting.id);

      if (cached) {
        // Use cached summary
        meetingsCached++;
        meetingSummaries.push({
          meetingId: meeting.id,
          subject: meeting.subject,
          date: meeting.startDateTime,
          summary: JSON.parse(cached.summary),
          cached: true,
        });
        console.log(`✓ Using cached summary for: ${meeting.subject}`);
      } else {
        // Generate new summary only if transcript exists
        if (meeting.transcript && meeting.transcript.trim().length > 0) {
          const isLong = meeting.transcript.length > LONG_TRANSCRIPT_THRESHOLD;
          console.log(
            `⚙️ Generating summary for: ${meeting.subject} (${meeting.transcript.length} chars${isLong ? ' — chunked' : ''})`
          );

          // Use chunked summarization for long transcripts to prevent key detail loss
          const result = await summarizeTranscriptInChunks(
            meeting.transcript,
            meeting.subject,
            meeting.startDateTime,
            meeting.endDateTime,
            { email: userEmail }
          );

          // Save to cache
          saveMeetingSummary(meeting.id, result.summary, {
            subject: meeting.subject,
            meetingDate: meeting.startDateTime,
            transcriptLength: meeting.transcript.length,
            model: result.metrics.model,
            generatedBy: userEmail,
          });

          meetingsGenerated++;
          meetingSummaries.push({
            meetingId: meeting.id,
            subject: meeting.subject,
            date: meeting.startDateTime,
            summary: result.summary,
            cached: false,
          });
          console.log(`✓ Generated summary for: ${meeting.subject}`);
        } else {
          console.log(`⊘ No transcript available for: ${meeting.subject}`);
        }
      }
    } catch (error) {
      console.error(`Error processing meeting ${meeting.id}:`, error);
      // Continue with other meetings
    }
  }

  // ============================================
  // Step 2: Process Related Emails
  // ============================================
  const emailSummaries: PreparationResult['emailSummaries'] = [];
  let emailsCached = 0;
  let emailsGenerated = 0;

  for (const email of context.context.relatedEmails) {
    try {
      // Check cache first
      let cached = getEmailSummaryById(email.id);

      if (cached) {
        // Use cached summary
        emailsCached++;
        emailSummaries.push({
          emailId: email.id,
          subject: email.subject || 'No Subject',
          from: email.from?.emailAddress.name || email.from?.emailAddress.address || 'Unknown',
          date: email.receivedDateTime || new Date().toISOString(),
          summary: JSON.parse(cached.summary),
          cached: true,
        });
        console.log(`✓ Using cached summary for email: ${email.subject}`);
      } else {
        // Generate new summary only if full body exists
        if (email.fullBody && email.fullBody.trim().length > 0) {
          console.log(`⚙️ Generating summary for email: ${email.subject}`);
          
          const summary = await summarizeEmail(email.fullBody, {
            subject: email.subject || 'No Subject',
            from: email.from?.emailAddress.name || email.from?.emailAddress.address || 'Unknown',
            date: email.receivedDateTime || new Date().toISOString(),
          });

          // Save to cache
          saveEmailSummary(email.id, summary, {
            subject: email.subject,
            fromEmail: email.from?.emailAddress.address,
            receivedDate: email.receivedDateTime,
            model: process.env.AZURE_OPENAI_DEPLOYMENT,
            generatedBy: userEmail,
          });

          emailsGenerated++;
          emailSummaries.push({
            emailId: email.id,
            subject: email.subject || 'No Subject',
            from: email.from?.emailAddress.name || email.from?.emailAddress.address || 'Unknown',
            date: email.receivedDateTime || new Date().toISOString(),
            summary,
            cached: false,
          });
          console.log(`✓ Generated summary for email: ${email.subject}`);
        } else {
          console.log(`⊘ No full body available for email: ${email.subject}`);
        }
      }
    } catch (error) {
      console.error(`Error processing email ${email.id}:`, error);
      // Continue with other emails
    }
  }

  // ============================================
  // Step 3: Reduce — Aggregate when item count is high
  // Groups related meeting/email summaries into thread briefs to prevent
  // attention dilution in the final brief generation call.
  // ============================================

  const MEETING_REDUCE_THRESHOLD = 3;
  const EMAIL_REDUCE_THRESHOLD = 5;

  const rawMeetingSummaries = meetingSummaries.map((m) => ({
    subject: m.subject,
    date: context.context.relatedMeetings.find((rm) => rm.id === m.meetingId)?.startDateTime || '',
    summary: m.summary,
  }));

  const rawEmailSummaries = emailSummaries.map((e) => ({
    subject: e.subject,
    from: e.summary.from,
    date: e.summary.date,
    summary: e.summary,
  }));

  let meetingThreadBriefs: string[] | undefined;
  let emailThreadBriefs: string[] | undefined;

  // Reduce meeting summaries into thread briefs when above threshold
  if (rawMeetingSummaries.length > MEETING_REDUCE_THRESHOLD) {
    console.log(`⚙️ Reducing ${rawMeetingSummaries.length} meeting summaries via thread aggregation...`);

    // Cluster by subject similarity (greedy single-pass)
    const used = new Set<number>();
    const groups: typeof rawMeetingSummaries[] = [];

    for (let i = 0; i < rawMeetingSummaries.length; i++) {
      if (used.has(i)) continue;
      const group = [rawMeetingSummaries[i]];
      used.add(i);
      for (let j = i + 1; j < rawMeetingSummaries.length; j++) {
        if (used.has(j)) continue;
        if (getSubjectSimilarity(rawMeetingSummaries[i].subject, rawMeetingSummaries[j].subject) >= 0.2) {
          group.push(rawMeetingSummaries[j]);
          used.add(j);
        }
      }
      groups.push(group);
    }

    meetingThreadBriefs = await Promise.all(groups.map((g) => aggregateMeetingThread(g)));
    console.log(`✓ Reduced to ${meetingThreadBriefs.length} meeting thread briefs`);
  }

  // Reduce email summaries into thread briefs when above threshold
  if (rawEmailSummaries.length > EMAIL_REDUCE_THRESHOLD) {
    console.log(`⚙️ Reducing ${rawEmailSummaries.length} email summaries via sender grouping...`);

    // Group by sender
    const senderGroups = new Map<string, typeof rawEmailSummaries>();
    for (const email of rawEmailSummaries) {
      const key = email.from.toLowerCase();
      if (!senderGroups.has(key)) senderGroups.set(key, []);
      senderGroups.get(key)!.push(email);
    }

    emailThreadBriefs = await Promise.all(
      Array.from(senderGroups.values()).map((g) => aggregateEmailThread(g))
    );
    console.log(`✓ Reduced to ${emailThreadBriefs.length} email thread briefs`);
  }

  // Aggregate channel messages into a short context string if present
  let channelContext: string | undefined;
  if (context.context.channelMessages && context.context.channelMessages.length > 0) {
    channelContext = context.context.channelMessages
      .slice(0, 10)
      .map((m) => {
        const author = m.from?.user?.displayName || 'Unknown';
        const text = m.body.content.replace(/<[^>]*>/g, '').slice(0, 300); // strip HTML, cap length
        return `${author}: ${text}`;
      })
      .join('\n');
  }

  // ============================================
  // Step 4: Generate Comprehensive Preparation Brief
  // ============================================
  console.log('⚙️ Generating comprehensive preparation brief...');

  const briefInput: PreparationBriefInput = {
    upcomingMeeting: {
      subject: context.meeting.subject,
      date: context.meeting.startDateTime,
      attendees: context.context.attendeeInfo.map((a) => a.displayName || ''),
    },
    relatedMeetingSummaries: rawMeetingSummaries,
    relatedEmailSummaries: rawEmailSummaries,
    meetingThreadBriefs,
    emailThreadBriefs,
    channelContext,
  };

  // Estimate total tokens for context
  const combinedContext = JSON.stringify(briefInput);
  const estimatedTokens = estimateTokens(combinedContext);
  const TOKEN_THRESHOLD = 100000; // 100k tokens (adjust as needed)

  let briefResult: { brief: string; tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } } = {
    brief: '',
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
  let approach: 'single-stage' | 'multi-stage' = 'single-stage';
  let layers = 1;

  // Determine if multi-stage summarization is needed
  const shouldUseMultiStage = multiStage && estimatedTokens > TOKEN_THRESHOLD;

  if (shouldUseMultiStage) {
    console.log(`📊 Large context detected (${estimatedTokens.toLocaleString()} tokens), using multi-stage summarization`);
    approach = 'multi-stage';

    // Multi-stage approach: Chunk summaries → intermediate summaries → final brief
    const CHUNK_SIZE = 10; // Process 10 items per chunk
    const allSummaries = [
      ...meetingSummaries.map((m) => ({
        type: 'meeting',
        content: JSON.stringify(m.summary),
        metadata: `${m.subject} (${new Date(m.date).toLocaleDateString()})`,
      })),
      ...emailSummaries.map((e) => ({
        type: 'email',
        content: JSON.stringify(e.summary),
        metadata: `${e.subject} from ${e.from} (${new Date(e.date).toLocaleDateString()})`,
      })),
    ];

    // Layer 1: Create intermediate summaries for chunks
    const intermediateSummaries: string[] = [];
    for (let i = 0; i < allSummaries.length; i += CHUNK_SIZE) {
      const chunk = allSummaries.slice(i, i + CHUNK_SIZE);

      // Create a condensed summary for this chunk
      const chunkSummary = await createPreparationBrief({
        upcomingMeeting: briefInput.upcomingMeeting,
        relatedMeetingSummaries: chunk
          .filter((c) => c.type === 'meeting')
          .map((c) => JSON.parse(c.content)),
        relatedEmailSummaries: chunk
          .filter((c) => c.type === 'email')
          .map((c) => JSON.parse(c.content)),
      });

      intermediateSummaries.push(chunkSummary.brief);
      console.log(`✓ Generated intermediate summary ${intermediateSummaries.length}/${Math.ceil(allSummaries.length / CHUNK_SIZE)}`);
    }

    layers = 2;

    // Layer 2: If we still have multiple intermediate summaries, combine them
    if (intermediateSummaries.length > 1) {
      console.log(`⚙️  Combining ${intermediateSummaries.length} intermediate summaries into final brief...`);

      // Create a meta-brief from intermediate summaries
      const metaBriefInput: PreparationBriefInput = {
        upcomingMeeting: briefInput.upcomingMeeting,
        relatedMeetingSummaries: intermediateSummaries.map((summary, idx) => ({
          subject: `Summary Group ${idx + 1}`,
          date: new Date().toISOString(),
          summary: {
            subject: `Summary Group ${idx + 1}`,
            date: new Date().toISOString(),
            keyDecisions: [],
            actionItems: [],
            metrics: [],
            nextSteps: [],
            fullSummary: summary,
          },
        })),
        relatedEmailSummaries: [],
      };

      briefResult = await createPreparationBrief(metaBriefInput);
      console.log(`✓ Final brief created (${layers} layers)`);
    } else {
      // Only one intermediate summary, use it as the final brief
      briefResult = { brief: intermediateSummaries[0], tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    }
  } else {
    // Single-stage: Direct summarization
    if (estimatedTokens > TOKEN_THRESHOLD && !multiStage) {
      console.log(`⚠️  Large context (${estimatedTokens.toLocaleString()} tokens) but multi-stage disabled. Consider enabling it.`);
    }
    briefResult = await createPreparationBrief(briefInput);
  }

  const processingTimeMs = Date.now() - startTime;

  console.log('✅ Preparation pipeline complete:', {
    processingTimeMs,
    approach,
    layers,
    meetingsProcessed: meetingSummaries.length,
    emailsProcessed: emailSummaries.length,
    cached: meetingsCached + emailsCached,
    generated: meetingsGenerated + emailsGenerated,
    briefTokens: briefResult.tokenUsage.totalTokens,
    reducedMeetingThreads: meetingThreadBriefs?.length ?? 0,
    reducedEmailThreads: emailThreadBriefs?.length ?? 0,
  });

  return {
    brief: briefResult.brief,
    meetingSummaries,
    emailSummaries,
    stats: {
      totalMeetings: context.context.relatedMeetings.length,
      meetingsCached,
      meetingsGenerated,
      totalEmails: context.context.relatedEmails.length,
      emailsCached,
      emailsGenerated,
      processingTimeMs,
      briefTokenUsage: briefResult.tokenUsage,
      reducedMeetingThreads: meetingThreadBriefs?.length ?? 0,
      reducedEmailThreads: emailThreadBriefs?.length ?? 0,
    },
    approach,
    layers,
  };
}

// ============================================
// Cache Management Utilities
// ============================================

export function getCacheStats(): {
  totalMeetingSummaries: number;
  totalEmailSummaries: number;
} {
  // This could be extended to query the database for stats
  return {
    totalMeetingSummaries: 0,
    totalEmailSummaries: 0,
  };
}

export function clearCache(type: 'meetings' | 'emails' | 'all'): { cleared: number } {
  // This could be extended to actually clear the cache
  // For now, just a placeholder
  console.log(`Clearing cache: ${type}`);
  return { cleared: 0 };
}
