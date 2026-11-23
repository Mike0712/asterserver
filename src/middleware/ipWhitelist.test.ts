import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { applyIpWhitelist } from './ipWhitelist';
import { listen } from '../test/helpers';

const makeApp = (allowed: string[]) => {
  const app = express();
  applyIpWhitelist(app, allowed);
  app.get('/ping', (_req, res) => { res.json({ ok: true }); });
  return app;
};

const quiet = async <T>(fn: () => Promise<T>) => {
  const warn = console.warn;
  console.warn = () => undefined;
  try { return await fn(); } finally { console.warn = warn; }
};

test('allows a whitelisted direct client', async () => {
  const server = await listen(makeApp(['127.0.0.1']));
  try {
    const res = await quiet(() => fetch(`${server.url}/ping`));
    assert.equal(res.status, 200);
  } finally { await server.close(); }
});

test('a spoofed X-Forwarded-For does not bypass the whitelist', async () => {
  // Attacker sends "X-Forwarded-For: 10.0.0.1"; a reverse proxy on localhost
  // appends the real client: "10.0.0.1, 203.0.113.5". Only the proxy hop is
  // trustworthy, so the client is 203.0.113.5 — not the first entry.
  const server = await listen(makeApp(['10.0.0.1']));
  try {
    const res = await quiet(() =>
      fetch(`${server.url}/ping`, { headers: { 'X-Forwarded-For': '10.0.0.1, 203.0.113.5' } }),
    );
    assert.equal(res.status, 403);
  } finally { await server.close(); }
});

test('the real client IP appended by a local reverse proxy is honoured', async () => {
  const server = await listen(makeApp(['10.0.0.1']));
  try {
    const res = await quiet(() => fetch(`${server.url}/ping`, { headers: { 'X-Forwarded-For': '10.0.0.1' } }));
    assert.equal(res.status, 200);
  } finally { await server.close(); }
});
