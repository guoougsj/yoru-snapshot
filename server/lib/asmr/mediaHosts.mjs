const API_HOSTS = new Set([
  "api.asmr-200.com",
  "api.asmr.one",
  "api.asmr-100.com",
  "api.asmr-300.com",
]);

export function isAllowedMediaHost(value) {
  const host = String(value || "").toLowerCase();
  return (
    host === "asmr.one" ||
    host.endsWith(".asmr.one") ||
    host === "kiko-play-niptan.one" ||
    host.endsWith(".kiko-play-niptan.one") ||
    API_HOSTS.has(host)
  );
}
