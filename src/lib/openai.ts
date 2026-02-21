import { AzureOpenAI } from "openai";
import type { MeetingSummary, SummarizationResult, TokenUsage } from "@/types/meeting";
import https from "https";
import { getUserDefaultPrompt, calculateCost, PRICING } from "./db";
import {
  MAX_TOKENS_SUMMARIZE,
  MAX_TOKENS_EMAIL,
  MAX_TOKENS_PREP,
  TEMPERATURE_SUMMARIZE,
  TEMPERATURE_PREP,
} from "./constants";
import { withRetry } from "./openai-retry";

// Custom agent for corporate proxies with self-signed certs
export const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let _client: AzureOpenAI | null = null;

export function getOpenAIClient(): AzureOpenAI {
  if (!_client) {
    _client = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY!,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
      httpAgent: httpsAgent,
    } as ConstructorParameters<typeof AzureOpenAI>[0] & { httpAgent: https.Agent });
  }
  return _client;
}

function calculateMeetingDuration(startDateTime: string, endDateTime?: string): number | null {
  if (!startDateTime || !endDateTime) return null;
  try {
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    const durationMs = end.getTime() - start.getTime();
    return Math.round(durationMs / 60000);
  } catch {
    return null;
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function logSummarizationMetrics(metrics: SummarizationResult['metrics']): void {
  const costs = calculateCost(metrics.tokenUsage);

  const logData = {
    type: 'SUMMARIZATION_METRICS',
    ...metrics,
    costEstimate: costs,
  };

  console.log('Summarization Metrics:', JSON.stringify(logData, null, 2));
}

export async function summarizeTranscript(
  transcript: string,
  meetingSubject: string,
  meetingDate: string,
  endDateTime?: string,
  userInfo?: { name?: string; email?: string }
): Promise<SummarizationResult> {
  const startTime = Date.now();

  let systemPrompt = `You are a meeting summarizer for enterprise clients.

Extract and structure the following from the transcript:
1. Key decisions made (max 5)
2. Action items with owners and deadlines
3. Important metrics/numbers mentioned
4. Next steps

Return ONLY valid JSON with this exact structure:
{
  "keyDecisions": ["decision1", "decision2"],
  "actionItems": [
    {"owner": "John", "task": "Follow up with client", "deadline": "Friday"}
  ],
  "metrics": ["1,247 claims processed", "3.2 days average turnaround"],
  "nextSteps": ["step1", "step2"],
  "fullSummary": "narrative summary here"
}

Be concise. Focus on actionable information. If a field has no data, return empty array.`;

  let userPromptTemplate = `Meeting: {{meetingSubject}}
Date: {{meetingDate}}

Transcript:
{{transcript}}`;

  if (userInfo?.email) {
    try {
      const promptTemplate = getUserDefaultPrompt(userInfo.email);
      if (promptTemplate) {
        systemPrompt = promptTemplate.systemPrompt;
        userPromptTemplate = promptTemplate.userPromptTemplate;
      }
    } catch (error) {
      console.error("Error fetching user prompt template, using default:", error);
    }
  }

  const userPrompt = userPromptTemplate
    .replace(/\{\{meetingSubject\}\}/g, meetingSubject)
    .replace(/\{\{meetingDate\}\}/g, meetingDate)
    .replace(/\{\{transcript\}\}/g, transcript);

  try {
    const model = process.env.AZURE_OPENAI_DEPLOYMENT!;
    const response = await withRetry(() =>
      getOpenAIClient().chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: TEMPERATURE_SUMMARIZE,
        max_tokens: MAX_TOKENS_SUMMARIZE,
        response_format: { type: "json_object" },
      })
    );

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);
    const processingTimeMs = Date.now() - startTime;

    const tokenUsage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    const metrics: SummarizationResult['metrics'] = {
      meetingSubject,
      meetingDate,
      meetingDurationMinutes: calculateMeetingDuration(meetingDate, endDateTime),
      transcriptLength: transcript.length,
      transcriptWordCount: countWords(transcript),
      tokenUsage,
      processingTimeMs,
      model,
      timestamp: new Date().toISOString(),
      requestedBy: userInfo?.name,
      requestedByEmail: userInfo?.email,
    };

    logSummarizationMetrics(metrics);

    const summary: MeetingSummary = {
      subject: meetingSubject,
      date: meetingDate,
      ...parsed,
    };

    return { summary, metrics };
  } catch (error) {
    console.error("Error summarizing with OpenAI:", error);
    throw new Error("Failed to generate summary");
  }
}

// ============================================
// Chunked Transcript Summarization (MapReduce)
// Long transcripts (>12k chars ≈ 4k tokens) are processed in rolling windows
// to prevent key details from being truncated in a single context window.
// ============================================

const TRANSCRIPT_CHUNK_SIZE = 10000; // chars — ~2500 tokens, leaves room for prompt+output

function chunkTranscript(transcript: string): string[] {
  if (transcript.length <= TRANSCRIPT_CHUNK_SIZE) return [transcript];

  const chunks: string[] = [];
  const overlap = 600; // retain last 600 chars of previous chunk for continuity
  let start = 0;

  while (start < transcript.length) {
    const end = Math.min(start + TRANSCRIPT_CHUNK_SIZE, transcript.length);
    chunks.push(transcript.slice(start, end));
    if (end === transcript.length) break;
    start = end - overlap;
  }

  return chunks;
}

export async function summarizeTranscriptInChunks(
  transcript: string,
  meetingSubject: string,
  meetingDate: string,
  endDateTime?: string,
  userInfo?: { name?: string; email?: string }
): Promise<SummarizationResult> {
  // Short transcripts go through the normal single-pass path
  if (transcript.length <= TRANSCRIPT_CHUNK_SIZE) {
    return summarizeTranscript(transcript, meetingSubject, meetingDate, endDateTime, userInfo);
  }

  const chunks = chunkTranscript(transcript);
  console.log(`Long transcript (${transcript.length} chars) → ${chunks.length} chunks`);

  const model = process.env.AZURE_OPENAI_DEPLOYMENT!;
  let rollingContext = "";

  // Intermediate chunks: produce a rolling context summary (not the final structured output)
  for (let i = 0; i < chunks.length - 1; i++) {
    const chunkContent = rollingContext
      ? `Prior discussion summary:\n${rollingContext}\n\nContinuation (part ${i + 1}/${chunks.length}):\n${chunks[i]}`
      : `Meeting transcript part ${i + 1}/${chunks.length}:\n${chunks[i]}`;

    const response = await withRetry(() =>
      getOpenAIClient().chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "Summarize the key points, decisions, and actions from this meeting transcript excerpt in 4-6 sentences. Focus on specifics — names, numbers, commitments. This summary will provide context for processing the remainder of the transcript.",
          },
          { role: "user", content: chunkContent },
        ],
        temperature: TEMPERATURE_SUMMARIZE,
        max_tokens: 450,
      })
    );

    rollingContext = response.choices[0].message.content || rollingContext;
    console.log(`Transcript chunk ${i + 1}/${chunks.length - 1} condensed`);
  }

  // Final chunk: incorporate rolling context and produce the full structured summary
  const lastChunk = chunks[chunks.length - 1];
  const finalTranscript = rollingContext
    ? `[Context from earlier in the meeting:\n${rollingContext}]\n\n[Final portion of transcript]:\n${lastChunk}`
    : lastChunk;

  return summarizeTranscript(finalTranscript, meetingSubject, meetingDate, endDateTime, userInfo);
}

// ============================================
// Thread Aggregation (Reduce Step)
// Collapses multiple related summaries into a single compact brief
// before passing to the final preparation brief generator.
// ============================================

export async function aggregateMeetingThread(
  meetings: Array<{ subject: string; date: string; summary: MeetingSummary }>
): Promise<string> {
  if (meetings.length === 0) return "";
  if (meetings.length === 1) {
    const m = meetings[0];
    return `${m.subject}: ${m.summary.fullSummary || ""}`;
  }

  const model = process.env.AZURE_OPENAI_DEPLOYMENT!;
  const context = meetings
    .map(
      (m, i) =>
        `Meeting ${i + 1}: ${m.subject} (${new Date(m.date).toLocaleDateString()})\n` +
        `Decisions: ${m.summary.keyDecisions?.join("; ") || "none"}\n` +
        `Actions: ${m.summary.actionItems?.map((a) => `${a.owner}: ${a.task}`).join("; ") || "none"}\n` +
        `Summary: ${m.summary.fullSummary || ""}`
    )
    .join("\n\n");

  const response = await withRetry(() =>
    getOpenAIClient().chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Synthesize these related meeting summaries into one tight paragraph (4-6 sentences). Capture the arc of decisions made, open issues, and outstanding actions. Be specific — include names and numbers where present.",
        },
        { role: "user", content: context },
      ],
      temperature: TEMPERATURE_PREP,
      max_tokens: 300,
    })
  );

  return response.choices[0].message.content || "";
}

export async function aggregateEmailThread(
  emails: Array<{ subject: string; from: string; date: string; summary: EmailSummary }>
): Promise<string> {
  if (emails.length === 0) return "";
  if (emails.length === 1) {
    const e = emails[0];
    return `${e.subject} from ${e.from}: ${e.summary.summary || ""}`;
  }

  const model = process.env.AZURE_OPENAI_DEPLOYMENT!;
  const context = emails
    .map(
      (e, i) =>
        `Email ${i + 1}: "${e.subject}" from ${e.from} (${new Date(e.date).toLocaleDateString()})\n` +
        `Sentiment: ${e.summary.sentiment}\n` +
        `Key points: ${e.summary.keyPoints?.join("; ") || "none"}\n` +
        `Actions: ${e.summary.actionItems?.join("; ") || "none"}\n` +
        `Summary: ${e.summary.summary}`
    )
    .join("\n\n");

  const response = await withRetry(() =>
    getOpenAIClient().chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Synthesize these related email summaries into one tight paragraph (3-5 sentences). Capture the main topic, overall sentiment, and any pending actions. Be concise and direct.",
        },
        { role: "user", content: context },
      ],
      temperature: TEMPERATURE_PREP,
      max_tokens: 250,
    })
  );

  return response.choices[0].message.content || "";
}

// ============================================
// Email Summarization
// ============================================

export interface EmailSummary {
  subject: string;
  from: string;
  date: string;
  keyPoints: string[];
  actionItems: string[];
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  summary: string;
}

export async function summarizeEmail(
  emailContent: string,
  metadata: {
    subject: string;
    from: string;
    date: string;
  }
): Promise<EmailSummary> {
  const systemPrompt = `You are an email summarizer for enterprise clients.

Extract and structure the following from the email:
1. Key points (max 5 most important points)
2. Action items mentioned
3. Overall sentiment (positive/neutral/negative/urgent)
4. Brief summary (2-3 sentences)

Return ONLY valid JSON with this exact structure:
{
  "subject": "email subject",
  "from": "sender name",
  "date": "date",
  "keyPoints": ["point1", "point2"],
  "actionItems": ["action1", "action2"],
  "sentiment": "neutral",
  "summary": "brief summary here"
}

Be concise. Focus on actionable information. If a field has no data, return empty array.`;

  const userPrompt = `Email Subject: ${metadata.subject}
From: ${metadata.from}
Date: ${metadata.date}

Email Content:
${emailContent}`;

  try {
    const model = process.env.AZURE_OPENAI_DEPLOYMENT!;
    const response = await withRetry(() =>
      getOpenAIClient().chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: TEMPERATURE_SUMMARIZE,
        max_tokens: MAX_TOKENS_EMAIL,
        response_format: { type: "json_object" },
      })
    );

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content) as EmailSummary;

    console.log('Email Summarization:', {
      subject: metadata.subject,
      tokens: response.usage?.total_tokens ?? 0,
      model
    });

    return parsed;
  } catch (error) {
    console.error("Error summarizing email with OpenAI:", error);
    throw new Error("Failed to generate email summary");
  }
}

// ============================================
// Preparation Brief Generation (Meta-summary)
// ============================================

export interface PreparationBriefInput {
  upcomingMeeting: {
    subject: string;
    date: string;
    attendees: string[];
  };
  relatedMeetingSummaries: Array<{
    subject: string;
    date: string;
    summary: MeetingSummary;
  }>;
  relatedEmailSummaries: Array<{
    subject: string;
    from: string;
    date: string;
    summary: EmailSummary;
  }>;
  // Pre-aggregated briefs produced by the reduce step — used instead of raw summaries
  // when there are too many items to pass directly (prevents attention dilution)
  meetingThreadBriefs?: string[];
  emailThreadBriefs?: string[];
  channelContext?: string; // aggregated Teams channel message context
}

export interface PreparationBriefResult {
  brief: string;
  tokenUsage: TokenUsage;
}

export async function createPreparationBrief(
  input: PreparationBriefInput
): Promise<PreparationBriefResult> {
  const systemPrompt = `You are an executive meeting preparation assistant.

Your job is to create a comprehensive yet concise preparation brief for an upcoming meeting.

The brief should include:
1. **Context**: What has been discussed recently in related meetings and emails
2. **Key Decisions & Actions**: Important decisions made and action items from previous interactions
3. **Open Issues**: Unresolved topics or pending items that may come up
4. **Recommended Focus**: What the attendee should prioritize or prepare for
5. **Quick Facts**: Important metrics, dates, or data points to remember

IMPORTANT: Format your response in proper Markdown:
- Use ## for section headers
- Use **bold** for emphasis
- Use - or * for bullet points
- Use proper line breaks between sections
- Use > for important callouts or quotes

Be concise but comprehensive. Focus on actionable insights that will help the attendee be well-prepared.`;

  // Use pre-aggregated thread briefs when available (reduce step applied upstream)
  // This prevents attention dilution when there are many related items.
  let meetingContext: string;
  if (input.meetingThreadBriefs && input.meetingThreadBriefs.length > 0) {
    meetingContext = input.meetingThreadBriefs
      .map((brief, i) => `Thread ${i + 1}:\n${brief}`)
      .join("\n\n");
  } else {
    meetingContext = input.relatedMeetingSummaries
      .map(
        (m, idx) =>
          `Meeting ${idx + 1}: ${m.subject} (${new Date(m.date).toLocaleDateString()})\n` +
          `- Key Decisions: ${m.summary.keyDecisions?.slice(0, 3).join("; ") || "None"}\n` +
          `- Action Items: ${m.summary.actionItems?.slice(0, 3).map((a) => `${a.owner}: ${a.task}`).join("; ") || "None"}\n` +
          `- Summary: ${m.summary.fullSummary || "No summary available"}`
      )
      .join("\n\n");
  }

  let emailContext: string;
  if (input.emailThreadBriefs && input.emailThreadBriefs.length > 0) {
    emailContext = input.emailThreadBriefs
      .map((brief, i) => `Thread ${i + 1}:\n${brief}`)
      .join("\n\n");
  } else {
    emailContext = input.relatedEmailSummaries
      .map(
        (e, idx) =>
          `Email ${idx + 1}: ${e.subject} from ${e.from} (${new Date(e.date).toLocaleDateString()})\n` +
          `- Sentiment: ${e.summary.sentiment}\n` +
          `- Key Points: ${e.summary.keyPoints?.slice(0, 3).join("; ") || "None"}\n` +
          `- Action Items: ${e.summary.actionItems?.join("; ") || "None"}\n` +
          `- Summary: ${e.summary.summary}`
      )
      .join("\n\n");
  }

  const channelSection = input.channelContext
    ? `\n\n**Teams Channel Context**\n${input.channelContext}`
    : "";

  const userPrompt = `Prepare a brief for this upcoming meeting:

**Upcoming Meeting**
Subject: ${input.upcomingMeeting.subject}
Date: ${new Date(input.upcomingMeeting.date).toLocaleString()}
Attendees: ${input.upcomingMeeting.attendees.join(", ")}

**Related Previous Meetings**
${meetingContext || "No related meetings found"}

**Related Emails**
${emailContext || "No related emails found"}${channelSection}

Create a comprehensive preparation brief that helps the attendee walk into this meeting fully informed.`;

  try {
    const model = process.env.AZURE_OPENAI_DEPLOYMENT!;
    const response = await withRetry(() =>
      getOpenAIClient().chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: TEMPERATURE_PREP,
        max_tokens: MAX_TOKENS_PREP,
      })
    );

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const tokenUsage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    console.log("Preparation Brief Generated:", {
      meeting: input.upcomingMeeting.subject,
      tokens: tokenUsage.totalTokens,
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
      relatedMeetings: input.relatedMeetingSummaries.length,
      relatedEmails: input.relatedEmailSummaries.length,
      reducedMeetingThreads: input.meetingThreadBriefs?.length ?? 0,
      reducedEmailThreads: input.emailThreadBriefs?.length ?? 0,
      model,
    });

    return { brief: content, tokenUsage };
  } catch (error) {
    console.error("Error creating preparation brief with OpenAI:", error);
    throw new Error("Failed to generate preparation brief");
  }
}
