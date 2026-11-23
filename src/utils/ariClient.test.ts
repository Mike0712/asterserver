import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AriClient } from './ariClient';
import { stub } from '../test/helpers';

test('ids from callers are URL-encoded as a single path segment', async () => {
  const urls: string[] = [];
  const restore = stub(globalThis, 'fetch', (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(null, { status: 204 });
  }) as typeof fetch);
  try {
    const client = new AriClient({ baseUrl: 'http://ari.local/ari' });
    // e.g. DELETE /api/ari/channels/<id> — Express decodes %2F in req.params,
    // so a crafted id would otherwise address a different ARI resource.
    await client.deleteChannel('../bridges/victim');
    await client.deleteBridge('a/b');
    await client.getBridge('x?y=1');
    await client.stopPlayback('p#1');
    await client.answerChannel('c/1');
    await client.addChannelToBridge({ bridgeId: 'b/1', channel: 'c1' });
  } finally {
    restore();
  }
  assert.deepEqual(
    urls.map((u) => new URL(u).pathname),
    [
      '/ari/channels/..%2Fbridges%2Fvictim',
      '/ari/bridges/a%2Fb',
      '/ari/bridges/x%3Fy%3D1',
      '/ari/playbacks/p%231',
      '/ari/channels/c%2F1/answer',
      '/ari/bridges/b%2F1/addChannel',
    ],
  );
});
