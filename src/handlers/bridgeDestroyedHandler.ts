import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';

export const registerBridgeDestroyedHandler = () => {
  ariWebSocket.on('BridgeDestroyed', (event: AriEvent) => {
    console.log('[ARI] Bridge destroyed:', event);
  });
};

