// Shared between handleIncomingExternalCall.ts and handleBridgeIncomingCall.ts —
// tracks an inbound external call from the moment it enters Stasis (already
// answered, ringing bridge with a tone playback) until the originated leg to
// the SIP endpoint either joins the bridge or times out.
export interface PendingIncomingCall {
  bridgeId: string;
  originalChannelId: string;
  playbackId: string | null;
  sipUser: string;
  from: string;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  pollHandle: ReturnType<typeof setInterval> | null;
}

const pendingCalls = new Map<string, PendingIncomingCall>();

export const incomingCallState = {
  set(bridgeId: string, call: PendingIncomingCall): void {
    pendingCalls.set(bridgeId, call);
  },
  get(bridgeId: string): PendingIncomingCall | undefined {
    return pendingCalls.get(bridgeId);
  },
  delete(bridgeId: string): void {
    pendingCalls.delete(bridgeId);
  },
};
