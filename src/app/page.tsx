"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Calendar, FileText, Sparkles } from "lucide-react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.replace("/meetings");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // If authenticated, show loading while redirecting
  if (status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-muted-foreground">Redirecting to meetings...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted p-8">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Meeting Summarizer
        </h1>
        <p className="mb-8 text-lg text-muted-foreground">
          AI-powered meeting summaries from your Microsoft Teams meetings.
          Get key decisions, action items, and insights in seconds.
        </p>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Sign in with your Microsoft account to access your meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="lg"
              onClick={() => signIn("azure-ad", { callbackUrl: "/meetings" })}
              className="w-full sm:w-auto"
            >
              <svg
                className="mr-2 h-5 w-5"
                viewBox="0 0 21 21"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              Sign in with Microsoft
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <Calendar className="mb-2 h-8 w-8 text-primary" />
              <CardTitle className="text-lg">Access Meetings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View all your recent Teams meetings with transcripts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <Sparkles className="mb-2 h-8 w-8 text-primary" />
              <CardTitle className="text-lg">AI Summaries</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Generate intelligent summaries powered by Azure OpenAI
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <FileText className="mb-2 h-8 w-8 text-primary" />
              <CardTitle className="text-lg">Action Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Extract key decisions, metrics, and next steps
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
