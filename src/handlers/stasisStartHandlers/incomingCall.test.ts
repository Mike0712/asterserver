import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ariClient, AriError } from '../../utils/ariClient';
import * as sender from '../../utils/telephonyEventSender';
import { handleIncomingExternalCall } from './handleIncomingExternalCall';
import { handleBridgeIncomingCall } from './handleBridgeIncomingCall';
import { incomingCallState } from './incomingCallState';
import { sleep, stub, trackUnhandledRejections } from '../../test/helpers';
import type { AriChannel } from '../../utils/ariWebSocket';

const caller = { id: 'caller-1', name: 'PJSIP/zadarma-1', caller: { number: '79001234567' } } as AriChannel;

let restores: Array<() => void> = [];
let bridgeIds: string[] = [];
const calls: Record<string, unknown[][]> = {};
const record = (name: string, result: (...args: unknown[]) => unknown) =>
  (async (...args: unknown[]) => { (calls[name] ??= []).push(args); return result(...args); }) as never;

const origConsole = { log: console.log, warn: console.warn, error: console.error };
const quiet = () => { console.log = () => undefined; console.warn = () => undefined; console.error = () => undefined; };

afterEach(() => {
  // never leave the 30 s hold timer / poll interval running
  for (const id of bridgeIds) {
    const pending = incomingCallState.get(id);
    if (pending?.pollHandle) clearInterval(pending.pollHandle);
    if (pending?.timeoutHandle) clearTimeout(pending.timeoutHandle);
    incomingCallState.delete(id);
  }
  bridgeIds = [];
  restores.forEach((r) => r());
  restores = [];
  for (const k of Object.keys(calls)) delete calls[k];
  Object.assign(console, origConsole);
});

const stubAri = (overrides: Partial<Record<keyof typeof ariClient, (...args: unknown[]) => unknown>> = {}) => {
  const defaults: Record<string, (...args: unknown[]) => unknown> = {
    createBridge: (opts) => { const id = (opts as { bridgeId: string }).bridgeId; bridgeIds.push(id); return { id }; },
    addChannelToBridge: () => undefined,
    playMedia: () => ({ id: 'playback-1' }),
    getEndpoint: () => ({ state: 'online' }),
    originateChannel: () => ({ id: 'callee' }),
    deleteChannel: () => undefined,
    deleteBridge: () => undefined,
    stopPlayback: () => undefined,
  };
  for (const [name, impl] of Object.entries({ ...defaults, ...overrides })) {
    restores.push(stub(ariClient, name as keyof typeof ariClient, record(name, impl!)));
  }
  restores.push(stub(sender, 'sendTelephonyEvent', (async () => undefined) as typeof sender.sendTelephonyEvent));
};

test('callee comes online during polling but originate fails: no unhandled rejection, caller is released', async () => {
  quiet();
  const unhandled = trackUnhandledRejections();
  let lookups = 0;
  stubAri({
    getEndpoint: () => ({ state: ++lookups === 1 ? 'offline' : 'online' }),
    originateChannel: () => { throw new AriError(500, 'Allocation failed'); },
  });
  try {
    await handleIncomingExternalCall(caller, { sip_user: 'alice', user_id: '1' });
    await sleep(1300); // one poll tick
    assert.deepEqual(unhandled.seen, [], 'originate failure inside the poll interval crashes the process');
    assert.ok(
      (calls.deleteChannel ?? []).some(([id]) => id === caller.id),
      'caller keeps hearing ring tone for the rest of the 30 s instead of being released',
    );
  } finally {
    unhandled.stop();
  }
});

test('callee leg fails to join the bridge: caller is released, not left in silence', async () => {
  quiet();
  stubAri({ addChannelToBridge: () => { throw new AriError(422, 'Channel not in Stasis'); } });
  const bridgeId = 'bridge_test-1';
  bridgeIds.push(bridgeId);
  incomingCallState.set(bridgeId, {
    bridgeId,
    originalChannelId: caller.id,
    playbackId: 'playback-1',
    sipUser: 'alice',
    from: '79001234567',
    timeoutHandle: setTimeout(() => undefined, 30_000),
    pollHandle: null,
  });

  await handleBridgeIncomingCall({ id: 'callee_test-1', name: 'PJSIP/alice-1' } as AriChannel, { bridgeId }).catch(() => undefined);

  // ring tone already stopped and hold timer cleared — nothing would ever end the caller's leg
  assert.ok((calls.deleteChannel ?? []).some(([id]) => id === caller.id), 'caller channel not hung up');
  assert.ok((calls.deleteBridge ?? []).some(([id]) => id === bridgeId), 'bridge not destroyed');
});

test('happy path: online callee is originated into the session bridge', async () => {
  quiet();
  stubAri();
  await handleIncomingExternalCall(caller, { sip_user: 'alice', user_id: '1' });
  const [[opts]] = calls.originateChannel as [[{ endpoint: string; appArgs: string; callerId: string }]];
  assert.equal(opts.endpoint, 'PJSIP/alice');
  assert.match(opts.appArgs, /callType:::bridgeIncomingCall,bridgeId:::bridge_/);
  assert.equal(opts.callerId, '79001234567');
});
