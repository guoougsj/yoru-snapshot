export function formatLongDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${totalMinutes} 分钟`;
  return `${hours} 小时 ${String(minutes).padStart(2, "0")} 分`;
}

export function formatShortDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toFixed(1)} h`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

export function formatSyncDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "刚刚";
  const diff = Date.now() - date.getTime();
  if (diff < 120_000) return "刚刚";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function workDurationLabel(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} MIN`;
  return `${hours}H ${String(minutes).padStart(2, "0")}M`;
}
