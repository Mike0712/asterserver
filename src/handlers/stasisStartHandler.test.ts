import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ariClient, AriError } from '../utils/ariClient';
import { ariWebSocket } from '../utils/ariWebSocket';
import { registerStasisStartHandler } from './stasisStartHandler';
import { sleep, stub, trackUnhandledRejections } from '../test/helpers';

test('channel without callType is hung up without an unhandled rejection when it is already gone', async () => {
  const unhandled = trackUnhandledRejections();
  const origLog = console.log; const origErr = console.error;
  console.log = () => undefined; console.error = () => undefined;
  const deleted: string[] = [];
  const restore = stub(ariClient, 'deleteChannel', (async (id: string) => {
    deleted.push(id);
    throw new AriError(404, 'Channel not found');
  }) as typeof ariClient.deleteChannel);
  try {
    registerStasisStartHandler();
    (ariWebSocket as unknown as { handleMessage(d: string): void }).handleMessage(
      JSON.stringify({ type: 'StasisStart', channel: { id: 'chan-1', name: 'PJSIP/x-1' }, args: [] }),
    );
    await sleep(30);
    assert.deepEqual(deleted, ['chan-1']);
    assert.deepEqual(unhandled.seen, [], 'deleteChannel rejection escaped (crashes the process)');
  } finally {
    restore();
    unhandled.stop();
    console.log = origLog; console.error = origErr;
  }
});
