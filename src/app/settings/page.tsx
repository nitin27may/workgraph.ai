"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, Star, Globe, Database } from "lucide-react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";

interface PromptTemplate {
  id: number;
  name: string;
  description: string | null;
  systemPrompt: string;
  userPromptTemplate: string;
  isDefault: boolean;
  isGlobal: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearingCache, setClearingCache] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    userPromptTemplate: "",
    isDefault: false,
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    } else if (status === "authenticated") {
      loadPrompts();
    }
  }, [status, router]);

  const loadPrompts = async () => {
    try {
      const response = await fetch("/api/prompts");
      if (response.ok) {
        const data = await response.json();
        setPrompts(data);
      } else {
        toast.error("Failed to load prompts");
      }
    } catch (error) {
      console.error("Error loading prompts:", error);
      toast.error("Failed to load prompts");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (prompt?: PromptTemplate) => {
    if (prompt) {
      setEditingPrompt(prompt);
      setFormData({
        name: prompt.name,
        description: prompt.description || "",
        systemPrompt: prompt.systemPrompt,
        userPromptTemplate: prompt.userPromptTemplate,
        isDefault: prompt.isDefault,
      });
    } else {
      setEditingPrompt(null);
      setFormData({
        name: "",
        description: "",
        systemPrompt: "",
        userPromptTemplate: `Meeting: {{meetingSubject}}
Date: {{meetingDate}}

Transcript:
{{transcript}}`,
        isDefault: false,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPrompt(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = editingPrompt
      ? `/api/prompts/${editingPrompt.id}`
      : "/api/prompts";
    const method = editingPrompt ? "PUT" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success(editingPrompt ? "Prompt updated" : "Prompt created");
        handleCloseDialog();
        loadPrompts();
      } else {
        toast.error("Failed to save prompt");
      }
    } catch (error) {
      console.error("Error saving prompt:", error);
      toast.error("Failed to save prompt");
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: "Delete Prompt",
      description: "Are you sure you want to delete this prompt?",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/prompts/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Prompt deleted");
        loadPrompts();
      } else {
        toast.error("Failed to delete prompt");
      }
    } catch (error) {
      console.error("Error deleting prompt:", error);
      toast.error("Failed to delete prompt");
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      const response = await fetch(`/api/prompts/${id}/set-default`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("Default prompt updated");
        loadPrompts();
      } else {
        toast.error("Failed to set default prompt");
      }
    } catch (error) {
      console.error("Error setting default:", error);
      toast.error("Failed to set default prompt");
    }
  };

  const handleClearCache = async () => {
    const confirmed = await confirm({
      title: "Clear Cache",
      description: "Are you sure you want to clear all cached meeting and email summaries? This action cannot be undone.",
      confirmLabel: "Clear Cache",
      variant: "destructive",
    });
    if (!confirmed) return;

    setClearingCache(true);
    try {
      const response = await fetch("/api/cache/clear", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Cache cleared successfully! Deleted ${data.meetingsDeleted} meeting summaries and ${data.emailsDeleted} email summaries.`);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to clear cache");
      }
    } catch (error) {
      console.error("Error clearing cache:", error);
      toast.error("Failed to clear cache");
    } finally {
      setClearingCache(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
    <ConfirmDialog />
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your application settings and preferences
        </p>
      </div>

      {/* Cache Management Section */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>Cache Management</CardTitle>
          </div>
          <CardDescription>
            Clear cached meeting and email summaries to free up space or force regeneration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Cached summaries are used to speed up meeting preparation. Clearing the cache will 
                force all summaries to be regenerated on next use.
              </p>
            </div>
            <Button 
              variant="destructive" 
              onClick={handleClearCache}
              disabled={clearingCache}
            >
              {clearingCache ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Cache
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Templates Section */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Prompt Templates</h2>
          <p className="mt-1 text-muted-foreground">
            Manage your meeting summary prompt templates
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4" />
          New Prompt
        </Button>
      </div>

      <div className="grid gap-4">
        {prompts.map((prompt) => (
          <Card key={prompt.id} className={prompt.isDefault ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">{prompt.name}</CardTitle>
                    {prompt.isDefault && (
                      <Badge variant="default">
                        <Star className="h-3 w-3" />
                        Default
                      </Badge>
                    )}
                    {prompt.isGlobal && (
                      <Badge variant="secondary">
                        <Globe className="h-3 w-3" />
                        Global
                      </Badge>
                    )}
                  </div>
                  {prompt.description && (
                    <CardDescription className="mt-2">{prompt.description}</CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  {!prompt.isGlobal && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(prompt)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(prompt.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {!prompt.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(prompt.id)}
                    >
                      Set as Default
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold">System Prompt</Label>
                  <div className="mt-1 rounded-md bg-muted p-3 text-sm">
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {prompt.systemPrompt}
                    </pre>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-semibold">User Prompt Template</Label>
                  <div className="mt-1 rounded-md bg-muted p-3 text-sm">
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {prompt.userPromptTemplate}
                    </pre>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Available variables: {"{"}{"{"} meetingSubject {"}"}{"}"}
                    , {"{"}{"{"}meetingDate{"}"}{"}"}, {"{"}{"{"}transcript{"}"}
                    {"}"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPrompt ? "Edit Prompt Template" : "Create Prompt Template"}
            </DialogTitle>
            <DialogDescription>
              Create a custom prompt template for meeting summaries. Use variables like{" "}
              {"{"}{"{"}meetingSubject{"}"}{"}"}
              {", "}
              {"{"}{"{"}meetingDate{"}"}{"}"}, and {"{"}{"{"}transcript{"}"}
              {"}"} in your user prompt template.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  placeholder="e.g., Detailed Technical Summary"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Brief description of when to use this template"
                />
              </div>
              <div>
                <Label htmlFor="systemPrompt">System Prompt *</Label>
                <Textarea
                  id="systemPrompt"
                  value={formData.systemPrompt}
                  onChange={(e) =>
                    setFormData({ ...formData, systemPrompt: e.target.value })
                  }
                  required
                  rows={10}
                  placeholder="Enter the system prompt that defines how the AI should summarize meetings..."
                />
              </div>
              <div>
                <Label htmlFor="userPromptTemplate">User Prompt Template *</Label>
                <Textarea
                  id="userPromptTemplate"
                  value={formData.userPromptTemplate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      userPromptTemplate: e.target.value,
                    })
                  }
                  required
                  rows={5}
                  placeholder={`Meeting: {{meetingSubject}}\nDate: {{meetingDate}}\n\nTranscript:\n{{transcript}}`}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isDefault"
                  checked={formData.isDefault}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isDefault: checked === true })
                  }
                />
                <Label htmlFor="isDefault" className="cursor-pointer">
                  Set as default prompt
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit">
                {editingPrompt ? "Update" : "Create"} Prompt
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
