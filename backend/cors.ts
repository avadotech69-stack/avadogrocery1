export function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function parseConfiguredOrigins(rawOrigins?: string): string[] {
  if (!rawOrigins) return [];
  return rawOrigins
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);
}

function matchesOriginPattern(origin: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === origin) return true;

  // Support wildcard subdomain patterns like https://*.pages.dev
  const wildcardIndex = pattern.indexOf('*.');
  if (wildcardIndex !== -1) {
    const prefix = pattern.slice(0, wildcardIndex);
    const suffix = pattern.slice(wildcardIndex + 1); // keeps leading dot, e.g. ".pages.dev"
    if (origin.startsWith(prefix) && origin.endsWith(suffix)) {
      const hostPrefix = origin.slice(prefix.length, origin.length - suffix.length);
      return hostPrefix.length > 0 && !hostPrefix.includes('/');
    }
  }

  return false;
}

/**
 * Resolves the Access-Control-Allow-Origin header value for a request origin.
 * - When CORS_ORIGIN is empty/unset or '*', any browser origin is allowed
 *   (making initial Render + Cloudflare Pages deployment work out of the box).
 * - When CORS_ORIGIN is set to comma-separated origins/patterns, only matching
 *   origins are echoed back.
 */
export function resolveAllowedCorsOrigin(
  requestOrigin: string | undefined,
  configuredOriginsRaw?: string
): string | null {
  if (!requestOrigin) return null;
  const cleanOrigin = normalizeOrigin(requestOrigin);
  if (!cleanOrigin) return null;

  const allowed = parseConfiguredOrigins(configuredOriginsRaw);
  if (allowed.length === 0 || allowed.includes('*')) {
    return cleanOrigin;
  }

  for (const pattern of allowed) {
    if (matchesOriginPattern(cleanOrigin, pattern)) {
      return cleanOrigin;
    }
  }

  return null;
}
