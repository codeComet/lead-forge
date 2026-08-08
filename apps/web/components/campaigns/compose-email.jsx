"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Standalone compose — send a one-off email to any recipient, not tied to a
// lead or proposal. Hits the same /api/emails route (leadId/proposalId omitted).
export function ComposeEmail({ orgId }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [to, setTo] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");

  async function send() {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast.error("To, subject and body are all required.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send");
      toast.success(json.queued ? "Email sent." : json.warning || "Email recorded.");
      queryClient.invalidateQueries({ queryKey: ["emails", orgId] });
      setTo("");
      setSubject("");
      setBody("");
      setOpen(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PenLine className="h-4 w-4" /> Compose email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compose email</DialogTitle>
          <DialogDescription>Send a one-off email to any recipient.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="owner@business.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message… plain text or HTML." />
          </div>
          <Button onClick={send} disabled={sending} className="w-full">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send email
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
