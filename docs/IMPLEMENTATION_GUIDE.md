# Implementation Guide: Agentic Architecture for WorkGraph.ai

This guide provides step-by-step instructions for implementing the recommended agentic architecture.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: Database Migration](#phase-1-database-migration)
3. [Phase 2: Azure Services Setup](#phase-2-azure-services-setup)
4. [Phase 3: LangGraph Integration](#phase-3-langgraph-integration)
5. [Phase 4: Agent Development](#phase-4-agent-development)
6. [Phase 5: Security Implementation](#phase-5-security-implementation)
7. [Phase 6: Testing & Deployment](#phase-6-testing--deployment)

---

## Prerequisites

### Required Azure Resources
- Azure OpenAI Service (with GPT-4o and embeddings models)
- Azure Document Intelligence
- Azure Database for PostgreSQL Flexible Server
- Azure Cache for Redis
- Azure Key Vault
- Azure Monitor / Log Analytics
- Azure AD Premium P1

### Development Tools
- Node.js 18+ and npm/yarn
- PostgreSQL client (psql)
- VS Code with extensions:
  - PostgreSQL
  - REST Client
  - Mermaid Preview
- Docker Desktop (for local testing)

### Skills Required
- TypeScript/JavaScript
- Next.js (App Router)
- SQL (PostgreSQL)
- REST APIs
- Azure services
- LangChain/LangGraph basics

---

## Phase 1: Database Migration

### Step 1.1: Provision PostgreSQL with pgvector

```bash
# Using Azure CLI
az postgres flexible-server create \
  --resource-group workgraph-rg \
  --name workgraph-db \
  --location eastus \
  --admin-user pgadmin \
  --admin-password <your-secure-password> \
  --sku-name Standard_B2s \
  --tier Burstable \
  --version 15 \
  --storage-size 128 \
  --public-access 0.0.0.0
  
# Enable pgvector extension
az postgres flexible-server parameter set \
  --resource-group workgraph-rg \
  --server-name workgraph-db \
  --name azure.extensions \
  --value VECTOR
```

### Step 1.2: Install pgvector Extension

```sql
-- Connect to your database
psql -h workgraph-db.postgres.database.azure.com -U pgadmin -d postgres

-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Step 1.3: Create Database Schema

```sql
-- src/db/migrations/001_initial_schema.sql

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  preferences JSONB DEFAULT '{}'::jsonb
);

-- Meetings table with vector embeddings
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
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Emails table with vector embeddings
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
  importance TEXT,
  is_read BOOLEAN DEFAULT false,
  conversation_id TEXT,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Chats table with vector embeddings
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id TEXT UNIQUE,
  content TEXT,
  from_email TEXT,
  from_name TEXT,
  created_time TIMESTAMP,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Files table
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  graph_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  extension TEXT,
  size_bytes BIGINT,
  mime_type TEXT,
  web_url TEXT,
  download_url TEXT,
  created_at_source TIMESTAMP,
  modified_at TIMESTAMP,
  last_processed_at TIMESTAMP,
  processing_status TEXT DEFAULT 'pending',
  shared_with TEXT[],
  classification TEXT DEFAULT 'INTERNAL',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- File chunks for vector search
CREATE TABLE file_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  chunk_index INT NOT NULL,
  page_numbers INT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Meeting summaries cache
CREATE TABLE meeting_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_points JSONB,
  action_items JSONB,
  decisions JSONB,
  risks JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Email summaries cache
CREATE TABLE email_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  urgency TEXT,
  key_requests JSONB,
  action_items JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User preferences
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  brief_style TEXT DEFAULT 'professional',
  brief_length TEXT DEFAULT 'concise',
  focus_areas TEXT[] DEFAULT ARRAY['decisions', 'action-items', 'risks'],
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Content relationships (auto-discovered)
CREATE TABLE content_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  similarity_score FLOAT NOT NULL,
  relationship_type TEXT,
  discovered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source_type, source_id, target_type, target_id)
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  result TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent memory/checkpoints (for LangGraph)
CREATE TABLE agent_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(thread_id, checkpoint_id)
);

-- Indexes for performance
CREATE INDEX meetings_user_id_idx ON meetings(user_id);
CREATE INDEX meetings_start_time_idx ON meetings(start_time);
CREATE INDEX meetings_embedding_idx ON meetings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX emails_user_id_idx ON emails(user_id);
CREATE INDEX emails_received_at_idx ON emails(received_at);
CREATE INDEX emails_embedding_idx ON emails USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX chats_user_id_idx ON chats(user_id);
CREATE INDEX chats_created_time_idx ON chats(created_time);
CREATE INDEX chats_embedding_idx ON chats USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX files_user_id_idx ON files(user_id);
CREATE INDEX files_modified_at_idx ON files(modified_at);
CREATE INDEX files_processing_status_idx ON files(processing_status);

CREATE INDEX file_chunks_file_id_idx ON file_chunks(file_id);
CREATE INDEX file_chunks_embedding_idx ON file_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX meeting_summaries_meeting_id_idx ON meeting_summaries(meeting_id);
CREATE INDEX email_summaries_email_id_idx ON email_summaries(email_id);

CREATE INDEX audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);

CREATE INDEX agent_checkpoints_thread_id_idx ON agent_checkpoints(thread_id);

-- Full-text search indexes
CREATE INDEX file_chunks_content_fts_idx ON file_chunks USING gin(to_tsvector('english', content));
CREATE INDEX meetings_transcript_fts_idx ON meetings USING gin(to_tsvector('english', transcript));
CREATE INDEX emails_body_fts_idx ON emails USING gin(to_tsvector('english', body_content));
```

### Step 1.4: Migrate Existing Data from SQLite

```typescript
// src/scripts/migrate-from-sqlite.ts
import Database from 'better-sqlite3';
import { Pool } from 'pg';

const sqliteDb = new Database('./data/workgraph.db');
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: 5432,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  ssl: { rejectUnauthorized: false }
});

async function migrateMeetings() {
  console.log('Migrating meetings...');
  
  // Fetch from SQLite
  const meetings = sqliteDb.prepare('SELECT * FROM meetings').all();
  
  // Insert into PostgreSQL
  for (const meeting of meetings) {
    await pgPool.query(`
      INSERT INTO meetings (
        user_id, graph_id, subject, start_time, end_time,
        transcript, summary, has_transcript, organizer_email,
        organizer_name, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (graph_id) DO NOTHING
    `, [
      meeting.user_id,
      meeting.graph_id,
      meeting.subject,
      meeting.start_time,
      meeting.end_time,
      meeting.transcript,
      meeting.summary,
      meeting.has_transcript ? true : false,
      meeting.organizer_email,
      meeting.organizer_name,
      meeting.created_at || new Date(),
      meeting.updated_at || new Date()
    ]);
  }
  
  console.log(`Migrated ${meetings.length} meetings`);
}

async function migrateUsers() {
  console.log('Migrating users...');
  
  const users = sqliteDb.prepare('SELECT * FROM users').all();
  
  for (const user of users) {
    await pgPool.query(`
      INSERT INTO users (email, name, role, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, [user.email, user.name || null, 'user', new Date()]);
  }
  
  console.log(`Migrated ${users.length} users`);
}

async function migrate() {
  try {
    await migrateUsers();
    await migrateMeetings();
    // Add more migration functions as needed
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pgPool.end();
    sqliteDb.close();
  }
}

migrate();
```

Run migration:
```bash
npm run ts-node src/scripts/migrate-from-sqlite.ts
```

---

## Phase 2: Azure Services Setup

### Step 2.1: Azure Document Intelligence

```bash
# Create Document Intelligence resource
az cognitiveservices account create \
  --name workgraph-doc-intel \
  --resource-group workgraph-rg \
  --kind FormRecognizer \
  --sku S0 \
  --location eastus \
  --yes

# Get endpoint and key
az cognitiveservices account show \
  --name workgraph-doc-intel \
  --resource-group workgraph-rg \
  --query "properties.endpoint" -o tsv

az cognitiveservices account keys list \
  --name workgraph-doc-intel \
  --resource-group workgraph-rg \
  --query "key1" -o tsv
```

### Step 2.2: Azure Redis Cache

```bash
# Create Redis cache
az redis create \
  --resource-group workgraph-rg \
  --name workgraph-cache \
  --location eastus \
  --sku Basic \
  --vm-size c1 \
  --enable-non-ssl-port false

# Get connection string
az redis list-keys \
  --resource-group workgraph-rg \
  --name workgraph-cache \
  --query "primaryKey" -o tsv
```

### Step 2.3: Azure Key Vault

```bash
# Create Key Vault
az keyvault create \
  --name workgraph-vault \
  --resource-group workgraph-rg \
  --location eastus \
  --enabled-for-deployment true

# Add secrets
az keyvault secret set \
  --vault-name workgraph-vault \
  --name azure-openai-key \
  --value <your-openai-key>

az keyvault secret set \
  --vault-name workgraph-vault \
  --name postgres-password \
  --value <your-db-password>

az keyvault secret set \
  --vault-name workgraph-vault \
  --name nextauth-secret \
  --value <your-nextauth-secret>

# Grant access to your application
az keyvault set-policy \
  --name workgraph-vault \
  --object-id <your-app-object-id> \
  --secret-permissions get list
```

### Step 2.4: Azure Monitor

```bash
# Create Log Analytics Workspace
az monitor log-analytics workspace create \
  --resource-group workgraph-rg \
  --workspace-name workgraph-logs \
  --location eastus

# Get workspace ID
az monitor log-analytics workspace show \
  --resource-group workgraph-rg \
  --workspace-name workgraph-logs \
  --query "customerId" -o tsv
```

### Step 2.5: Update Environment Variables

Create `.env.local`:
```bash
# Database
POSTGRES_HOST=workgraph-db.postgres.database.azure.com
POSTGRES_PORT=5432
POSTGRES_USER=pgadmin
POSTGRES_PASSWORD= # Retrieved from Key Vault
POSTGRES_DB=workgraph
POSTGRES_SSL=true

# Redis
REDIS_HOST=workgraph-cache.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD= # Retrieved from Key Vault
REDIS_TLS=true

# Azure Key Vault
AZURE_KEY_VAULT_NAME=workgraph-vault
AZURE_KEY_VAULT_TENANT_ID=<your-tenant-id>
AZURE_KEY_VAULT_CLIENT_ID=<your-client-id>
AZURE_KEY_VAULT_CLIENT_SECRET= # From Key Vault

# Azure Document Intelligence
AZURE_DOC_INTEL_ENDPOINT=https://workgraph-doc-intel.cognitiveservices.azure.com/
AZURE_DOC_INTEL_KEY= # Retrieved from Key Vault

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com/
AZURE_OPENAI_KEY= # Retrieved from Key Vault
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small

# Azure Monitor
AZURE_LOG_ANALYTICS_WORKSPACE_ID=<workspace-id>
AZURE_LOG_ANALYTICS_WORKSPACE_KEY=<workspace-key>

# Existing vars
AZURE_AD_CLIENT_ID=<your-client-id>
AZURE_AD_CLIENT_SECRET= # Retrieved from Key Vault
AZURE_AD_TENANT_ID=<your-tenant-id>
NEXTAUTH_URL=http://localhost:3300
NEXTAUTH_SECRET= # Retrieved from Key Vault

# LangSmith (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=<your-langsmith-key>
LANGCHAIN_PROJECT=workgraph-ai
```

---

## Phase 3: LangGraph Integration

### Step 3.1: Install Dependencies

```bash
npm install @langchain/langgraph @langchain/core @langchain/openai @langchain/community
npm install ioredis pg @azure/keyvault-secrets @azure/identity @azure/ai-form-recognizer
npm install --save-dev @types/pg @types/ioredis
```

Update `package.json`:
```json
{
  "dependencies": {
    "@langchain/langgraph": "^0.0.26",
    "@langchain/core": "^0.1.45",
    "@langchain/openai": "^0.0.19",
    "@langchain/community": "^0.0.35",
    "ioredis": "^5.3.2",
    "pg": "^8.11.3",
    "@azure/keyvault-secrets": "^4.7.0",
    "@azure/identity": "^4.0.0",
    "@azure/ai-form-recognizer": "^5.0.0"
  }
}
```

### Step 3.2: Configure Database Connection

```typescript
// src/lib/pg.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  ssl: process.env.POSTGRES_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export default pool;

// Helper function for vector search
export async function vectorSearch(
  table: string,
  embedding: number[],
  options: {
    limit?: number;
    threshold?: number;
    filters?: Record<string, any>;
  } = {}
) {
  const { limit = 10, threshold = 0.7, filters = {} } = options;
  
  // Build WHERE clause for filters
  const whereClauses: string[] = [];
  const values: any[] = [embedding];
  let paramIndex = 2;
  
  for (const [key, value] of Object.entries(filters)) {
    whereClauses.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }
  
  const whereClause = whereClauses.length > 0 
    ? `AND ${whereClauses.join(' AND ')}`
    : '';
  
  values.push(threshold, limit);
  
  const query = `
    SELECT *,
      1 - (embedding <=> $1) AS similarity
    FROM ${table}
    WHERE 1 - (embedding <=> $1) > $${paramIndex}
    ${whereClause}
    ORDER BY similarity DESC
    LIMIT $${paramIndex + 1}
  `;
  
  const result = await pool.query(query, values);
  return result.rows;
}
```

### Step 3.3: Configure Redis Cache

```typescript
// src/lib/redis.ts
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6380'),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export default redis;

// Helper functions
export async function cacheGet(key: string): Promise<any> {
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
}

export async function cacheSet(
  key: string,
  value: any,
  ttlSeconds: number = 3600
): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDelete(key: string): Promise<void> {
  await redis.del(key);
}
```

---

## Phase 4: Agent Development

### Step 4.1: Context Agent

Create `src/agents/context-agent.ts`:

```typescript
import { Runnable } from "@langchain/core/runnables";
import { OpenAIEmbeddings } from "@langchain/openai";
import { getGraphClient } from "@/lib/graph";
import { vectorSearch } from "@/lib/pg";
import { cacheGet, cacheSet } from "@/lib/redis";

export interface ContextAgentInput {
  meetingId: string;
  userId: string;
  accessToken: string;
}

export interface ContextAgentOutput {
  meeting: any;
  similarMeetings: any[];
  similarEmails: any[];
  similarFiles: any[];
  recentChats: any[];
}

export class ContextAgent extends Runnable<ContextAgentInput, ContextAgentOutput> {
  lc_namespace = ["workgraph", "agents", "context"];
  
  private embeddings: OpenAIEmbeddings;
  
  constructor() {
    super();
    this.embeddings = new OpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_ENDPOINT!.replace("https://", "").replace(".openai.azure.com/", ""),
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
      azureOpenAIApiVersion: "2024-02-01",
    });
  }
  
  async invoke(input: ContextAgentInput): Promise<ContextAgentOutput> {
    // Check cache first
    const cacheKey = `context:${input.meetingId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log(`✓ Context cache hit for meeting ${input.meetingId}`);
      return cached;
    }
    
    // Fetch meeting details
    const graphClient = getGraphClient(input.accessToken);
    const meeting = await graphClient.api(`/me/calendar/events/${input.meetingId}`).get();
    
    // Generate embedding for meeting
    const meetingText = `${meeting.subject} ${meeting.body?.content || ''}`;
    const embedding = await this.embeddings.embedQuery(meetingText);
    
    // Parallel vector searches
    const [similarMeetings, similarEmails, similarFiles] = await Promise.all([
      vectorSearch('meetings', embedding, {
        limit: 10,
        threshold: 0.75,
        filters: { user_id: input.userId }
      }),
      
      vectorSearch('emails', embedding, {
        limit: 15,
        threshold: 0.70,
        filters: { user_id: input.userId }
      }),
      
      vectorSearch('file_chunks', embedding, {
        limit: 10,
        threshold: 0.70
      })
    ]);
    
    // Fetch recent chats (not vector search)
    const attendeeEmails = meeting.attendees?.map((a: any) => a.emailAddress.address) || [];
    const recentChats = await this.getRecentChats(graphClient, attendeeEmails);
    
    const result: ContextAgentOutput = {
      meeting,
      similarMeetings,
      similarEmails,
      similarFiles,
      recentChats
    };
    
    // Cache for 5 minutes
    await cacheSet(cacheKey, result, 300);
    
    return result;
  }
  
  private async getRecentChats(client: any, attendeeEmails: string[]): Promise<any[]> {
    // Implementation similar to existing code
    // ... (code to fetch chats from Graph API)
    return [];
  }
}
```

### Step 4.2: Summarization Agent

Create `src/agents/summarization-agent.ts`:

```typescript
import { Runnable } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import pool from "@/lib/pg";

export interface SummarizationAgentInput {
  items: Array<{
    id: string;
    type: 'meeting' | 'email' | 'file';
    content: string;
    lastModified?: Date;
  }>;
}

export interface SummarizationAgentOutput {
  summaries: Array<{
    id: string;
    summary: any;
    cached: boolean;
  }>;
}

export class SummarizationAgent extends Runnable<SummarizationAgentInput, SummarizationAgentOutput> {
  lc_namespace = ["workgraph", "agents", "summarization"];
  
  private llm: ChatOpenAI;
  
  constructor() {
    super();
    this.llm = new ChatOpenAI({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_ENDPOINT!.replace("https://", "").replace(".openai.azure.com/", ""),
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT,
      azureOpenAIApiVersion: "2024-02-01",
      temperature: 0.3,
      modelName: "gpt-4o",
    });
  }
  
  async invoke(input: SummarizationAgentInput): Promise<SummarizationAgentOutput> {
    const summaries = await Promise.all(
      input.items.map(async (item) => {
        // Check cache
        const cached = await this.getFromCache(item.id, item.type);
        if (cached) {
          return {
            id: item.id,
            summary: cached,
            cached: true
          };
        }
        
        // Generate new summary
        const summary = await this.generateSummary(item);
        
        // Save to cache
        await this.saveToCache(item.id, item.type, summary);
        
        return {
          id: item.id,
          summary,
          cached: false
        };
      })
    );
    
    return { summaries };
  }
  
  private async getFromCache(id: string, type: string): Promise<any | null> {
    const table = type === 'meeting' ? 'meeting_summaries' : 
                 type === 'email' ? 'email_summaries' : null;
    
    if (!table) return null;
    
    const result = await pool.query(
      `SELECT summary FROM ${table} WHERE ${type}_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    
    return result.rows[0]?.summary || null;
  }
  
  private async saveToCache(id: string, type: string, summary: any): Promise<void> {
    const table = type === 'meeting' ? 'meeting_summaries' : 
                 type === 'email' ? 'email_summaries' : null;
    
    if (!table) return;
    
    await pool.query(
      `INSERT INTO ${table} (${type}_id, summary, created_at) VALUES ($1, $2, NOW())`,
      [id, JSON.stringify(summary)]
    );
  }
  
  private async generateSummary(item: { type: string; content: string }): Promise<any> {
    const prompt = this.getPromptForType(item.type);
    
    const response = await this.llm.invoke([
      { role: "system", content: prompt },
      { role: "user", content: item.content }
    ]);
    
    return this.parseStructuredSummary(response.content as string);
  }
  
  private getPromptForType(type: string): string {
    // Implementation similar to existing code
    return "Summarize this content...";
  }
  
  private parseStructuredSummary(content: string): any {
    // Parse LLM response into structured format
    return { summary: content };
  }
}
```

### Step 4.3: Brief Generation Agent

Create `src/agents/brief-agent.ts`:

```typescript
import { Runnable } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import pool from "@/lib/pg";

export interface BriefAgentInput {
  meeting: any;
  summaries: {
    meetings: any[];
    emails: any[];
    files: any[];
  };
  chats: any[];
  userId: string;
}

export interface BriefAgentOutput {
  brief: string;
  talkingPoints: string[];
  metadata: any;
}

export class BriefGenerationAgent extends Runnable<BriefAgentInput, BriefAgentOutput> {
  lc_namespace = ["workgraph", "agents", "brief"];
  
  private llm: ChatOpenAI;
  
  constructor() {
    super();
    this.llm = new ChatOpenAI({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_ENDPOINT!.replace("https://", "").replace(".openai.azure.com/", ""),
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT,
      azureOpenAIApiVersion: "2024-02-01",
      temperature: 0.5,
      modelName: "gpt-4o",
    });
  }
  
  async invoke(input: BriefAgentInput): Promise<BriefAgentOutput> {
    // Get user preferences
    const prefs = await this.getUserPreferences(input.userId);
    
    // Generate brief
    const brief = await this.generateBrief(input, prefs);
    
    // Extract talking points
    const talkingPoints = await this.extractTalkingPoints(brief);
    
    return {
      brief,
      talkingPoints,
      metadata: {
        generatedAt: new Date(),
        sources: {
          meetings: input.summaries.meetings.length,
          emails: input.summaries.emails.length,
          files: input.summaries.files.length,
          chats: input.chats.length
        }
      }
    };
  }
  
  private async getUserPreferences(userId: string): Promise<any> {
    const result = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    
    return result.rows[0] || {
      brief_style: 'professional',
      brief_length: 'concise',
      focus_areas: ['decisions', 'action-items', 'risks']
    };
  }
  
  private async generateBrief(input: BriefAgentInput, prefs: any): Promise<string> {
    const systemPrompt = `You are a professional executive assistant preparing meeting briefs.
      
      Style: ${prefs.brief_style}
      Length: ${prefs.brief_length}
      Focus: ${prefs.focus_areas.join(', ')}
      
      Structure your brief with:
      1. Meeting Context (1-2 sentences)
      2. Key Background (from previous meetings)
      3. Relevant Email Discussions
      4. Recent Conversations
      5. Recommended Talking Points
      6. Questions to Ask`;
    
    const userPrompt = `Generate a preparation brief for: ${input.meeting.subject}
      
      Previous Meetings:
      ${input.summaries.meetings.map(m => `- ${m.summary}`).join('\n')}
      
      Recent Emails:
      ${input.summaries.emails.map(e => `- ${e.summary}`).join('\n')}
      
      Related Files:
      ${input.summaries.files.map(f => `- ${f.summary}`).join('\n')}
      
      Recent Chats:
      ${input.chats.map(c => `- ${c.content}`).join('\n')}`;
    
    const response = await this.llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);
    
    return response.content as string;
  }
  
  private async extractTalkingPoints(brief: string): Promise<string[]> {
    // Extract bullet points from brief
    const lines = brief.split('\n');
    return lines
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
      .map(line => line.replace(/^[-•]\s*/, '').trim());
  }
}
```

### Step 4.4: Orchestrator with LangGraph

Create `src/agents/orchestrator.ts`:

```typescript
import { StateGraph, END } from "@langchain/langgraph";
import { ContextAgent, type ContextAgentInput, type ContextAgentOutput } from "./context-agent";
import { SummarizationAgent } from "./summarization-agent";
import { BriefGenerationAgent } from "./brief-agent";

// Define state interface
interface MeetingPrepState {
  meetingId: string;
  userId: string;
  accessToken: string;
  meeting?: any;
  context?: ContextAgentOutput;
  summaries?: any;
  brief?: string;
  talkingPoints?: string[];
  errors: string[];
}

export class MeetingPrepOrchestrator {
  private workflow: any;
  private contextAgent: ContextAgent;
  private summarizationAgent: SummarizationAgent;
  private briefAgent: BriefGenerationAgent;
  
  constructor() {
    this.contextAgent = new ContextAgent();
    this.summarizationAgent = new SummarizationAgent();
    this.briefAgent = new BriefGenerationAgent();
    
    this.workflow = this.buildWorkflow();
  }
  
  private buildWorkflow() {
    const workflow = new StateGraph<MeetingPrepState>({
      channels: {
        meetingId: { value: null },
        userId: { value: null },
        accessToken: { value: null },
        meeting: { value: null },
        context: { value: null },
        summaries: { value: null },
        brief: { value: null },
        talkingPoints: { value: null },
        errors: { value: [] }
      }
    });
    
    // Add nodes
    workflow.addNode("fetchContext", async (state: MeetingPrepState) => {
      try {
        const context = await this.contextAgent.invoke({
          meetingId: state.meetingId,
          userId: state.userId,
          accessToken: state.accessToken
        });
        
        return {
          ...state,
          meeting: context.meeting,
          context
        };
      } catch (error: any) {
        return {
          ...state,
          errors: [...state.errors, error.message]
        };
      }
    });
    
    workflow.addNode("summarize", async (state: MeetingPrepState) => {
      if (!state.context) {
        return {
          ...state,
          errors: [...state.errors, "No context available"]
        };
      }
      
      try {
        // Prepare items for summarization
        const items = [
          ...state.context.similarMeetings.map(m => ({
            id: m.id,
            type: 'meeting' as const,
            content: m.transcript || m.summary || ''
          })),
          ...state.context.similarEmails.map(e => ({
            id: e.id,
            type: 'email' as const,
            content: e.body_content || ''
          }))
        ];
        
        const result = await this.summarizationAgent.invoke({ items });
        
        return {
          ...state,
          summaries: result.summaries
        };
      } catch (error: any) {
        return {
          ...state,
          errors: [...state.errors, error.message]
        };
      }
    });
    
    workflow.addNode("generateBrief", async (state: MeetingPrepState) => {
      if (!state.meeting || !state.summaries) {
        return {
          ...state,
          errors: [...state.errors, "Missing meeting or summaries"]
        };
      }
      
      try {
        const result = await this.briefAgent.invoke({
          meeting: state.meeting,
          summaries: {
            meetings: state.summaries.filter((s: any) => s.type === 'meeting'),
            emails: state.summaries.filter((s: any) => s.type === 'email'),
            files: []
          },
          chats: state.context?.recentChats || [],
          userId: state.userId
        });
        
        return {
          ...state,
          brief: result.brief,
          talkingPoints: result.talkingPoints
        };
      } catch (error: any) {
        return {
          ...state,
          errors: [...state.errors, error.message]
        };
      }
    });
    
    // Define edges
    workflow.addEdge("fetchContext", "summarize");
    workflow.addEdge("summarize", "generateBrief");
    workflow.addEdge("generateBrief", END);
    
    // Set entry point
    workflow.setEntryPoint("fetchContext");
    
    // Compile
    return workflow.compile();
  }
  
  async execute(input: { meetingId: string; userId: string; accessToken: string }) {
    const initialState: MeetingPrepState = {
      ...input,
      errors: []
    };
    
    const result = await this.workflow.invoke(initialState);
    return result;
  }
}
```

---

## Phase 5: Security Implementation

### Step 5.1: Azure Key Vault Integration

Create `src/lib/secrets.ts`:

```typescript
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

class SecretsManager {
  private client: SecretClient;
  private cache: Map<string, { value: string; expiresAt: number }> = new Map();
  
  constructor() {
    const vaultUrl = `https://${process.env.AZURE_KEY_VAULT_NAME}.vault.azure.net`;
    const credential = new DefaultAzureCredential();
    this.client = new SecretClient(vaultUrl, credential);
  }
  
  async getSecret(name: string): Promise<string> {
    // Check cache
    const cached = this.cache.get(name);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    
    // Fetch from Key Vault
    const secret = await this.client.getSecret(name);
    
    // Cache for 5 minutes
    this.cache.set(name, {
      value: secret.value!,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    
    return secret.value!;
  }
}

export const secrets = new SecretsManager();
```

### Step 5.2: Audit Logging

Create `src/lib/audit.ts`:

```typescript
import pool from './pg';

export interface AuditEvent {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  result: 'SUCCESS' | 'FAILURE';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export async function auditLog(event: AuditEvent): Promise<void> {
  await pool.query(`
    INSERT INTO audit_logs (
      event_id, user_id, action, resource, resource_id,
      result, ip_address, user_agent, metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
  `, [
    crypto.randomUUID(),
    event.userId,
    event.action,
    event.resource,
    event.resourceId,
    event.result,
    event.ipAddress,
    event.userAgent,
    event.metadata ? JSON.stringify(event.metadata) : null
  ]);
}
```

---

## Phase 6: Testing & Deployment

### Step 6.1: Unit Tests

Create `src/agents/__tests__/context-agent.test.ts`:

```typescript
import { ContextAgent } from '../context-agent';

describe('ContextAgent', () => {
  it('should fetch context for a meeting', async () => {
    const agent = new ContextAgent();
    const result = await agent.invoke({
      meetingId: 'test-meeting-id',
      userId: 'test-user-id',
      accessToken: 'test-token'
    });
    
    expect(result).toHaveProperty('meeting');
    expect(result).toHaveProperty('similarMeetings');
    expect(result).toHaveProperty('similarEmails');
  });
});
```

### Step 6.2: Integration Tests

Create `src/__tests__/integration/meeting-prep.test.ts`:

```typescript
import { MeetingPrepOrchestrator } from '../../agents/orchestrator';

describe('Meeting Preparation Integration', () => {
  it('should generate a complete preparation brief', async () => {
    const orchestrator = new MeetingPrepOrchestrator();
    const result = await orchestrator.execute({
      meetingId: 'real-meeting-id',
      userId: 'real-user-id',
      accessToken: 'real-token'
    });
    
    expect(result.brief).toBeDefined();
    expect(result.talkingPoints).toBeInstanceOf(Array);
    expect(result.errors).toHaveLength(0);
  }, 30000); // 30 second timeout
});
```

### Step 6.3: Deploy to Azure

```bash
# Build application
npm run build

# Deploy to Azure App Service
az webapp up \
  --resource-group workgraph-rg \
  --name workgraph-app \
  --plan workgraph-plan \
  --runtime "NODE:18-lts" \
  --location eastus

# Configure environment variables
az webapp config appsettings set \
  --resource-group workgraph-rg \
  --name workgraph-app \
  --settings @env-vars.json

# Enable logging
az webapp log config \
  --resource-group workgraph-rg \
  --name workgraph-app \
  --application-logging filesystem \
  --level information
```

---

## Monitoring & Maintenance

### Monitor Agent Performance

Use LangSmith dashboard:
- Track agent execution times
- Monitor token usage
- Identify errors and retries
- Analyze user feedback

### Cost Optimization

1. **Monitor OpenAI costs** via Azure Cost Management
2. **Optimize cache hit rates** (target: >80%)
3. **Batch embedding requests** to reduce API calls
4. **Use smaller models** for simple tasks (GPT-4o-mini)

### Database Maintenance

```sql
-- Vacuum and analyze tables weekly
VACUUM ANALYZE meetings;
VACUUM ANALYZE emails;
VACUUM ANALYZE file_chunks;

-- Rebuild vector indexes monthly
REINDEX INDEX meetings_embedding_idx;
REINDEX INDEX emails_embedding_idx;
REINDEX INDEX file_chunks_embedding_idx;

-- Clean up old audit logs (retain 2 years)
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '2 years';
```

---

## Troubleshooting

### Common Issues

1. **Vector search is slow**
   - Check index creation: `\d+ meetings_embedding_idx`
   - Increase `lists` parameter in IVFFlat index
   - Consider using HNSW index for better performance

2. **High OpenAI costs**
   - Check cache hit rates
   - Review token usage in LangSmith
   - Optimize prompts
   - Use GPT-4o-mini where appropriate

3. **Agent workflow errors**
   - Check LangSmith traces
   - Review audit logs
   - Verify API permissions
   - Check network connectivity

4. **Redis connection issues**
   - Verify TLS settings
   - Check firewall rules
   - Increase connection timeout

---

## Next Steps

1. **Phase 1-2 Complete**: Database and Azure services ready
2. **Phase 3-4 Complete**: LangGraph and agents implemented
3. **Phase 5 Complete**: Security measures in place
4. **Phase 6**: Testing and deployment

**Ready for production!**

---

**Document Version:** 1.0  
**Last Updated:** February 11, 2026  
**Maintained by:** Development Team
