import express, { Application, Request, Response, NextFunction } from 'express';
import { addRouter } from './routes/add';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// IP whitelist middleware
const allowedIPs = (process.env.ALLOWED_IPS || '').split(',').filter(ip => ip.trim());

const getClientIP = (req: Request): string | undefined => {
  // Check X-Forwarded-For header first (for proxy/load balancer)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(',')[0].trim();
  }
  // Fallback to req.ip (works with trust proxy) or connection remote address
  return req.ip || req.socket.remoteAddress || req.connection?.remoteAddress;
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

app.use('/api/add', addRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

