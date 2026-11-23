import express, { Application } from 'express';
import { applyIpWhitelist, parseAllowedIPs } from './middleware/ipWhitelist';
import { endpointsRouter } from './routes/endpoints';
import { ariRouter } from './routes/ariCommand';
import { ariWebSocket } from './utils/ariWebSocket';
import { registerAllEventHandlers } from './handlers';

const app: Application = express();
const PORT = process.env.PORT || 3000;

applyIpWhitelist(app, parseAllowedIPs(process.env.ALLOWED_IPS));
app.use(express.json());

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

