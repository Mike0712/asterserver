import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AriWebSocketClient } from './ariWebSocket';
import { sleep, trackUnhandledRejections } from '../test/helpers';

const emit = (client: AriWebSocketClient, event: object) =>
  (client as unknown as { handleMessage(data: string): void }).handleMessage(JSON.stringify(event));

test('a rejecting async event handler does not become an unhandled rejection', async () => {
  const unhandled = trackUnhandledRejections();
  const errors: unknown[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    const client = new AriWebSocketClient();
    client.on('StasisStart', async () => { throw new Error('boom'); });
    client.on('*', async () => { throw new Error('boom wildcard'); });

    emit(client, { type: 'StasisStart' });
    await sleep(20);

    assert.deepEqual(unhandled.seen, [], 'handler rejection escaped as unhandledRejection (crashes the process)');
    assert.ok(errors.length >= 2, 'handler errors should be logged');
  } finally {
    console.error = origError;
    unhandled.stop();
  }
});

test('connecting does not log the ARI password', async () => {
  const logged: string[] = [];
  const capture = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = capture; console.error = capture; console.warn = capture;
  const client = new AriWebSocketClient({ baseUrl: 'http://127.0.0.1:1/ari', username: 'ari', password: 'S3cr3tPassw0rd' });
  try {
    await client.connect().catch(() => undefined);
    await sleep(20);
  } finally {
    client.disconnect();
    Object.assign(console, orig);
  }
  const leaked = logged.filter((line) => line.includes('S3cr3tPassw0rd'));
  assert.deepEqual(leaked, [], 'ARI credentials written to the log');
});

test('keeps reconnecting while Asterisk is down (no give-up after 10 attempts)', async () => {
  const unhandled = trackUnhandledRejections();
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = () => undefined; console.error = () => undefined; console.warn = () => undefined;
  const client = new AriWebSocketClient({ baseUrl: 'http://127.0.0.1:1/ari' });
  const internals = client as unknown as { reconnectDelay: number; maxReconnectDelay?: number };
  internals.reconnectDelay = 1;
  internals.maxReconnectDelay = 1;
  let attempts = 0;
  const realConnect = client.connect.bind(client);
  client.connect = () => { attempts++; return realConnect(); };
  try {
    await client.connect().catch(() => undefined);
    for (let i = 0; i < 100 && attempts <= 15; i++) await sleep(20);
  } finally {
    client.disconnect();
    Object.assign(console, orig);
    unhandled.stop();
  }
  // each failed reconnect's connect() promise used to reject unhandled — that alone kills the process
  assert.deepEqual(unhandled.seen, [], 'failed reconnect attempt became an unhandled rejection');
  assert.ok(attempts > 15, `stopped reconnecting after ${attempts} attempts — after a longer Asterisk outage events never come back`);
});
