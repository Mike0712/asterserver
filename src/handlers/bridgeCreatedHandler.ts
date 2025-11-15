import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';

export const registerBridgeCreatedHandler = () => {
  ariWebSocket.on('BridgeCreated', (event: AriEvent) => {
    console.log('[ARI] Bridge created:', event);
  });
};

