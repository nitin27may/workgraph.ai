"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";

export interface OneNoteSavePayload {
  /** "meeting" saves full MoM, "actionItems" saves selected action items */
  mode?: "meeting" | "actionItems";
  meeting: {
    subject: string;
    startDateTime: string;
    organizer: { emailAddress: { name: string } };
    participants?: {
      attendees: Array<{ emailAddress: { name: string; address: string } }>;
    };
  };
  /** Required when mode is undefined or "meeting" */
  summary?: {
    keyDecisions: string[];
    actionItems: Array<{ owner: string; task: string; deadline?: string }>;
    nextSteps: string[];
    fullSummary: string;
  };
  /** Required when mode is "actionItems" */
  actionItems?: Array<{ owner: string; task: string; deadline?: string }>;
}

interface OneNoteSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: OneNoteSavePayload | null;
  title?: string;
  description?: string;
}

export function OneNoteSaveDialog({
  open,
  onOpenChange,
  payload,
  title = "Save to OneNote",
  description = "Select a notebook and section to save as a OneNote page.",
}: OneNoteSaveDialogProps) {
  const [notebooks, setNotebooks] = useState<Array<{ id: string; displayName: string }>>([]);
  const [sections, setSections] = useState<Array<{ id: string; displayName: string }>>([]);
  const [selectedNotebook, setSelectedNotebook] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notebooksFetched, setNotebooksFetched] = useState(false);

  // Fetch notebooks when dialog opens
  useEffect(() => {
    if (!open || notebooksFetched) return;

    let cancelled = false;
    setLoadingNotebooks(true);

    fetch("/api/onenote?resource=notebooks")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setNotebooks(data.notebooks || []);
        setNotebooksFetched(true);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load OneNote notebooks.");
      })
      .finally(() => {
        if (!cancelled) setLoadingNotebooks(false);
      });

    return () => { cancelled = true; };
  }, [open, notebooksFetched]);

  async function onNotebookChange(notebookId: string) {
    setSelectedNotebook(notebookId);
    setSelectedSection("");
    setSections([]);
    setLoadingSections(true);
    try {
      const res = await fetch(`/api/onenote?resource=sections&notebookId=${notebookId}`);
      const data = await res.json();
      setSections(data.sections || []);
    } catch {
      toast.error("Failed to load sections.");
    } finally {
      setLoadingSections(false);
    }
  }

  async function handleSave() {
    if (!payload || !selectedSection) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        sectionId: selectedSection,
        meeting: payload.meeting,
      };

      if (payload.mode === "actionItems") {
        body.mode = "actionItems";
        body.actionItems = payload.actionItems;
      } else {
        body.mode = "meeting";
        body.summary = payload.summary;
      }

      const res = await fetch("/api/onenote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Save failed");

      const data = await res.json();
      onOpenChange(false);

      const label =
        payload.mode === "actionItems" ? "Action items" : "Meeting summary";

      if (data.page?.webUrl) {
        toast.success(`${label} saved to OneNote`, {
          action: {
            label: "Open in OneNote",
            onClick: () => window.open(data.page.webUrl, "_blank", "noopener,noreferrer"),
          },
          duration: 8000,
        });
      } else {
        toast.success(`${label} saved to OneNote`);
      }
    } catch {
      toast.error("Failed to save to OneNote. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
                  {notebooks.map((nb) => (
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
                disabled={!selectedNotebook || sections.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !selectedNotebook
                        ? "Select a notebook first"
                        : sections.length === 0
                        ? "No sections found"
                        : "Select a section..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((sec) => (
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!selectedSection || saving}>
            {saving ? (
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
  );
}
