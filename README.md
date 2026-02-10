# WorkGraph.ai - Intelligent Work Assistant

AI-powered workplace intelligence platform built on Microsoft Graph API. Empowers employees with a unified dashboard to access meeting summaries, email insights, task management, and AI-driven decision support.

## Vision

A one-stop solution for employees to start their workday with complete context - see pending items, flagged emails, upcoming meetings with preparation notes, to-dos, and intelligent insights to make informed decisions.

## Current Features

### Authentication & Security
- **Microsoft Azure AD Authentication** - Secure sign-in with organizational accounts
- **User Authorization** - Database-driven access control for authorized users
- **Session Management** - NextAuth.js with secure token handling

### Meeting Intelligence
- **Meeting List & Filter** - View recent Teams meetings with date range filtering
- **Real-time Transcript Access** - Fetch meeting transcripts via Graph API
- **AI-Powered Summaries** - Generate intelligent summaries using Azure OpenAI (GPT-4o)
- **Action Items Extraction** - Automatically identify decisions, metrics, and next steps
- **Meeting Attendance Reports** - Track who attended meetings and for how long
- **Customizable Summary Prompts** - Admin-configurable AI prompts with default/custom templates
- **Meeting Preparation** - Context-aware briefs with:
  - Related emails with attendees (semantic keyword matching)
  - Previous similar meetings with transcripts
  - Recent chats with participants
  - Attendee information and profiles
  - AI-generated preparation briefs combining all context

### Email Intelligence
- **Flagged Emails Dashboard** - View emails marked for follow-up
- **Email Categorization**:
  - Due today, overdue, upcoming, no due date
  - Unread important emails (Focused Inbox support)
- **Email Search** - Search messages across mailbox
- **Task Creation from Emails** - Convert email action items to To-Do tasks
- **Email Sharing** - Send formatted tasks via email to colleagues

### Task Management (Microsoft To-Do Integration)
- **View All Tasks** - Access tasks across all To-Do lists
- **Create Tasks** - Single and batch task creation
- **Task Lists** - Manage multiple task lists
- **Update & Delete** - Full CRUD operations on tasks
- **Due Today & Overdue** - Filtered views for urgent tasks
- **Task Sharing** - Share tasks with team members via email

### Daily Digest
- **Morning Dashboard** - Consolidated view of:
  - Today's meetings
  - Flagged emails (categorized by urgency)
  - Tasks due today and overdue
  - Unread important emails
  - Recent action items from meetings
- **Smart Prioritization** - AI-driven importance ranking
- **One-Click Navigation** - Quick access to detailed views

### People & Collaboration
- **People Search** - Find colleagues in organization
- **Organizational Insights** - View job titles, departments
- **Contact Integration** - Search across contacts and communication history

### Usage Analytics & Cost Tracking
- **Token Usage Tracking** - Monitor OpenAI API consumption
- **Cost Analysis** - Track costs per meeting/summary
- **Performance Metrics**:
  - Processing time per request
  - Average tokens per meeting
  - Model usage statistics
- **Detailed Usage Logs** - Audit trail for all AI operations
- **Export Capabilities** - Download usage data for reporting
- **Cost Optimization Insights** - Identify expensive operations

### Data Management
- **SQLite Database** - Local data persistence for:
  - Meeting metadata and summaries
  - User authorization lists
  - Custom prompt templates
  - Usage tracking and analytics
- **Cache Management** - API endpoint to clear cached data

### User Experience
- **Modern UI** - Tailwind CSS + Shadcn UI components
- **Dark/Light Mode** - Theme toggle support
- **Responsive Design** - Mobile-friendly interface
- **Real-time Loading States** - Spinners and skeleton loaders
- **Error Handling** - Graceful error messages and fallbacks

## Tech Stack

- **Framework**: Next.js 15 (App Router with React 19)
- **Styling**: Tailwind CSS 4 + Shadcn UI
- **Authentication**: NextAuth.js v4 with Azure AD
- **APIs**: 
  - Microsoft Graph API (Meetings, Mail, Tasks, Calendar, OneDrive, Chats)
  - Azure OpenAI (GPT-4o for summaries and insights)
- **Database**: SQLite (better-sqlite3) - Migration to PostgreSQL + pgvector planned
- **Language**: TypeScript 5
- **Deployment**: Docker support with docker-compose

## Microsoft Graph API Scopes Used

Current implementation uses the following Graph API permissions:

### Delegated Permissions (User Context)
- `User.Read` - Read user profile
- `Calendars.Read` - Read user calendar and meetings
- `OnlineMeetings.Read` - Access online meeting details
- `CallRecords.Read` - Read call records (for transcripts)
- `OnlineMeetingTranscript.Read.All` - Access meeting transcripts
- `Mail.Read` - Read user emails
- `Mail.ReadWrite` - Manage email flags and properties
- `Mail.Send` - Send emails
- `Tasks.ReadWrite` - Access and manage Microsoft To-Do tasks
- `People.Read` - Search for people in organization
- `Chat.Read` - Read Teams chat messages
- `Files.Read.All` - Read OneDrive and SharePoint files
- `Sites.Read.All` - Access SharePoint sites

## Getting Started

### Prerequisites

1. **Azure AD App Registration** with permissions listed above

2. **Azure OpenAI** deployment with GPT-4o or GPT-4 model

3. **Node.js** 18+ and npm/yarn

### Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your credentials in `.env.local`:
   ```bash
   # Azure AD (App Registration)
   AZURE_AD_CLIENT_ID=your-client-id
   AZURE_AD_CLIENT_SECRET=your-client-secret
   AZURE_AD_TENANT_ID=your-tenant-id

   # NextAuth
   NEXTAUTH_URL=http://localhost:3300
   NEXTAUTH_SECRET=generate-random-secret-here

   # Azure OpenAI
   AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com/
   AZURE_OPENAI_KEY=your-key
   AZURE_OPENAI_DEPLOYMENT=gpt-4o
   ```

3. Generate a NextAuth secret:
   ```bash
   openssl rand -base64 32
   ```

### Development Setup

4. Install dependencies:
   ```bash
   npm install
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3300](http://localhost:3300) in your browser.

### Docker Setup (Recommended for Production)

1. **Quick Start** - Use the startup script:
   ```bash
   ./start.sh
   ```

2. **Manual Docker Compose**:
   ```bash
   # Build and start
   docker-compose up -d
   
   # View logs
   docker-compose logs -f
   
   # Stop
   docker-compose down
   ```

3. Access at [http://localhost:3300](http://localhost:3300)

See [DOCKER.md](./DOCKER.md) for detailed Docker deployment instructions.

## Project Structure

```
src/
├── app/
│   ├── api/                         # Backend API routes
│   │   ├── auth/[...nextauth]/      # Azure AD authentication
│   │   ├── meetings/                # Meetings data & filtering
│   │   ├── summarize/               # AI meeting summaries
│   │   ├── transcript/              # Transcript fetching
│   │   ├── meeting-prep/            # Context-aware meeting prep
│   │   ├── attendance/              # Meeting attendance reports
│   │   ├── tasks/                   # To-Do task management
│   │   ├── people/                  # People search
│   │   ├── daily-digest/            # Morning dashboard data
│   │   ├── digest-summary/          # AI-generated digest
│   │   ├── email-followups/         # Flagged emails
│   │   ├── prompts/                 # Custom AI prompts (admin)
│   │   ├── usage/                   # Usage analytics
│   │   ├── users/                   # User management
│   │   └── cache/clear/             # Cache management
│   ├── meetings/                    # Meetings UI
│   │   ├── page.tsx                 # Meetings list
│   │   └── [id]/page.tsx            # Meeting detail
│   ├── digest/page.tsx              # Daily digest dashboard
│   ├── settings/page.tsx            # User settings
│   ├── usage/page.tsx               # Usage analytics
│   ├── admin/users/page.tsx         # Admin user management
│   └── page.tsx                     # Landing/login page
├── components/
│   ├── ui/                          # Shadcn UI components
│   ├── Header.tsx                   # App header with navigation
│   ├── SessionProvider.tsx          # NextAuth wrapper
│   └── theme-toggle.tsx             # Dark/light mode switch
├── lib/
│   ├── auth.ts                      # NextAuth config
│   ├── db.ts                        # SQLite database operations
│   ├── graph.ts                     # Microsoft Graph API client (2200+ lines)
│   │                                # - Meetings, Transcripts, Attendance
│   │                                # - Email, Tasks, Calendar
│   │                                # - OneDrive, Chats, People
│   ├── openai.ts                    # Azure OpenAI integration
│   ├── preparation-pipeline.ts      # Meeting prep AI pipeline
│   └── utils.ts                     # Utility functions
└── types/
    ├── meeting.ts                   # Type definitions
    └── next-auth.d.ts               # NextAuth extensions
```

## Deployment

### Local Development
```bash
npm install
npm run dev
# Open http://localhost:3300
```

### Docker (Recommended for Production)
```bash
# Quick start
./start.sh

# Or manual docker-compose
docker-compose up -d --build
docker-compose logs -f
```

**Important**: Update `NEXTAUTH_URL` in `.env.local` to your production domain before deploying.

## Related Documentation

- [Shadcn UI Enhancement Plan](./docs/SHADCN_UI_ENHANCEMENT_PLAN.md) - Comprehensive plan to enhance UI with professional components
- [Vector DB Enhancement Plan](./docs/vector-db-enhancement.md) - Detailed plan for PostgreSQL + pgvector migration
- [Features Roadmap](./docs/FEATURES_ROADMAP.md) - Upcoming features and enhancements

## Contributing

This is an internal application. For feature requests or issues, please contact the development team.

## License

Proprietary - Internal Use Only

See [DOCKER.md](./DOCKER.md) for complete Docker deployment guide.

### Vercel

```bash
npm i -g vercel
vercel
```

Set environment variables in the Vercel dashboard. Update port to 3300 in your configuration.

## License

MIT

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
