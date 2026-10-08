// Origin configuration is deployment-owned, never supplied by a client header.
// No parent-domain routing, forwarded-host trust or cross-origin browser API.
export function permitsHost(request, env) {
  let owner, api, url;
  try {
    owner = new URL(env.OWNER_ORIGIN);
    api = new URL(env.API_ORIGIN);
    url = new URL(request.url);
  } catch { return false; }
  if ([owner, api].some(u => u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username || u.password) || owner.origin === api.origin) return false;
  const path = url.pathname;
  if (url.origin === owner.origin) {
    return (request.method === 'GET' && (path === '/' || path === '/owner' || path.startsWith('/owner/'))) ||
      (request.method === 'POST' && (path.startsWith('/v1/owner/') || /^\/v1\/admin\/(create|renew|revoke|transfer)$/.test(path)));
  }
  if (url.origin === api.origin) {
    if (request.method === 'GET') return env.CUSTOMER_PORTAL_ENABLED === 'true' && (path === '/invite' || path.startsWith('/invite/'));
    if (request.method !== 'POST') return false;
    if (path === '/v1/customer/accept-invite') return env.CUSTOMER_PORTAL_ENABLED === 'true'; // optional customer JWT + CSRF downstream
    if (path !== '/v1/activate' && path !== '/v1/refresh') return false;
    // Electron's main-process HTTPS requests have no browser Origin. Browsers
    // may only call their own origin; no wildcard CORS or credential sharing.
    const origin = request.headers.get('origin');
    return origin === null || origin === api.origin;
  }
  return false;
}
