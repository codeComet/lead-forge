// Send pacing: how many emails an org may send today, and when the next one
// goes out.
//
// Gmail scores the sender, not the message — a domain with no history that
// suddenly emits 40 cold emails gets spam-foldered regardless of SPF/DKIM. So
// volume ramps over four weeks and each send is spaced through a business-hours
// window with jitter, instead of firing as a burst.
//
// Pure functions: no DB, no clock of their own (`now` is always passed in), and
// randomness is injectable — so the worker and the UI can agree on the schedule
// and tests stay deterministic.

/**
 * Daily cap by day-of-ramp (1-based, counted from warm-up start).
 * Weeks 1-2 run against seed contacts only; leads unlock at graduation.
 */
export const RAMP = [
  { untilDay: 7, cap: 8 },
  { untilDay: 14, cap: 15 },
  { untilDay: 21, cap: 25 },
  { untilDay: 28, cap: 40 },
];
/** Steady-state ceiling once the ramp is done. */
export const RAMP_CEILING = 50;

/** Cap before any warm-up has been started (legacy/idle orgs stay unmetered). */
export const IDLE_CAP = Infinity;

const MINUTE = 60_000;
const DAY = 86_400_000;

// ── timezone helpers (Intl only — no date library in this monorepo) ─────

function tzParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    // Intl renders midnight as "24" in some locales/zones.
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    isoWeekday: WEEKDAY[p.weekday] ?? 1,
  };
}

/** Offset of `timeZone` from UTC at `date`, in ms (positive = ahead of UTC). */
function tzOffsetMs(date, timeZone) {
  const p = tzParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The UTC instant for a wall-clock time in `timeZone`. Resolved twice because
 * the offset itself depends on the instant (DST boundaries).
 */
export function zonedToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let utc = naive - tzOffsetMs(new Date(naive), timeZone);
  utc = naive - tzOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/** Local calendar date (YYYY-MM-DD) of `date` in `timeZone`. */
export function localDateKey(date, timeZone) {
  const p = tzParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Start of the local day, as a UTC instant. */
export function startOfLocalDay(date, timeZone) {
  const p = tzParts(date, timeZone);
  return zonedToUtc({ year: p.year, month: p.month, day: p.day }, timeZone);
}

// ── ramp + warm-up state ───────────────────────────────────────────────

const DEFAULTS = {
  mode: "idle",
  warmup_started_at: null,
  warmup_days: 14,
  timezone: "Europe/Stockholm",
  window_start_hour: 9,
  window_end_hour: 17,
  send_days: [1, 2, 3, 4, 5],
  daily_cap_override: null,
};

export function withDefaults(settings) {
  return { ...DEFAULTS, ...(settings || {}) };
}

/**
 * 1-based day of the ramp. Counted in whole local days so "day 2" starts at
 * local midnight, not 24h after the start click.
 */
export function rampDay(settings, now = new Date()) {
  const s = withDefaults(settings);
  if (!s.warmup_started_at) return 1;
  const start = startOfLocalDay(new Date(s.warmup_started_at), s.timezone);
  const today = startOfLocalDay(now, s.timezone);
  return Math.max(1, Math.round((today - start) / DAY) + 1);
}

/** Emails allowed today. Infinity for orgs that never started warm-up. */
export function dailyCap(settings, now = new Date()) {
  const s = withDefaults(settings);
  if (s.mode === "idle" || !s.warmup_started_at) return IDLE_CAP;
  if (s.daily_cap_override) return s.daily_cap_override;
  const day = rampDay(s, now);
  for (const step of RAMP) if (day <= step.untilDay) return step.cap;
  return RAMP_CEILING;
}

/** True once the warm-up period is over (day N+1 onwards). */
export function isWarmupComplete(settings, now = new Date()) {
  const s = withDefaults(settings);
  if (!s.warmup_started_at) return false;
  return rampDay(s, now) > s.warmup_days;
}

/** Days of warm-up still to run (0 once complete). */
export function warmupDaysLeft(settings, now = new Date()) {
  const s = withDefaults(settings);
  if (!s.warmup_started_at) return s.warmup_days;
  return Math.max(0, s.warmup_days - rampDay(s, now) + 1);
}

/** Only seed contacts are mailable while warm-up is running. */
export function leadsBlocked(settings, now = new Date()) {
  const s = withDefaults(settings);
  return s.mode === "warming" && !isWarmupComplete(s, now);
}

// ── window + slot placement ────────────────────────────────────────────

function windowBounds(date, s) {
  const p = tzParts(date, s.timezone);
  const base = { year: p.year, month: p.month, day: p.day };
  return {
    open: zonedToUtc({ ...base, hour: s.window_start_hour }, s.timezone),
    // hour 24 is midnight the next day; zonedToUtc handles the rollover.
    close: zonedToUtc({ ...base, hour: s.window_end_hour }, s.timezone),
    isoWeekday: p.isoWeekday,
  };
}

/** Is `date` inside an allowed send day + hour range? */
export function isWithinWindow(date, settings) {
  const s = withDefaults(settings);
  const { open, close, isoWeekday } = windowBounds(date, s);
  return s.send_days.includes(isoWeekday) && date >= open && date < close;
}

/** Window opening of the next allowed send day strictly after `date`'s day. */
function nextWindowOpen(date, s) {
  let cursor = new Date(startOfLocalDay(date, s.timezone).getTime() + 12 * 3600_000);
  for (let i = 0; i < 14; i++) {
    cursor = new Date(cursor.getTime() + DAY);
    const { open, isoWeekday } = windowBounds(cursor, s);
    if (s.send_days.includes(isoWeekday)) return open;
  }
  return new Date(date.getTime() + DAY); // send_days empty/invalid → don't spin
}

/** Window opening today if still ahead, else the next allowed day's. */
function windowOpenAtOrAfter(date, s) {
  const { open, close, isoWeekday } = windowBounds(date, s);
  if (s.send_days.includes(isoWeekday)) {
    if (date < open) return open;
    if (date < close) return date;
  }
  return nextWindowOpen(date, s);
}

/**
 * When the next email should go out.
 *
 * @param settings      email_settings row (partial ok — defaults fill in)
 * @param now           current instant
 * @param sentToday     emails already sent in the current local day
 * @param lastScheduled last scheduled/sent instant, so sends don't stack up
 * @param rand          () => [0,1) — injectable for deterministic tests
 * @returns { at: Date, capReached: boolean, cap: number }
 *          `capReached` means today's quota is spent and `at` is tomorrow.
 */
export function nextSendSlot({ settings, now = new Date(), sentToday = 0, lastScheduledAt = null, rand = Math.random } = {}) {
  const s = withDefaults(settings);
  const cap = dailyCap(s, now);

  // Unmetered orgs: send immediately, no window, no spacing.
  if (cap === IDLE_CAP) return { at: now, capReached: false, cap };

  const { open, close } = windowBounds(now, s);
  const windowMs = Math.max(close - open, 60 * MINUTE);
  // Aim to spread the whole day's quota across the window, then jitter ±40% so
  // the gaps don't look machine-perfect. Floor of 6 min keeps small caps sane.
  const evenGap = windowMs / Math.max(cap, 1);
  const gap = Math.max(6 * MINUTE, evenGap * (0.6 + 0.8 * rand()));

  let candidate = windowOpenAtOrAfter(now, s);
  if (lastScheduledAt) {
    const after = new Date(new Date(lastScheduledAt).getTime() + gap);
    if (after > candidate) candidate = windowOpenAtOrAfter(after, s);
  }

  // Quota spent for today → first slot of the next allowed day.
  const spentToday = sentToday >= cap;
  const rolled = spentToday || candidate >= windowBounds(candidate, s).close;
  if (rolled) {
    const nextOpen = nextWindowOpen(spentToday ? now : candidate, s);
    // Small random offset so day N+1 doesn't start with a burst at 09:00:00.
    return { at: new Date(nextOpen.getTime() + Math.floor(rand() * 25 * MINUTE)), capReached: spentToday, cap };
  }

  return { at: candidate, capReached: false, cap };
}
