"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users,
  UserPlus,
  Trash2,
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
  RefreshCw,
  AlertCircle,
  Download,
  Upload,
  CheckCircle,
  Mail,
  Calendar,
} from "lucide-react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

interface AuthorizedUser {
  id: number;
  email: string;
  name: string | null;
  role: "admin" | "user";
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Form state
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ message: string; errors: string[] } | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.email) {
      checkAdminAndFetch();
    }
  }, [session?.user?.email]);

  async function checkAdminAndFetch() {
    try {
      const checkRes = await fetch("/api/auth/check");
      const checkData = await checkRes.json();

      if (!checkData.isAdmin) {
        setForbidden(true);
        setLoading(false);
        return;
      }

      await fetchUsers();
    } catch (error) {
      console.error("Error checking admin status:", error);
      setForbidden(true);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      const response = await fetch("/api/users");
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || null,
          role: newRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to add user");
        return;
      }

      setSuccess(`User ${newEmail} added successfully`);
      setNewEmail("");
      setNewName("");
      setNewRole("user");
      await fetchUsers();
    } catch {
      setError("Failed to add user");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleActive(user: AuthorizedUser) {
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          isActive: !user.isActive,
        }),
      });

      if (response.ok) {
        await fetchUsers();
      }
    } catch (error) {
      console.error("Error toggling user:", error);
    }
  }

  async function handleDeleteUser(id: number, email: string) {
    const confirmed = await confirm({
      title: "Delete User",
      description: `Are you sure you want to delete ${email}?`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/users?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSuccess(`User ${email} deleted`);
        await fetchUsers();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to delete user");
      }
    } catch {
      setError("Failed to delete user");
    }
  }

  async function handleExportCsv() {
    try {
      const response = await fetch("/api/users?format=csv");
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `authorized-users-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error exporting CSV:", error);
      setError("Failed to export CSV");
    }
  }

  async function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/users", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      setImportResult({
        message: result.message || "Import completed",
        errors: result.errors || [],
      });

      await fetchUsers();
    } catch {
      setError("Failed to import CSV");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (status === "loading" || loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">
              You don&apos;t have permission to access this page.
              <br />
              Only administrators can manage users.
            </p>
            <Button onClick={() => router.push("/meetings")} variant="outline">
              Go to Meetings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeUsers = users.filter((u) => u.isActive);
  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <>
    <ConfirmDialog />
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Authorized Users
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who can access this application
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCsv}
            className="hidden"
          />
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
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <UserCheck className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeUsers.length}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{adminCount}</p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Messages */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss" className="ml-auto hover:text-destructive/80">×</button>
          </AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-success/30 bg-success/10 text-success">
          <CheckCircle className="w-4 h-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} aria-label="Dismiss" className="ml-auto hover:text-success/80">×</button>
          </AlertDescription>
        </Alert>
      )}

      {importResult && (
        <Alert className="border-info/30 bg-info/10 text-info">
          <Upload className="w-4 h-4" />
          <AlertDescription>
            <span className="font-medium">{importResult.message}</span>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 text-xs text-destructive list-disc list-inside">
                {importResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {importResult.errors.length > 5 && (
                  <li>...and {importResult.errors.length - 5} more errors</li>
                )}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Add User Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Add New User
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddUser} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="add-user-email" className="text-xs font-medium text-muted-foreground mb-1 block">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-user-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@company.com"
                className="h-9"
                required
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="add-user-name" className="text-xs font-medium text-muted-foreground mb-1 block">
                Name
              </Label>
              <Input
                id="add-user-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="John Doe"
                className="h-9"
              />
            </div>
            <div className="w-full sm:w-28">
              <Label htmlFor="add-user-role" className="text-xs font-medium text-muted-foreground mb-1 block">
                Role
              </Label>
              <select
                id="add-user-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
                className="w-full h-9 px-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" size="sm" disabled={adding || !newEmail.trim()} className="h-9">
                {adding ? <Spinner size="sm" className="mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Add
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Authorized Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No authorized users yet.</p>
              <p className="text-xs mt-1">Add users above to grant access.</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="divide-y">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className={`px-4 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors ${
                      !user.isActive ? "opacity-50 bg-muted/20" : ""
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                      user.role === "admin"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {user.name || user.email.split("@")[0]}
                        </span>
                        <Badge
                          variant={user.role === "admin" ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {user.role === "admin" && <ShieldCheck className="w-3 h-3 mr-0.5" />}
                          {user.role}
                        </Badge>
                        {!user.isActive && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3" />
                          {user.email}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(user)}
                        className="h-8 px-2 text-xs"
                      >
                        {user.isActive ? (
                          <>
                            <UserX className="w-3.5 h-3.5 mr-1" />
                            Disable
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5 mr-1" />
                            Enable
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Footer Note */}
      <p className="text-xs text-muted-foreground text-center">
        CSV format: email, name (optional), role (optional: user/admin)
      </p>
    </div>
    </>
  );
}
