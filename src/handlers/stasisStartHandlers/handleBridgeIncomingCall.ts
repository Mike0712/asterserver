import { ariClient } from '../../utils/ariClient';
import { AriChannel } from '../../utils/ariWebSocket';
import { incomingCallState } from './incomingCallState';

// Entry point for `Stasis(app, callType:::bridgeIncomingCall, bridgeId:::...)`
// — this is the leg originated by handleIncomingExternalCall.ts once the SIP
// endpoint came online. The channel is already answered by the time we get
// here (see stasisStartHandler.ts), so we just stop the ring tone on the
// waiting caller and join both legs.
export const handleBridgeIncomingCall = async (
  channel: AriChannel,
  args: Record<string, string>,
): Promise<void> => {
  const bridgeId = args.bridgeId;
  if (!bridgeId) return;

  const pending = incomingCallState.get(bridgeId);
  if (!pending) {
    // The wait timed out (or the caller hung up) before this leg came up.
    await ariClient.deleteChannel(channel.id).catch(() => undefined);
    return;
  }

  incomingCallState.delete(bridgeId);

  if (pending.pollHandle) clearInterval(pending.pollHandle);
  if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
  if (pending.playbackId) {
    await ariClient.stopPlayback(pending.playbackId).catch(() => undefined);
  }

  await ariClient.addChannelToBridge({ bridgeId, channel: channel.id, role: 'participant' });
};
