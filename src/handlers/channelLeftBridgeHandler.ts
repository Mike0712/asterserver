import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';
import { sendTelephonyEvent } from '../utils/telephonyEventSender';

interface ChannelLeftBridgeEvent extends AriEvent {
  bridge?: {
    id?: string;
    name?: string;
  };
  channel?: {
    id?: string;
    name?: string;
    caller?: {
      number?: string;
      name?: string;
    };
    dialplan?: {
      exten?: string;
      context?: string;
    };
  };
}

export const registerChannelLeftBridgeHandler = () => {
  ariWebSocket.on('ChannelLeftBridge', async (event: ChannelLeftBridgeEvent) => {
    console.log('[ARI] Channel left bridge:', event);

    try {
      const joinExtension = event.channel?.dialplan?.exten;
      const endpoint = event.channel?.name || joinExtension;
      const caller = event.channel?.caller?.number || event.channel?.name;

      await sendTelephonyEvent({
        event: 'bridge_left',
        bridge_id: event.bridge?.id,
        uniqueid: event.channel?.id,
        caller,
        endpoint,
        join_extension: joinExtension,
        status: 'left',
        timestamp: event.timestamp,
        metadata: {
          bridge_name: event.bridge?.name,
          channel_id: event.channel?.id,
          caller_name: event.channel?.caller?.name,
          dialplan_context: event.channel?.dialplan?.context,
        },
      });
    } catch (error) {
      console.error('[ARI] Failed to send bridge_left event:', error);
    }
  });
};

