"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Mail,
  CheckSquare,
  Clock,
  RefreshCw,
  Users,
  AlertCircle,
  Bell,
  ChevronRight,
  Sparkles,
  Flag,
  Inbox,
  Video,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

interface Meeting {
  id: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  organizer: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  participants?: {
    attendees: Array<{
      emailAddress: {
        name: string;
        address: string;
      };
    }>;
  };
  joinWebUrl?: string;
}

interface FlaggedEmail {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  flag?: {
    flagStatus: string;
    dueDateTime?: {
      dateTime: string;
    };
  };
}

interface EmailMessage {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  importance?: string;
  hasAttachments?: boolean;
}

interface TodoTask {
  id: string;
  title: string;
  status: string;
  importance?: string;
  dueDateTime?: {
    dateTime: string;
  };
  listName?: string;
}

interface ActionItem {
  id: string;
  text: string;
  meetingId: string;
  meetingSubject: string;
  meetingDate: string;
}

interface DailyDigest {
  date: string;
  meetings: Meeting[];
  followUpEmails: FlaggedEmail[];
  tasks: TodoTask[];
  importantEmails: EmailMessage[];
  actionItems: ActionItem[];
}

interface DigestSectionProps {
  title: string;
  count: number;
  icon: LucideIcon;
  variant?: "default" | "warning" | "info";
  children: ReactNode;
}

function DigestSection({ title, count, icon: Icon, variant = "default", children }: DigestSectionProps) {
  const variantStyles = {
    default: "border-slate-200",
    warning: "border-amber-200 bg-amber-50/50",
    info: "border-blue-200 bg-blue-50/50",
  };

  return (
    <Card className={variantStyles[variant]}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Icon className="h-5 w-5" />
            {title}
            <Badge variant="outline" className="ml-2">
              {count}
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nothing here - you're all caught up!</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  // Parse the datetime string properly - it comes as ISO string from Graph API
  const startTime = new Date(meeting.startDateTime);
  const endTime = new Date(meeting.endDateTime);
  const now = new Date();
  const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isUpcoming = hoursUntil > 0 && hoursUntil <= 4;

  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className={`block p-4 rounded-lg border transition-all hover:border-primary hover:shadow-md cursor-pointer ${isUpcoming ? "border-primary bg-primary/5" : "border-slate-200"}`}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold flex items-center gap-2">
            {meeting.subject}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </h3>
          {isUpcoming && <Badge variant="default" className="flex-shrink-0">Soon</Badge>}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {startTime.toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric',
              hour: 'numeric', 
              minute: '2-digit',
              timeZoneName: 'short'
            })} - {endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
          {meeting.participants && meeting.participants.attendees.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {meeting.participants.attendees.length} attendee{meeting.participants.attendees.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Organizer: {meeting.organizer.emailAddress.name}
        </p>
        <div className="flex items-center gap-2 pt-2">
          <Badge variant="outline" className="text-xs">
            View Preparation
          </Badge>
          {meeting.joinWebUrl && (
            <Badge variant="outline" className="text-xs">
              <Video className="h-3 w-3 mr-1" />
              Join Available
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmailCard({ email }: { email: FlaggedEmail | EmailMessage }) {
  const receivedTime = new Date(email.receivedDateTime);
  const isRecent = (new Date().getTime() - receivedTime.getTime()) / (1000 * 60 * 60) < 24;

  return (
    <div className="p-4 rounded-lg border border-slate-200 transition-all hover:border-primary hover:shadow-sm">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{email.subject}</h3>
          {isRecent && <Badge variant="secondary" className="flex-shrink-0">Recent</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          From: {email.from.emailAddress.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {receivedTime.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: TodoTask }) {
  const isHighPriority = task.importance === 'high';
  const dueDate = task.dueDateTime ? new Date(task.dueDateTime.dateTime) : null;
  const isOverdue = dueDate && dueDate < new Date();

  return (
    <div className={`p-4 rounded-lg border transition-all hover:border-primary hover:shadow-sm ${isOverdue ? "border-red-200 bg-red-50/50" : "border-slate-200"}`}>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{task.title}</h3>
          <div className="flex gap-1">
            {isHighPriority && <Badge variant="destructive" className="flex-shrink-0">High Priority</Badge>}
            {isOverdue && <Badge variant="outline" className="flex-shrink-0 border-red-300 text-red-700">Overdue</Badge>}
          </div>
        </div>
        {task.listName && (
          <p className="text-sm text-muted-foreground">List: {task.listName}</p>
        )}
        {dueDate && (
          <p className="text-sm text-muted-foreground">
            Due: {dueDate.toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

function ActionItemCard({ item }: { item: ActionItem }) {
  const meetingDate = new Date(item.meetingDate);
  
  return (
    <div className="p-4 rounded-lg border border-slate-200 transition-all hover:border-primary hover:shadow-sm">
      <div className="space-y-2">
        <p className="font-medium">{item.text}</p>
        <p className="text-sm text-muted-foreground">
          From: <Link href={`/meetings/${item.meetingId}`} className="text-primary hover:underline">
            {item.meetingSubject}
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          {meetingDate.toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

export default function DigestPage() {
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDigest = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/daily-digest");
      if (!response.ok) throw new Error("Failed to fetch daily digest");

      const data = await response.json();
      setDigest(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load digest");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDigest();
  }, []);

  useEffect(() => {
    fetchDigest();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Error Loading Digest
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchDigest}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!digest) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Good morning! Here&apos;s your day ahead
            </h1>
            <p className="text-slate-600 mt-1">
              {formatDate(digest.date)}
            </p>
          </div>
          <Button onClick={fetchDigest} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Upcoming Meetings (Next 72 Hours) */}
      <DigestSection
        title="Upcoming Meetings (Next 72 Hours)"
        count={digest.meetings.length}
        icon={Calendar}
      >
        {digest.meetings.map((meeting) => (
          <MeetingCard key={meeting.id} meeting={meeting} />
        ))}
      </DigestSection>

      {/* Follow-up Required */}
      <DigestSection
        title="Emails Needing Follow-up"
        count={digest.followUpEmails.length}
        icon={Flag}
        variant="warning"
      >
        {digest.followUpEmails.map((email) => (
          <EmailCard key={email.id} email={email} />
        ))}
      </DigestSection>

      {/* Tasks Due */}
      <DigestSection
        title="Tasks Due Today & High Priority"
        count={digest.tasks.length}
        icon={CheckSquare}
      >
        {digest.tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </DigestSection>

      {/* Important Unread */}
      {digest.importantEmails.length > 0 && (
        <DigestSection
          title="Important Unread Emails"
          count={digest.importantEmails.length}
          icon={Inbox}
        >
          {digest.importantEmails.map((email) => (
            <EmailCard key={email.id} email={email} />
          ))}
        </DigestSection>
      )}

      {/* Yesterday's Action Items */}
      {digest.actionItems.length > 0 && (
        <DigestSection
          title="Outstanding Action Items"
          count={digest.actionItems.length}
          icon={AlertCircle}
          variant="info"
        >
          {digest.actionItems.map((item) => (
            <ActionItemCard key={item.id} item={item} />
          ))}
        </DigestSection>
      )}

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Button variant="outline" className="justify-start" asChild>
            <Link href="/meetings">
              <Calendar className="h-4 w-4 mr-2" />
              All Meetings
            </Link>
          </Button>
          <Button variant="outline" className="justify-start" asChild>
            <a href="https://to-do.office.com/tasks/inbox" target="_blank" rel="noopener noreferrer">
              <CheckSquare className="h-4 w-4 mr-2" />
              Microsoft To Do
            </a>
          </Button>
          <Button variant="outline" className="justify-start" asChild>
            <a href="https://outlook.office.com/mail" target="_blank" rel="noopener noreferrer">
              <Mail className="h-4 w-4 mr-2" />
              Outlook
            </a>
          </Button>
          <Button variant="outline" className="justify-start" asChild>
            <Link href="/settings">
              <AlertCircle className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
