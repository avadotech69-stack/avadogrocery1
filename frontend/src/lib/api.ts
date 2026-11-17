const DEFAULT_PAGES_BACKEND_URL = 'https://avadogrocery1.onrender.com';

export function buildApiUrl(path: string, baseUrl?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const cleanBase = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!cleanBase) return normalizedPath;
  return `${cleanBase}${normalizedPath}`;
}

export function resolveRuntimeApiBase(
  configuredUrl?: string,
  hostname?: string
): string {
  const trimmed = (configuredUrl ?? '').trim();
  if (trimmed) return trimmed;
  if (hostname && hostname.toLowerCase().endsWith('.pages.dev')) {
    return DEFAULT_PAGES_BACKEND_URL;
  }
  return '';
}

function getConfiguredApiBase(): string {
  let configured = '';
  try {
    configured = import.meta.env.VITE_API_URL ?? '';
  } catch {
    configured = '';
  }
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : undefined;
  return resolveRuntimeApiBase(configured, hostname);
}

export function apiUrl(path: string): string {
  return buildApiUrl(path, getConfiguredApiBase());
}
