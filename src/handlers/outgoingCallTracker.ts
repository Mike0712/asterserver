import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent, AriChannel } from '../utils/ariWebSocket';
import { ariClient } from '../utils/ariClient';
import { sendTelephonyEvent } from '../utils/telephonyEventSender';

/**
 * Tracks outgoing PSTN calls made with a plain dialplan `Dial()` (not Stasis)
 * and reports their progress / hangup cause to tgsip, which relays them to the
 * mini app over SSE.
 *
 * This works because the ARI WebSocket is opened with `subscribeAll=true`, so
 * we receive Dial / ChannelHangupRequest / ChannelDestroyed for every channel
 * on the box, Stasis or not.
 *
 * Correlation: the mini app sends `X-Call-Token: <uuid>` in its INVITE. On the
 * first Dial event for a caller channel we read that header through ARI
 * (dialplan functions are readable as channel variables). Calls without the
 * header are ignored, so this never touches incoming / bridge / Stasis calls.
 */

type OutgoingCallState = 'dialing' | 'ringing' | 'progress' | 'answered' | 'failed' | 'ended';

interface TrackedCall {
  token: string;
  callerChannelId: string;
  sipUser: string | null;
  peerChannelId?: string;
  dialstatus?: string;
  lastState?: OutgoingCallState;
  startedAt: number;
  answeredAt?: number;
  hangupBy?: 'local' | 'remote';
  peerCause?: number;
  peerCauseTxt?: string;
}

interface DialEvent extends AriEvent {
  caller?: AriChannel;
  peer?: AriChannel;
  dialstatus?: string;
  dialstring?: string;
}

interface HangupEvent extends AriEvent {
  channel?: AriChannel;
  cause?: number;
  cause_txt?: string;
  soft?: boolean;
}

const TOKEN_HEADER_FUNC = 'PJSIP_HEADER(read,X-Call-Token)';
// Optional fallback if the dialplan copies the header into a variable:
//   same => n,Set(CALL_TOKEN=${PJSIP_HEADER(read,X-Call-Token)})
const TOKEN_VARIABLE = 'CALL_TOKEN';
// Safety net in case we never see the caller's ChannelDestroyed (ARI reconnect).
const STALE_CALL_MS = 6 * 60 * 60 * 1000;

// Caller channel id -> resolved call (null = not ours, ignore its events).
const calls = new Map<string, TrackedCall | null>();
// Peer (outbound trunk) channel id -> caller channel id.
const peerToCaller = new Map<string, string>();
// Per-caller promise chain: events for one call are handled strictly in order
// even though the first one has to wait for the token lookup.
const chains = new Map<string, Promise<void>>();

const enqueue = (callerId: string, task: () => Promise<void>) => {
  const prev = chains.get(callerId) ?? Promise.resolve();
  const next = prev.then(task).catch((error) => {
    console.error('[OutgoingCall] Handler failed for', callerId, error);
  });
  chains.set(callerId, next);
};

const forget = (callerId: string) => {
  const call = calls.get(callerId);
  if (call?.peerChannelId) peerToCaller.delete(call.peerChannelId);
  calls.delete(callerId);
  chains.delete(callerId);
};

const readVar = async (channelId: string, variable: string): Promise<string | null> => {
  try {
    const { value } = await ariClient.getChannelVariable(channelId, variable);
    return value?.trim() || null;
  } catch {
    return null; // 404 = not set / channel already gone
  }
};

// "PJSIP/alice-0000002a" -> "alice"
const sipUserFromChannelName = (name?: string): string | null => {
  const match = name?.match(/^PJSIP\/(.+)-[0-9a-f]+$/i);
  return match ? match[1] : null;
};

const resolveCall = async (caller: AriChannel): Promise<TrackedCall | null> => {
  if (calls.has(caller.id)) return calls.get(caller.id) ?? null;

  const token = (await readVar(caller.id, TOKEN_HEADER_FUNC)) ?? (await readVar(caller.id, TOKEN_VARIABLE));
  if (!token) {
    calls.set(caller.id, null);
    setTimeout(() => forget(caller.id), STALE_CALL_MS).unref();
    return null;
  }

  const call: TrackedCall = {
    token,
    callerChannelId: caller.id,
    sipUser: sipUserFromChannelName(caller.name),
    startedAt: Date.now(),
  };
  calls.set(caller.id, call);
  setTimeout(() => forget(caller.id), STALE_CALL_MS).unref();
  console.log('[OutgoingCall] Tracking', caller.name, 'token', token);
  return call;
};

const emit = async (call: TrackedCall, state: OutgoingCallState, extra: Record<string, unknown> = {}) => {
  call.lastState = state;
  try {
    await sendTelephonyEvent({
      event: 'outgoing_call_state',
      uniqueid: call.callerChannelId,
      endpoint: call.sipUser ?? undefined,
      timestamp: new Date().toISOString(),
      metadata: {
        call_token: call.token,
        state,
        dialstatus: call.dialstatus ?? null,
        ...extra,
      },
    });
  } catch {
    // sendTelephonyEvent already logged it; never break the chain.
  }
};

const DIALSTATUS_STATE: Record<string, OutgoingCallState> = {
  '': 'dialing',
  RINGING: 'ringing',
  PROGRESS: 'progress',
  ANSWER: 'answered',
};

const handleDial = (event: DialEvent) => {
  const caller = event.caller;
  const peer = event.peer;
  if (!caller?.id || !peer?.id) return; // originate without a caller — not a dialplan Dial()

  // Don't start tracking a call we haven't seen begin (e.g. app restarted mid-call).
  if (!calls.has(caller.id) && !chains.has(caller.id) && event.dialstatus) return;

  peerToCaller.set(peer.id, caller.id);

  enqueue(caller.id, async () => {
    const call = await resolveCall(caller);
    if (!call) return;

    call.peerChannelId = peer.id;
    const dialstatus = event.dialstatus ?? '';
    if (dialstatus) call.dialstatus = dialstatus;

    const state = DIALSTATUS_STATE[dialstatus] ?? 'failed'; // BUSY, NOANSWER, CONGESTION, CHANUNAVAIL, CANCEL, ...
    if (state === 'answered') call.answeredAt = Date.now();
    if (state === call.lastState && state !== 'failed') return;

    await emit(call, state, { peer_channel: peer.name });
  });
};

const handleHangupRequest = (event: HangupEvent) => {
  const channelId = event.channel?.id;
  if (!channelId) return;
  const isPeer = peerToCaller.has(channelId);
  const callerId = isPeer ? peerToCaller.get(channelId)! : channelId;
  if (!chains.has(callerId)) return;

  enqueue(callerId, async () => {
    const call = calls.get(callerId);
    // Before answer DIALSTATUS says it all (CANCEL = caller gave up); the
    // caller's own hangup request after a failed Dial() is just the dialplan
    // `Hangup()` and must not be read as "local hangup".
    if (!call || call.hangupBy || !call.answeredAt) return;
    // Whoever asks to hang up first is the side that ended the call.
    call.hangupBy = isPeer ? 'remote' : 'local';
    if (isPeer && event.cause) call.peerCause = event.cause;
  });
};

const handleDestroyed = (event: HangupEvent) => {
  const channelId = event.channel?.id;
  if (!channelId) return;
  const isPeer = peerToCaller.has(channelId);
  const callerId = isPeer ? peerToCaller.get(channelId)! : channelId;
  if (!chains.has(callerId)) return;

  enqueue(callerId, async () => {
    const call = calls.get(callerId);
    if (!call) {
      if (!isPeer) forget(callerId);
      return;
    }

    if (isPeer) {
      // The trunk leg carries the real cause from the provider (17 busy, 19 no answer, ...).
      if (event.cause) call.peerCause = event.cause;
      if (event.cause_txt) call.peerCauseTxt = event.cause_txt;
      return;
    }

    const cause = call.peerCause ?? event.cause ?? null;
    const causeTxt = call.peerCause ? call.peerCauseTxt ?? null : event.cause_txt ?? null;
    const now = Date.now();
    await emit(call, 'ended', {
      cause,
      cause_txt: causeTxt,
      hangup_by: call.hangupBy ?? null,
      answered: Boolean(call.answeredAt),
      duration: call.answeredAt ? Math.round((now - call.answeredAt) / 1000) : 0,
      total_duration: Math.round((now - call.startedAt) / 1000),
    });
    forget(callerId);
  });
};

export const registerOutgoingCallTracker = () => {
  ariWebSocket.on('Dial', (event) => handleDial(event as DialEvent));
  ariWebSocket.on('ChannelHangupRequest', (event) => handleHangupRequest(event as HangupEvent));
  ariWebSocket.on('ChannelDestroyed', (event) => handleDestroyed(event as HangupEvent));
};
