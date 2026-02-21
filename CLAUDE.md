# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on port 3300
npm run build        # Production build (standalone output)
npm run start        # Start production server on port 3300
npm run lint         # ESLint (flat config, next/core-web-vitals + TypeScript)
```

Docker: `docker compose up` (mounts `usage.db` and `./logs` as volumes, health check on :3300)

No test runner is configured.

## Architecture

Next.js 16 App Router monolith — all server logic runs as API route handlers, no separate backend. Client-heavy: all page components use `"use client"` with `useState`+`fetch` (no RSC data fetching currently).

### Key Modules (`src/lib/`)

- **`auth.ts`** — NextAuth v4 with Azure AD provider, manual token refresh via Microsoft OAuth2 endpoint. Access token exposed on session for Graph API calls.
- **`db.ts`** — SQLite data layer (`better-sqlite3`, synchronous). Stores usage metrics, authorized users, prompt templates, summary cache. File: `usage.db` at project root.
- **`graph.ts`** — Microsoft Graph API client. Handles meetings, transcripts, mail, tasks, calendar, chat, people, files. ~67KB.
- **`openai.ts`** — Azure OpenAI (GPT-4o) for summarization, digests, meeting prep, email summaries.
- **`preparation-pipeline.ts`** — Two-stage meeting preparation orchestrator.
- **`validations.ts`** — Zod schemas for all API route request bodies and query params. Use `parseBody(schema, data)` helper in routes.

### Auth & Authorization

- NextAuth v4 + Azure AD with ~15 delegated Graph scopes
- Database-driven user allowlist checked in every API route (`isUserAuthorized()`)
- Admin determined by `ADMIN_EMAIL` / `NEXT_PUBLIC_ADMIN_EMAIL` env vars
- Access token passed to client session and forwarded to Graph/OpenAI in API routes

### Data Flow

Browser -> API Route (session check + auth check) -> Microsoft Graph / Azure OpenAI -> SQLite cache -> JSON response

## Design System

Defined in `.github/copilot-instructions.md`. Key rules:

- **Shadcn/ui** (new-york style) with Radix primitives. Config in `components.json`.
- **Tailwind CSS v4** via PostCSS plugin (not v3 config file). CSS variables use HSL in `globals.css`.
- **Color palette**: Cool blue primary, teal accent. Strictly no purple, violet, or pink anywhere.
- **Icons**: Lucide React only (sizes: 12/16/20/24px). No emojis.
- **Dark mode**: Custom implementation via `localStorage` + `classList` toggle (not next-themes).
- **Toasts**: `sonner` (`<Toaster position="top-right" richColors />`)
- **Path alias**: `@/*` maps to `./src/*`

## Shadcn/ui Best Practices

- **Always use shadcn primitives over raw HTML elements.** Use `Checkbox` (not `<input type="checkbox">`), `Input` (not `<input>`), `Select` (not `<select>`), `Alert` (not styled `<div>` banners). Check `src/components/ui/` for available components before creating custom markup.
- **Use semantic color tokens exclusively** — never hardcode Tailwind palette colors like `text-purple-600`, `bg-red-50`, `border-slate-200`. These bypass the theme system and break dark mode.
- **Available semantic tokens**: `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info`. Each has a `-foreground` variant.
- **Use opacity modifiers** for subtle backgrounds: `bg-primary/10`, `border-warning/30`, `bg-destructive/5` — instead of light-shade palette colors (`bg-red-50`, `bg-blue-100`).
- **Component mapping**: `Alert` for feedback banners (errors/success/info), `Card` for content containers, `Badge` for status indicators, `Dialog` for modals, `Skeleton` for loading states.
- When adding new shadcn components: `npx shadcn@latest add <component-name>`

## Tailwind CSS v4 Best Practices

- **No `tailwind.config.ts`** — all configuration lives in `src/app/globals.css` via the `@theme inline` block. Colors defined as HSL CSS variables (`:root` for light, `.dark` for dark mode).
- **All colors must go through CSS variables** for automatic dark mode support. The `@theme inline` block maps CSS vars to Tailwind color utilities (e.g., `--color-primary: hsl(var(--primary))`).
- **Never use raw Tailwind palette colors** (`slate-200`, `blue-600`, `green-100`, etc.) in components. Always map to semantic tokens (`border-border`, `text-foreground`, `bg-card`, `text-muted-foreground`).
- **Adding new semantic colors**: Define `--new-color` and `--new-color-foreground` in `:root`, `.dark`, and the `@media prefers-color-scheme` block, then register in `@theme inline` as `--color-new-color: hsl(var(--new-color))`.

## Microsoft Graph API

- **Delegated permissions only** — all Graph calls use the user's access token from the NextAuth session. No application-level tokens.
- **Client factory**: `getGraphClient(accessToken)` in `src/lib/graph.ts` returns an initialized `@microsoft/microsoft-graph-client` Client instance.
- **API route pattern**: `getServerSession(authOptions)` -> extract `session.accessToken` -> call `graph.ts` function -> return JSON. Every route checks `isUserAuthorized()` from `src/lib/db.ts`.
- **Available scopes** (configured in `src/lib/auth.ts`): `User.Read`, `User.ReadBasic.All`, `People.Read`, `Calendars.Read`, `Calendars.ReadWrite`, `OnlineMeetings.Read`, `CallRecordings.Read.All`, `OnlineMeetingTranscript.Read.All`, `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `Chat.Read`, `ChatMessage.Send`, `Tasks.ReadWrite`, `Files.Read`, `Files.ReadWrite`
- **Query best practices**: Always use `$select` to request only needed fields, `$filter` for server-side filtering, `$top` to limit results, `$orderby` for sorting. This reduces payload size and Graph API throttling risk.
- **Token refresh** is automatic — handled by the `jwt` callback in `auth.ts` when `accessTokenExpires` is past. Refresh failures set `session.error = "RefreshAccessTokenError"`.
- **Adding new Graph endpoints**: Create the function in `graph.ts`, add the corresponding API route in `src/app/api/`, and verify the required scope is already in the auth config. Reference: [Microsoft Graph REST API](https://learn.microsoft.com/en-us/graph/api/overview)

## Environment

Copy `.env.example` to `.env.local`. Requires: Azure AD app registration, Azure OpenAI endpoint/key, NextAuth secret.

## Gotchas

- TLS verification is disabled (`rejectUnauthorized: false`) in `graph.ts`, `openai.ts`, and `next.config.ts` for corporate proxy compatibility.
- SQLite is synchronous — blocks the event loop under concurrent load. PostgreSQL migration is planned (`docs/vector-db-enhancement.md`).
- `package.json` name is still `meeting-summarizer`; app title is "Meeting Summarizer". WorkGraph.ai branding not fully applied.
- `output: "standalone"` in `next.config.ts` for Docker deployment.
