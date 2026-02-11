# WorkGraph.ai System Architecture Diagrams

This document contains detailed architecture diagrams for the recommended agentic architecture.

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WebApp[Web App<br/>Next.js]
        MobileApp[Mobile App<br/>PWA]
        TeamsTab[Teams Tab<br/>React]
    end
    
    subgraph "API Gateway Layer"
        APIGateway[API Gateway<br/>Next.js Routes]
        Auth[Authentication<br/>NextAuth.js]
        RateLimit[Rate Limiting]
        Validation[Request Validation]
    end
    
    subgraph "LangGraph Agent Layer"
        Orchestrator[Orchestrator Agent<br/>Workflow Coordinator]
        ContextAgent[Context Agent<br/>Data Gathering]
        SummaryAgent[Summarization Agent<br/>Content Processing]
        BriefAgent[Brief Generation Agent<br/>Synthesis]
        EmailAgent[Email Agent]
        MeetingAgent[Meeting Agent]
        ChatAgent[Chat Agent]
        DocAgent[Document Agent]
        
        AgentMemory[(Agent Memory<br/>State & Checkpoints)]
    end
    
    subgraph "Data & AI Services"
        AzureOpenAI[Azure OpenAI<br/>GPT-4o & Embeddings]
        MicrosoftGraph[Microsoft Graph API<br/>M365 Data]
        DocIntel[Azure Document<br/>Intelligence]
        
        subgraph "Storage"
            PostgreSQL[(PostgreSQL<br/>+ pgvector)]
            Redis[(Redis Cache)]
            KeyVault[Azure Key Vault<br/>Secrets]
        end
        
        LangSmith[LangSmith<br/>Monitoring]
    end
    
    WebApp --> APIGateway
    MobileApp --> APIGateway
    TeamsTab --> APIGateway
    
    APIGateway --> Auth
    APIGateway --> RateLimit
    APIGateway --> Validation
    
    APIGateway --> Orchestrator
    
    Orchestrator --> ContextAgent
    Orchestrator --> SummaryAgent
    Orchestrator --> BriefAgent
    Orchestrator --> AgentMemory
    
    ContextAgent --> EmailAgent
    ContextAgent --> MeetingAgent
    ContextAgent --> ChatAgent
    ContextAgent --> DocAgent
    
    EmailAgent --> PostgreSQL
    MeetingAgent --> PostgreSQL
    ChatAgent --> PostgreSQL
    DocAgent --> PostgreSQL
    
    ContextAgent --> MicrosoftGraph
    SummaryAgent --> AzureOpenAI
    BriefAgent --> AzureOpenAI
    DocAgent --> DocIntel
    
    ContextAgent --> Redis
    SummaryAgent --> Redis
    
    Orchestrator --> LangSmith
    
    Auth --> KeyVault
    
    style Orchestrator fill:#4A90E2,stroke:#2E5C8A,color:#fff
    style ContextAgent fill:#7B68EE,stroke:#5D4DB3,color:#fff
    style SummaryAgent fill:#7B68EE,stroke:#5D4DB3,color:#fff
    style BriefAgent fill:#7B68EE,stroke:#5D4DB3,color:#fff
    style PostgreSQL fill:#336791,stroke:#274567,color:#fff
    style AzureOpenAI fill:#10A37F,stroke:#0C7D5F,color:#fff
```

## 2. Meeting Preparation Workflow

```mermaid
flowchart TD
    Start([User Request:<br/>Meeting Prep]) --> Auth{Authenticated?}
    
    Auth -->|No| Deny[Return 401]
    Auth -->|Yes| CheckAuth{Authorized?}
    
    CheckAuth -->|No| Forbidden[Return 403]
    CheckAuth -->|Yes| Orchestrator[Orchestrator Agent<br/>Initialize Workflow]
    
    Orchestrator --> FetchContext[Context Agent:<br/>Fetch Meeting & Context]
    
    FetchContext --> GetMeeting[Get Meeting Details<br/>from Graph API]
    GetMeeting --> GenEmbedding[Generate Meeting<br/>Embedding]
    
    GenEmbedding --> ParallelSearch[Parallel Vector Search]
    
    ParallelSearch --> SearchMeetings[Search Similar<br/>Meetings]
    ParallelSearch --> SearchEmails[Search Similar<br/>Emails]
    ParallelSearch --> SearchFiles[Search Similar<br/>Files]
    ParallelSearch --> SearchChats[Get Recent<br/>Chats]
    
    SearchMeetings --> CheckCache{Results<br/>Found?}
    SearchEmails --> CheckCache
    SearchFiles --> CheckCache
    SearchChats --> CheckCache
    
    CheckCache -->|Yes| Summarize[Summarization Agent:<br/>Process Content]
    CheckCache -->|No| Empty[Return Empty Context]
    
    Summarize --> ParallelSummarize[Parallel Summarization]
    
    ParallelSummarize --> SumMeetings[Summarize<br/>Meetings]
    ParallelSummarize --> SumEmails[Summarize<br/>Emails]
    ParallelSummarize --> SumFiles[Summarize<br/>Files]
    
    SumMeetings --> CacheCheck{In Cache?}
    SumEmails --> CacheCheck
    SumFiles --> CacheCheck
    
    CacheCheck -->|Yes| UseCache[Use Cached<br/>Summary]
    CacheCheck -->|No| Generate[Generate New<br/>Summary via GPT-4o]
    
    Generate --> SaveCache[Save to Cache]
    UseCache --> AggregateSummaries[Aggregate All<br/>Summaries]
    SaveCache --> AggregateSummaries
    
    AggregateSummaries --> BriefGen[Brief Generation Agent:<br/>Create Preparation Brief]
    
    BriefGen --> RankContent[Rank Content<br/>by Relevance]
    RankContent --> GetUserPrefs[Get User<br/>Preferences]
    GetUserPrefs --> GenerateBrief[Generate Personalized<br/>Brief via GPT-4o]
    
    GenerateBrief --> ExtractPoints[Extract Talking<br/>Points]
    ExtractPoints --> ReturnResult[Return to Client]
    
    Empty --> ReturnResult
    ReturnResult --> End([End])
    
    style FetchContext fill:#7B68EE,stroke:#5D4DB3,color:#fff
    style Summarize fill:#7B68EE,stroke:#5D4DB3,color:#fff
    style BriefGen fill:#7B68EE,stroke:#5D4DB3,color:#fff
    style ParallelSearch fill:#50C878,stroke:#3A9B5C,color:#fff
    style ParallelSummarize fill:#50C878,stroke:#3A9B5C,color:#fff
```

## 3. Data Flow Architecture

```mermaid
graph LR
    subgraph "Data Sources"
        M365[Microsoft 365]
        Meetings[Teams Meetings]
        Emails[Outlook Email]
        Chats[Teams Chats]
        Files[OneDrive/SharePoint]
    end
    
    subgraph "Ingestion Layer"
        GraphAPI[Microsoft Graph API]
        DocIntel[Azure Document<br/>Intelligence]
    end
    
    subgraph "Processing Layer"
        Extract[Text Extraction]
        Chunk[Chunking Strategy]
        Embed[Embedding Generation<br/>text-embedding-3-small]
    end
    
    subgraph "Storage Layer"
        PGVector[(PostgreSQL + pgvector)]
        Metadata[(Metadata Tables)]
        Vectors[(Vector Embeddings)]
    end
    
    subgraph "Query Layer"
        VectorSearch[Vector Similarity<br/>Search]
        HybridSearch[Hybrid Search<br/>Vector + Full-Text]
        RankingAlgo[Ranking Algorithm]
    end
    
    subgraph "Agent Layer"
        Agents[LangGraph Agents]
    end
    
    Meetings --> GraphAPI
    Emails --> GraphAPI
    Chats --> GraphAPI
    Files --> GraphAPI
    Files --> DocIntel
    
    GraphAPI --> Extract
    DocIntel --> Extract
    
    Extract --> Chunk
    Chunk --> Embed
    
    Embed --> PGVector
    Extract --> Metadata
    Embed --> Vectors
    
    Agents --> VectorSearch
    Agents --> HybridSearch
    
    VectorSearch --> PGVector
    HybridSearch --> PGVector
    HybridSearch --> Metadata
    
    VectorSearch --> RankingAlgo
    HybridSearch --> RankingAlgo
    
    RankingAlgo --> Agents
    
    style Extract fill:#FF6B6B,stroke:#CC5555,color:#fff
    style Chunk fill:#FF6B6B,stroke:#CC5555,color:#fff
    style Embed fill:#FF6B6B,stroke:#CC5555,color:#fff
    style PGVector fill:#336791,stroke:#274567,color:#fff
```

## 4. Security Architecture

```mermaid
graph TB
    subgraph "Client"
        User[User]
    end
    
    subgraph "Authentication"
        AzureAD[Azure AD<br/>OAuth2 + PKCE]
        NextAuth[NextAuth.js<br/>Session Management]
    end
    
    subgraph "Authorization"
        RBACCheck[RBAC Check<br/>User Permissions]
        DataClassCheck[Data Classification<br/>Check]
        RateLimit[Rate Limiting<br/>100 req/min]
    end
    
    subgraph "Application Layer"
        APIGateway[API Gateway]
        Agents[LangGraph Agents]
    end
    
    subgraph "Secrets Management"
        KeyVault[Azure Key Vault]
        SecretCache[Secret Cache<br/>5 min TTL]
    end
    
    subgraph "Data Layer"
        EncryptedDB[(Encrypted Database<br/>TDE Enabled)]
        EncryptedFields[Field-Level<br/>Encryption<br/>AES-256-GCM]
    end
    
    subgraph "Audit & Monitoring"
        AuditLog[(Audit Logs<br/>2 Year Retention)]
        AzureMonitor[Azure Monitor]
        Alerts[Security Alerts]
    end
    
    User -->|1. Login| AzureAD
    AzureAD -->|2. JWT Token| NextAuth
    NextAuth -->|3. Session Cookie| User
    
    User -->|4. API Request + Cookie| APIGateway
    APIGateway -->|5. Validate Session| NextAuth
    NextAuth -->|6. Session Valid| RBACCheck
    
    RBACCheck -->|7. Check Permissions| DataClassCheck
    DataClassCheck -->|8. Check Data Access| RateLimit
    RateLimit -->|9. Allowed| Agents
    
    Agents -->|10. Request Secrets| SecretCache
    SecretCache -->|11. Cache Miss| KeyVault
    KeyVault -->|12. Return Secret| SecretCache
    SecretCache -->|13. Cached Secret| Agents
    
    Agents -->|14. Read/Write| EncryptedDB
    EncryptedDB -->|15. Decrypt| EncryptedFields
    EncryptedFields -->|16. Plaintext| Agents
    
    APIGateway --> AuditLog
    RBACCheck --> AuditLog
    DataClassCheck --> AuditLog
    Agents --> AuditLog
    
    AuditLog --> AzureMonitor
    AzureMonitor --> Alerts
    
    style AzureAD fill:#0078D4,stroke:#005A9E,color:#fff
    style KeyVault fill:#0078D4,stroke:#005A9E,color:#fff
    style EncryptedDB fill:#DC143C,stroke:#A0102A,color:#fff
    style AuditLog fill:#FF8C00,stroke:#CC7000,color:#fff
```

## 5. Document Processing Pipeline

```mermaid
flowchart TD
    Start([Document Discovery]) --> Search[Search OneDrive/<br/>SharePoint]
    
    Search --> Filter[Filter by:<br/>- Attendees<br/>- Keywords<br/>- Date Range]
    
    Filter --> Download[Download File<br/>Content]
    
    Download --> DetectType{File Type?}
    
    DetectType -->|PDF/Image| LayoutAPI[Document Intelligence<br/>Layout Analysis]
    DetectType -->|Word| ReadAPI[Document Intelligence<br/>Read API]
    DetectType -->|Excel| GraphAPI[Graph API<br/>Workbook API]
    DetectType -->|PowerPoint| ReadAPI
    
    LayoutAPI --> ExtractStructure[Extract:<br/>- Text<br/>- Tables<br/>- Key-Value Pairs<br/>- Page Layout]
    ReadAPI --> ExtractText[Extract:<br/>- Text<br/>- Pages]
    GraphAPI --> ExtractWorkbook[Extract:<br/>- Sheets<br/>- Tables<br/>- Formulas]
    
    ExtractStructure --> Chunking[Smart Chunking<br/>Strategy]
    ExtractText --> Chunking
    ExtractWorkbook --> Chunking
    
    Chunking --> ChunkByTables[Chunk by Tables<br/>+ Context]
    Chunking --> ChunkByPages[Chunk by Pages<br/>with Overlap]
    Chunking --> ChunkByWindow[Sliding Window<br/>Chunking]
    
    ChunkByTables --> Embedding[Generate Embeddings<br/>text-embedding-3-small]
    ChunkByPages --> Embedding
    ChunkByWindow --> Embedding
    
    Embedding --> Batch[Batch Processing<br/>10 chunks at a time]
    
    Batch --> Store[(Store in PostgreSQL<br/>file_chunks table)]
    
    Store --> Index[Create Vector Index<br/>IVFFlat]
    
    Index --> End([Document Ready<br/>for Search])
    
    style LayoutAPI fill:#0078D4,stroke:#005A9E,color:#fff
    style ReadAPI fill:#0078D4,stroke:#005A9E,color:#fff
    style Embedding fill:#10A37F,stroke:#0C7D5F,color:#fff
    style Store fill:#336791,stroke:#274567,color:#fff
```

## 6. LangGraph Workflow State Machine

```mermaid
stateDiagram-v2
    [*] --> Initialize
    
    Initialize --> FetchContext: Start Workflow
    
    FetchContext --> Summarize: Context Retrieved
    FetchContext --> HandleError: Error Occurred
    
    Summarize --> GenerateBrief: Summaries Complete
    Summarize --> HandleError: Error Occurred
    
    GenerateBrief --> Complete: Brief Generated
    GenerateBrief --> HandleError: Error Occurred
    
    HandleError --> FetchContext: Retry (< 3 attempts)
    HandleError --> Failed: Max Retries Exceeded
    
    Complete --> [*]: Success
    Failed --> [*]: Failed
    
    state FetchContext {
        [*] --> GetMeeting
        GetMeeting --> GenerateEmbedding
        GenerateEmbedding --> VectorSearch
        VectorSearch --> AggregateResults
        AggregateResults --> [*]
    }
    
    state Summarize {
        [*] --> CheckCache
        CheckCache --> UseCache: Cache Hit
        CheckCache --> GenerateNew: Cache Miss
        GenerateNew --> SaveCache
        UseCache --> [*]
        SaveCache --> [*]
    }
    
    state GenerateBrief {
        [*] --> RankContent
        RankContent --> GetPreferences
        GetPreferences --> GenerateDraft
        GenerateDraft --> ExtractPoints
        ExtractPoints --> [*]
    }
    
    note right of FetchContext
        Parallel execution of:
        - Meeting search
        - Email search
        - File search
        - Chat fetch
    end note
    
    note right of Summarize
        Parallel summarization
        with cache checking
    end note
    
    note right of GenerateBrief
        Personalized based on
        user preferences
    end note
```

## 7. Database Schema (Entity Relationship)

```mermaid
erDiagram
    USERS ||--o{ MEETINGS : "has"
    USERS ||--o{ EMAILS : "receives"
    USERS ||--o{ CHATS : "participates"
    USERS ||--o{ FILES : "owns"
    USERS ||--o{ USER_PREFERENCES : "has"
    
    MEETINGS ||--o{ MEETING_SUMMARIES : "has"
    MEETINGS ||--o{ MEETING_PARTICIPANTS : "includes"
    MEETINGS }o--o{ USERS : "attended_by"
    
    EMAILS ||--o{ EMAIL_SUMMARIES : "has"
    
    FILES ||--o{ FILE_CHUNKS : "contains"
    FILES ||--o{ FILE_METADATA : "has"
    
    MEETING_SUMMARIES ||--o{ CONTENT_RELATIONSHIPS : "related_to"
    EMAIL_SUMMARIES ||--o{ CONTENT_RELATIONSHIPS : "related_to"
    FILE_CHUNKS ||--o{ CONTENT_RELATIONSHIPS : "related_to"
    
    USERS {
        uuid id PK
        string email UK
        string name
        string role
        timestamp created_at
        timestamp last_login
    }
    
    MEETINGS {
        uuid id PK
        string user_id FK
        string graph_id UK
        string subject
        timestamp start_time
        timestamp end_time
        text transcript
        text summary
        vector embedding
        boolean has_transcript
        timestamp created_at
    }
    
    EMAILS {
        uuid id PK
        string user_id FK
        string graph_id UK
        string subject
        string from_email
        text body_content
        timestamp received_at
        vector embedding
        string importance
        boolean is_read
    }
    
    CHATS {
        uuid id PK
        string user_id FK
        string chat_id
        text message
        timestamp created_at
        vector embedding
    }
    
    FILES {
        uuid id PK
        string user_id FK
        string graph_id UK
        string name
        string extension
        bigint size_bytes
        string web_url
        timestamp modified_at
        timestamp last_processed_at
        string classification
    }
    
    FILE_CHUNKS {
        uuid id PK
        uuid file_id FK
        text content
        vector embedding
        int chunk_index
        int[] page_numbers
        jsonb metadata
    }
    
    MEETING_SUMMARIES {
        uuid id PK
        uuid meeting_id FK
        text summary
        jsonb key_points
        jsonb action_items
        jsonb decisions
        timestamp created_at
    }
    
    EMAIL_SUMMARIES {
        uuid id PK
        uuid email_id FK
        text summary
        string urgency
        jsonb key_requests
        timestamp created_at
    }
    
    USER_PREFERENCES {
        uuid id PK
        string user_id FK
        string brief_style
        string brief_length
        string[] focus_areas
        jsonb preferences
    }
    
    CONTENT_RELATIONSHIPS {
        uuid id PK
        string source_type
        uuid source_id
        string target_type
        uuid target_id
        float similarity_score
        timestamp discovered_at
    }
```

---

## Diagram Usage Notes

1. **Mermaid Diagrams**: All diagrams are written in Mermaid syntax and can be rendered in:
   - GitHub (native support)
   - VS Code (with Mermaid extension)
   - Online editors (mermaid.live)
   - Documentation sites (GitBook, Docusaurus)

2. **Export Options**: 
   - PNG/SVG: Use Mermaid CLI or online tools
   - Interactive: Embed in web pages with mermaid.js
   - Presentations: Export to slides or embed in PowerPoint

3. **Updates**: 
   - Keep diagrams in sync with implementation
   - Version control with git
   - Review during architecture changes

4. **Tools**:
   - Mermaid Live Editor: https://mermaid.live
   - VS Code Extension: Markdown Preview Mermaid Support
   - CLI: `npm install -g @mermaid-js/mermaid-cli`

---

**Created:** February 11, 2026  
**Format:** Mermaid  
**Maintained by:** Development Team
