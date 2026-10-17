/** Date and text formatting. The corpus is recorded in India Standard Time, so every label uses it. */

const TZ = "Asia/Kolkata";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

/** Calendar parts in IST, with fixed English abbreviations ("Sep", never "Sept"). */
function parts(ms: number) {
  const p = Object.fromEntries(partsFmt.formatToParts(ms).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month) - 1, d: Number(p.day), wd: WEEKDAYS.indexOf(String(p.weekday)) };
}

export const fmtDay = (ms: number) => {
  const p = parts(ms);
  return `${p.d} ${MONTHS[p.m]}`;
};
export const fmtDate = (ms: number) => {
  const p = parts(ms);
  return `${p.d} ${MONTHS[p.m]} ${p.y}`;
};
export const fmtWeekday = (ms: number) => {
  const p = parts(ms);
  return `${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.m]}`;
};
export const fmtTime = (ms: number) => timeFmt.format(ms);

/** "2:35" for a recording offset in milliseconds. */
export function fmtOffset(ms: number | undefined | null) {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** An ISO date object such as "2026-09-28" shown as "28 Sep". */
export function fmtObject(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, m, d] = value.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}`;
  }
  return value;
}

export function fmtRelative(ms: number, now = Date.now()) {
  const s = Math.round((now - ms) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDay(ms);
}

export const predicateLabel = (p: string) => p.replace(/_/g, " ");

/** Start of the IST calendar day containing `ms`. */
export function istDayStart(ms: number) {
  const offset = 5.5 * 3600 * 1000;
  return Math.floor((ms + offset) / 86400000) * 86400000 - offset;
}

export const DAY = 86400000;

export function compact(n: number) {
  return new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export function sourceTitle(f: {
  meeting?: { title: string } | null;
  thread?: { subject?: string; title?: string } | null;
  source?: { container?: { title?: string; subject?: string } };
}) {
  return f.meeting?.title ?? f.thread?.subject ?? f.thread?.title ?? f.source?.container?.title ?? f.source?.container?.subject ?? "Unknown source";
}

export function isEmailFact(f: { source?: { kind?: string }; thread?: unknown }) {
  return f.source?.kind === "email" || Boolean(f.thread);
}
