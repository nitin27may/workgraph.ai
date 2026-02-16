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

// Custom agent for corporate proxies with self-signed certs
const agent = new https.Agent({ rejectUnauthorized: false });

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY!,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
  httpAgent: agent,
} as ConstructorParameters<typeof AzureOpenAI>[0] & { httpAgent: https.Agent });

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
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: TEMPERATURE_SUMMARIZE,
      max_tokens: MAX_TOKENS_SUMMARIZE,
      response_format: { type: "json_object" },
    });

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
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: TEMPERATURE_SUMMARIZE,
      max_tokens: MAX_TOKENS_EMAIL,
      response_format: { type: "json_object" },
    });

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
}

export async function createPreparationBrief(
  input: PreparationBriefInput
): Promise<string> {
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

  const meetingContext = input.relatedMeetingSummaries.map((m, idx) =>
    `Meeting ${idx + 1}: ${m.subject} (${new Date(m.date).toLocaleDateString()})
- Key Decisions: ${m.summary.keyDecisions?.slice(0, 3).join('; ') || 'None'}
- Action Items: ${m.summary.actionItems?.slice(0, 3).map(a => `${a.owner}: ${a.task}`).join('; ') || 'None'}
- Summary: ${m.summary.fullSummary || 'No summary available'}`
  ).join('\n\n');

  const emailContext = input.relatedEmailSummaries.map((e, idx) =>
    `Email ${idx + 1}: ${e.subject} from ${e.from} (${new Date(e.date).toLocaleDateString()})
- Sentiment: ${e.summary.sentiment}
- Key Points: ${e.summary.keyPoints?.slice(0, 3).join('; ') || 'None'}
- Action Items: ${e.summary.actionItems?.join('; ') || 'None'}
- Summary: ${e.summary.summary}`
  ).join('\n\n');

  const userPrompt = `Prepare a brief for this upcoming meeting:

**Upcoming Meeting**
Subject: ${input.upcomingMeeting.subject}
Date: ${new Date(input.upcomingMeeting.date).toLocaleString()}
Attendees: ${input.upcomingMeeting.attendees.join(', ')}

**Related Previous Meetings**
${meetingContext || 'No related meetings found'}

**Related Emails**
${emailContext || 'No related emails found'}

Create a comprehensive preparation brief that helps the attendee walk into this meeting fully informed.`;

  try {
    const model = process.env.AZURE_OPENAI_DEPLOYMENT!;
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: TEMPERATURE_PREP,
      max_tokens: MAX_TOKENS_PREP,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    console.log('Preparation Brief Generated:', {
      meeting: input.upcomingMeeting.subject,
      tokens: response.usage?.total_tokens ?? 0,
      relatedMeetings: input.relatedMeetingSummaries.length,
      relatedEmails: input.relatedEmailSummaries.length,
      model
    });

    return content;
  } catch (error) {
    console.error("Error creating preparation brief with OpenAI:", error);
    throw new Error("Failed to generate preparation brief");
  }
}
