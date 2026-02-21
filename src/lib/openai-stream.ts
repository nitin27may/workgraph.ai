import { getOpenAIClient } from "./openai";
import { getUserDefaultPrompt } from "./db";
import { withRetry } from "./openai-retry";
import {
  MAX_TOKENS_SUMMARIZE,
  TEMPERATURE_SUMMARIZE,
} from "./constants";

export type StreamEvent =
  | { type: "status"; stage: string }
  | { type: "summary"; delta: string }
  | { type: "structured"; data: Record<string, unknown> }
  | { type: "metrics"; data: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" };

export async function* summarizeTranscriptStream(
  transcript: string,
  meetingSubject: string,
  meetingDate: string,
  endDateTime?: string,
  userInfo?: { name?: string; email?: string }
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();

  // -- Build prompts (same logic as non-streaming) --
  let systemPrompt = `You are a meeting summarizer for enterprise clients.

First, write a comprehensive narrative summary of the meeting.

Then, on a new line, output a JSON block wrapped in \`\`\`json and \`\`\` fences with this exact structure:
{
  "keyDecisions": ["decision1", "decision2"],
  "actionItems": [
    {"owner": "John", "task": "Follow up with client", "deadline": "Friday"}
  ],
  "metrics": ["1,247 claims processed", "3.2 days average turnaround"],
  "nextSteps": ["step1", "step2"]
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
        // For streaming, we modify the system prompt to produce narrative + JSON
        // rather than pure JSON, so we prepend streaming instructions
        systemPrompt = `${promptTemplate.systemPrompt}

IMPORTANT: First write the full narrative summary as plain text. Then output the structured data as a JSON block wrapped in \`\`\`json and \`\`\` fences.`;
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

  yield { type: "status", stage: "generating" };

  try {
    const model = process.env.AZURE_OPENAI_DEPLOYMENT!;

    const stream = await withRetry(() =>
      getOpenAIClient().chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: TEMPERATURE_SUMMARIZE,
        max_tokens: MAX_TOKENS_SUMMARIZE,
        stream: true,
        stream_options: { include_usage: true },
      })
    );

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    for await (const chunk of stream) {
      // Capture usage from the final chunk
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
        totalTokens = chunk.usage.total_tokens ?? 0;
      }

      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        yield { type: "summary", delta };
      }
    }

    // -- Parse structured data from the accumulated content --
    const structured = extractStructuredData(fullContent);
    const narrativeSummary = extractNarrativeSummary(fullContent);

    yield {
      type: "structured",
      data: {
        subject: meetingSubject,
        date: meetingDate,
        fullSummary: narrativeSummary,
        ...structured,
      },
    };

    const processingTimeMs = Date.now() - startTime;
    yield {
      type: "metrics",
      data: {
        tokenUsage: { promptTokens, completionTokens, totalTokens },
        processingTimeMs,
        model,
        meetingSubject,
        meetingDate,
      },
    };

    yield { type: "done" };
  } catch (error) {
    console.error("Error in streaming summarization:", error);
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "Failed to generate summary",
    };
  }
}

function extractStructuredData(content: string): Record<string, unknown> {
  // Try to extract JSON from ```json ... ``` fences
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: try to find any JSON object in the content
  const jsonObjectMatch = content.match(/\{[\s\S]*"keyDecisions"[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0]);
    } catch {
      // Fall through
    }
  }

  return {
    keyDecisions: [],
    actionItems: [],
    metrics: [],
    nextSteps: [],
  };
}

function extractNarrativeSummary(content: string): string {
  // Remove the JSON block to get just the narrative
  const withoutJson = content.replace(/```json[\s\S]*?```/, "").trim();
  // Also remove any trailing JSON object if fences weren't used
  const withoutTrailingJson = withoutJson.replace(/\{[\s\S]*"keyDecisions"[\s\S]*\}$/, "").trim();
  return withoutTrailingJson || content;
}
