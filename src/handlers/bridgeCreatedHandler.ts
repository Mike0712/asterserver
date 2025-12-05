import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';
import { sendTelephonyEvent } from '../utils/telephonyEventSender';

interface BridgeCreatedEvent extends AriEvent {
  bridge?: {
    id?: string;
    name?: string;
    technology?: string;
    bridge_type?: string;
  };
}

export const registerBridgeCreatedHandler = () => {
  ariWebSocket.on('BridgeCreated', async (event: BridgeCreatedEvent) => {
    console.log('[ARI] Bridge created:', event);

    try {
      await sendTelephonyEvent({
        event: 'bridge_created',
        bridge_id: event.bridge?.id,
        timestamp: event.timestamp,
        metadata: {
          bridge_name: event.bridge?.name,
          bridge_technology: event.bridge?.technology,
          bridge_type: event.bridge?.bridge_type,
        },
      });
    } catch (error) {
      console.error('[ARI] Failed to send bridge_created event:', error);
    }
  });
};

