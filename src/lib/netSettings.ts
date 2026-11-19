/**
 * User-selectable data source presets and route health.
 *
 * The official asmr.one API is blocked on some networks. YORU ships with a
 * working read-only relay, but users can also choose a direct-only route, the
 * public relays, their own relay, or a static snapshot. Presets are one-click;
 * only the self-hosted relay and snapshot options need a URL.
 */

export type DataSourcePreset =
  | "auto"
  | "furina"
  | "direct"
  | "public"
  | "custom"
  | "snapshot"
  | "bundled";

export type CustomSourceKind = "relay" | "snapshot";

export interface CustomSource {
  raw: string;
  kind: CustomSourceKind;
  base: string;
}

export interface DataSourceConfig {
  preset: DataSourcePreset;
  raw: string;
}

export interface SourcePreset {
  id: DataSourcePreset;
  label: string;
  detail: string;
  needsUrl?: boolean;
}

export const FURINA_RELAY = "https://asmr.furina.in/api";

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: "auto",
    label: "自动选择",
    detail: "内置中继 + 直连 + 公共中继，推荐",
  },
  {
    id: "furina",
    label: "内置中继",
    detail: "asmr.furina.in 只读反代",
  },
  {
    id: "direct",
    label: "仅直连",
    detail: "官方 API，需要 VPN / 海外网络",
  },
  {
    id: "public",
    label: "公共中继",
    detail: "AllOrigins / cors.lol，可能限流",
  },
  {
    id: "custom",
    label: "自建中继",
    detail: "可先用内置地址，再替换成自己的",
    needsUrl: true,
  },
  {
    id: "snapshot",
    label: "静态快照",
    detail: "GitHub raw / jsDelivr JSON",
    needsUrl: true,
  },
  {
    id: "bundled",
    label: "内置快照",
    detail: "APK 自带 24 件作品，完全离线",
  },
];

const DATA_SOURCE_KEY = "yoru.data-source-v2";
const LEGACY_CUSTOM_KEY = "yoru.custom-source-v1";
const ROUTE_HEALTH_KEY = "yoru.route-health-v1";
const COOLDOWN_MS = 10 * 60_000;

const VALID_PRESETS = new Set<DataSourcePreset>(
  SOURCE_PRESETS.map((preset) => preset.id),
);

export function parseCustomSource(raw: string): CustomSource | null {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const path = url.pathname.toLowerCase();
  const kind: CustomSourceKind =
    path.endsWith(".json") || url.searchParams.get("snapshot") === "1"
      ? "snapshot"
      : "relay";
  return { raw: value, kind, base: value.replace(/\/+$/, "") };
}

export function readDataSource(): DataSourceConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(DATA_SOURCE_KEY) || "null") as
      | Partial<DataSourceConfig>
      | null;
    if (stored && VALID_PRESETS.has(stored.preset as DataSourcePreset)) {
      return {
        preset: stored.preset as DataSourcePreset,
        raw: typeof stored.raw === "string" ? stored.raw : "",
      };
    }
  } catch {
    /* Fall through to the legacy key. */
  }

  try {
    const legacy = localStorage.getItem(LEGACY_CUSTOM_KEY) || "";
    const parsed = parseCustomSource(legacy);
    if (parsed) {
      return {
        preset: parsed.kind === "snapshot" ? "snapshot" : "custom",
        raw: parsed.raw,
      };
    }
  } catch {
    /* Ignore unavailable storage. */
  }

  return { preset: "auto", raw: "" };
}

export function saveDataSource(
  preset: DataSourcePreset,
  raw = "",
): DataSourceConfig | null {
  if (!VALID_PRESETS.has(preset)) return null;
  const value = raw.trim();
  if (value && (preset === "custom" || preset === "snapshot")) {
    const parsed = parseCustomSource(value);
    if (!parsed) return null;
    if (preset === "snapshot" && parsed.kind !== "snapshot") return null;
    if (preset === "custom" && parsed.kind !== "relay") return null;
  }
  const config: DataSourceConfig = { preset, raw: value };
  try {
    localStorage.setItem(DATA_SOURCE_KEY, JSON.stringify(config));
    localStorage.removeItem(LEGACY_CUSTOM_KEY);
  } catch {
    /* The current session can still use the in-memory value. */
  }
  return config;
}

export function presetLabel(preset: DataSourcePreset): string {
  return SOURCE_PRESETS.find((item) => item.id === preset)?.label || "自动选择";
}

/**
 * A relay may be:
 *  - a generic CORS proxy that takes ?url=...;
 *  - a template containing {url};
 *  - a transparent reverse proxy whose path ends with /api (like a
 *    Cloudflare/Netlify deployment that forwards the remainder verbatim).
 */
export function buildRelayTarget(base: string, target: string): string {
  if (base.includes("{url}")) {
    return base.replace("{url}", encodeURIComponent(target));
  }
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    return base;
  }
  // Users often paste the example URL from a relay README, complete with
  // ?url=...; drop the old value before adding the real target.
  if (parsed.searchParams.has("url")) {
    parsed.searchParams.delete("url");
  }
  const cleanBase = parsed.toString().replace(/\/+$/, "");
  if (/\/api\/?$/.test(parsed.pathname)) {
    const targetUrl = new URL(target);
    return `${cleanBase}${targetUrl.pathname.replace(/^\/api/, "")}${targetUrl.search}`;
  }
  const separator = cleanBase.includes("?") ? "&" : "?";
  return `${cleanBase}${separator}url=${encodeURIComponent(target)}`;
}

/** Relay base used by the chosen preset, or null for auto/pure direct. */
export function presetRelay(config: DataSourceConfig): CustomSource | null {
  if (config.preset === "furina") {
    return { raw: FURINA_RELAY, kind: "relay", base: FURINA_RELAY };
  }
  if (config.preset === "custom") {
    const parsed = parseCustomSource(config.raw);
    return parsed?.kind === "relay" ? parsed : null;
  }
  return null;
}

export function presetSnapshot(config: DataSourceConfig): CustomSource | null {
  if (config.preset !== "snapshot") return null;
  const parsed = parseCustomSource(config.raw);
  return parsed?.kind === "snapshot" ? parsed : null;
}

interface RouteHealth {
  okAt?: number;
  failAt?: number;
  fails?: number;
}

function readHealth(): Record<string, RouteHealth> {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTE_HEALTH_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeHealth(value: Record<string, RouteHealth>) {
  try {
    localStorage.setItem(ROUTE_HEALTH_KEY, JSON.stringify(value));
  } catch {
    /* Health hints are optional. */
  }
}

export function isRouteCoolingDown(name: string): boolean {
  const entry = readHealth()[name];
  if (!entry?.fails || !entry.failAt) return false;
  if (entry.fails < 2) return false;
  return Date.now() - entry.failAt < COOLDOWN_MS;
}

export function routePenalty(name: string): number {
  const entry = readHealth()[name];
  if (!entry) return 0;
  if (entry.okAt && (!entry.failAt || entry.okAt >= entry.failAt)) return -1_000_000;
  return (entry.fails || 0) * 1_000;
}

export function noteRouteResult(name: string, ok: boolean) {
  const all = readHealth();
  const previous = all[name] || {};
  all[name] = ok
    ? { okAt: Date.now(), fails: 0 }
    : { ...previous, failAt: Date.now(), fails: (previous.fails || 0) + 1 };
  writeHealth(all);
}

export function forgetRouteHealth() {
  writeHealth({});
}
