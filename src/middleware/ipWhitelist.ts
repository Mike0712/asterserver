import { Application, Request, Response, NextFunction } from 'express';

// Remove IPv6-mapped IPv4 prefix (::ffff:)
export const normalizeIP = (ip: string): string => ip.replace(/^::ffff:/i, '');

export const parseAllowedIPs = (raw: string | undefined): string[] =>
  (raw || '')
    .split(',')
    .map((ip) => normalizeIP(ip.trim()))
    .filter((ip) => ip);

// req.ip, resolved by Express from X-Forwarded-For only across *trusted*
// proxy hops. Taking the header's first entry ourselves let any client spoof
// a whitelisted address — proxies append the real client, they don't replace it.
const getClientIP = (req: Request): string | undefined => {
  const ip = req.ip || req.socket.remoteAddress;
  return ip ? normalizeIP(ip) : undefined;
};

/**
 * Which hops may set X-Forwarded-For. Default 'loopback' = a reverse proxy on
 * this host; override with TRUST_PROXY (any Express 'trust proxy' value, e.g.
 * "10.0.0.0/8", "2" or "false" when exposed directly).
 */
const trustProxySetting = (): string | number | boolean => {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) return 'loopback';
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
};

/** Configures proxy trust on the app and mounts the IP whitelist middleware. */
export const applyIpWhitelist = (app: Application, allowedIPs: string[]) => {
  app.set('trust proxy', trustProxySetting());

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (allowedIPs.length === 0) {
      console.warn('Warning: No ALLOWED_IPS configured, allowing all requests');
      return next();
    }

    const clientIP = getClientIP(req);

    if (!clientIP || !allowedIPs.includes(clientIP)) {
      console.warn(`Blocked request from IP: ${clientIP}, allowed IPs: ${allowedIPs.join(', ')}`);
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  });
};
