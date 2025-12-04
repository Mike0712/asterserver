import express, { Application, Request, Response, NextFunction } from 'express';
import { endpointsRouter } from './routes/endpoints';
import { ariRouter } from './routes/ariCommand';
import { ariWebSocket } from './utils/ariWebSocket';
import { registerAllEventHandlers } from './handlers';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// IP whitelist middleware
const normalizeIP = (ip: string): string => {
  // Remove IPv6-mapped IPv4 prefix (::ffff:)
  return ip.replace(/^::ffff:/i, '');
};

const allowedIPs = (process.env.ALLOWED_IPS || '')
  .split(',')
  .map(ip => normalizeIP(ip.trim()))
  .filter(ip => ip);

const getClientIP = (req: Request): string | undefined => {
  // Check X-Forwarded-For header first (for proxy/load balancer)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return normalizeIP(ips.split(',')[0].trim());
  }
  // Fallback to req.ip (works with trust proxy) or connection remote address
  const ip = req.ip || req.socket.remoteAddress || req.connection?.remoteAddress;
  return ip ? normalizeIP(ip) : undefined;
};

const ipWhitelist = (req: Request, res: Response, next: NextFunction) => {
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
};

app.set('trust proxy', true);
app.use(express.json());
app.use(ipWhitelist);

app.use('/api/endpoints', endpointsRouter);
app.use('/api/ari', ariRouter);

// Register ARI WebSocket event handlers
registerAllEventHandlers();

// Подключаемся к ARI WebSocket
ariWebSocket.connect().catch((error) => {
  console.error('[ARI WebSocket] Failed to connect:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing ARI WebSocket...');
  ariWebSocket.disconnect();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing ARI WebSocket...');
  ariWebSocket.disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

