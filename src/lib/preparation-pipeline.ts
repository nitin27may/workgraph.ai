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
  summarizeTranscript,
  summarizeEmail,
  createPreparationBrief,
  type EmailSummary,
  type PreparationBriefInput,
} from "./openai";
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
  };
}

export async function generateMeetingPreparations(
  context: MeetingPrep,
  userEmail: string
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
          console.log(`⚙️ Generating summary for: ${meeting.subject}`);
          
          const result = await summarizeTranscript(
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
  // Step 3: Generate Comprehensive Preparation Brief
  // ============================================
  console.log('⚙️ Generating comprehensive preparation brief...');

  const briefInput: PreparationBriefInput = {
    upcomingMeeting: {
      subject: context.meeting.subject,
      date: context.meeting.startDateTime,
      attendees: context.context.attendeeInfo.map((a) => a.displayName || ''),
    },
    relatedMeetingSummaries: meetingSummaries.map((m) => ({
      subject: m.subject,
      date: context.context.relatedMeetings.find((rm) => rm.id === m.meetingId)?.startDateTime || '',
      summary: m.summary,
    })),
    relatedEmailSummaries: emailSummaries.map((e) => ({
      subject: e.subject,
      from: e.summary.from,
      date: e.summary.date,
      summary: e.summary,
    })),
  };

  const brief = await createPreparationBrief(briefInput);

  const processingTimeMs = Date.now() - startTime;

  console.log('✅ Preparation pipeline complete:', {
    processingTimeMs,
    meetingsProcessed: meetingSummaries.length,
    emailsProcessed: emailSummaries.length,
    cached: meetingsCached + emailsCached,
    generated: meetingsGenerated + emailsGenerated,
  });

  return {
    brief,
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
    },
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
