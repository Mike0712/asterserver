import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import { within } from '../test/helpers';

test('a hung events endpoint does not stall the sender forever', async () => {
  const sockets = new Set<import('net').Socket>();
  const server = http.createServer(() => { /* never responds */ });
  server.on('connection', (s) => { sockets.add(s); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;

  process.env.TELEPHONY_EVENTS_URL = `http://127.0.0.1:${port}/api/telephony/events`;
  process.env.TELEPHONY_EVENTS_TIMEOUT_MS = '300';
  // module reads env at load time
  const { sendTelephonyEvent } = await import('./telephonyEventSender');

  const origErr = console.error;
  console.error = () => undefined;
  try {
    const outcome = await within(
      sendTelephonyEvent({ event: 'test' }).then(() => 'resolved', () => 'rejected'),
      2000,
      'sendTelephonyEvent',
    ).catch((e: Error) => e.message);
    // outgoingCallTracker awaits every emit per call — a hung request freezes all later events of that call
    assert.equal(outcome, 'rejected');
  } finally {
    console.error = origErr;
    sockets.forEach((s) => s.destroy());
    server.close();
  }
});
