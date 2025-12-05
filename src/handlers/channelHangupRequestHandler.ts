import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';
import { sendTelephonyEvent } from '../utils/telephonyEventSender';

interface ChannelHangupRequestEvent extends AriEvent {
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
    state?: string;
  };
  soft?: boolean;
}

export const registerChannelHangupRequestHandler = () => {
  ariWebSocket.on('ChannelHangupRequest', async (event: ChannelHangupRequestEvent) => {
    console.log('[ARI] Channel hangup requested:', event);

    try {
      const joinExtension = event.channel?.dialplan?.exten;
      const endpoint = event.channel?.name || joinExtension;
      const caller = event.channel?.caller?.number || event.channel?.name;

      await sendTelephonyEvent({
        event: 'channel_hangup_request',
        uniqueid: event.channel?.id,
        caller,
        endpoint,
        join_extension: joinExtension,
        status: 'left',
        timestamp: event.timestamp,
        metadata: {
          channel_id: event.channel?.id,
          channel_state: event.channel?.state,
          caller_name: event.channel?.caller?.name,
          dialplan_context: event.channel?.dialplan?.context,
          soft: event.soft,
        },
      });
    } catch (error) {
      console.error('[ARI] Failed to send channel_hangup_request event:', error);
    }
  });
};

