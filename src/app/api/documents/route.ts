import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthenticatedSession } from "@/lib/api-auth";
import {
  getTrendingDocuments,
  getUsedDocuments,
  getSharedDocuments,
  searchGraphContent,
  getRecentFiles,
  normalizeDriveItemToDocument,
  deduplicateDocuments,
  type DocumentSource,
  type DiscoveredDocument,
} from "@/lib/graph/files";

const VALID_SOURCES: DocumentSource[] = ["trending", "used", "shared", "search", "recent"];

export const GET = withAuth(async (req: NextRequest, session: AuthenticatedSession) => {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";
  const sourceFilter = searchParams.get("source") as DocumentSource | null;

  if (sourceFilter && !VALID_SOURCES.includes(sourceFilter)) {
    return NextResponse.json(
      { error: `Invalid source. Must be one of: ${VALID_SOURCES.join(", ")}` },
      { status: 400 }
    );
  }

  const token = session.accessToken;

  const counts: Record<DocumentSource, number> = {
    trending: 0,
    used: 0,
    shared: 0,
    search: 0,
    recent: 0,
  };

  let allDocs: DiscoveredDocument[] = [];

  // Fetch only the requested source, or all sources in parallel
  const shouldFetch = (s: DocumentSource) => !sourceFilter || sourceFilter === s;

  const promises: Promise<void>[] = [];

  if (shouldFetch("trending")) {
    promises.push(
      getTrendingDocuments(token).then((docs) => {
        counts.trending = docs.length;
        allDocs.push(...docs);
      })
    );
  }

  if (shouldFetch("used")) {
    promises.push(
      getUsedDocuments(token).then((docs) => {
        counts.used = docs.length;
        allDocs.push(...docs);
      })
    );
  }

  if (shouldFetch("shared")) {
    promises.push(
      getSharedDocuments(token).then((docs) => {
        counts.shared = docs.length;
        allDocs.push(...docs);
      })
    );
  }

  if (shouldFetch("search") && query) {
    promises.push(
      searchGraphContent(token, query).then((docs) => {
        counts.search = docs.length;
        allDocs.push(...docs);
      })
    );
  }

  if (shouldFetch("recent")) {
    promises.push(
      getRecentFiles(token)
        .then((items) => items.map((item) => normalizeDriveItemToDocument(item, "recent")))
        .then((docs) => {
          counts.recent = docs.length;
          allDocs.push(...docs);
        })
    );
  }

  await Promise.all(promises);

  const documents = deduplicateDocuments(allDocs);

  return NextResponse.json({
    documents,
    counts: {
      ...counts,
      total: documents.length,
    },
  });
});
