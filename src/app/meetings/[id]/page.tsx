"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Meeting, MeetingSummary, Attendee } from "@/types/meeting";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Copy,
  CheckCircle,
  ExternalLink,
  FileText,
  Sparkles,
  Target,
  TrendingUp,
  ArrowRight,
  User,
  Users,
  Video,
  UserCheck,
  UserX,
  Mail,
  BookOpen,
  ChevronDown,
  BarChart2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { parseUTCDateTime, formatMeetingDate, formatMeetingTime } from "@/lib/dateUtils";
import { formatSummaryAsMarkdown } from "@/lib/summaryUtils";
import { getInitials } from "@/lib/utils";
import { toast } from "sonner";
import type { MeetingPrep } from "@/lib/graph/meeting-prep";

interface EnhancedPrepStats {
  totalMeetings: number;
  meetingsCached: number;
  meetingsGenerated: number;
  totalEmails: number;
  emailsCached: number;
  emailsGenerated: number;
  processingTimeMs: number;
  briefTokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  reducedMeetingThreads?: number;
  reducedEmailThreads?: number;
}

interface RelatedMeetingSummary {
  meetingId: string;
  subject: string;
  date: string;
  cached: boolean;
}

interface RelatedEmailSummary {
  emailId: string;
  subject: string;
  from: string;
  date: string;
  cached: boolean;
}

export default function MeetingDetailsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const meetingId = params.id as string;

  // Meeting data state
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loadingMeeting, setLoadingMeeting] = useState(true);
  const [meetingNotFound, setMeetingNotFound] = useState(false);
  const [meetingLoaded, setMeetingLoaded] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Loading meeting details...");
  const [meetingPrep, setMeetingPrep] = useState<MeetingPrep | null>(null);
  const [loadingPrep, setLoadingPrep] = useState(false);

  // Attendance state
  const [actualAttendees, setActualAttendees] = useState<Attendee[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [attendanceFetched, setAttendanceFetched] = useState(false);

  // Transcript state
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [transcriptFetched, setTranscriptFetched] = useState(false);
  const [transcriptCopied, setTranscriptCopied] = useState(false);

  // Summary state
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [streamingText, setStreamingText] = useState<string>("");
  const [summaryCopied, setSummaryCopied] = useState(false);

  // Preparation brief state
  const [prepBrief, setPrepBrief] = useState<string | null>(null);
  const [loadingPrepBrief, setLoadingPrepBrief] = useState(false);
  const [prepBriefCopied, setPrepBriefCopied] = useState(false);
  const [enhancedPrepStats, setEnhancedPrepStats] = useState<EnhancedPrepStats | null>(null);
  const [isEnhancedPrep, setIsEnhancedPrep] = useState(false);
  const [relatedMeetingsList, setRelatedMeetingsList] = useState<RelatedMeetingSummary[]>([]);
  const [relatedEmailsList, setRelatedEmailsList] = useState<RelatedEmailSummary[]>([]);

  // OneNote state
  const [oneNoteOpen, setOneNoteOpen] = useState(false);
  const [oneNoteNotebooks, setOneNoteNotebooks] = useState<Array<{ id: string; displayName: string }>>([]);
  const [oneNoteSections, setOneNoteSections] = useState<Array<{ id: string; displayName: string }>>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [savingToOneNote, setSavingToOneNote] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState("details");
  
  // Check if meeting is in the future
  const isFutureMeeting = meeting ? new Date(meeting.startDateTime) > new Date() : false;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  // Fetch meeting data on mount (only once)
  useEffect(() => {
    if (session && meetingId && !meetingLoaded) {
      fetchMeetingData();
    }
  }, [session, meetingId, meetingLoaded]);

  // Fetch attendance when meeting is loaded
  useEffect(() => {
    if (meeting?.onlineMeetingId && !attendanceFetched) {
      fetchAttendance();
    }
  }, [meeting, attendanceFetched]);

  // Fetch transcript when transcript tab is selected
  useEffect(() => {
    if (activeTab === "transcript" && !transcriptFetched && meeting?.onlineMeetingId) {
      fetchTranscript();
    }
  }, [activeTab, transcriptFetched, meeting]);

  async function fetchMeetingData() {
    setLoadingMeeting(true);
    setLoadingStatus("Loading meeting details...");
    try {
      // First, try to find in past meetings
      const response = await fetch("/api/meetings");
      const data = await response.json();
      const foundMeeting = data.meetings?.find(
        (m: Meeting) => m.onlineMeetingId === meetingId || m.id === meetingId
      );
      
      if (foundMeeting) {
        setMeeting(foundMeeting);
        setMeetingLoaded(true);
      } else {
        // If not found in past meetings, try fetching from Graph API (future meeting)
        setLoadingStatus("Fetching meeting from calendar...");
        const graphResponse = await fetch(`/api/meetings?id=${meetingId}`);
        
        if (graphResponse.ok) {
          const graphData = await graphResponse.json();
          if (graphData.meeting) {
            setMeeting(graphData.meeting);
            setMeetingLoaded(true);
            
            // For future meetings, fetch meeting prep context
            setLoadingStatus("Loading meeting preparation context...");
            await fetchMeetingPrep(meetingId);
          } else {
            setMeetingNotFound(true);
          }
        } else {
          const errorData = await graphResponse.json();
          console.error("Failed to fetch meeting:", {
            status: graphResponse.status,
            error: errorData,
          });
          setMeetingNotFound(true);
        }
      }
    } catch (error) {
      console.error("Error fetching meeting:", error);
      setMeetingNotFound(true);
    } finally {
      setLoadingMeeting(false);
      setLoadingStatus("");
    }
  }

  async function fetchMeetingPrep(id: string, enhanced: boolean = false) {
    setLoadingPrep(true);
    setIsEnhancedPrep(enhanced);
    try {
      const url = enhanced 
        ? `/api/meeting-prep?meetingId=${id}&enhanced=true`
        : `/api/meeting-prep?meetingId=${id}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setMeetingPrep(data);
        
        // If enhanced prep, extract the brief, stats, and summaries lists
        if (enhanced && data.enhanced) {
          setPrepBrief(data.preparationBrief);
          setEnhancedPrepStats(data.stats);
          setRelatedMeetingsList(data.summaries?.meetings || []);
          setRelatedEmailsList(data.summaries?.emails || []);
        }
      } else {
        const errorData = await response.json();
        console.error("Failed to fetch meeting prep:", {
          status: response.status,
          error: errorData,
        });
      }
    } catch (error) {
      console.error("Error fetching meeting prep:", error);
    } finally {
      setLoadingPrep(false);
    }
  }

  async function fetchAttendance() {
    if (!meeting?.onlineMeetingId) return;

    setLoadingAttendance(true);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlineMeetingId: meeting.onlineMeetingId }),
      });

      const data = await response.json();
      if (data.attendanceReport?.attendees) {
        setActualAttendees(data.attendanceReport.attendees);
      }
    } catch (error) {
      console.error("Error fetching attendance:", error);
    } finally {
      setLoadingAttendance(false);
      setAttendanceFetched(true);
    }
  }

  async function fetchTranscript() {
    if (!meeting?.onlineMeetingId) return;

    setLoadingTranscript(true);
    try {
      const response = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlineMeetingId: meeting.onlineMeetingId }),
      });

      const data = await response.json();
      if (data.transcript) {
        setTranscript(data.transcript);
      }
    } catch (error) {
      console.error("Error fetching transcript:", error);
    } finally {
      setLoadingTranscript(false);
      setTranscriptFetched(true);
    }
  }

  async function generateSummary() {
    if (!meeting) return;

    setLoadingSummary(true);
    setStreamingText("");

    try {
      const response = await fetch("/api/summarize/stream", {
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

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "summary") {
                setStreamingText(prev => prev + data.delta);
              } else if (eventType === "structured") {
                setSummary(data as MeetingSummary);
                setStreamingText("");
              } else if (eventType === "error") {
                throw new Error(data.message);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
            eventType = "";
          }
        }
      }
    } catch (error) {
      console.error("Error generating summary:", error);
      setStreamingText("");
      toast.error("Failed to generate summary. Please try again.");
    } finally {
      setLoadingSummary(false);
    }
  }

  function copyTranscript() {
    if (transcript) {
      navigator.clipboard.writeText(transcript);
      setTranscriptCopied(true);
      setTimeout(() => setTranscriptCopied(false), 2000);
    }
  }

  function copySummary() {
    if (summary) {
      navigator.clipboard.writeText(formatSummaryAsMarkdown(summary));
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2000);
    }
  }

  async function generatePrepBrief() {
    if (!meetingPrep || !meeting) return;

    setLoadingPrepBrief(true);
    
    try {
      // Call enhanced API to generate comprehensive preparation brief
      await fetchMeetingPrep(meeting.id, true); // true = enhanced mode
      
    } catch (error) {
      console.error('Error generating preparation brief:', error);
      toast.error('Failed to generate preparation brief. Please try again.');
    } finally {
      setLoadingPrepBrief(false);
    }
  }

  function copyPrepBrief() {
    if (prepBrief) {
      navigator.clipboard.writeText(prepBrief);
      setPrepBriefCopied(true);
      setTimeout(() => setPrepBriefCopied(false), 2000);
    }
  }

  async function openOneNoteDialog() {
    setOneNoteOpen(true);
    if (oneNoteNotebooks.length === 0) {
      setLoadingNotebooks(true);
      try {
        const res = await fetch("/api/onenote?resource=notebooks");
        const data = await res.json();
        setOneNoteNotebooks(data.notebooks || []);
      } catch {
        toast.error("Failed to load OneNote notebooks.");
      } finally {
        setLoadingNotebooks(false);
      }
    }
  }

  async function onNotebookChange(notebookId: string) {
    setSelectedNotebook(notebookId);
    setSelectedSection("");
    setOneNoteSections([]);
    setLoadingSections(true);
    try {
      const res = await fetch(`/api/onenote?resource=sections&notebookId=${notebookId}`);
      const data = await res.json();
      setOneNoteSections(data.sections || []);
    } catch {
      toast.error("Failed to load sections.");
    } finally {
      setLoadingSections(false);
    }
  }

  async function saveToOneNote() {
    if (!meeting || !summary || !selectedSection) return;
    setSavingToOneNote(true);
    try {
      const res = await fetch("/api/onenote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: selectedSection,
          meeting: {
            subject: meeting.subject,
            startDateTime: meeting.startDateTime,
            organizer: meeting.organizer,
            participants: meeting.participants,
          },
          summary: {
            keyDecisions: summary.keyDecisions,
            actionItems: summary.actionItems,
            nextSteps: summary.nextSteps,
            fullSummary: summary.fullSummary,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Save failed");
      }

      const data = await res.json();
      toast.success("Meeting summary saved to OneNote.");
      setOneNoteOpen(false);

      if (data.page?.webUrl) {
        window.open(data.page.webUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      toast.error("Failed to save to OneNote. Please try again.");
    } finally {
      setSavingToOneNote(false);
    }
  }

  function formatDuration(start: string, end: string): string {
    const startDate = parseUTCDateTime(start);
    const endDate = parseUTCDateTime(end);
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) {
      return `${diffMins} minutes`;
    }
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? "s" : ""}`;
  }

  function formatAttendanceTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  }

  // Check if an invitee actually attended
  function didAttend(email: string): boolean {
    return actualAttendees.some(
      (a) => a.emailAddress.address.toLowerCase() === email.toLowerCase()
    );
  }

  // Get attendance duration for an attendee
  function getAttendanceDuration(email: string): number | undefined {
    const attendee = actualAttendees.find(
      (a) => a.emailAddress.address.toLowerCase() === email.toLowerCase()
    );
    return attendee?.totalAttendanceInSeconds;
  }

  // Auth loading or meeting loading - show nice loading state
  if (status === "loading" || loadingMeeting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Spinner size="lg" />
          </div>
          {loadingStatus && (
            <div className="space-y-2">
              <p className="text-lg font-medium">{loadingStatus}</p>
              <p className="text-sm text-muted-foreground">Please wait while we prepare your meeting information</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Meeting not found after loading
  if (!loadingMeeting && meetingNotFound) {
    return (
      <div className="min-h-screen bg-muted/30">
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            className="mb-6"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push("/meetings");
              }
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <Video className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">Meeting not found</h3>
              <p className="mb-4 text-muted-foreground">
                The meeting you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
              </p>
              <Button onClick={() => {
                if (window.history.length > 1) {
                  router.back();
                } else {
                  router.push("/meetings");
                }
              }}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const invitedAttendees = meeting?.participants?.attendees || [];

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Navigation */}
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push("/meetings");
            }
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {/* Meeting Header Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {loadingMeeting || !meeting ? (
                  <>
                    <Skeleton className="h-8 w-3/4 mb-2" />
                    <div className="flex gap-4 mt-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </>
                ) : (
                  <>
                    <CardTitle className="text-2xl">
                      {meeting.subject || "Untitled Meeting"}
                    </CardTitle>
                    <CardDescription className="mt-2 flex flex-wrap items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatMeetingDate(meeting.startDateTime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatMeetingTime(meeting.startDateTime)}
                        {" • "}
                        {formatDuration(meeting.startDateTime, meeting.endDateTime)}
                      </span>
                    </CardDescription>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {loadingMeeting || !meeting ? (
                  <Skeleton className="h-6 w-32" />
                ) : (
                  <>
                    {new Date(meeting.startDateTime) > new Date() && (
                      <Badge variant="default" className="bg-info">
                        <Clock className="h-3 w-3 mr-1" />
                        Upcoming
                      </Badge>
                    )}
                    {meeting.hasTranscript ? (
                      <Badge variant="success">Transcript Available</Badge>
                    ) : (
                      <Badge variant="secondary">No Transcript</Badge>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          {!loadingMeeting && meeting?.joinWebUrl && (
            <CardContent>
              <Button variant="outline" asChild>
                <a href={meeting.joinWebUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Teams
                </a>
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Meeting Prep Context - Only show for future meetings when NOT in preparation tab */}
        {meetingPrep && isFutureMeeting && activeTab !== "preparation" && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Meeting Preparation Available
                  </CardTitle>
                  <CardDescription className="mt-1">
                    We've gathered context about this meeting and attendees
                  </CardDescription>
                </div>
                <Button onClick={() => {
                  if (!prepBrief) {
                    generatePrepBrief();
                  } else {
                    setActiveTab("preparation");
                  }
                }}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {prepBrief ? "View Brief" : "Generate Brief"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-3 text-sm">
                {meetingPrep.context?.attendeeInfo && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{meetingPrep.context.attendeeInfo.length} attendees</span>
                  </div>
                )}
                {meetingPrep.context?.relatedEmails && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{meetingPrep.context.relatedEmails.length} related emails</span>
                  </div>
                )}
                {meetingPrep.context?.relatedMeetings && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{meetingPrep.context.relatedMeetings.length} related meetings</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className={`grid w-full ${isFutureMeeting ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Details
            </TabsTrigger>
            {isFutureMeeting && meetingPrep && (
              <TabsTrigger value="preparation" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Preparation
              </TabsTrigger>
            )}
            {!isFutureMeeting && (
              <>
                <TabsTrigger
                  value="transcript"
                  className="flex items-center gap-2"
                  disabled={loadingMeeting || !meeting?.hasTranscript}
                >
                  <FileText className="h-4 w-4" />
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="summary" className="flex items-center gap-2" disabled={loadingMeeting}>
                  <Sparkles className="h-4 w-4" />
                  Summary
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Meeting Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Organizer */}
                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <User className="h-4 w-4" />
                    Organizer
                  </h4>
                  {loadingMeeting ? (
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div>
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {meeting && getInitials(meeting.organizer.emailAddress.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{meeting?.organizer.emailAddress.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {meeting?.organizer.emailAddress.address}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Actual Attendees (who joined) */}
                {(actualAttendees.length > 0 || loadingAttendance) && (
                  <>
                    <div>
                      <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <UserCheck className="h-4 w-4 text-success" />
                        Joined Meeting ({actualAttendees.length})
                      </h4>
                      {loadingAttendance ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                              <Skeleton className="h-8 w-8 rounded-full" />
                              <div className="flex-1">
                                <Skeleton className="h-4 w-24 mb-1" />
                                <Skeleton className="h-3 w-32" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {actualAttendees.map((attendee, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-3"
                            >
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs bg-success/10 text-success">
                                  {getInitials(attendee.emailAddress.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {attendee.emailAddress.name}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {attendee.totalAttendanceInSeconds && 
                                    `Attended: ${formatAttendanceTime(attendee.totalAttendanceInSeconds)}`}
                                </p>
                              </div>
                              <Badge variant="success" className="text-xs">
                                Joined
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Separator />
                  </>
                )}

                {/* Invited Attendees */}
                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Invited ({invitedAttendees.length})
                    {actualAttendees.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        • Showing attendance status
                      </span>
                    )}
                  </h4>
                  {loadingMeeting ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="flex-1">
                            <Skeleton className="h-4 w-24 mb-1" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : invitedAttendees.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {invitedAttendees.map((attendee, index) => {
                        const attended = actualAttendees.length > 0 && didAttend(attendee.emailAddress.address);
                        const duration = getAttendanceDuration(attendee.emailAddress.address);
                        
                        return (
                          <div
                            key={index}
                            className={`flex items-center gap-3 rounded-lg border p-3 ${
                              actualAttendees.length > 0
                                ? attended
                                  ? "border-success/30 bg-success/5"
                                  : "border-destructive/30 bg-destructive/5"
                                : ""
                            }`}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={`text-xs ${
                                actualAttendees.length > 0
                                  ? attended
                                    ? "bg-success/10 text-success"
                                    : "bg-destructive/10 text-destructive"
                                  : ""
                              }`}>
                                {getInitials(attendee.emailAddress.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {attendee.emailAddress.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {duration ? `${formatAttendanceTime(duration)}` : attendee.emailAddress.address}
                              </p>
                            </div>
                            {actualAttendees.length > 0 && (
                              attended ? (
                                <UserCheck className="h-4 w-4 text-success" />
                              ) : (
                                <UserX className="h-4 w-4 text-destructive" />
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No attendee information available
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preparation Tab - For Future Meetings */}
          <TabsContent value="preparation">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Meeting Preparation Brief
                  </CardTitle>
                  {prepBrief && (
                    <Button variant="outline" size="sm" onClick={copyPrepBrief}>
                      {prepBriefCopied ? (
                        <CheckCircle className="mr-2 h-4 w-4" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {prepBriefCopied ? "Copied!" : "Copy Brief"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!prepBrief && !loadingPrepBrief && (
                  <div className="text-center py-8">
                    <Sparkles className="mx-auto mb-4 h-12 w-12 text-primary/50" />
                    <h3 className="mb-2 text-lg font-medium">
                      Generate Preparation Brief
                    </h3>
                    <p className="mb-6 text-sm text-muted-foreground max-w-md mx-auto">
                      Generate a comprehensive brief with attendee information, recent email context,
                      previous meetings, and suggested talking points to help you prepare for this meeting.
                    </p>
                    <Button
                      size="lg"
                      onClick={generatePrepBrief}
                      disabled={!meetingPrep}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Preparation Brief
                    </Button>
                    {!meetingPrep && (
                      <p className="mt-4 text-sm text-destructive">
                        Loading meeting context...
                      </p>
                    )}
                  </div>
                )}

                {loadingPrepBrief && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Spinner size="md" />
                      <div>
                        <p className="font-medium">Generating preparation brief...</p>
                        <p className="text-sm text-muted-foreground">
                          Analyzing meeting context and attendee information
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[95%]" />
                        <Skeleton className="h-4 w-[90%]" />
                      </div>
                      <Separator />
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-[80%]" />
                        <Skeleton className="h-3 w-[70%]" />
                      </div>
                    </div>
                  </div>
                )}

                {prepBrief && (
                  <div className="space-y-4">
                    {/* Source Content Lists */}
                    {(relatedMeetingsList.length > 0 || relatedEmailsList.length > 0) && (
                      <Card className="bg-muted/30">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Source Content Analysis
                          </CardTitle>
                          <CardDescription>
                            Verify the meetings and emails used for this preparation
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {relatedMeetingsList.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                <Video className="h-4 w-4" />
                                Related Meetings ({relatedMeetingsList.length})
                              </h4>
                              <div className="space-y-1.5">
                                {relatedMeetingsList.map((meeting, idx) => {
                                  const meetingDate = meeting.date ? new Date(meeting.date) : null;
                                  const formattedDate = meetingDate 
                                    ? meetingDate.toLocaleDateString('en-US', { 
                                        month: 'short', 
                                        day: 'numeric', 
                                        year: 'numeric' 
                                      }) 
                                    : 'Unknown date';
                                  
                                  return (
                                    <div 
                                      key={meeting.meetingId} 
                                      className="text-sm flex items-start gap-2 p-2 rounded bg-background/50"
                                    >
                                      <Badge variant={meeting.cached ? "secondary" : "default"} className="text-xs mt-0.5">
                                        {meeting.cached ? "Cached" : "New"}
                                      </Badge>
                                      <div className="flex-1">
                                        <div className="font-medium">{meeting.subject}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {formattedDate}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          
                          {relatedEmailsList.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                Related Emails ({relatedEmailsList.length})
                              </h4>
                              <div className="space-y-1.5">
                                {relatedEmailsList.map((email, idx) => {
                                  const emailDate = email.date ? new Date(email.date) : null;
                                  const formattedDate = emailDate 
                                    ? emailDate.toLocaleDateString('en-US', { 
                                        month: 'short', 
                                        day: 'numeric', 
                                        year: 'numeric' 
                                      }) 
                                    : 'Unknown date';
                                  
                                  return (
                                    <div 
                                      key={email.emailId} 
                                      className="text-sm flex items-start gap-2 p-2 rounded bg-background/50"
                                    >
                                      <Badge variant={email.cached ? "secondary" : "default"} className="text-xs mt-0.5">
                                        {email.cached ? "Cached" : "New"}
                                      </Badge>
                                      <div className="flex-1">
                                        <div className="font-medium">{email.subject}</div>
                                        <div className="text-xs text-muted-foreground">
                                          From: {email.from || 'Unknown'} • {formattedDate}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="bg-primary">
                          Ready to Present
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Copy this brief before joining the meeting
                        </span>
                      </div>
                      
                      {/* Enhanced Prep Stats */}
                      {enhancedPrepStats && isEnhancedPrep && (
                        <div className="space-y-2 pt-2 border-t">
                          <div className="flex items-center gap-2 text-sm">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="font-medium">Enhanced Preparation</span>
                            <Badge variant="secondary" className="text-xs">
                              {(enhancedPrepStats.processingTimeMs / 1000).toFixed(1)}s
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Meetings analyzed:</span>
                              <span className="ml-1 font-medium">
                                {enhancedPrepStats.totalMeetings} ({enhancedPrepStats.meetingsCached} cached)
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Emails analyzed:</span>
                              <span className="ml-1 font-medium">
                                {enhancedPrepStats.totalEmails} ({enhancedPrepStats.emailsCached} cached)
                              </span>
                            </div>
                            {enhancedPrepStats.briefTokenUsage && (
                              <>
                                <div>
                                  <span className="text-muted-foreground">Brief prompt tokens:</span>
                                  <span className="ml-1 font-medium">
                                    {enhancedPrepStats.briefTokenUsage.promptTokens.toLocaleString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Brief total tokens:</span>
                                  <span className="ml-1 font-medium">
                                    {enhancedPrepStats.briefTokenUsage.totalTokens.toLocaleString()}
                                  </span>
                                </div>
                              </>
                            )}
                            {(enhancedPrepStats.reducedMeetingThreads ?? 0) > 0 && (
                              <div className="col-span-2">
                                <span className="text-muted-foreground">MapReduce applied:</span>
                                <span className="ml-1 font-medium">
                                  {enhancedPrepStats.reducedMeetingThreads} meeting thread{enhancedPrepStats.reducedMeetingThreads !== 1 ? 's' : ''},&nbsp;
                                  {enhancedPrepStats.reducedEmailThreads} email thread{enhancedPrepStats.reducedEmailThreads !== 1 ? 's' : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Relevance Information */}
                      {(meetingPrep as any)?.relevance && (
                        <div className="space-y-2 pt-2 border-t">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">Context Confidence:</span>
                            <Badge 
                              variant={(meetingPrep as any).relevance.confidence === 'high' ? 'default' : 
                                      (meetingPrep as any).relevance.confidence === 'medium' ? 'secondary' : 'outline'}
                            >
                              {(meetingPrep as any).relevance.confidence.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ({(meetingPrep as any).relevance.emailCount} emails, {(meetingPrep as any).relevance.meetingCount} meetings)
                            </span>
                          </div>
                          {(meetingPrep as any).relevance.topKeywords.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">Keywords:</span>
                              {(meetingPrep as any).relevance.topKeywords.map((keyword: string) => (
                                <Badge key={keyword} variant="outline" className="text-xs">
                                  {keyword}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <ScrollArea className="h-[500px] rounded-md border bg-muted/50 p-6">
                      <div className="prose prose-sm dark:prose-invert max-w-none
                          [&>h2]:text-lg [&>h2]:font-bold [&>h2]:mt-6 [&>h2]:mb-3 
                          [&>h3]:text-base [&>h3]:font-semibold [&>h3]:mt-4 [&>h3]:mb-2 
                          [&>ul]:list-disc [&>ul]:ml-6 [&>ul]:my-3 [&>ul]:space-y-1 
                          [&>li]:mb-1 [&>strong]:font-semibold 
                          [&>blockquote]:border-l-4 [&>blockquote]:border-primary 
                          [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:my-3 
                          [&>p]:my-2 [&>p]:leading-relaxed">
                        <ReactMarkdown>{prepBrief}</ReactMarkdown>
                      </div>
                    </ScrollArea>

                    <div className="flex gap-2 justify-end">
                      <Button onClick={copyPrepBrief}>
                        {prepBriefCopied ? (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Brief
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transcript Tab */}
          <TabsContent value="transcript">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Meeting Transcript</CardTitle>
                  {transcript && (
                    <Button variant="outline" size="sm" onClick={copyTranscript}>
                      {transcriptCopied ? (
                        <CheckCircle className="mr-2 h-4 w-4" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {transcriptCopied ? "Copied!" : "Copy Transcript"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingTranscript ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Spinner size="sm" />
                      <span className="text-sm text-muted-foreground">
                        Loading transcript...
                      </span>
                    </div>
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-[90%]" />
                      <Skeleton className="h-4 w-[85%]" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-[75%]" />
                      <Skeleton className="h-4 w-[95%]" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-[80%]" />
                    </div>
                  </div>
                ) : transcript ? (
                  <ScrollArea className="h-[500px] rounded-md border bg-muted/50 p-4">
                    <pre className="whitespace-pre-wrap font-mono text-sm">
                      {transcript}
                    </pre>
                  </ScrollArea>
                ) : (
                  <div className="rounded-md border border-dashed p-8 text-center">
                    <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {meeting?.hasTranscript
                        ? "Failed to load transcript. Please try again."
                        : "No transcript available for this meeting."}
                    </p>
                    {meeting?.hasTranscript && (
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => {
                          setTranscriptFetched(false);
                          fetchTranscript();
                        }}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Sparkles className="h-5 w-5 text-primary" />
                    AI Summary
                  </CardTitle>
                  {summary && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={copySummary}>
                        {summaryCopied ? (
                          <CheckCircle className="mr-2 h-4 w-4" />
                        ) : (
                          <Copy className="mr-2 h-4 w-4" />
                        )}
                        {summaryCopied ? "Copied!" : "Copy Summary"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={openOneNoteDialog}>
                        <BookOpen className="mr-2 h-4 w-4" />
                        Save to OneNote
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!summary && !loadingSummary && (
                  <div className="text-center py-8">
                    <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="mb-2 text-lg font-medium">
                      Generate AI Summary
                    </h3>
                    <p className="mb-6 text-sm text-muted-foreground max-w-md mx-auto">
                      Use AI to analyze the meeting transcript and generate a structured
                      summary with key decisions, action items, and next steps.
                    </p>
                    <Button
                      size="lg"
                      onClick={generateSummary}
                      disabled={!meeting?.hasTranscript}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Summary
                    </Button>
                    {!meeting?.hasTranscript && (
                      <p className="mt-4 text-sm text-destructive">
                        No transcript available to summarize
                      </p>
                    )}
                  </div>
                )}

                {loadingSummary && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Spinner size="md" />
                      <div>
                        <p className="font-medium">Generating summary...</p>
                        <p className="text-sm text-muted-foreground">
                          {streamingText ? "Streaming response..." : "Analyzing transcript and extracting key insights"}
                        </p>
                      </div>
                    </div>

                    {streamingText ? (
                      <div>
                        <p className="text-sm leading-relaxed">
                          {streamingText}
                          <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-[95%]" />
                          <Skeleton className="h-4 w-[90%]" />
                          <Skeleton className="h-4 w-[85%]" />
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 rounded-full" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                          <Skeleton className="h-3 w-[80%]" />
                          <Skeleton className="h-3 w-[70%]" />
                          <Skeleton className="h-3 w-[75%]" />
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 rounded-full" />
                            <Skeleton className="h-4 w-28" />
                          </div>
                          <Skeleton className="h-12 w-full rounded-md" />
                          <Skeleton className="h-12 w-full rounded-md" />
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 rounded-full" />
                            <Skeleton className="h-4 w-24" />
                          </div>
                          <Skeleton className="h-3 w-[60%]" />
                          <Skeleton className="h-3 w-[65%]" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {summary && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-sm leading-relaxed">
                        {summary.fullSummary}
                      </p>
                    </div>

                    <Separator />

                    {summary.keyDecisions.length > 0 && (
                      <div>
                        <h4 className="mb-3 flex items-center gap-2 font-semibold">
                          <CheckCircle className="h-4 w-4 text-success" />
                          Key Decisions
                        </h4>
                        <ul className="space-y-2 text-sm">
                          {summary.keyDecisions.map((decision, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-muted-foreground">•</span>
                              {decision}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {summary.actionItems.length > 0 && (
                      <div>
                        <h4 className="mb-3 flex items-center gap-2 font-semibold">
                          <Target className="h-4 w-4 text-primary" />
                          Action Items
                        </h4>
                        <ul className="space-y-2 text-sm">
                          {summary.actionItems.map((item, i) => (
                            <li key={i} className="rounded-md bg-muted p-3">
                              <span className="font-medium">{item.owner}:</span>{" "}
                              {item.task}
                              {item.deadline && (
                                <span className="ml-2 text-muted-foreground">
                                  (Due: {item.deadline})
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {summary.metrics.length > 0 && (
                      <div>
                        <h4 className="mb-3 flex items-center gap-2 font-semibold">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          Key Metrics
                        </h4>
                        <ul className="space-y-2 text-sm">
                          {summary.metrics.map((metric, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-muted-foreground">•</span>
                              {metric}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {summary.nextSteps.length > 0 && (
                      <div>
                        <h4 className="mb-3 flex items-center gap-2 font-semibold">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          Next Steps
                        </h4>
                        <ul className="space-y-2 text-sm">
                          {summary.nextSteps.map((step, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-muted-foreground">
                                {i + 1}.
                              </span>
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* OneNote Save Dialog */}
      <Dialog open={oneNoteOpen} onOpenChange={setOneNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Save to OneNote
            </DialogTitle>
            <DialogDescription>
              Select a notebook and section to save this meeting summary as a structured OneNote page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Notebook</Label>
              {loadingNotebooks ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={selectedNotebook} onValueChange={onNotebookChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a notebook..." />
                  </SelectTrigger>
                  <SelectContent>
                    {oneNoteNotebooks.map((nb) => (
                      <SelectItem key={nb.id} value={nb.id}>
                        {nb.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Section</Label>
              {loadingSections ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedSection}
                  onValueChange={setSelectedSection}
                  disabled={!selectedNotebook || oneNoteSections.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !selectedNotebook
                          ? "Select a notebook first"
                          : oneNoteSections.length === 0
                          ? "No sections found"
                          : "Select a section..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {oneNoteSections.map((sec) => (
                      <SelectItem key={sec.id} value={sec.id}>
                        {sec.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOneNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveToOneNote}
              disabled={!selectedSection || savingToOneNote}
            >
              {savingToOneNote ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Save Page
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
