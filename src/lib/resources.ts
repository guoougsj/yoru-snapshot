export interface ExternalResource {
  id: string;
  name: string;
  url: string;
  description: string;
  requiresLogin?: boolean;
}

export const ASMR_DAILY: ExternalResource = {
  id: "asmr-daily",
  name: "ASMR Daily",
  url: "https://asmrdaily.drive2dav.top",
  description: "Neokikoeru 资源库 · 需登录",
  requiresLogin: true,
};

export const EXTERNAL_RESOURCES: ExternalResource[] = [ASMR_DAILY];

export function resourceWorkUrl(resource: ExternalResource, workId: string): string {
  return `${resource.url}/works/${encodeURIComponent(workId)}`;
}
