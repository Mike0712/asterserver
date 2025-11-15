import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';

export const registerChannelEnteredBridgeHandler = () => {
  ariWebSocket.on('ChannelEnteredBridge', (event: AriEvent) => {
    console.log('[ARI] Channel entered bridge:', event);
  });
};

