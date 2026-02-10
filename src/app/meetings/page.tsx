"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import type { Meeting, MeetingSummary } from "@/types/meeting";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Calendar,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  User,
  RefreshCw,
  Video,
  FileText,
  Sparkles,
  CheckCircle,
  Target,
  TrendingUp,
  ArrowRight,
  Loader2,
  Copy,
  ListTodo,
  Share2,
  Check,
  Square,
  CheckSquare,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function MeetingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showOnlyWithTranscript, setShowOnlyWithTranscript] = useState(true);

  // Date range filter state
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    // Add 1 day to current date to ensure recently finished meetings show up
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().split("T")[0];
  });

  // Summary state for inline summaries
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, MeetingSummary>>({});
  const [loadingSummary, setLoadingSummary] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<string | null>(null);

  // Task creation state
  const [selectedActionItems, setSelectedActionItems] = useState<Record<string, Set<number>>>({});
  const [creatingTasks, setCreatingTasks] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareSubject, setShareSubject] = useState("");
  const [sharingTask, setSharingTask] = useState<{ meetingKey: string; index: number; item: { owner: string; task: string; deadline?: string } } | null>(null);
  
  // People search state for autocomplete
  const [peopleSearchResults, setPeopleSearchResults] = useState<Array<{ id: string; displayName: string; emailAddress: string; jobTitle?: string }>>([]);
  const [searchingPeople, setSearchingPeople] = useState(false);
  const [showPeopleDropdown, setShowPeopleDropdown] = useState(false);
  const [sharingInProgress, setSharingInProgress] = useState(false);
  
  // Share summary state
  const [shareSummaryDialogOpen, setShareSummaryDialogOpen] = useState(false);
  const [shareSummaryEmail, setShareSummaryEmail] = useState("");
  const [shareSummarySubject, setShareSummarySubject] = useState("");
  const [sharingSummary, setSharingSummary] = useState<{ meetingKey: string; summary: MeetingSummary; meeting: Meeting } | null>(null);
  const [sharingSummaryInProgress, setSharingSummaryInProgress] = useState(false);
  const [summaryPeopleResults, setSummaryPeopleResults] = useState<Array<{ id: string; displayName: string; emailAddress: string; jobTitle?: string }>>([]);
  const [showSummaryPeopleDropdown, setShowSummaryPeopleDropdown] = useState(false);
  const [searchingSummaryPeople, setSearchingSummaryPeople] = useState(false);
  const [includeAllAttendees, setIncludeAllAttendees] = useState(false);

  // Filter meetings based on transcript filter
  const filteredMeetings = showOnlyWithTranscript
    ? meetings.filter((m) => m.hasTranscript)
    : meetings;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      loadMeetings();
    }
  }, [session]);

  async function loadMeetings() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      const response = await fetch(`/api/meetings?${params.toString()}`);
      const data = await response.json();
      setMeetings(data.meetings || []);
    } catch (error) {
      console.error("Error loading meetings:", error);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }

  async function generateSummary(meeting: Meeting, e: React.MouseEvent) {
    e.stopPropagation();
    const meetingKey = meeting.onlineMeetingId || meeting.id;
    
    // If already expanded and has summary, just toggle
    if (expandedSummary === meetingKey && summaries[meetingKey]) {
      setExpandedSummary(null);
      return;
    }
    
    // If we have cached summary, just expand
    if (summaries[meetingKey]) {
      setExpandedSummary(meetingKey);
      return;
    }
    
    // Generate new summary
    setLoadingSummary(meetingKey);
    setExpandedSummary(meetingKey);
    
    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onlineMeetingId: meeting.onlineMeetingId,
          subject: meeting.subject,
          startDateTime: meeting.startDateTime,
          endDateTime: meeting.endDateTime,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      const summaryData = await response.json();
      setSummaries(prev => ({ ...prev, [meetingKey]: summaryData }));
    } catch (error) {
      console.error("Error generating summary:", error);
      setExpandedSummary(null);
    } finally {
      setLoadingSummary(null);
    }
  }

  function copySummary(meetingKey: string, summary: MeetingSummary) {
    const text = `
# ${summary.subject}
Date: ${new Date(summary.date).toLocaleDateString()}

## Summary
${summary.fullSummary}

## Key Decisions
${summary.keyDecisions.map((d) => `- ${d}`).join("\n")}

## Action Items
${summary.actionItems.map((a) => `- ${a.owner}: ${a.task}${a.deadline ? ` (Due: ${a.deadline})` : ""}`).join("\n")}

## Key Metrics
${summary.metrics.map((m) => `- ${m}`).join("\n")}

## Next Steps
${summary.nextSteps.map((s) => `- ${s}`).join("\n")}
    `.trim();
    navigator.clipboard.writeText(text);
    setCopiedSummary(meetingKey);
    setTimeout(() => setCopiedSummary(null), 2000);
  }

  // Toggle action item selection for task creation
  function toggleActionItemSelection(meetingKey: string, index: number) {
    setSelectedActionItems(prev => {
      const currentSet = prev[meetingKey] || new Set<number>();
      const newSet = new Set(currentSet);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return { ...prev, [meetingKey]: newSet };
    });
  }

  // Select all action items
  function selectAllActionItems(meetingKey: string, count: number) {
    setSelectedActionItems(prev => {
      const currentSet = prev[meetingKey] || new Set<number>();
      const allSelected = currentSet.size === count;
      if (allSelected) {
        return { ...prev, [meetingKey]: new Set<number>() };
      } else {
        return { ...prev, [meetingKey]: new Set(Array.from({ length: count }, (_, i) => i)) };
      }
    });
  }

  // Create tasks from selected action items
  async function createTasksFromActionItems(meetingKey: string, summary: MeetingSummary) {
    const selected = selectedActionItems[meetingKey];
    if (!selected || selected.size === 0) {
      toast.error("Please select at least one action item");
      return;
    }

    setCreatingTasks(meetingKey);

    try {
      const tasksToCreate = summary.actionItems
        .filter((_, index) => selected.has(index))
        .map(item => ({
          title: `${item.owner}: ${item.task}`,
          body: item.deadline ? `Due: ${item.deadline}` : undefined,
          meetingSubject: summary.subject,
        }));

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: tasksToCreate }),
      });

      if (!response.ok) {
        throw new Error("Failed to create tasks");
      }

      const result = await response.json();
      toast.success(`Created ${result.created.length} task(s) in Microsoft To Do`);
      
      // Clear selection after successful creation
      setSelectedActionItems(prev => ({ ...prev, [meetingKey]: new Set<number>() }));
    } catch (error) {
      console.error("Error creating tasks:", error);
      toast.error("Failed to create tasks");
    } finally {
      setCreatingTasks(null);
    }
  }

  // Share a task with another user
  async function shareTask() {
    if (!sharingTask || !shareEmail) {
      toast.error("Please enter an email address");
      return;
    }

    setSharingInProgress(true);
    try {
      const response = await fetch("/api/tasks/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: shareSubject || `${sharingTask.item.owner}: ${sharingTask.item.task}`,
          taskBody: sharingTask.item.deadline ? `Due: ${sharingTask.item.deadline}` : "",
          recipientEmail: shareEmail,
          meetingSubject: summaries[sharingTask.meetingKey]?.subject,
          emailSubject: shareSubject,
          assignAsTask: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to share task");
      }

      toast.success(`Task shared with ${shareEmail}`);
      setShareDialogOpen(false);
      setShareEmail("");
      setShareSubject("");
      setSharingTask(null);
      setPeopleSearchResults([]);
    } catch (error) {
      console.error("Error sharing task:", error);
      toast.error("Failed to share task");
    } finally {
      setSharingInProgress(false);
    }
  }

  // Search for people when typing in the share email field
  async function searchPeople(query: string) {
    if (query.length < 2) {
      setPeopleSearchResults([]);
      setShowPeopleDropdown(false);
      return;
    }

    setSearchingPeople(true);
    try {
      const response = await fetch(`/api/people?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setPeopleSearchResults(data.people || []);
        setShowPeopleDropdown(true);
      }
    } catch (error) {
      console.error("Error searching people:", error);
    } finally {
      setSearchingPeople(false);
    }
  }

  // Handle email input change with debounced search
  function handleEmailInputChange(value: string) {
    setShareEmail(value);
    // Debounce the search
    const timeoutId = setTimeout(() => {
      searchPeople(value);
    }, 300);
    return () => clearTimeout(timeoutId);
  }

  // Select a person from the autocomplete dropdown
  function selectPerson(person: { displayName: string; emailAddress: string }) {
    setShareEmail(person.emailAddress);
    setShowPeopleDropdown(false);
    setPeopleSearchResults([]);
  }

  // Search for people for summary sharing
  async function searchSummaryPeople(query: string) {
    if (query.length < 2) {
      setSummaryPeopleResults([]);
      setShowSummaryPeopleDropdown(false);
      return;
    }

    setSearchingSummaryPeople(true);
    try {
      const response = await fetch(`/api/people?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSummaryPeopleResults(data.people || []);
        setShowSummaryPeopleDropdown(true);
      }
    } catch (error) {
      console.error("Error searching people:", error);
    } finally {
      setSearchingSummaryPeople(false);
    }
  }

  // Handle summary email input change
  function handleSummaryEmailChange(value: string) {
    setShareSummaryEmail(value);
    const timeoutId = setTimeout(() => {
      searchSummaryPeople(value);
    }, 300);
    return () => clearTimeout(timeoutId);
  }

  // Select a person for summary sharing
  function selectSummaryPerson(person: { displayName: string; emailAddress: string }) {
    setShareSummaryEmail(person.emailAddress);
    setShowSummaryPeopleDropdown(false);
    setSummaryPeopleResults([]);
  }

  // Share the complete meeting summary via email
  async function shareSummary() {
    if (!sharingSummary || (!shareSummaryEmail && !includeAllAttendees)) {
      toast.error("Please enter an email address or include all attendees");
      return;
    }

    setSharingSummaryInProgress(true);
    try {
      const { summary, meeting } = sharingSummary;
      
      // Build recipient list
      const recipients: string[] = [];
      if (shareSummaryEmail) {
        recipients.push(shareSummaryEmail);
      }
      if (includeAllAttendees && meeting.participants?.attendees) {
        meeting.participants.attendees.forEach(attendee => {
          if (attendee.emailAddress?.address && !recipients.includes(attendee.emailAddress.address)) {
            recipients.push(attendee.emailAddress.address);
          }
        });
      }
      
      // Format the summary as HTML email content with proper formatting
      const summaryHtml = `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="color: #1a1a1a; border-bottom: 2px solid #0078d4; padding-bottom: 10px;">Meeting Summary</h1>
  
  <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 10px 0; color: #1a1a1a;">${summary.subject}</h2>
    <p style="margin: 0; color: #666;"><strong>Date:</strong> ${new Date(summary.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>

  <div style="margin-bottom: 25px;">
    <h3 style="color: #0078d4; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Summary</h3>
    <p style="line-height: 1.6; white-space: pre-wrap;">${summary.fullSummary}</p>
  </div>

  ${summary.keyDecisions.length > 0 ? `
  <div style="margin-bottom: 25px;">
    <h3 style="color: #0078d4; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Key Decisions</h3>
    <ul style="line-height: 1.8; padding-left: 20px;">
      ${summary.keyDecisions.map(d => `<li style="margin-bottom: 8px;">${d}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${summary.actionItems.length > 0 ? `
  <div style="margin-bottom: 25px;">
    <h3 style="color: #0078d4; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Action Items</h3>
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
      <thead>
        <tr style="background-color: #f0f0f0;">
          <th style="text-align: left; padding: 10px; border: 1px solid #ddd; font-weight: 600;">Owner</th>
          <th style="text-align: left; padding: 10px; border: 1px solid #ddd; font-weight: 600;">Task</th>
          <th style="text-align: left; padding: 10px; border: 1px solid #ddd; font-weight: 600;">Due Date</th>
        </tr>
      </thead>
      <tbody>
        ${summary.actionItems.map(a => `
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: 500;">${a.owner}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${a.task}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${a.deadline || 'Not specified'}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${summary.metrics.length > 0 ? `
  <div style="margin-bottom: 25px;">
    <h3 style="color: #0078d4; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Key Metrics</h3>
    <ul style="line-height: 1.8; padding-left: 20px;">
      ${summary.metrics.map(m => `<li style="margin-bottom: 8px;">${m}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${summary.nextSteps.length > 0 ? `
  <div style="margin-bottom: 25px;">
    <h3 style="color: #0078d4; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Next Steps</h3>
    <ul style="line-height: 1.8; padding-left: 20px;">
      ${summary.nextSteps.map(s => `<li style="margin-bottom: 8px;">${s}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />
  <p style="color: #888; font-size: 12px; text-align: center;">
    <em>This summary was generated by the Meeting Summarizer app.</em>
  </p>
</div>
      `.trim();

      const response = await fetch("/api/tasks/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: shareSummarySubject || `Meeting Summary: ${summary.subject}`,
          taskBody: summaryHtml,
          taskBodyHtml: true,
          recipientEmail: recipients[0],
          ccRecipients: recipients.slice(1),
          meetingSubject: summary.subject,
          emailSubject: shareSummarySubject,
          assignAsTask: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to share summary");
      }

      const recipientCount = recipients.length;
      toast.success(`Summary shared with ${recipientCount} recipient${recipientCount > 1 ? 's' : ''}`);
      setShareSummaryDialogOpen(false);
      setShareSummaryEmail("");
      setShareSummarySubject("");
      setIncludeAllAttendees(false);
      setSharingSummary(null);
      setSummaryPeopleResults([]);
    } catch (error) {
      console.error("Error sharing summary:", error);
      toast.error("Failed to share summary");
    } finally {
      setSharingSummaryInProgress(false);
    }
  }

  function viewMeetingDetails(meeting: Meeting) {
    // Use onlineMeetingId as the route param (required for transcript API)
    const id = meeting.onlineMeetingId || meeting.id;
    router.push(`/meetings/${encodeURIComponent(id)}`);
  }

  // Parse datetime from Graph API - it comes in UTC without 'Z' suffix
  function parseUTCDateTime(dateTimeString: string): Date {
    const cleanedString = dateTimeString.replace(/\.\d+$/, ""); // Remove trailing decimals
    return new Date(cleanedString + "Z"); // Add Z to parse as UTC, displays in local timezone
  }

  function formatMeetingDateTime(dateTimeString: string): string {
    const date = parseUTCDateTime(dateTimeString);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Only show full-page spinner for auth loading
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Title */}
        <div className="mb-8 border-l-4 border-primary pl-4">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Meetings & Recordings
          </h1>
          <p className="mt-2 text-muted-foreground">
            View your Teams meetings and generate AI-powered summaries
          </p>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="hover:shadow-md transition-shadow duration-300">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
                <Video className="h-6 w-6 text-primary" />
              </div>
              <div>
                {loading ? (
                  <Skeleton className="h-8 w-12 mb-1" />
                ) : (
                  <p className="text-2xl font-bold">{meetings.length}</p>
                )}
                <p className="text-sm text-muted-foreground">Total Meetings</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10 dark:bg-success/20">
                <FileText className="h-6 w-6 text-success" />
              </div>
              <div>
                {loading ? (
                  <Skeleton className="h-8 w-8 mb-1" />
                ) : (
                  <p className="text-2xl font-bold">
                    {meetings.filter((m) => m.hasTranscript).length}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">With Transcripts</p>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow duration-300">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 dark:bg-accent/20">
                <Sparkles className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">Ready</p>
                <p className="text-sm text-muted-foreground">AI Summarization</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="mb-6 space-y-4">
          {/* Date Range Filter */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card/50 backdrop-blur-sm p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>
            <Button onClick={loadMeetings} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="mr-2 h-4 w-4" />
              )}
              Apply Filter
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(new Date().getDate() - 30);
                setStartDate(thirtyDaysAgo.toISOString().split("T")[0]);
                setEndDate(tomorrow.toISOString().split("T")[0]);
              }}
            >
              Last 30 Days
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(new Date().getDate() - 7);
                setStartDate(sevenDaysAgo.toISOString().split("T")[0]);
                setEndDate(tomorrow.toISOString().split("T")[0]);
              }}
            >
              Last 7 Days
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setStartDate(new Date().toISOString().split("T")[0]);
                setEndDate(tomorrow.toISOString().split("T")[0]);
              }}
            >
              Today
            </Button>
          </div>

          {/* Secondary Toolbar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Meetings</h2>
              <p className="text-sm text-muted-foreground">
                {startDate === endDate
                  ? `Showing meetings for ${new Date(startDate).toLocaleDateString()}`
                  : `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Transcript Filter Toggle */}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={showOnlyWithTranscript}
                  onChange={(e) => setShowOnlyWithTranscript(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="flex items-center gap-1 text-sm">
                  <FileText className="h-4 w-4" />
                  With transcript only
                </span>
              </label>
              <Button variant="outline" onClick={loadMeetings} disabled={loading}>
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {filteredMeetings.length === 0 && !loading && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">
                {showOnlyWithTranscript
                  ? "No meetings with transcripts"
                  : "No meetings found"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {showOnlyWithTranscript
                  ? "Try disabling the transcript filter to see all meetings"
                  : "No meetings found in the selected date range"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Meetings List - Skeleton Loading */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-5 w-28" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-8 w-28" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Meetings List - Actual Data */}
        {!loading && (
          <div className="space-y-4">
            {filteredMeetings.map((meeting) => {
              const meetingKey = meeting.onlineMeetingId || meeting.id;
              const isExpanded = expandedSummary === meetingKey;
              const summary = summaries[meetingKey];
              const isLoadingSummary = loadingSummary === meetingKey;

              return (
                <Card
                  key={meeting.id}
                  className="group transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/40 dark:hover:shadow-primary/20 bg-gradient-to-br from-card to-card/50"
                >
                  <CardHeader 
                    className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-xl"
                    onClick={() => viewMeetingDetails(meeting)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <CardTitle className="text-lg font-semibold group-hover:text-primary transition-colors">
                        {meeting.subject || "Untitled Meeting"}
                      </CardTitle>
                      {meeting.hasTranscript ? (
                        <Badge variant="success" className="gap-1 shadow-sm">
                          <FileText className="h-3 w-3" />
                          Transcript Available
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          No Transcript
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-primary" />
                      {formatMeetingDateTime(meeting.startDateTime)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4 text-primary" />
                        <span className="font-medium">{meeting.organizer.emailAddress.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant={isExpanded ? "default" : "outline"}
                          size="sm"
                          disabled={!meeting.hasTranscript || isLoadingSummary}
                          onClick={(e) => generateSummary(meeting, e)}
                          className="shadow-sm"
                        >
                          {isLoadingSummary ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Summarizing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-1 h-4 w-4" />
                              {isExpanded ? "Hide Summary" : "Summarize"}
                              {isExpanded ? (
                                <ChevronUp className="ml-1 h-4 w-4" />
                              ) : (
                                <ChevronDown className="ml-1 h-4 w-4" />
                              )}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            viewMeetingDetails(meeting);
                          }}
                        >
                          View Details
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Expandable Summary Section */}
                    {isExpanded && (
                      <div className="mt-4 rounded-lg border bg-gradient-to-br from-muted/40 to-muted/60 p-5 shadow-inner">
                        {isLoadingSummary ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              <span className="text-sm text-muted-foreground">
                                Analyzing transcript and generating summary...
                              </span>
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-[90%]" />
                            <Skeleton className="h-4 w-[85%]" />
                          </div>
                        ) : summary ? (
                          <div className="space-y-4">
                            {/* Full Summary */}
                            <div>
                              <p className="text-sm leading-relaxed text-foreground">
                                {summary.fullSummary}
                              </p>
                            </div>

                            {/* Action buttons - Share and Copy */}
                            <div className="flex items-center gap-2 pt-2 border-t border-dashed">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSharingSummary({ meetingKey, summary, meeting });
                                  setShareSummarySubject(`Meeting Summary: ${summary.subject}`);
                                  setIncludeAllAttendees(false);
                                  setShareSummaryDialogOpen(true);
                                }}
                              >
                                <Share2 className="mr-1 h-3.5 w-3.5" />
                                Share Summary
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copySummary(meetingKey, summary);
                                }}
                              >
                                {copiedSummary === meetingKey ? (
                                  <>
                                    <CheckCircle className="mr-1 h-3.5 w-3.5" />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="mr-1 h-3.5 w-3.5" />
                                    Copy Summary
                                  </>
                                )}
                              </Button>
                            </div>

                              {/* Key Decisions */}
                              {summary.keyDecisions.length > 0 && (
                                <>
                                  <Separator />
                                  <div>
                                    <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                      <CheckCircle className="h-4 w-4 text-success" />
                                      Key Decisions
                                    </h4>
                                    <ul className="space-y-1 text-sm">
                                      {summary.keyDecisions.map((decision, i) => (
                                        <li key={i} className="flex gap-2">
                                          <span className="text-muted-foreground">•</span>
                                          {decision}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </>
                              )}

                              {/* Action Items */}
                              {summary.actionItems.length > 0 && (
                                <>
                                  <Separator />
                                  <div>
                                    <div className="mb-3 flex items-center justify-between">
                                      <h4 className="flex items-center gap-2 text-sm font-semibold">
                                        <Target className="h-4 w-4 text-primary" />
                                        Action Items
                                      </h4>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            selectAllActionItems(meetingKey, summary.actionItems.length);
                                          }}
                                        >
                                          {(selectedActionItems[meetingKey]?.size || 0) === summary.actionItems.length ? (
                                            <>
                                              <Square className="mr-1 h-3 w-3" />
                                              Deselect All
                                            </>
                                          ) : (
                                            <>
                                              <CheckSquare className="mr-1 h-3 w-3" />
                                              Select All
                                            </>
                                          )}
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          disabled={!selectedActionItems[meetingKey]?.size || creatingTasks === meetingKey}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            createTasksFromActionItems(meetingKey, summary);
                                          }}
                                        >
                                          {creatingTasks === meetingKey ? (
                                            <>
                                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                              Creating...
                                            </>
                                          ) : (
                                            <>
                                              <ListTodo className="mr-1 h-3 w-3" />
                                              Create Tasks ({selectedActionItems[meetingKey]?.size || 0})
                                            </>
                                          )}
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs px-2"
                                          disabled={!selectedActionItems[meetingKey]?.size}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const selectedIndices = Array.from(selectedActionItems[meetingKey] || []);
                                            if (selectedIndices.length === 1) {
                                              const item = summary.actionItems[selectedIndices[0]];
                                              setSharingTask({ meetingKey, index: selectedIndices[0], item });
                                              setShareSubject(`Action Item: ${item.task.slice(0, 50)}${item.task.length > 50 ? '...' : ''}`);
                                              setShareDialogOpen(true);
                                            } else if (selectedIndices.length > 1) {
                                              // For multiple tasks, share the first one but indicate multiple selected
                                              const item = summary.actionItems[selectedIndices[0]];
                                              setSharingTask({ meetingKey, index: selectedIndices[0], item });
                                              setShareSubject(`${selectedIndices.length} Action Items from: ${summary.subject}`);
                                              setShareDialogOpen(true);
                                            }
                                          }}
                                          title={`Share selected task${(selectedActionItems[meetingKey]?.size || 0) > 1 ? 's' : ''}`}
                                        >
                                          <Share2 className="h-3 w-3" />
                                          <span className="hidden sm:inline ml-1">Share ({selectedActionItems[meetingKey]?.size || 0})</span>
                                        </Button>
                                      </div>
                                    </div>
                                    <ul className="space-y-1 text-sm">
                                      {summary.actionItems.map((item, i) => {
                                        const isSelected = selectedActionItems[meetingKey]?.has(i);
                                        return (
                                          <li 
                                            key={i} 
                                            className={`group rounded bg-background p-2 flex items-start gap-2 cursor-pointer hover:bg-muted transition-colors ${isSelected ? 'ring-1 ring-primary' : ''}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleActionItemSelection(meetingKey, i);
                                            }}
                                          >
                                            <div className="mt-0.5">
                                              {isSelected ? (
                                                <CheckSquare className="h-4 w-4 text-primary" />
                                              ) : (
                                                <Square className="h-4 w-4 text-muted-foreground" />
                                              )}
                                            </div>
                                            <div className="flex-1">
                                              <span className="font-medium">{item.owner}:</span>{" "}
                                              {item.task}
                                              {item.deadline && (
                                                <span className="ml-2 text-muted-foreground">
                                                  (Due: {item.deadline})
                                                </span>
                                              )}
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                </>
                              )}

                              {/* Key Metrics */}
                              {summary.metrics.length > 0 && (
                                <>
                                  <Separator />
                                  <div>
                                    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                                      <TrendingUp className="h-4 w-4 text-purple-600" />
                                      Key Metrics
                                    </h4>
                                    <ul className="space-y-1 text-sm">
                                      {summary.metrics.map((metric, i) => (
                                        <li key={i} className="flex gap-2">
                                          <span className="text-muted-foreground">•</span>
                                          {metric}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </>
                              )}

                              {/* Next Steps */}
                              {summary.nextSteps.length > 0 && (
                                <>
                                  <Separator />
                                  <div>
                                    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                                      <ArrowRight className="h-4 w-4 text-orange-600" />
                                      Next Steps
                                    </h4>
                                    <ul className="space-y-1 text-sm">
                                      {summary.nextSteps.map((step, i) => (
                                        <li key={i} className="flex gap-2">
                                          <span className="text-muted-foreground">{i + 1}.</span>
                                          {step}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </>
                              )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Failed to generate summary. Please try again.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Share Task Dialog */}
        <Dialog open={shareDialogOpen} onOpenChange={(open: boolean) => {
          setShareDialogOpen(open);
          if (!open) {
            setPeopleSearchResults([]);
            setShowPeopleDropdown(false);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share Task</DialogTitle>
              <DialogDescription>
                Share this task with a colleague via email. They will receive the task details.
              </DialogDescription>
            </DialogHeader>
            {sharingTask && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="font-medium">{sharingTask.item.owner}: {sharingTask.item.task}</p>
                  {sharingTask.item.deadline && (
                    <p className="text-sm text-muted-foreground mt-1">Due: {sharingTask.item.deadline}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="share-subject">Email Subject</Label>
                  <Input
                    id="share-subject"
                    type="text"
                    placeholder="Email subject..."
                    value={shareSubject}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShareSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="share-email">Recipient Email</Label>
                  <div className="relative">
                    <div className="relative">
                      <Input
                        id="share-email"
                        type="email"
                        placeholder="Start typing a name or email..."
                        value={shareEmail}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEmailInputChange(e.target.value)}
                        onFocus={() => {
                          if (peopleSearchResults.length > 0) {
                            setShowPeopleDropdown(true);
                          }
                        }}
                        autoComplete="off"
                      />
                      {searchingPeople && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    
                    {/* Autocomplete Dropdown */}
                    {showPeopleDropdown && peopleSearchResults.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                        <ul className="max-h-60 overflow-auto py-1">
                          {peopleSearchResults.map((person) => (
                            <li
                              key={person.id}
                              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted transition-colors"
                              onClick={() => selectPerson(person)}
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                                {(person.displayName || person.emailAddress || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{person.displayName || person.emailAddress}</p>
                                <p className="text-xs text-muted-foreground truncate">{person.emailAddress}</p>
                                {person.jobTitle && (
                                  <p className="text-xs text-muted-foreground truncate">{person.jobTitle}</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Type to search for colleagues in your organization
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={shareTask} disabled={!shareEmail || sharingInProgress}>
                {sharingInProgress ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sharing...
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share Task
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share Summary Dialog */}
        <Dialog open={shareSummaryDialogOpen} onOpenChange={(open: boolean) => {
          setShareSummaryDialogOpen(open);
          if (!open) {
            setSummaryPeopleResults([]);
            setShowSummaryPeopleDropdown(false);
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Share Meeting Summary</DialogTitle>
              <DialogDescription>
                Share this complete meeting summary with a colleague via email.
              </DialogDescription>
            </DialogHeader>
            {sharingSummary && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-3 max-h-32 overflow-y-auto">
                  <p className="font-medium text-sm">{sharingSummary.summary.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(sharingSummary.summary.date).toLocaleDateString()}
                  </p>
                  <p className="text-sm mt-2 line-clamp-2">{sharingSummary.summary.fullSummary}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>• {sharingSummary.summary.keyDecisions.length} decisions</span>
                    <span>• {sharingSummary.summary.actionItems.length} action items</span>
                    <span>• {sharingSummary.summary.nextSteps.length} next steps</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="share-summary-subject">Email Subject</Label>
                  <Input
                    id="share-summary-subject"
                    type="text"
                    placeholder="Email subject..."
                    value={shareSummarySubject}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShareSummarySubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="share-summary-email">Recipient Email</Label>
                  <div className="relative">
                    <div className="relative">
                      <Input
                        id="share-summary-email"
                        type="email"
                        placeholder="Start typing a name or email..."
                        value={shareSummaryEmail}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSummaryEmailChange(e.target.value)}
                        onFocus={() => {
                          if (summaryPeopleResults.length > 0) {
                            setShowSummaryPeopleDropdown(true);
                          }
                        }}
                        autoComplete="off"
                      />
                      {searchingSummaryPeople && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    
                    {/* Autocomplete Dropdown */}
                    {showSummaryPeopleDropdown && summaryPeopleResults.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                        <ul className="max-h-60 overflow-auto py-1">
                          {summaryPeopleResults.map((person) => (
                            <li
                              key={person.id}
                              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted transition-colors"
                              onClick={() => selectSummaryPerson(person)}
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                                {(person.displayName || person.emailAddress || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{person.displayName || person.emailAddress}</p>
                                <p className="text-xs text-muted-foreground truncate">{person.emailAddress}</p>
                                {person.jobTitle && (
                                  <p className="text-xs text-muted-foreground truncate">{person.jobTitle}</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Type to search for colleagues in your organization
                  </p>
                </div>
                
                {/* Include all attendees option */}
                {sharingSummary.meeting?.participants?.attendees && sharingSummary.meeting.participants.attendees.length > 0 && (
                  <div className="flex items-start space-x-3 rounded-lg border p-3 bg-muted/30">
                    <Checkbox
                      id="include-attendees"
                      checked={includeAllAttendees}
                      onCheckedChange={(checked: boolean) => setIncludeAllAttendees(checked)}
                    />
                    <div className="flex-1">
                      <Label htmlFor="include-attendees" className="cursor-pointer font-medium">
                        Include all meeting attendees
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        CC {sharingSummary.meeting.participants.attendees.length} attendee{sharingSummary.meeting.participants.attendees.length > 1 ? 's' : ''}: {sharingSummary.meeting.participants.attendees.slice(0, 3).map(a => a.emailAddress?.name || a.emailAddress?.address).join(', ')}{sharingSummary.meeting.participants.attendees.length > 3 ? ` +${sharingSummary.meeting.participants.attendees.length - 3} more` : ''}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShareSummaryDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={shareSummary} disabled={(!shareSummaryEmail && !includeAllAttendees) || sharingSummaryInProgress}>
                {sharingSummaryInProgress ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sharing...
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share Summary
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
