export function buildApiUrl(path: string, baseUrl?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const cleanBase = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!cleanBase) return normalizedPath;
  return `${cleanBase}${normalizedPath}`;
}

function getConfiguredApiBase(): string {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return meta.env?.VITE_API_URL ?? '';
}

export function apiUrl(path: string): string {
  return buildApiUrl(path, getConfiguredApiBase());
}
