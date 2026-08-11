// Sends are paced (daily cap + spread across the send window), so the answer to
// "did it send?" is now one of three things: sent, scheduled for later, or
// recorded but not sent. Shared so every compose surface phrases it the same.

/** Human message for an /api/emails response body. */
export function sendResultMessage(json) {
  if (json?.sent) return "Email sent.";
  if (json?.scheduledAt) {
    const at = new Date(json.scheduledAt);
    const when = at.toLocaleString(undefined, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    return json.capReached
      ? `Daily limit reached — scheduled for ${when} to protect your sender reputation.`
      : `Scheduled for ${when}.`;
  }
  if (json?.queued) return "Email queued for sending.";
  return json?.warning || "Email recorded.";
}
