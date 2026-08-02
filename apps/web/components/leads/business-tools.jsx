"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Re-audit + manually fix a business's website / contact email. Lives on the
// lead detail page so a missed or wrong URL can be corrected and re-scanned
// without going back to the search list.
export function BusinessTools({ business, lead }) {
  const router = useRouter();
  const [auditing, setAuditing] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [website, setWebsite] = React.useState(business?.website || "");
  const [email, setEmail] = React.useState(lead?.contact_email || "");

  async function reaudit() {
    setAuditing(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessIds: [business.id] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success("Re-auditing… results refresh in a moment.");
      // Give the worker a head start, then pull fresh audit data into the page.
      setTimeout(() => router.refresh(), 6000);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAuditing(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, contactEmail: email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setOpen(false);
      toast.success("Saved. Re-auditing with the new details…");
      router.refresh();
      // A manual website is the whole point of re-auditing — kick one off.
      await reaudit();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={reaudit} disabled={auditing}>
        {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Re-audit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4" /> Edit details
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit business details</DialogTitle>
            <DialogDescription>
              Add the website or email if the audit missed them. Saving re-audits the site
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="example.com"
                type="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@business.com"
                type="email"
              />
              <p className="text-xs text-muted-foreground">
                A manually entered email is marked <span className="font-medium">verified</span>.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save &amp; re-audit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
