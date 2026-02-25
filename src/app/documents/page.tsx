"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Search,
  TrendingUp,
  Clock,
  Share2,
  FolderOpen,
  X,
  type LucideIcon,
} from "lucide-react";
import { getFileTypeInfo, detectFileOrigin, ORIGIN_CONFIG, formatFileSize } from "@/lib/file-utils";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import type { DocumentSource } from "@/lib/graph/files";

interface DiscoveredDocument {
  id: string;
  name: string;
  webUrl: string;
  lastModifiedDateTime?: string;
  size?: number;
  mimeType?: string;
  owner?: string;
  containerName?: string;
  containerType?: string;
  source: DocumentSource;
}

interface DocumentsResponse {
  documents: DiscoveredDocument[];
  counts: {
    trending: number;
    used: number;
    shared: number;
    search: number;
    recent: number;
    total: number;
  };
}

type FilterTab = "all" | DocumentSource;

const SOURCE_LABELS: Record<DocumentSource, string> = {
  trending: "Trending",
  used: "Recently Used",
  shared: "Shared With Me",
  search: "Search Results",
  recent: "Recent Files",
};

const SOURCE_ICONS: Record<DocumentSource, LucideIcon> = {
  trending: TrendingUp,
  used: Clock,
  shared: Share2,
  search: Search,
  recent: FolderOpen,
};

const SOURCE_EMPTY_MESSAGES: Record<DocumentSource, string> = {
  trending: "No trending documents found. This may be unavailable for your tenant.",
  used: "No recently used documents found. This may be unavailable for your tenant.",
  shared: "No shared documents found. This may be unavailable for your tenant.",
  search: "No search results. Try a different query.",
  recent: "No recent files found.",
};

function DocumentCard({ doc }: { doc: DiscoveredDocument }) {
  const typeInfo = getFileTypeInfo(doc.mimeType, doc.name);
  const origin = detectFileOrigin(doc.webUrl, doc.containerType);
  const OriginIcon = ORIGIN_CONFIG[origin].icon;
  const modified = doc.lastModifiedDateTime ? new Date(doc.lastModifiedDateTime) : null;

  return (
    <Card
      className="group cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
      onClick={() => window.open(doc.webUrl, "_blank")}
    >
      <CardContent className="p-4 space-y-3">
        {/* Top row: colored icon + name + open button */}
        <div className="flex items-start gap-3">
          <FileTypeIcon typeInfo={typeInfo} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium leading-snug line-clamp-2" title={doc.name}>
                {doc.name}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(doc.webUrl, "_blank");
                }}
                aria-label="Open document"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            {(doc.containerName || doc.owner) && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {doc.containerName || doc.owner}
              </p>
            )}
          </div>
        </div>

        {/* Bottom row: badges + metadata */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-xs gap-1 font-normal">
              <OriginIcon className="h-3 w-3" />
              {ORIGIN_CONFIG[origin].label}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal">
              {typeInfo.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            {modified && (
              <span>{modified.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            )}
            {doc.size ? <span>{formatFileSize(doc.size)}</span> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DocumentsPage() {
  const [data, setData] = useState<DocumentsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const fetchDocuments = useCallback(async (q?: string) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (q) params.set("q", q);

      const response = await fetch(`/api/documents?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch documents");

      const result: DocumentsResponse = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;
    setActiveQuery(q);
    setActiveTab("all");
    fetchDocuments(q);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveQuery("");
    setData(null);
  };

  const filteredDocuments = data
    ? data.documents.filter((d) => {
        if (activeTab !== "all" && d.source !== activeTab) return false;
        if (activeQuery && d.source !== "search") {
          return d.name.toLowerCase().includes(activeQuery.toLowerCase());
        }
        return true;
      })
    : [];

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Error Loading Documents
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => fetchDocuments(activeQuery || undefined)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Documents
            </h1>
            <p className="text-muted-foreground mt-1">
              Discover trending, recent, and shared documents across your organization
            </p>
          </div>
          <Button
            onClick={() => fetchDocuments(activeQuery || undefined)}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
          {activeQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={handleClearSearch}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Button onClick={handleSearch} disabled={loading || !searchQuery.trim()}>
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
      </div>

      {/* No data yet — prompt user */}
      {!data && !loading && (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="text-lg font-medium text-foreground">Search your documents</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Enter a keyword above to search, or click Refresh to load trending, recent, and shared documents.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          <Skeleton className="h-10 w-full" />
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Source filter tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
              <TabsTrigger value="all" className="data-[state=active]:bg-muted">
                All
                <Badge variant="secondary" className="ml-1.5 text-xs">
                  {data.counts.total}
                </Badge>
              </TabsTrigger>
              {(Object.keys(SOURCE_LABELS) as DocumentSource[]).map((source) => {
                const count = data.counts[source] ?? 0;
                if (source === "search" && !activeQuery) return null;
                const Icon = SOURCE_ICONS[source];
                return (
                  <TabsTrigger key={source} value={source} className="data-[state=active]:bg-muted gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {SOURCE_LABELS[source]}
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {count}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {/* Documents grid */}
          {filteredDocuments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  {activeTab !== "all" ? SOURCE_EMPTY_MESSAGES[activeTab] : "No documents found."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredDocuments.map((doc) => (
                <DocumentCard key={`${doc.source}-${doc.id}`} doc={doc} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
