"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, User, ChevronDown, BarChart3, ShieldCheck, Users, Settings, Calendar, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

// Admin email constant - must match the one in db.ts
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "nitinkumar.singh@nbfc.com";

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Check if current user is admin
  const isAdmin = session?.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo / Brand */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <svg
                className="h-5 w-5 text-primary-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="text-xl font-semibold hidden sm:inline">Meeting Summarizer</span>
          </Link>

          {/* Navigation Links */}
          {session?.user && (
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/digest"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted ${
                  pathname === "/digest" ? "bg-muted text-foreground" : "text-muted-foreground"
                }`}
              >
                <Sparkles className="h-4 w-4" />
                Daily Digest
              </Link>
              <Link
                href="/meetings"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted ${
                  pathname?.startsWith("/meetings") ? "bg-muted text-foreground" : "text-muted-foreground"
                }`}
              >
                <Calendar className="h-4 w-4" />
                Meetings
              </Link>
            </nav>
          )}
        </div>

        {/* Theme Toggle & User Menu */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {session?.user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium">{session.user.name}</p>
                <p className="text-xs text-muted-foreground">{session.user.email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>

            {showDropdown && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-card p-1 shadow-lg">
                <div className="border-b px-3 py-2 sm:hidden">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="text-xs text-muted-foreground">{session.user.email}</p>
                </div>
                
                {/* Mobile navigation */}
                <div className="md:hidden">
                  <Link
                    href="/digest"
                    onClick={() => setShowDropdown(false)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted ${
                      pathname === "/digest" ? "bg-muted font-medium" : ""
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                    Daily Digest
                  </Link>
                  <Link
                    href="/meetings"
                    onClick={() => setShowDropdown(false)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted ${
                      pathname?.startsWith("/meetings") ? "bg-muted font-medium" : ""
                    }`}
                  >
                    <Calendar className="h-4 w-4" />
                    Meetings
                  </Link>
                  <div className="my-1 border-b" />
                </div>

                <Link
                  href="/settings"
                  onClick={() => setShowDropdown(false)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted ${
                    pathname === "/settings" ? "bg-muted font-medium" : ""
                  }`}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                {isAdmin && (
                  <>
                    <div className="my-1 border-b" />
                    <Link
                      href="/usage"
                      onClick={() => setShowDropdown(false)}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted ${
                        pathname === "/usage" ? "bg-muted font-medium" : ""
                      }`}
                    >
                      <BarChart3 className="h-4 w-4" />
                      Usage Dashboard
                    </Link>
                    <Link
                      href="/admin/users"
                      onClick={() => setShowDropdown(false)}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted ${
                        pathname?.startsWith("/admin/users") ? "bg-muted font-medium" : ""
                      }`}
                    >
                      <Users className="h-4 w-4" />
                      Manage Users
                    </Link>
                  </>
                )}
                <div className="my-1 border-b" />
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-muted"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </header>
  );
}
