"use client";

import * as React from "react";
import { Search, LogOut, ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils";

export function Topbar({ user, orgName }) {
  const name = user?.user_metadata?.full_name || user?.email || "You";

  function openPalette() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur lg:px-6">
      <button
        onClick={openPalette}
        className="flex w-72 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent"
      >
        <Search className="h-4 w-4" />
        Search or jump to…
        <span className="ml-auto text-xs opacity-60">⌘K</span>
      </button>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {initials(name)}
              </span>
              <span className="hidden max-w-[10rem] truncate text-sm sm:inline">{name}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{orgName}</DropdownMenuLabel>
            <div className="px-2 pb-1 text-xs text-muted-foreground">{user?.email}</div>
            <DropdownMenuSeparator />
            <form action="/auth/signout" method="post">
              <button type="submit" className="w-full">
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
