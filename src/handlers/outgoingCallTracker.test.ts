import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ariClient } from '../utils/ariClient';
import { ariWebSocket } from '../utils/ariWebSocket';
import * as sender from '../utils/telephonyEventSender';
import { registerOutgoingCallTracker } from './outgoingCallTracker';
import { sleep, stub } from '../test/helpers';

const sent: Array<{ endpoint?: string; metadata?: Record<string, unknown> }> = [];
const restores: Array<() => void> = [];
const origLog = console.log;

before(() => {
  console.log = () => undefined;
  restores.push(stub(sender, 'sendTelephonyEvent', (async (p: (typeof sent)[number]) => { sent.push(p); }) as never));
  // Only channels named tracked-* carry an X-Call-Token header.
  restores.push(stub(ariClient, 'getChannelVariable', (async (id: string, v: string) => {
    if (id.startsWith('tracked-') && v.startsWith('PJSIP_HEADER')) return { value: `tok-${id}` };
    throw new Error('404');
  }) as never));
  registerOutgoingCallTracker();
});
after(() => { restores.forEach((r) => r()); console.log = origLog; });

const emit = (e: object) => (ariWebSocket as unknown as { handleMessage(d: string): void }).handleMessage(JSON.stringify(e));
const statesFor = (token: string) =>
  sent.filter((p) => p.metadata?.call_token === token).map((p) => p.metadata!);

test('busy: dialing → ringing → failed(BUSY) → ended with Q.850 17 from the trunk leg', async () => {
  const A = { id: 'tracked-1', name: 'PJSIP/alice-00000001' };
  const B = { id: 'peer-1', name: 'PJSIP/zadarma-00000002' };
  emit({ type: 'Dial', caller: A, peer: B, dialstatus: '' });
  emit({ type: 'Dial', caller: A, peer: B, dialstatus: 'RINGING' });
  emit({ type: 'Dial', caller: A, peer: B, dialstatus: 'BUSY' });
  emit({ type: 'ChannelDestroyed', channel: B, cause: 17, cause_txt: 'User busy' });
  emit({ type: 'ChannelHangupRequest', channel: A, cause: 17 }); // dialplan Hangup() after Dial
  emit({ type: 'ChannelDestroyed', channel: A, cause: 17, cause_txt: 'User busy' });
  await sleep(30);

  const states = statesFor('tok-tracked-1');
  assert.deepEqual(states.map((s) => s.state), ['dialing', 'ringing', 'failed', 'ended']);
  const ended = states.at(-1)!;
  assert.equal(ended.dialstatus, 'BUSY');
  assert.equal(ended.cause, 17);
  assert.equal(ended.hangup_by, null, "dialplan Hangup() after a failed Dial must not count as 'local'");
  assert.equal(sent.find((p) => p.metadata?.call_token === 'tok-tracked-1')?.endpoint, 'alice');
});

test('answered then remote hangup: hangup_by=remote, answered=true', async () => {
  const A = { id: 'tracked-2', name: 'PJSIP/bob-00000003' };
  const B = { id: 'peer-2', name: 'PJSIP/zadarma-00000004' };
  emit({ type: 'Dial', caller: A, peer: B, dialstatus: '' });
  emit({ type: 'Dial', caller: A, peer: B, dialstatus: 'ANSWER' });
  await sleep(20);
  emit({ type: 'ChannelHangupRequest', channel: B, cause: 16 });
  emit({ type: 'ChannelHangupRequest', channel: A, cause: 16 });
  emit({ type: 'ChannelDestroyed', channel: B, cause: 16, cause_txt: 'Normal Clearing' });
  emit({ type: 'ChannelDestroyed', channel: A, cause: 16, cause_txt: 'Normal Clearing' });
  await sleep(30);

  const ended = statesFor('tok-tracked-2').at(-1)!;
  assert.equal(ended.state, 'ended');
  assert.equal(ended.hangup_by, 'remote');
  assert.equal(ended.answered, true);
});

test('calls without X-Call-Token are ignored', async () => {
  const before = sent.length;
  emit({ type: 'Dial', caller: { id: 'other-1', name: 'PJSIP/x-1' }, peer: { id: 'peer-x', name: 'PJSIP/y-2' }, dialstatus: '' });
  emit({ type: 'ChannelDestroyed', channel: { id: 'other-1' }, cause: 16 });
  await sleep(30);
  assert.equal(sent.length, before);
});
