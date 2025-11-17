import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';

export const registerChannelCreatedHandler = () => {
  ariWebSocket.on('ChannelCreated', (event: AriEvent) => {
    console.log('[ARI] Channel created:', event);
  });
};