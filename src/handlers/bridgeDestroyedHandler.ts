import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';
import { sendTelephonyEvent } from '../utils/telephonyEventSender';

interface BridgeDestroyedEvent extends AriEvent {
  bridge?: {
    id?: string;
    name?: string;
  };
}

export const registerBridgeDestroyedHandler = () => {
  ariWebSocket.on('BridgeDestroyed', async (event: BridgeDestroyedEvent) => {
    console.log('[ARI] Bridge destroyed:', event);

    try {
      await sendTelephonyEvent({
        event: 'bridge_completed',
        bridge_id: event.bridge?.id,
        timestamp: event.timestamp,
        metadata: {
          bridge_name: event.bridge?.name,
        },
      });
    } catch (error) {
      console.error('[ARI] Failed to send bridge_completed event:', error);
    }
  });
};

