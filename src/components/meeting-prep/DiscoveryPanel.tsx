"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CandidateCard } from "./CandidateCard";
import { AlertCircle, Loader2, Calendar, Mail, Users, File, Search, Sparkles, TrendingUp, Clock, Share2, FileText } from "lucide-react";
import { getFileTypeInfo, detectFileOrigin, ORIGIN_CONFIG } from "@/lib/file-utils";
import { FileTypeIcon } from "@/components/FileTypeIcon";

interface DiscoveryPanelProps {
  meetingId: string;
  onGenerate?: (result: any) => void;
}

interface MeetingCandidate {
  id: string;
  subject: string;
  startTime: string;
  endTime: string;
  score: number;
  autoSelected: boolean;
  attendeeCount: number;
  hasTranscript?: boolean;
  reasoning: string;
}

interface EmailCandidate {
  id: string;
  subject: string;
  from: string;
  fromEmail: string;
  receivedTime: string;
  score: number;
  autoSelected: boolean;
  hasAttachments: boolean;
  isPartOfChain?: boolean;
  chainEmailCount?: number;
  reasoning: string;
}

interface TeamCandidate {
  id: string;
  name: string;
  description?: string;
  score: number;
  autoSelected: boolean;
  channels: ChannelCandidate[];
  reasoning: string;
}

interface ChannelCandidate {
  id: string;
  displayName: string;
  description?: string;
  selected: boolean;
}

type DocumentSource = "trending" | "used" | "shared" | "search" | "recent";

interface FileCandidate {
  id: string;
  name: string;
  path: string;
  modifiedTime: string;
  score: number;
  autoSelected: boolean;
  owner?: string;
  size?: number;
  reasoning: string;
  source?: DocumentSource;
  containerName?: string;
  mimeType?: string;
}

interface DiscoveryData {
  targetMeeting: {
    id: string;
    subject: string;
    startTime: string;
    endTime: string;
  };
  candidates: {
    meetings: MeetingCandidate[];
    emails: EmailCandidate[];
    teams: TeamCandidate[];
    files: FileCandidate[];
  };
  stats: {
    totalMeetings: number;
    totalEmails: number;
    totalTeams: number;
    totalFiles: number;
    autoSelectedCount: number;
    fileSources?: Record<string, number>;
  };
  cached?: boolean;
  processingTimeMs?: number;
}

export function DiscoveryPanel({ meetingId, onGenerate }: DiscoveryPanelProps) {
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DiscoveryData | null>(null);
  
  // Keywords for filtering
  const [keywords, setKeywords] = useState("");
  const [keywordsApplied, setKeywordsApplied] = useState(false);
  
  // Selection state
  const [selectedMeetings, setSelectedMeetings] = useState<Set<string>>(new Set());
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [selectedTeamChannels, setSelectedTeamChannels] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [multiStageSummary, setMultiStageSummary] = useState(false);
  const [fileSourceFilter, setFileSourceFilter] = useState<DocumentSource | "all">("all");

  // Fetch discovery data function
  const fetchDiscovery = async (keywordsToUse?: string) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('meetingId', meetingId);
      if (keywordsToUse) {
        params.set('keywords', keywordsToUse);
      }

      console.log(`🔍 Fetching discovery data for meeting: ${meetingId}${keywordsToUse ? ` with keywords: ${keywordsToUse}` : ''}`);
      const response = await fetch(`/api/meeting-prep/discover?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Discovery API error:', response.status, errorData);
        throw new Error(errorData.details || errorData.error || `Failed to fetch discovery data: ${response.statusText}`);
      }

      const result: DiscoveryData = await response.json();
      console.log('✅ Discovery data loaded:', result.stats);
      setData(result);

      // Initialize selections with auto-selected items
      const autoMeetings = new Set(
        result.candidates.meetings
          .filter((m) => m.autoSelected)
          .map((m) => m.id)
      );
      const autoEmails = new Set(
        result.candidates.emails
          .filter((e) => e.autoSelected)
          .map((e) => e.id)
      );
      const autoTeamChannels = new Set(
        result.candidates.teams
          .filter((t) => t.autoSelected)
          .flatMap((t) => t.channels.filter((c) => c.selected).map((c) => `${t.id}|${c.id}`))
      );
      const autoFiles = new Set(
        result.candidates.files
          .filter((f) => f.autoSelected)
          .map((f) => f.id)
      );

      setSelectedMeetings(autoMeetings);
      setSelectedEmails(autoEmails);
      setSelectedTeamChannels(autoTeamChannels);
      setSelectedFiles(autoFiles);
      setKeywordsApplied(!!keywordsToUse);
    } catch (err) {
      console.error("Error fetching discovery:", err);
      setError(err instanceof Error ? err.message : "Failed to load discovery data");
    } finally {
      setLoading(false);
    }
  };

  // Retry/Search handler with keywords
  const handleSearch = () => {
    setData(null);
    fetchDiscovery(keywords.trim() || undefined);
  };

  // Toggle selection handlers
  const toggleMeeting = (id: string, selected: boolean) => {
    setSelectedMeetings((prev) => {
      const newSet = new Set(prev);
      if (selected) newSet.add(id);
      else newSet.delete(id);
      return newSet;
    });
  };

  const toggleEmail = (id: string, selected: boolean) => {
    setSelectedEmails((prev) => {
      const newSet = new Set(prev);
      if (selected) newSet.add(id);
      else newSet.delete(id);
      return newSet;
    });
  };

  const toggleTeamChannel = (teamId: string, channelId: string, selected: boolean) => {
    const key = `${teamId}|${channelId}`;
    setSelectedTeamChannels((prev) => {
      const newSet = new Set(prev);
      if (selected) newSet.add(key);
      else newSet.delete(key);
      return newSet;
    });
  };

  const toggleFile = (id: string, selected: boolean) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (selected) newSet.add(id);
      else newSet.delete(id);
      return newSet;
    });
  };

  // Select/Deselect all handlers
  const selectAllMeetings = () => {
    setSelectedMeetings(new Set(data?.candidates.meetings.map((m) => m.id) || []));
  };

  const deselectAllMeetings = () => {
    setSelectedMeetings(new Set());
  };

  const selectAllEmails = () => {
    setSelectedEmails(new Set(data?.candidates.emails.map((e) => e.id) || []));
  };

  const deselectAllEmails = () => {
    setSelectedEmails(new Set());
  };

  const selectAllFiles = () => {
    setSelectedFiles(new Set(data?.candidates.files.map((f) => f.id) || []));
  };

  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  // Generate preparation brief
  const handleGenerate = async () => {
    if (!data) return;

    try {
      setProcessing(true);
      setError(null);

      // Build team/channel selections
      const teamChannelIds = Array.from(selectedTeamChannels).map((key) => {
        const [teamId, channelId] = key.split("|");
        return { teamId, channelId };
      });

      const response = await fetch("/api/meeting-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId: data.targetMeeting.id,
          selections: {
            meetingIds: Array.from(selectedMeetings),
            emailIds: Array.from(selectedEmails),
            teamChannelIds,
            fileIds: Array.from(selectedFiles),
          },
          multiStageSummary,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate preparation: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (onGenerate) {
        onGenerate(result);
      }
    } catch (err) {
      console.error("Error generating preparation:", err);
      setError(err instanceof Error ? err.message : "Failed to generate preparation");
    } finally {
      setProcessing(false);
    }
  };

  // Calculate total selected items
  const totalSelected =
    selectedMeetings.size +
    selectedEmails.size +
    selectedTeamChannels.size +
    selectedFiles.size;

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to Load Discovery Data</AlertTitle>
          <AlertDescription className="mt-2">
            <p>{error}</p>
            <p className="mt-2 text-sm opacity-80">
              This could be due to API permissions or network issues. Check the browser console for more details.
            </p>
          </AlertDescription>
        </Alert>
        <Button onClick={handleSearch} variant="outline">
          <Loader2 className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  // Initial state - show keyword search form
  if (!data && !loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Discover Related Content</h3>
          <p className="text-sm text-muted-foreground">
            Search for meetings, emails, teams, and files from the last 30 days related to this meeting.
          </p>
        </div>

        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="keywords" className="text-sm font-medium">
              Filter Keywords (optional)
            </Label>
            <Input
              id="keywords"
              placeholder="e.g., SBA, Small Business Accelerator, Project Alpha..."
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Add comma-separated keywords to boost relevance scores. Also searches matching Teams.
            </p>
          </div>

          <Button onClick={handleSearch} className="w-full">
            <Search className="mr-2 h-4 w-4" />
            Discover Related Content
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-semibold">Select Context for Preparation</h3>
          {keywordsApplied && (
            <Badge variant="outline" className="bg-primary/10">
              <Sparkles className="h-3 w-3 mr-1" />
              Keywords Applied
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Choose which meetings, emails, teams, and files to include in the preparation brief.
          {data.cached && (
            <span className="ml-2 text-xs">
              (Cached results)
            </span>
          )}
        </p>
      </div>

      {/* Keyword Search */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Filter keywords (e.g., SBA, Small Business Accelerator)..."
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <Button onClick={handleSearch} variant="secondary">
          <Search className="h-4 w-4 mr-2" />
          Re-scan
        </Button>
      </div>

      {/* Tabs for different source types */}
      <Tabs defaultValue="meetings" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="meetings" className="gap-2">
            <Calendar className="h-4 w-4" />
            Meetings
            <Badge variant="secondary" className="ml-1">
              {data.stats.totalMeetings}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="emails" className="gap-2">
            <Mail className="h-4 w-4" />
            Emails
            <Badge variant="secondary" className="ml-1">
              {data.stats.totalEmails}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-2">
            <Users className="h-4 w-4" />
            Teams
            <Badge variant="secondary" className="ml-1">
              {data.stats.totalTeams}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <File className="h-4 w-4" />
            Files
            <Badge variant="secondary" className="ml-1">
              {data.stats.totalFiles}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Meetings Tab */}
        <TabsContent value="meetings" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedMeetings.size} of {data.candidates.meetings.length} selected
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllMeetings}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAllMeetings}>
                Deselect All
              </Button>
            </div>
          </div>

          {data.candidates.meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No relevant meetings found in the last 30 days
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.candidates.meetings.map((meeting) => (
                <CandidateCard
                  key={meeting.id}
                  id={meeting.id}
                  title={meeting.subject}
                  metadata={`${new Date(meeting.startTime).toLocaleDateString()} - ${meeting.attendeeCount} attendees`}
                  score={meeting.score}
                  selected={selectedMeetings.has(meeting.id)}
                  reasoning={meeting.reasoning}
                  type="meeting"
                  onToggle={toggleMeeting}
                  additionalInfo={
                    meeting.hasTranscript ? (
                      <span className="text-success">✓ Transcript available</span>
                    ) : (
                      <span className="text-muted-foreground">No transcript</span>
                    )
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Emails Tab */}
        <TabsContent value="emails" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedEmails.size} of {data.candidates.emails.length} selected
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllEmails}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAllEmails}>
                Deselect All
              </Button>
            </div>
          </div>

          {data.candidates.emails.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No relevant emails found in the last 30 days
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.candidates.emails.map((email) => (
                <CandidateCard
                  key={email.id}
                  id={email.id}
                  title={email.subject}
                  metadata={`From: ${email.from} - ${new Date(email.receivedTime).toLocaleDateString()}`}
                  score={email.score}
                  selected={selectedEmails.has(email.id)}
                  reasoning={email.reasoning}
                  type="email"
                  onToggle={toggleEmail}
                  additionalInfo={
                    <div className="flex gap-3">
                      {email.hasAttachments && (
                        <span>📎 Has attachments</span>
                      )}
                      {email.isPartOfChain && (
                        <span>💬 Part of {email.chainEmailCount}-email thread</span>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Teams Tab */}
        <TabsContent value="teams" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {selectedTeamChannels.size} channels selected
          </p>

          {data.candidates.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No relevant teams found
            </p>
          ) : (
            <div className="space-y-4">
              {data.candidates.teams.map((team) => (
                <div key={team.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-medium">{team.name}</h4>
                    <Badge className={team.score >= 70 ? "bg-success/10 text-success border-success/20" : "bg-muted"}>
                      {team.score}%
                    </Badge>
                  </div>
                  
                  {team.channels.length > 0 && (
                    <div className="ml-6 space-y-2">
                      {team.channels.map((channel) => (
                        <div
                          key={channel.id}
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/30 cursor-pointer"
                          onClick={() => toggleTeamChannel(team.id, channel.id, !selectedTeamChannels.has(`${team.id}|${channel.id}`))}
                        >
                          <Checkbox
                            checked={selectedTeamChannels.has(`${team.id}|${channel.id}`)}
                            onCheckedChange={(checked) => toggleTeamChannel(team.id, channel.id, checked as boolean)}
                          />
                          <span className="text-sm">{channel.displayName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedFiles.size} of {data.candidates.files.length} selected
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllFiles}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAllFiles}>
                Deselect All
              </Button>
            </div>
          </div>

          {/* Source filter buttons */}
          {data.stats.fileSources && Object.keys(data.stats.fileSources).length > 1 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={fileSourceFilter === "all" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFileSourceFilter("all")}
              >
                All ({data.candidates.files.length})
              </Button>
              {(["trending", "used", "shared", "search", "recent"] as const).map((source) => {
                const count = data.stats.fileSources?.[source] || 0;
                if (count === 0) return null;
                const sourceConfig = {
                  trending: { icon: TrendingUp, label: "Trending" },
                  used: { icon: Clock, label: "Recently Used" },
                  shared: { icon: Share2, label: "Shared" },
                  search: { icon: Search, label: "Search Match" },
                  recent: { icon: FileText, label: "Recent" },
                } as const;
                const config = sourceConfig[source];
                const Icon = config.icon;
                return (
                  <Button
                    key={source}
                    variant={fileSourceFilter === source ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setFileSourceFilter(source)}
                  >
                    <Icon className="mr-1 h-3 w-3" />
                    {config.label} ({count})
                  </Button>
                );
              })}
            </div>
          )}

          {data.candidates.files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No relevant files found
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.candidates.files
                .filter((file) => fileSourceFilter === "all" || file.source === fileSourceFilter)
                .map((file) => {
                  const sourceConfig: Record<string, { icon: typeof TrendingUp; label: string; className: string }> = {
                    trending: { icon: TrendingUp, label: "Trending", className: "bg-info/10 text-info border-info/20" },
                    used: { icon: Clock, label: "Recently Used", className: "bg-muted text-muted-foreground border-border" },
                    shared: { icon: Share2, label: "Shared", className: "bg-accent text-accent-foreground border-accent/30" },
                    search: { icon: Search, label: "Search Match", className: "bg-warning/10 text-warning border-warning/20" },
                    recent: { icon: FileText, label: "Recent", className: "bg-success/10 text-success border-success/20" },
                  };
                  const config = file.source ? sourceConfig[file.source] : null;
                  const SourceIcon = config?.icon;

                  // File type icon with color
                  const typeInfo = getFileTypeInfo(file.mimeType, file.name);

                  // File origin (OneDrive / SharePoint / Teams)
                  const origin = detectFileOrigin(file.path);
                  const OriginIcon = ORIGIN_CONFIG[origin].icon;

                  return (
                    <CandidateCard
                      key={file.id}
                      id={file.id}
                      title={file.name}
                      metadata={`${file.containerName ? `in ${file.containerName}` : ""}${file.owner ? `${file.containerName ? " · " : ""}${file.owner}` : ""}`}
                      score={file.score}
                      selected={selectedFiles.has(file.id)}
                      reasoning={file.reasoning}
                      type="file"
                      onToggle={toggleFile}
                      customIcon={<FileTypeIcon typeInfo={typeInfo} size="sm" />}
                      additionalInfo={
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="text-xs font-normal gap-1">
                            <OriginIcon className="h-3 w-3" />
                            {ORIGIN_CONFIG[origin].label}
                          </Badge>
                          {config && SourceIcon && (
                            <Badge variant="outline" className={`text-xs font-normal ${config.className}`}>
                              <SourceIcon className="mr-1 h-3 w-3" />
                              {config.label}
                            </Badge>
                          )}
                        </div>
                      }
                    />
                  );
                })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Action Bar */}
      <div className="sticky bottom-0 bg-background border-t border-border pt-4 space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="multi-stage"
                checked={multiStageSummary}
                onCheckedChange={(checked) => setMultiStageSummary(checked as boolean)}
              />
              <label
                htmlFor="multi-stage"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Use multi-stage summarization (for large contexts)
              </label>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              {totalSelected} {totalSelected === 1 ? "item" : "items"} selected
            </p>
            <Button
              onClick={handleGenerate}
              disabled={processing || totalSelected === 0}
              size="lg"
            >
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Preparation Brief
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
