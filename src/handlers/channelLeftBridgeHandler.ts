import { ariClient } from '../utils/ariClient';
import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent } from '../utils/ariWebSocket';
import { sendTelephonyEvent } from '../utils/telephonyEventSender';
import { incomingCallState } from './stasisStartHandlers/incomingCallState';

interface ChannelLeftBridgeEvent extends AriEvent {
  bridge?: {
    id?: string;
    name?: string;
    channels?: string[];
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

    await handleCallSessionCleanup(event.bridge?.id, event.bridge?.channels, event.channel?.id);
  });
};

// Mirrors classic Dial(): the other leg of a two-party call doesn't stay
// connected to nothing once one side hangs up. Driven entirely by the
// ChannelLeftBridge event's own bridge.channels snapshot — no separate
// cache — and scoped to bridges this app created for call sessions
// (bridge_<sessionId>, see handleIncomingExternalCall.ts) so it never
// touches a bridge some other part of the system might be using.
async function handleCallSessionCleanup(
  bridgeId: string | undefined,
  remainingChannels: string[] | undefined,
  leftChannelId: string | undefined,
): Promise<void> {
  if (!bridgeId || !bridgeId.startsWith('bridge_')) return;

  if (!remainingChannels || remainingChannels.length === 0) {
    console.log('[ARI] bridge', bridgeId, 'is now empty — destroying it');

    // Covers the caller hanging up while we're still waiting for the
    // callee's endpoint to (re)register (handleIncomingExternalCall.ts's
    // wake+poll phase, before the callee leg exists at all) — without this,
    // the poll/hold-timeout would keep running against a bridge that no
    // longer exists and could still originate a phantom ring to the callee
    // after the caller has already given up.
    const pending = incomingCallState.get(bridgeId);
    if (pending) {
      incomingCallState.delete(bridgeId);
      if (pending.pollHandle) clearInterval(pending.pollHandle);
      if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
      if (pending.playbackId) await ariClient.stopPlayback(pending.playbackId).catch(() => undefined);
    }

    await ariClient.deleteBridge(bridgeId).catch(() => undefined);
    return;
  }

  if (remainingChannels.length === 1) {
    const [otherChannelId] = remainingChannels;
    console.log('[ARI] channel', leftChannelId, 'left', bridgeId, '— hanging up the other leg', otherChannelId);
    await ariClient.deleteChannel(otherChannelId).catch(() => undefined);
  }
}

