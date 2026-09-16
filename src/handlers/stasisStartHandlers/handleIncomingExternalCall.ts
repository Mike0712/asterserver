import { ariClient } from '../../utils/ariClient';
import { AriChannel } from '../../utils/ariWebSocket';
import { incomingCallState, PendingIncomingCall } from './incomingCallState';

const ARI_APP = process.env.ARI_APP || 'asterisk-app';
const POLL_INTERVAL_MS = 1000;
// Total time we hold the caller (ring tone playing, channel already answered)
// from the moment the call enters Stasis until it's either bridged or we give
// up — whether that time goes to waiting for the SIP endpoint to (re)register
// after a wake push, or to ringing it once dialing has actually started.
// Matches the original dialplan's single `Dial(PJSIP/user,30,r)` budget: the
// caller is held for up to 30s total, in case the callee picks up, regardless
// of how that 30s splits between "waking up" and "ringing".
const HOLD_TIMEOUT_MS = 30000;
const MIN_ORIGINATE_TIMEOUT_SEC = 5;

async function sendWakeSignals(userId: string, from: string): Promise<void> {
  const wakeUrl = process.env.TELEPHONY_WAKE_PUSH_URL;
  const notifyUrl = process.env.TELEPHONY_NOTIFY_URL;
  if (!wakeUrl && !notifyUrl) {
    console.warn('[ARI] TELEPHONY_WAKE_PUSH_URL/TELEPHONY_NOTIFY_URL not set — offline callee will not be woken, call will just poll until hold timeout');
  }
  const query = `user_id=${encodeURIComponent(userId)}&from=${encodeURIComponent(from)}`;

  await Promise.all([
    wakeUrl
      ? fetch(`${wakeUrl}?${query}`).catch((error) => console.error('[ARI] wake-push failed:', error))
      : Promise.resolve(),
    notifyUrl
      ? fetch(`${notifyUrl}?${query}`).catch((error) => console.error('[ARI] notify failed:', error))
      : Promise.resolve(),
  ]);
}

async function abortCall(bridgeId: string): Promise<void> {
  const pending = incomingCallState.get(bridgeId);
  if (!pending) return;
  incomingCallState.delete(bridgeId);

  if (pending.pollHandle) clearInterval(pending.pollHandle);
  if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
  if (pending.playbackId) {
    await ariClient.stopPlayback(pending.playbackId).catch(() => undefined);
  }

  await ariClient.deleteChannel(pending.originalChannelId).catch(() => undefined);
  await ariClient.deleteBridge(bridgeId).catch(() => undefined);
}

// `deadlineAt` is the single hold-timeout for the whole call (set once in
// handleIncomingExternalCall) — the originate's own ring timeout is however
// much of that budget is left, not a fresh 30s on top of it.
async function originateToEndpoint(bridgeId: string, sipUser: string, deadlineAt: number, from: string): Promise<void> {
  const remainingSec = Math.max(MIN_ORIGINATE_TIMEOUT_SEC, Math.round((deadlineAt - Date.now()) / 1000));

  await ariClient.originateChannel({
    endpoint: `PJSIP/${sipUser}`,
    app: ARI_APP,
    appArgs: `callType:::bridgeIncomingCall,bridgeId:::${bridgeId}`,
    timeout: remainingSec,
    // Without this the new leg to the callee's endpoint carries no caller
    // identity, so its SIP client shows "Anonymous" instead of the actual
    // calling number.
    callerId: from,
  });
  // No separate timeout here on purpose — the single HOLD_TIMEOUT_MS timer
  // started in handleIncomingExternalCall already covers "callee doesn't
  // answer in time" and will abort the whole call, bridge included.
}

function pollUntilOnline(bridgeId: string, sipUser: string, deadlineAt: number, from: string): void {
  // Guards against two overlapping ticks both deciding to act (setInterval
  // doesn't wait for the previous async callback to finish) — the first tick
  // to reach this synchronous check wins, everything after it is a no-op.
  let resolved = false;

  const pending = incomingCallState.get(bridgeId);
  if (!pending) return;

  pending.pollHandle = setInterval(async () => {
    if (resolved || Date.now() >= deadlineAt) return; // the hold-timeout will abort separately

    const endpoint = await ariClient
      .getEndpoint('PJSIP', sipUser)
      .catch((error) => {
        console.error('[ARI] getEndpoint poll failed for', sipUser, error);
        return null;
      });
    if (resolved) return;

    const current = incomingCallState.get(bridgeId);
    if (!current) {
      resolved = true;
      return; // already aborted/bridged elsewhere
    }

    if (endpoint?.state === 'online') {
      resolved = true;
      if (current.pollHandle) clearInterval(current.pollHandle);
      current.pollHandle = null;
      await originateToEndpoint(bridgeId, sipUser, deadlineAt, from);
    }
  }, POLL_INTERVAL_MS);
}

// Entry point for `Stasis(app, callType:::incomingExternalCall, sip_user:::..., user_id:::..., from:::...)`.
// The channel is already answered (see stasisStartHandler.ts) — this, plus
// the ring-tone playback below, is what replaces the old dialplan
// Answer()+Playtones()+Wait()-loop+Dial() sequence.
export const handleIncomingExternalCall = async (
  channel: AriChannel,
  args: Record<string, string>,
): Promise<void> => {
  const sipUser = args.sip_user;
  const userId = args.user_id;
  const from = args.from || channel.caller?.number || 'Unknown';

  if (!channel || !sipUser) {
    return;
  }

  const bridge = (await ariClient.createBridge({ type: 'mixing' })) as { id: string };
  await ariClient.addChannelToBridge({ bridgeId: bridge.id, channel: channel.id, role: 'participant' });

  const playback = (await ariClient.playMedia(channel.id, 'tone:ring;tonezone=ru')) as { id: string };

  const pending: PendingIncomingCall = {
    bridgeId: bridge.id,
    originalChannelId: channel.id,
    playbackId: playback.id,
    sipUser,
    from,
    timeoutHandle: null,
    pollHandle: null,
  };
  incomingCallState.set(bridge.id, pending);

  const deadlineAt = Date.now() + HOLD_TIMEOUT_MS;
  pending.timeoutHandle = setTimeout(() => {
    console.warn('[ARI] incoming call: hold timeout reached, aborting', bridge.id, 'sip_user:', sipUser);
    abortCall(bridge.id);
  }, HOLD_TIMEOUT_MS);

  const endpoint = await ariClient
    .getEndpoint('PJSIP', sipUser)
    .catch((error) => {
      console.error('[ARI] getEndpoint failed for', sipUser, error);
      return null;
    });

  if (endpoint?.state === 'online') {
    await originateToEndpoint(bridge.id, sipUser, deadlineAt, from);
    return;
  }

  console.log('[ARI] endpoint not immediately online, waking + polling:', sipUser, 'state:', endpoint?.state ?? 'lookup failed');

  if (userId) {
    sendWakeSignals(userId, from).catch(() => undefined);
  }

  pollUntilOnline(bridge.id, sipUser, deadlineAt, from);
};
