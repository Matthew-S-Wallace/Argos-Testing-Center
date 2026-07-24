const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
const MINUTES_PER_DAY = 24 * 60;

export function getFieldGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export function getTodayDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function formatDate(dateString) {
  if (!dateString) return "—";

  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function parseStatusDateTime(value) {
  if (!value) return null;

  const stringValue = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(stringValue)
    ? new Date(`${stringValue}T00:00:00`)
    : new Date(stringValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateStatusDurationDays(startDate, endDate) {
  const start = parseStatusDateTime(startDate);
  const end = parseStatusDateTime(endDate);

  if (!start || !end) return 0;

  return Math.max(0, (end.getTime() - start.getTime()) / MILLISECONDS_PER_DAY);
}

export function formatStatusDuration(durationDays) {
  const totalMinutes = Math.max(0, Math.round(Number(durationDays || 0) * MINUTES_PER_DAY));
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    const parts = [`${days} day${days === 1 ? "" : "s"}`];
    if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    return parts.join(" ");
  }

  if (hours > 0) {
    const parts = [`${hours} hour${hours === 1 ? "" : "s"}`];
    if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    return parts.join(" ");
  }

  return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
}

export function calculateDaysDown(downSince, status, comparisonDate = new Date()) {
  if (status === "Ready" || !downSince) return 0;

  const downDate = new Date(`${downSince}T00:00:00`);
  const today = new Date(comparisonDate);

  today.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor((today.getTime() - downDate.getTime()) / MILLISECONDS_PER_DAY));
}

export function calculateFinalDaysDown(downSince, comparisonDate = new Date()) {
  if (!downSince) return 0;

  const downDate = new Date(`${downSince}T00:00:00`);
  const today = new Date(comparisonDate);

  today.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor((today.getTime() - downDate.getTime()) / MILLISECONDS_PER_DAY));
}

export function formatRTS(asset) {
  if (asset.rtsType === "TBD") return "TBD";
  if (asset.rtsType === "No RTS Established") return "—";

  if (asset.rtsType === "Estimated Date" && asset.rtsDate) {
    const date = new Date(`${asset.rtsDate}T00:00:00`);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  return "—";
}

export function isSameLocalCalendarDate(value, comparisonDate = new Date()) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === comparisonDate.getFullYear() &&
    date.getMonth() === comparisonDate.getMonth() &&
    date.getDate() === comparisonDate.getDate()
  );
}