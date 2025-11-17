import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';

export const registerWildcardHandler = () => {
  ariWebSocket.on('*', (event: AriEvent) => {
    // console.log(`[ARI Event] ${event.type}:`, JSON.stringify(event, null, 2));
  });
};

