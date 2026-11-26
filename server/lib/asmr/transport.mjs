export const MIRRORS = [
  "https://api.asmr-200.com",
  "https://api.asmr.one",
  "https://api.asmr-100.com",
  "https://api.asmr-300.com",
];

export const RELAY_MIRRORS = [MIRRORS[0], MIRRORS[1]];

export const RELAYS = [
  {
    name: "furina-relay",
    build: (url) => {
      const target = new URL(url);
      return `https://asmr.furina.in/api${target.pathname.replace(/^\/api/, "")}${target.search}`;
    },
    unwrap: (payload) => payload,
  },
  {
    name: "allorigins-raw",
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    unwrap: (payload) => payload,
  },
  {
    name: "cors-lol",
    build: (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
    unwrap: (payload) => payload,
  },
  {
    name: "allorigins",
    build: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    unwrap: (payload) => {
      const code = payload?.status?.http_code;
      if (code && code !== 200) throw new Error(`relay upstream ${code}`);
      if (typeof payload?.contents !== "string") {
        throw new Error("relay returned empty contents");
      }
      return JSON.parse(payload.contents);
    },
  },
];

export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
];

export async function fetchJson(url, { relay = null, timeout = 9000, attempts = 1 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const target = relay ? relay.build(url) : url;
      const headers = relay
        ? { "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] }
        : {
            Accept: "application/json",
            Origin: "https://asmr.one",
            Referer: "https://asmr.one/",
            "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          };
      const response = await fetch(target, {
        headers,
        signal: AbortSignal.timeout(timeout),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${text.slice(0, 80)}`);
      }
      const payload = JSON.parse(text);
      return relay ? relay.unwrap(payload) : payload;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
      }
    }
  }
  throw lastError;
}
