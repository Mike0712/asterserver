import express, { Application, Request, Response, NextFunction } from 'express';
import { addRouter } from './routes/add';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// IP whitelist middleware
const allowedIPs = (process.env.ALLOWED_IPS || '').split(',').filter(ip => ip.trim());

const ipWhitelist = (req: Request, res: Response, next: NextFunction) => {
  if (allowedIPs.length === 0) {
    console.warn('Warning: No ALLOWED_IPS configured, allowing all requests');
    return next();
  }
  
  const clientIP = req.ip || req.connection.remoteAddress;
  
  if (!clientIP || !allowedIPs.includes(clientIP)) {
    console.warn(`Blocked request from IP: ${clientIP}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  next();
};

app.use(express.json());
app.set('trust proxy', true);
app.use(ipWhitelist);

app.use('/api/add', addRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

