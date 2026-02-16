"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  Upload,
  Trash2,
  BarChart3,
  DollarSign,
  Clock,
  FileText,
  Zap,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

interface UsageRecord {
  id: number;
  meetingSubject: string;
  meetingDate: string;
  meetingDurationMinutes: number | null;
  transcriptLength: number;
  transcriptWordCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  processingTimeMs: number;
  model: string;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  createdAt: string;
  requestedBy: string | null;
  requestedByEmail: string | null;
}

interface UsageStats {
  totalRecords: number;
  totalTokens: number;
  totalCost: number;
  avgTokensPerMeeting: number;
  avgCostPerMeeting: number;
  avgProcessingTimeMs: number;
}

interface Pricing {
  INPUT_COST_PER_1M: number;
  OUTPUT_COST_PER_1M: number;
}

export default function UsagePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ message: string; errors: string[] } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.accessToken) {
      fetchUsageData();
    }
  }, [session?.accessToken]);

  async function fetchUsageData() {
    setLoading(true);
    try {
      const response = await fetch("/api/usage");
      if (response.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setRecords(data.records || []);
        setStats(data.stats || null);
        setPricing(data.pricing || null);
      }
    } catch (error) {
      console.error("Error fetching usage data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    try {
      const response = await fetch("/api/usage?format=csv");
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `usage-export-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Error exporting usage:", error);
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/usage", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      setImportResult({
        message: result.message || "Import completed",
        errors: result.errors || [],
      });

      // Refresh data
      await fetchUsageData();
    } catch (error) {
      console.error("Error importing usage:", error);
      setImportResult({
        message: "Import failed",
        errors: [error instanceof Error ? error.message : "Unknown error"],
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleClearAll() {
    if (!confirm("Are you sure you want to delete ALL usage records? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch("/api/usage?clearAll=true", {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchUsageData();
      }
    } catch (error) {
      console.error("Error clearing usage:", error);
    }
  }

  async function handleDeleteRecord(id: number) {
    try {
      const response = await fetch(`/api/usage?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setRecords(records.filter((r) => r.id !== id));
        // Refresh stats
        await fetchUsageData();
      }
    } catch (error) {
      console.error("Error deleting record:", error);
    }
  }

  function formatCurrency(amount: number): string {
    return `$${amount.toFixed(6)}`;
  }

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-6">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-dashed">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground text-sm">
              You don&apos;t have permission to access the usage dashboard. Only administrators can view this page.
            </p>
            <Button onClick={() => router.push("/meetings")} variant="outline" className="mt-4">
              Go to Meetings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="border-l-4 border-primary pl-4 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Usage Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Track token usage and costs for meeting summarizations
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={fetchUsageData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={records.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Import CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
          />
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearAll}
            disabled={records.length === 0}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <Card className={importResult.errors.length > 0 ? "border-warning" : "border-success"}>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle
                className={`w-5 h-5 ${
                  importResult.errors.length > 0 ? "text-warning" : "text-success"
                }`}
              />
              <div>
                <p className="font-medium">{importResult.message}</p>
                {importResult.errors.length > 0 && (
                  <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li>...and {importResult.errors.length - 5} more errors</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Info */}
      {pricing && (
        <Card className="bg-primary/5 border-primary/20 hover:shadow-md transition-shadow duration-300">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-primary">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm font-medium">
                Azure OpenAI GPT-4.1 Regional Pricing (US East): Input ${pricing.INPUT_COST_PER_1M}/1M
                tokens, Output ${pricing.OUTPUT_COST_PER_1M}/1M tokens
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Total Summaries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatNumber(stats.totalRecords)}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Total Tokens
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatNumber(stats.totalTokens)}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-success" />
                Total Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(stats.totalCost)}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Avg Tokens/Meeting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatNumber(Math.round(stats.avgTokensPerMeeting))}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-success" />
                Avg Cost/Meeting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(stats.avgCostPerMeeting)}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Avg Processing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{(stats.avgProcessingTimeMs / 1000).toFixed(2)}s</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Records Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Usage Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No usage records yet.</p>
              <p className="text-sm mt-2">Summarize a meeting to start tracking usage.</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {records.map((record) => (
                  <div
                    key={record.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium truncate">{record.meetingSubject}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {record.model}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(record.createdAt)}
                          {record.requestedBy && (
                            <span className="ml-2">
                              • Requested by <span className="font-medium">{record.requestedBy}</span>
                            </span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-4 mt-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Duration:</span>{" "}
                            <span className="font-medium">
                              {record.meetingDurationMinutes
                                ? `${record.meetingDurationMinutes} min`
                                : "N/A"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Words:</span>{" "}
                            <span className="font-medium">
                              {formatNumber(record.transcriptWordCount)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Processing:</span>{" "}
                            <span className="font-medium">
                              {(record.processingTimeMs / 1000).toFixed(2)}s
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col md:items-end gap-2">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div className="text-center">
                            <p className="text-muted-foreground text-xs">Input</p>
                            <p className="font-medium">{formatNumber(record.promptTokens)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(record.inputCost)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground text-xs">Output</p>
                            <p className="font-medium">{formatNumber(record.completionTokens)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(record.outputCost)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground text-xs">Total</p>
                            <p className="font-bold">{formatNumber(record.totalTokens)}</p>
                            <p className="text-xs font-medium text-success">
                              {formatCurrency(record.totalCost)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRecord(record.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Separator />

      <p className="text-xs text-muted-foreground text-center">
        Usage data is stored locally in SQLite. Export regularly to backup your data.
      </p>
      </main>
    </div>
  );
}
