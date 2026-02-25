# Upcoming Enhancements Backlog

## Documents Page — Read & Process Document Content

**Priority:** Enhancement
**Status:** Planned

Currently the Documents page (`src/app/documents/page.tsx`) fetches document metadata (name, webUrl, mimeType, size, owner, etc.) from Microsoft Graph APIs (Insights trending/used/shared, search, recent files) and displays them as cards. Clicking a card opens the document in the browser via `webUrl`.

**What's missing:** The actual *content* of documents is not being read or processed. We only have metadata — no text extraction, no summarization, no content search within files.

**Planned work:**
1. **Document content extraction** — Use Graph API download URLs (`@microsoft.graph.downloadUrl`) to fetch file content for supported types (Word, PDF, text, etc.)
2. **Text extraction pipeline** — Parse downloaded content into plain text (e.g., using libraries for DOCX, PDF, PPTX parsing)
3. **AI-powered summarization** — Send extracted text to Azure OpenAI for summarization, key points extraction, etc.
4. **Content preview** — Show document summary/preview directly in the Documents page cards without needing to open the full file
5. **Deep search** — Search within document content, not just metadata/names
6. **Caching** — Cache extracted content and summaries in SQLite (or future PostgreSQL) to avoid repeated downloads

**Related files:**
- `src/lib/graph/files.ts` — Graph API functions (already has `getDriveItemDownloadUrl()`)
- `src/app/api/documents/route.ts` — Documents API endpoint
- `src/app/documents/page.tsx` — Documents UI page
- `src/lib/openai.ts` — Azure OpenAI integration for summarization

**Dependencies:**
- May need additional npm packages for file parsing (e.g., `mammoth` for DOCX, `pdf-parse` for PDF)
- Consider token limits for large documents when sending to OpenAI
- SQLite storage for caching (or future PostgreSQL migration per `docs/vector-db-enhancement.md`)
