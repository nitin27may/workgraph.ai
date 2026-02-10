# PostgreSQL + pgvector Migration Plan

## Overview

This document outlines the complete plan to migrate from SQLite to PostgreSQL with pgvector for intelligent meeting summarization with contextual awareness.

---

## Goals

1. **Enable Vector Similarity Search**: Store and search embeddings across meetings, emails, chats, and files
2. **Contextual Intelligence**: Link related content automatically using semantic similarity
3. **Incremental Processing**: Only process new content to reduce API costs by 70-80%
4. **Smart Meeting Preparation**: Generate context-aware briefs with historical data
5. **Interactive Q&A**: Enable post-meeting questions with source attribution

---

## Database Architecture

### Current State (SQLite)
```
meetings table:
- Basic meeting metadata
- No embeddings
- No relationships
- Isolated summaries
```

### Target State (PostgreSQL + pgvector)
```
Core Tables:
├── meetings (with embedding vector)
├── emails (with embedding vector)
├── chats (with embedding vector)
├── files (with embedding vector)
├── tasks (with embedding vector)
├── content_chunks (for large documents)
├── content_relationships (auto-discovered links)
├── meeting_participants
└── prompt_templates (existing)
```

---

## Detailed Schema Changes

### New Tables to Create

#### 1. **meetings** (Enhanced)
```sql
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  graph_id TEXT UNIQUE,
  online_meeting_id TEXT UNIQUE,
  subject TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  transcript TEXT,
  summary TEXT,
  recording_url TEXT,
  join_web_url TEXT,
  has_transcript BOOLEAN DEFAULT false,
  organizer_email TEXT,
  organizer_name TEXT,
  embedding vector(1536),  -- NEW: Azure OpenAI embedding
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX meetings_user_id_idx ON meetings(user_id);
CREATE INDEX meetings_start_time_idx ON meetings(start_time);
CREATE INDEX meetings_embedding_idx ON meetings 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### 2. **emails** (New)
```sql
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  graph_id TEXT UNIQUE NOT NULL,
  subject TEXT,
  from_email TEXT,
  from_name TEXT,
  to_emails TEXT[],
  cc_emails TEXT[],
  body_content TEXT,
  body_preview TEXT,
  received_at TIMESTAMP NOT NULL,
  has_attachments BOOLEAN DEFAULT false,
  importance TEXT,  -- 'low', 'normal', 'high'
  is_read BOOLEAN DEFAULT false,
  conversation_id TEXT,
  embedding vector(1536),  -- Embedding of subject + body
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX emails_user_id_idx ON emails(user_id);
CREATE INDEX emails_received_at_idx ON emails(received_at DESC);
CREATE INDEX emails_conversation_id_idx ON emails(conversation_id);
CREATE INDEX emails_embedding_idx ON emails 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### 3. **chats** (New)
```sql
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  graph_id TEXT UNIQUE NOT NULL,
  chat_id TEXT NOT NULL,
  chat_type TEXT,  -- 'oneOnOne', 'group', 'meeting'
  message_text TEXT NOT NULL,
  from_user_id TEXT,
  from_user_name TEXT,
  from_user_email TEXT,
  sent_at TIMESTAMP NOT NULL,
  message_type TEXT,  -- 'message', 'systemEventMessage'
  importance TEXT,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX chats_user_id_idx ON chats(user_id);
CREATE INDEX chats_chat_id_idx ON chats(chat_id);
CREATE INDEX chats_sent_at_idx ON chats(sent_at DESC);
CREATE INDEX chats_embedding_idx ON chats 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### 4. **files** (New)
```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  graph_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  content_extracted TEXT,
  created_by_email TEXT,
  created_by_name TEXT,
  modified_at TIMESTAMP,
  web_url TEXT,
  download_url TEXT,
  parent_folder_id TEXT,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX files_user_id_idx ON files(user_id);
CREATE INDEX files_modified_at_idx ON files(modified_at DESC);
CREATE INDEX files_mime_type_idx ON files(mime_type);
CREATE INDEX files_embedding_idx ON files 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### 5. **tasks** (Enhanced)
```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  graph_id TEXT UNIQUE,
  list_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT,
  due_date TIMESTAMP,
  completed_date TIMESTAMP,
  priority TEXT,
  categories TEXT[],
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX tasks_user_id_idx ON tasks(user_id);
CREATE INDEX tasks_status_idx ON tasks(status);
CREATE INDEX tasks_due_date_idx ON tasks(due_date);
CREATE INDEX tasks_embedding_idx ON tasks 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### 6. **content_chunks** (New - for large documents)
```sql
CREATE TABLE content_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,  -- 'meeting', 'email', 'chat', 'file'
  source_id UUID NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_count INT,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source_id, source_type, chunk_index)
);

-- Indexes
CREATE INDEX content_chunks_source_idx ON content_chunks(source_id, source_type);
CREATE INDEX content_chunks_embedding_idx ON content_chunks 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### 7. **content_relationships** (New - auto-discovered)
```sql
CREATE TABLE content_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  related_type TEXT NOT NULL,
  related_id UUID NOT NULL,
  similarity_score FLOAT,  -- 0.0 to 1.0
  relationship_type TEXT,  -- 'similar', 'referenced', 'follow_up', 'context'
  context_metadata JSONB,  -- Store additional context
  discovered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source_id, source_type, related_id, related_type)
);

-- Indexes
CREATE INDEX content_relationships_source_idx ON content_relationships(source_id, source_type);
CREATE INDEX content_relationships_related_idx ON content_relationships(related_id, related_type);
CREATE INDEX content_relationships_similarity_idx ON content_relationships(similarity_score DESC);
```

#### 8. **meeting_participants** (Enhanced)
```sql
CREATE TABLE meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT,  -- 'accepted', 'declined', 'tentative', 'none'
  type TEXT,  -- 'required', 'optional', 'organizer'
  did_attend BOOLEAN DEFAULT false,
  attendance_duration_seconds INT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(meeting_id, email)
);

-- Indexes
CREATE INDEX meeting_participants_meeting_id_idx ON meeting_participants(meeting_id);
CREATE INDEX meeting_participants_email_idx ON meeting_participants(email);
```

#### 9. **sync_state** (New - track incremental sync)
```sql
CREATE TABLE sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,  -- 'email', 'chat', 'calendar', 'files'
  last_sync_at TIMESTAMP NOT NULL,
  last_sync_cursor TEXT,  -- Delta token or continuation token
  items_synced INT DEFAULT 0,
  sync_status TEXT,  -- 'success', 'partial', 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, source_type)
);

-- Indexes
CREATE INDEX sync_state_user_id_idx ON sync_state(user_id);
CREATE INDEX sync_state_last_sync_at_idx ON sync_state(last_sync_at);
```

#### 10. **prompt_templates** (Migrated from SQLite)
```sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,  -- NULL for global templates
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_global BOOLEAN DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX prompt_templates_user_id_idx ON prompt_templates(user_id);
CREATE INDEX prompt_templates_is_default_idx ON prompt_templates(is_default);
```

---

## Data Migration Strategy

### Phase 1: Initial Setup
```bash
# 1. Backup existing SQLite database
cp meeting-summarizer/web/usage.db meeting-summarizer/web/usage.db.backup

# 2. Start PostgreSQL with pgvector
docker-compose up -d postgres

# 3. Run migrations
npm run db:migrate
```

### Phase 2: Data Migration Script
```typescript
// scripts/migrate-to-postgres.ts

async function migrateData() {
  // 1. Migrate prompt templates from SQLite to PostgreSQL
  const templates = await getSQLitePromptTemplates();
  await insertPromptTemplatesToPostgres(templates);
  
  // 2. Migrate usage records (optional - for historical tracking)
  const usageRecords = await getSQLiteUsageRecords();
  await insertUsageRecordsToPostgres(usageRecords);
  
  console.log('Migration completed successfully!');
}
```

### Phase 3: Incremental Sync
- Set up background jobs to sync new content
- Store sync cursors for delta queries
- Only process new/updated items

---

## Implementation Plan

### Phase 1: Infrastructure Setup

#### Docker & Database Setup
- [ ] Add PostgreSQL service to `docker-compose.yml`
- [ ] Install pgvector extension
- [ ] Create database initialization script
- [ ] Set up environment variables

**Files to Create/Modify:**
- `docker-compose.yml` - Modify
- `.env.local` - Add DATABASE_URL
- `.env.example` - Add DATABASE_URL template

#### Schema Creation
- [ ] Create migration scripts for all new tables
- [ ] Add indexes for vector search
- [ ] Set up foreign key relationships
- [ ] Create database helper functions

**New Files:**
- `src/lib/db/postgres.ts` - Database connection pool
- `src/lib/db/migrations/001_initial_schema.sql`
- `src/lib/db/migrations/002_add_indexes.sql`
- `src/lib/db/models/meeting.ts`
- `src/lib/db/models/email.ts`
- `src/lib/db/models/chat.ts`
- `src/lib/db/models/file.ts`

#### Data Migration
- [ ] Create SQLite → PostgreSQL migration script
- [ ] Migrate prompt templates
- [ ] Verify data integrity
- [ ] Test rollback procedures

**New Files:**
- `scripts/migrate-to-postgres.ts`
- `scripts/verify-migration.ts`

---

### Phase 2: Embedding Service

#### Azure OpenAI Integration
- [ ] Create embedding service
- [ ] Implement batching for efficiency
- [ ] Add retry logic and error handling
- [ ] Cache embeddings in database

**New Files:**
- `src/lib/embeddings/service.ts`
- `src/lib/embeddings/types.ts`
- `src/lib/embeddings/cache.ts`

**Code Example:**
```typescript
// src/lib/embeddings/service.ts

import { AzureOpenAI } from 'openai';

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiVersion: '2024-02-15-preview',
  });

  try {
    const response = await client.embeddings.create({
      model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-ada-002',
      input: text.substring(0, 8191), // Max tokens for ada-002
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiVersion: '2024-02-15-preview',
  });

  const response = await client.embeddings.create({
    model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-ada-002',
    input: texts.map(t => t.substring(0, 8191)),
  });
  
  return response.data.map(d => d.embedding);
}
```

#### Background Processing Jobs
- [ ] Create job queue for processing
- [ ] Implement incremental sync for emails
- [ ] Implement incremental sync for chats
- [ ] Implement incremental sync for files

**New Files:**
- `src/lib/jobs/sync-emails.ts`
- `src/lib/jobs/sync-chats.ts`
- `src/lib/jobs/sync-files.ts`
- `src/lib/jobs/scheduler.ts`

#### Content Chunking
- [ ] Implement text chunking for large documents
- [ ] Store chunks with embeddings
- [ ] Create chunk retrieval functions

**New Files:**
- `src/lib/embeddings/chunking.ts`

**Code Example:**
```typescript
// src/lib/embeddings/chunking.ts

export function chunkText(text: string, maxTokens: number = 1000): string[] {
  // Simple chunking by sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    
    if (currentTokens + sentenceTokens > maxTokens && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      currentTokens = sentenceTokens;
    } else {
      currentChunk += sentence;
      currentTokens += sentenceTokens;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}
```

---

### Phase 3: Vector Search & RAG

#### Vector Search Functions
- [ ] Create similarity search queries
- [ ] Implement multi-table search
- [ ] Add filtering by date/user
- [ ] Optimize with proper indexes

**New Files:**
- `src/lib/db/vector-search.ts`

**Code Example:**
```typescript
// src/lib/db/vector-search.ts

import { Pool } from 'pg';

export async function findRelatedContent(
  embedding: number[],
  userId: string,
  options: {
    types?: ('meeting' | 'email' | 'chat' | 'file')[];
    limit?: number;
    threshold?: number;
    dateRange?: { start: Date; end: Date };
  } = {}
) {
  const {
    types = ['meeting', 'email', 'chat', 'file'],
    limit = 20,
    threshold = 0.7,
    dateRange,
  } = options;

  const db = getPool();
  const queries = [];
  
  if (types.includes('meeting')) {
    queries.push(`
      SELECT 'meeting' as type, id, subject as title, 
             summary as snippet, start_time as date,
             1 - (embedding <=> $1::vector) as similarity
      FROM meetings 
      WHERE user_id = $2 
        ${dateRange ? 'AND start_time BETWEEN $3 AND $4' : ''}
        AND (1 - (embedding <=> $1::vector)) > $5
    `);
  }
  
  if (types.includes('email')) {
    queries.push(`
      SELECT 'email' as type, id, subject as title,
             body_preview as snippet, received_at as date,
             1 - (embedding <=> $1::vector) as similarity
      FROM emails 
      WHERE user_id = $2 
        ${dateRange ? 'AND received_at BETWEEN $3 AND $4' : ''}
        AND (1 - (embedding <=> $1::vector)) > $5
    `);
  }
  
  if (types.includes('chat')) {
    queries.push(`
      SELECT 'chat' as type, id, 
             substring(message_text, 1, 100) as title,
             message_text as snippet, sent_at as date,
             1 - (embedding <=> $1::vector) as similarity
      FROM chats 
      WHERE user_id = $2 
        ${dateRange ? 'AND sent_at BETWEEN $3 AND $4' : ''}
        AND (1 - (embedding <=> $1::vector)) > $5
    `);
  }

  if (types.includes('file')) {
    queries.push(`
      SELECT 'file' as type, id, name as title,
             substring(content_extracted, 1, 200) as snippet,
             modified_at as date,
             1 - (embedding <=> $1::vector) as similarity
      FROM files 
      WHERE user_id = $2 
        ${dateRange ? 'AND modified_at BETWEEN $3 AND $4' : ''}
        AND (1 - (embedding <=> $1::vector)) > $5
    `);
  }
  
  const unionQuery = `
    WITH all_content AS (
      ${queries.join(' UNION ALL ')}
    )
    SELECT * FROM all_content
    ORDER BY similarity DESC
    LIMIT $6
  `;
  
  const params = dateRange
    ? [`[${embedding.join(',')}]`, userId, dateRange.start, dateRange.end, threshold, limit]
    : [`[${embedding.join(',')}]`, userId, threshold, limit];
    
  const result = await db.query(unionQuery, params);
  return result.rows;
}
```

#### Relationship Discovery
- [ ] Auto-discover relationships between content
- [ ] Store in `content_relationships` table
- [ ] Create background job for discovery
- [ ] Add manual relationship APIs

**New Files:**
- `src/lib/relationships/discovery.ts`
- `src/app/api/relationships/route.ts`

#### RAG Implementation
- [ ] Create context retrieval for meetings
- [ ] Implement smart prompt engineering
- [ ] Add source attribution
- [ ] Test with various scenarios

**New Files:**
- `src/lib/rag/retrieval.ts`
- `src/lib/rag/prompts.ts`

---

### Phase 4: UI Integration & Features

#### Enhanced Meeting Summarization
- [ ] Update summarization to use RAG
- [ ] Show related content sources
- [ ] Add confidence scores
- [ ] Update meeting details page

**Files to Modify:**
- `src/app/api/summarize/route.ts`
- `src/app/meetings/[id]/page.tsx`

**Code Changes:**
```typescript
// src/app/api/summarize/route.ts - Enhanced

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const { onlineMeetingId, subject, startDateTime } = await request.json();
  
  // 1. Get transcript
  const transcript = await getOnlineMeetingTranscript(
    session.accessToken,
    onlineMeetingId
  );
  
  // 2. Generate embedding for meeting
  const meetingText = `${subject}\n${transcript}`;
  const embedding = await generateEmbedding(meetingText);
  
  // 3. Find related content (RAG)
  const relatedContent = await findRelatedContent(embedding, session.user.email, {
    types: ['email', 'meeting', 'chat'],
    limit: 10,
    threshold: 0.7,
    dateRange: {
      start: new Date(Date.parse(startDateTime) - 30 * 24 * 60 * 60 * 1000),
      end: new Date(startDateTime),
    },
  });
  
  // 4. Build context for LLM
  const context = buildRAGContext({
    currentMeeting: { subject, transcript },
    relatedEmails: relatedContent.filter(c => c.type === 'email'),
    relatedMeetings: relatedContent.filter(c => c.type === 'meeting'),
    relatedChats: relatedContent.filter(c => c.type === 'chat'),
  });
  
  // 5. Generate summary with context
  const promptTemplate = await getUserDefaultPrompt(session.user.email);
  const summary = await generateSummaryWithRAG(context, promptTemplate);
  
  // 6. Store meeting with embedding
  const meetingId = await saveMeetingToPostgres({
    userId: session.user.email,
    onlineMeetingId,
    subject,
    startTime: new Date(startDateTime),
    transcript,
    summary: summary.fullSummary,
    embedding,
  });
  
  // 7. Store relationships
  await storeRelationships(meetingId, relatedContent);
  
  return NextResponse.json({
    ...summary,
    sources: relatedContent,
    confidence: calculateConfidence(relatedContent),
  });
}
```

#### Meeting Preparation Enhancement
- [ ] Use vector search for meeting prep
- [ ] Show related meetings and emails
- [ ] Add attendee interaction history
- [ ] Display confidence metrics

**Files to Modify:**
- `src/app/api/meeting-prep/route.ts`
- Components in `src/app/meetings/[id]/page.tsx`

#### Post-Meeting Q&A Feature
- [ ] Create "Ask a Question" component
- [ ] Implement question → embedding → search
- [ ] Show source documents
- [ ] Add conversation history

**New Files:**
- `src/app/api/meeting-qa/route.ts`
- `src/components/meeting/qa-interface.tsx`

**UI Component:**
```tsx
// src/components/meeting/qa-interface.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

export function MeetingQA({ meetingId }: { meetingId: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function askQuestion() {
    setLoading(true);
    
    const response = await fetch('/api/meeting-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, question }),
    });
    
    const data = await response.json();
    setAnswer(data);
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask About This Meeting</CardTitle>
        <CardDescription>
          Ask questions about the meeting content and related context
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="e.g., What action items were assigned to Sarah?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && askQuestion()}
          />
          <Button onClick={askQuestion} disabled={loading}>
            {loading ? <Spinner /> : 'Ask'}
          </Button>
        </div>

        {answer && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="whitespace-pre-wrap">{answer.response}</p>
            </div>
            
            {answer.sources?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Sources:</h4>
                <div className="space-y-2">
                  {answer.sources.map((source: any) => (
                    <div key={source.id} className="text-sm p-2 border rounded flex items-center gap-2">
                      <Badge variant="outline">{source.type}</Badge>
                      <span className="flex-1">{source.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {(source.similarity * 100).toFixed(0)}% match
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

#### Testing & Polish
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Documentation updates

---

## Docker Configuration

### Updated `docker-compose.yml`

```yaml
version: '3.8'

services:
  # PostgreSQL with pgvector
  postgres:
    image: pgvector/pgvector:pg16
    container_name: meeting-summarizer-postgres
    environment:
      POSTGRES_DB: meeting_summarizer
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres123}
      POSTGRES_HOST_AUTH_METHOD: trust
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./meeting-summarizer/web/src/lib/db/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - meeting-summarizer-network

  # Meeting Summarizer App
  meeting-summarizer:
    build:
      context: ./meeting-summarizer/web
      dockerfile: Dockerfile
    container_name: meeting-summarizer-app
    ports:
      - "3300:3300"
    environment:
      NODE_ENV: production
      PORT: 3300
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/meeting_summarizer
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3300}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      AZURE_AD_CLIENT_ID: ${AZURE_AD_CLIENT_ID}
      AZURE_AD_CLIENT_SECRET: ${AZURE_AD_CLIENT_SECRET}
      AZURE_AD_TENANT_ID: ${AZURE_AD_TENANT_ID}
      AZURE_OPENAI_KEY: ${AZURE_OPENAI_KEY}
      AZURE_OPENAI_ENDPOINT: ${AZURE_OPENAI_ENDPOINT}
      AZURE_OPENAI_DEPLOYMENT: ${AZURE_OPENAI_DEPLOYMENT}
      AZURE_OPENAI_EMBEDDING_DEPLOYMENT: ${AZURE_OPENAI_EMBEDDING_DEPLOYMENT:-text-embedding-ada-002}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      NEXT_PUBLIC_ADMIN_EMAIL: ${NEXT_PUBLIC_ADMIN_EMAIL}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3300"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    volumes:
      - ./meeting-summarizer/web/usage.db:/app/usage.db
      - app_logs:/app/logs
    networks:
      - meeting-summarizer-network

networks:
  meeting-summarizer-network:
    driver: bridge

volumes:
  postgres_data:
    driver: local
  app_logs:
    driver: local
```

---

## Environment Variables

### Updated `.env.local` and `.env.example`

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/meeting_summarizer
POSTGRES_PASSWORD=postgres123

# Azure AD
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_TENANT_ID=your-tenant-id

# NextAuth
NEXTAUTH_URL=http://localhost:3300
NEXTAUTH_SECRET=your-secret-key

# Azure OpenAI
AZURE_OPENAI_KEY=your-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-ada-002

# Admin
ADMIN_EMAIL=admin@example.com
NEXT_PUBLIC_ADMIN_EMAIL=admin@example.com

# Background Jobs (optional)
ENABLE_AUTO_SYNC=true
SYNC_INTERVAL_MINUTES=30

# Vector Search Settings
SIMILARITY_THRESHOLD=0.7
MAX_RELATED_ITEMS=20
```

---

## Code Changes Summary

### New Files to Create (67 files)

#### 1. Database & Migrations (10 files)
- `src/lib/db/postgres.ts` - PostgreSQL connection pool
- `src/lib/db/migrations/001_initial_schema.sql`
- `src/lib/db/migrations/002_add_indexes.sql`
- `src/lib/db/migrations/003_add_functions.sql`
- `src/lib/db/models/meeting.ts`
- `src/lib/db/models/email.ts`
- `src/lib/db/models/chat.ts`
- `src/lib/db/models/file.ts`
- `src/lib/db/models/task.ts`
- `src/lib/db/vector-search.ts`

#### 2. Embedding Service (5 files)
- `src/lib/embeddings/service.ts`
- `src/lib/embeddings/types.ts`
- `src/lib/embeddings/cache.ts`
- `src/lib/embeddings/chunking.ts`
- `src/lib/embeddings/batch.ts`

#### 3. Sync Jobs (6 files)
- `src/lib/jobs/sync-emails.ts`
- `src/lib/jobs/sync-chats.ts`
- `src/lib/jobs/sync-files.ts`
- `src/lib/jobs/sync-calendar.ts`
- `src/lib/jobs/scheduler.ts`
- `src/lib/jobs/types.ts`

#### 4. RAG System (4 files)
- `src/lib/rag/retrieval.ts`
- `src/lib/rag/prompts.ts`
- `src/lib/rag/scoring.ts`
- `src/lib/rag/context-builder.ts`

#### 5. Relationships (3 files)
- `src/lib/relationships/discovery.ts`
- `src/lib/relationships/graph.ts`
- `src/lib/relationships/types.ts`

#### 6. API Routes (8 files)
- `src/app/api/emails/route.ts`
- `src/app/api/chats/route.ts`
- `src/app/api/files/route.ts`
- `src/app/api/sync/route.ts`
- `src/app/api/sync/status/route.ts`
- `src/app/api/meeting-qa/route.ts`
- `src/app/api/relationships/route.ts`
- `src/app/api/health/route.ts`

#### 7. UI Components (8 files)
- `src/components/meeting/qa-interface.tsx`
- `src/components/meeting/related-content.tsx`
- `src/components/meeting/source-attribution.tsx`
- `src/components/meeting/confidence-indicator.tsx`
- `src/components/sync/sync-status.tsx`
- `src/components/sync/sync-trigger.tsx`
- `src/components/context/context-viewer.tsx`
- `src/components/relationships/relationship-graph.tsx`

#### 8. Utilities & Scripts (7 files)
- `scripts/migrate-to-postgres.ts`
- `scripts/seed-embeddings.ts`
- `scripts/test-vector-search.ts`
- `scripts/verify-migration.ts`
- `scripts/sync-historical-data.ts`
- `src/lib/utils/token-counter.ts`
- `src/lib/utils/text-processor.ts`

#### 9. Types (3 files)
- `src/types/embedding.ts`
- `src/types/vector-search.ts`
- `src/types/sync.ts`

### Files to Modify (13 files)

1. **`docker-compose.yml`** - Add PostgreSQL service
2. **`package.json`** - Add new dependencies
3. **`.env.local`** - Add DATABASE_URL and new variables
4. **`.env.example`** - Add template for new variables
5. **`src/app/api/summarize/route.ts`** - Add RAG
6. **`src/app/api/meeting-prep/route.ts`** - Use vector search
7. **`src/app/meetings/[id]/page.tsx`** - Add Q&A and sources
8. **`src/lib/openai.ts`** - Add embedding functions
9. **`next.config.ts`** - Add experimental features if needed
10. **`tsconfig.json`** - Add paths for new modules
11. **`README.md`** - Update setup instructions
12. **`DOCKER.md`** - Update Docker instructions
13. **`.gitignore`** - Add database-specific ignores

---

## New Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "pg": "^8.11.3",
    "pgvector": "^0.1.8",
    "@types/pg": "^8.10.9",
    "node-pg-migrate": "^6.2.2"
  },
  "scripts": {
    "db:migrate": "node-pg-migrate up",
    "db:migrate:down": "node-pg-migrate down",
    "db:migrate:create": "node-pg-migrate create",
    "db:seed": "tsx scripts/seed-embeddings.ts",
    "migrate:data": "tsx scripts/migrate-to-postgres.ts",
    "test:vector": "tsx scripts/test-vector-search.ts"
  }
}
```

---

## Success Metrics

### Performance Targets
- Vector search response time: < 200ms for 10K embeddings
- Embedding generation: < 2s per meeting
- Incremental sync: Only new content processed
- 70-80% reduction in API costs

### Functionality Targets
- Accurate related content discovery (>70% relevance)
- Smart meeting preparation with historical context
- Post-meeting Q&A with source attribution
- Auto-relationship discovery with >80% accuracy

### User Experience Targets
- Context-aware summaries feel natural
- One-click meeting prep is helpful
- Q&A responses are accurate and sourced
- Clear visual indication of sources/confidence

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Data migration failure** | High | Low | Full backup, dry-run testing, rollback plan |
| **Embedding cost overrun** | Medium | Medium | Caching, incremental processing, monitoring |
| **Vector search performance** | Medium | Medium | Proper indexes, query optimization, benchmarking |
| **User confusion** | Low | Medium | Clear UI, tooltips, documentation, gradual rollout |
| **PostgreSQL resource usage** | Medium | Low | Monitoring, connection pooling, query optimization |

---

## Implementation Phases Summary

| Phase | Focus Area | Key Deliverables |
|-------|------------|------------------|
| **Phase 1** | Infrastructure | PostgreSQL setup, schema, migration |
| **Phase 2** | Embeddings | Embedding service, sync jobs, chunking |
| **Phase 3** | Vector Search | RAG implementation, relationships, search |
| **Phase 4** | UI Integration | Enhanced features, Q&A, testing |

---

## Quick Start Commands

```bash
# 1. Install new dependencies
npm install pg pgvector @types/pg node-pg-migrate

# 2. Start PostgreSQL
docker-compose up -d postgres

# 3. Wait for PostgreSQL to be ready
docker-compose logs -f postgres

# 4. Run migrations
npm run db:migrate

# 5. Migrate existing data from SQLite
npm run migrate:data

# 6. Generate embeddings for existing data
npm run db:seed

# 7. Start the application
npm run dev

# 8. Test vector search
npm run test:vector
```

---

## Additional Resources

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Azure OpenAI Embeddings](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/embeddings)
- [RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Vector Database Comparison](https://benchmark.vectorview.ai/)

---

## Future Enhancements (Post-MVP)

### Phase 2 Features
- [ ] Multi-user collaboration on meeting notes
- [ ] Automatic action item tracking across meetings
- [ ] Meeting sentiment analysis
- [ ] Participant engagement metrics
- [ ] Integration with project management tools

### Phase 3 Features
- [ ] Real-time meeting transcription
- [ ] Live Q&A during meetings
- [ ] Proactive meeting suggestions
- [ ] Cross-organization knowledge sharing
- [ ] Advanced analytics dashboard

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review plan with team
- [ ] Get stakeholder approval
- [ ] Set up development environment
- [ ] Backup all existing data

### Week 1
- [ ] Set up PostgreSQL + pgvector
- [ ] Create all database tables
- [ ] Write migration scripts
- [ ] Test migration with sample data

### Week 2
- [ ] Implement embedding service
- [ ] Create sync jobs
- [ ] Test chunking for large documents
- [ ] Monitor API costs

### Week 3
- [ ] Implement vector search
- [ ] Build RAG system
- [ ] Test relationship discovery
- [ ] Performance optimization

### Week 4
- [ ] Update UI components
- [ ] Add Q&A feature
- [ ] Create user documentation
- [ ] Deploy to production

---

## Training & Documentation

### For Developers
- Database schema documentation
- API endpoint documentation
- Vector search query examples
- Troubleshooting guide

### For Users
- Feature walkthrough video
- Q&A feature guide
- Meeting preparation tips
- Privacy and data handling

---

## Support & Maintenance

### Monitoring
- [ ] Set up database performance monitoring
- [ ] Track embedding generation costs
- [ ] Monitor vector search performance
- [ ] Alert on sync failures

### Regular Maintenance
- [ ] Weekly database backups
- [ ] Monthly index optimization
- [ ] Quarterly embedding model updates
- [ ] Annual data archival

---

**Document Version:** 1.1  
**Last Updated:** February 9, 2026  
**Status:** Ready for Implementation
