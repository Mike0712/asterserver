import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';

export const registerStasisEndHandler = () => {
  ariWebSocket.on('StasisEnd', (event: AriEvent) => {
    console.log('[ARI] Channel left Stasis:', event);
  });
};

