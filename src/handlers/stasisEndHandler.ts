import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';
import { sendTelephonyEvent } from '../utils/telephonyEventSender';

interface StasisEndEvent extends AriEvent {
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

export const registerStasisEndHandler = () => {
  ariWebSocket.on('StasisEnd', async (event: StasisEndEvent) => {
    console.log('[ARI] Channel left Stasis:', event);

    try {
      const joinExtension = event.channel?.dialplan?.exten;
      const endpoint = event.channel?.name || joinExtension;
      const caller = event.channel?.caller?.number || event.channel?.name;

      await sendTelephonyEvent({
        event: 'stasis_end',
        uniqueid: event.channel?.id,
        caller,
        endpoint,
        join_extension: joinExtension,
        status: 'left',
        timestamp: event.timestamp,
        metadata: {
          channel_id: event.channel?.id,
          caller_name: event.channel?.caller?.name,
          dialplan_context: event.channel?.dialplan?.context,
        },
      });
    } catch (error) {
      console.error('[ARI] Failed to send stasis_end event:', error);
    }
  });
};

