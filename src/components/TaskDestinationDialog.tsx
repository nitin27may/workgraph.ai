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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ListTodo, LayoutGrid, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { TaskDestination } from "@/types/meeting";
import { MICROSOFT_TODO_URL, MICROSOFT_PLANNER_URL } from "@/lib/constants";

export interface TaskDestinationPayload {
  tasks: Array<{
    title: string;
    body?: string;
    dueDateTime?: string;
    importance?: "low" | "normal" | "high";
  }>;
  meetingSubject?: string;
}

interface TaskDestinationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: TaskDestinationPayload | null;
  onComplete?: () => void;
}

interface PlannerPlan {
  id: string;
  title: string;
}

interface PlannerBucket {
  id: string;
  name: string;
}

const STORAGE_KEY = "taskDestination";

function importanceToPlannerPriority(
  importance: "low" | "normal" | "high"
): number {
  switch (importance) {
    case "high":
      return 3;
    case "normal":
      return 5;
    case "low":
      return 9;
    default:
      return 5;
  }
}

export function TaskDestinationDialog({
  open,
  onOpenChange,
  payload,
  onComplete,
}: TaskDestinationDialogProps) {
  const [destination, setDestination] = useState<TaskDestination>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(STORAGE_KEY) as TaskDestination) || "todo";
    }
    return "todo";
  });

  // Planner state
  const [plans, setPlans] = useState<PlannerPlan[]>([]);
  const [buckets, setBuckets] = useState<PlannerBucket[]>([]);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedBucket, setSelectedBucket] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [plansFetched, setPlansFetched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist destination choice
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, destination);
    }
  }, [destination]);

  // Fetch planner plans when dialog opens and Planner is selected
  useEffect(() => {
    if (!open || destination !== "planner" || plansFetched) return;

    let cancelled = false;
    setLoadingPlans(true);
    setError(null);

    fetch("/api/planner/plans")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setPlans(data.plans || []);
        setPlansFetched(true);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load Planner plans.");
      })
      .finally(() => {
        if (!cancelled) setLoadingPlans(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, destination, plansFetched]);

  // Fetch buckets when plan changes
  async function onPlanChange(planId: string) {
    setSelectedPlan(planId);
    setSelectedBucket("");
    setBuckets([]);

    if (!planId) return;

    setLoadingBuckets(true);
    try {
      const res = await fetch(`/api/planner/plans/${planId}/buckets`);
      const data = await res.json();
      setBuckets(data.buckets || []);
    } catch {
      toast.error("Failed to load buckets.");
    } finally {
      setLoadingBuckets(false);
    }
  }

  // Reset planner state when switching destinations
  function handleDestinationChange(dest: TaskDestination) {
    setDestination(dest);
    setError(null);
    if (dest === "planner" && !plansFetched) {
      // Plans will be fetched by the useEffect
    }
  }

  async function handleCreate() {
    if (!payload || payload.tasks.length === 0) return;
    setCreating(true);
    setError(null);

    try {
      if (destination === "todo") {
        // Create tasks in Microsoft To Do
        const tasksToCreate = payload.tasks.map((t) => ({
          title: t.title,
          body: t.body,
          dueDateTime: t.dueDateTime,
          importance: t.importance,
          meetingSubject: payload.meetingSubject,
        }));

        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks: tasksToCreate }),
        });

        if (!response.ok) throw new Error("Failed to create tasks in To Do");

        const result = await response.json();
        toast.success(
          `Created ${result.created.length} task(s) in Microsoft To Do`,
          {
            action: {
              label: "Open To Do",
              onClick: () => window.open(MICROSOFT_TODO_URL, "_blank"),
            },
          }
        );
      } else {
        // Create tasks in Microsoft Planner
        if (!selectedPlan) {
          setError("Please select a Planner plan.");
          setCreating(false);
          return;
        }

        const tasksToCreate = payload.tasks.map((t) => ({
          title: t.title,
          planId: selectedPlan,
          bucketId: selectedBucket || undefined,
          body: t.body,
          dueDateTime: t.dueDateTime,
          priority: t.importance
            ? importanceToPlannerPriority(t.importance)
            : 5,
        }));

        const response = await fetch("/api/planner/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks: tasksToCreate }),
        });

        if (!response.ok)
          throw new Error("Failed to create tasks in Planner");

        const result = await response.json();
        toast.success(
          `Created ${result.created.length} task(s) in Microsoft Planner`,
          {
            action: {
              label: "Open Planner",
              onClick: () => window.open(MICROSOFT_PLANNER_URL, "_blank"),
            },
          }
        );
      }

      onOpenChange(false);
      onComplete?.();
    } catch (err) {
      console.error("Error creating tasks:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create tasks"
      );
    } finally {
      setCreating(false);
    }
  }

  const taskCount = payload?.tasks.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            Create Tasks ({taskCount})
          </DialogTitle>
          <DialogDescription>
            Choose where to create {taskCount}{" "}
            {taskCount === 1 ? "task" : "tasks"} from meeting action items.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Destination selector */}
          <div className="space-y-2">
            <Label>Destination</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={destination === "todo" ? "default" : "outline"}
                className="justify-start gap-2"
                onClick={() => handleDestinationChange("todo")}
              >
                <ListTodo className="h-4 w-4" />
                Microsoft To Do
              </Button>
              <Button
                variant={destination === "planner" ? "default" : "outline"}
                className="justify-start gap-2"
                onClick={() => handleDestinationChange("planner")}
              >
                <LayoutGrid className="h-4 w-4" />
                Microsoft Planner
              </Button>
            </div>
          </div>

          {/* Planner-specific options */}
          {destination === "planner" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                {loadingPlans ? (
                  <Skeleton className="h-10 w-full" />
                ) : plans.length === 0 && plansFetched ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No Planner plans found. Create a plan in Microsoft
                      Planner first, then try again.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Select
                    value={selectedPlan}
                    onValueChange={onPlanChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a plan..." />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedPlan && (
                <div className="space-y-2">
                  <Label>Bucket (optional)</Label>
                  {loadingBuckets ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      value={selectedBucket}
                      onValueChange={setSelectedBucket}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            buckets.length === 0
                              ? "No buckets found"
                              : "Select a bucket (optional)..."
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {buckets.map((bucket) => (
                          <SelectItem key={bucket.id} value={bucket.id}>
                            {bucket.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              creating ||
              taskCount === 0 ||
              (destination === "planner" && !selectedPlan)
            }
          >
            {creating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creating...
              </>
            ) : (
              <>
                <ListTodo className="mr-2 h-4 w-4" />
                Create {taskCount} {taskCount === 1 ? "Task" : "Tasks"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
