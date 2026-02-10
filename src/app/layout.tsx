import type { Metadata } from "next";
import { SessionProvider } from "@/components/SessionProvider";
import { Header } from "@/components/Header";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meeting Summarizer",
  description: "AI-powered meeting summaries from Microsoft Teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          <Header />
          {children}
          <Toaster position="top-right" richColors />
        </SessionProvider>
      </body>
    </html>
  );
}
