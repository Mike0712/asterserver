import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';

export const registerChannelLeftBridgeHandler = () => {
  ariWebSocket.on('ChannelLeftBridge', (event: AriEvent) => {
    console.log('[ARI] Channel left bridge:', event);
  });
};

