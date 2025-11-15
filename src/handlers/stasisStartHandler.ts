import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';

export const registerStasisStartHandler = () => {
  ariWebSocket.on('StasisStart', (event: AriEvent) => {
    console.log('[ARI] Channel entered Stasis:', event);
  });
};

