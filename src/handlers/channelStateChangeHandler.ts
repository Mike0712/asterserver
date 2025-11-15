import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';

export const registerChannelStateChangeHandler = () => {
  ariWebSocket.on('ChannelStateChange', (event: AriEvent) => {
    console.log('[ARI] Channel state changed:', event);
  });
};

