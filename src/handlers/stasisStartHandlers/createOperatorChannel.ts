import { ariClient } from "../../utils/ariClient";
import { AriChannel } from "../../utils/ariWebSocket";
import { sendTelephonyEvent } from "../../utils/telephonyEventSender";


export const createOperatorChannel = async (channel: AriChannel, args: Record<string, string>, application: string, timestamp: string) => {
        const joinExtension = args.extension;
    
        if (!channel || !joinExtension) {
          return;
        }
        
        if (args.bridgeId) {
            try {
                await ariClient.addChannelToBridge({
                    bridgeId: args.bridgeId,
                    channel: channel.id,
                    role: 'participant',
                });
            } catch (error) {
                console.error('[ARI] Failed to add channel to bridge:', error);
                return;
            }
        }

        if (joinExtension.startsWith('010')) {
          try {
            await sendTelephonyEvent({
              event: 'bridge_join',
              uniqueid: channel.id,
              caller: channel.caller?.number || channel.name,
              endpoint: channel.name || joinExtension,
              join_extension: joinExtension,
              timestamp: timestamp || new Date().toISOString(),
              metadata: {
                channel_id: channel.id,
                caller_name: channel.caller?.name,
                application,
              },
            });
          } catch (error) {
            console.error('[ARI] Failed to send bridge_join on StasisStart:', error);
          }
        }
    
}