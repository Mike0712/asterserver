import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { pool } from '../db/pool';
import { endpointsRouter } from './endpoints';
import { listen, stub, trackUnhandledRejections, within } from '../test/helpers';

/**
 * In-memory stand-in for the three PJSIP realtime tables. Plain pool.query()
 * writes immediately; queries on a connection from getConnection() are
 * staged and only applied on commit() — like InnoDB.
 */
type Row = { id: string; [k: string]: unknown };
const makeFakeDb = (opts: { failInsertInto?: string; failAll?: boolean } = {}) => {
  const tables: Record<string, Row[]> = { ps_endpoints: [], ps_aors: [], ps_auths: [] };

  const exec = (sql: string, params: unknown[], target: Record<string, Row[]>) => {
    if (opts.failAll) throw new Error('connect ECONNREFUSED');
    const insert = sql.match(/INSERT INTO\s+(\w+)/i);
    if (insert) {
      const table = insert[1];
      if (table === opts.failInsertInto) {
        const err = new Error(`Duplicate entry '${params[0]}' for key 'PRIMARY'`);
        throw err;
      }
      target[table].push({ id: String(params[0]) });
      return [{ affectedRows: 1 }];
    }
    const del = sql.match(/DELETE FROM\s+(\w+)/i);
    if (del) {
      const before = target[del[1]].length;
      target[del[1]] = target[del[1]].filter((r) => r.id !== params[0]);
      return [{ affectedRows: before - target[del[1]].length }];
    }
    const upd = sql.match(/UPDATE\s+(\w+)/i);
    if (upd) {
      const row = target[upd[1]].find((r) => r.id === params[params.length - 1]);
      if (row) row.max_contacts = params[0];
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (/SELECT/i.test(sql)) return [tables.ps_auths.filter((r) => r.id === params[0])];
    throw new Error(`fake db: unsupported SQL ${sql}`);
  };

  const fakePool = {
    query: async (sql: string, params: unknown[] = []) => exec(sql, params, tables),
    getConnection: async () => {
      let staged: Record<string, Row[]> | null = null;
      const conn = {
        beginTransaction: async () => { staged = JSON.parse(JSON.stringify(tables)); },
        query: async (sql: string, params: unknown[] = []) => exec(sql, params, staged ?? tables),
        commit: async () => { if (staged) Object.assign(tables, staged); staged = null; },
        rollback: async () => { staged = null; },
        release: () => undefined,
      };
      return conn;
    },
  };
  return { tables, fakePool };
};

let restores: Array<() => void> = [];
let server: Awaited<ReturnType<typeof listen>>;
let unhandled: ReturnType<typeof trackUnhandledRejections>;
const origError = console.error;

const useDb = (db: ReturnType<typeof makeFakeDb>) => {
  restores.push(stub(pool, 'query', db.fakePool.query as unknown as typeof pool.query));
  restores.push(stub(pool, 'getConnection', db.fakePool.getConnection as unknown as typeof pool.getConnection));
};

beforeEach(async () => {
  console.error = () => undefined;
  unhandled = trackUnhandledRejections();
  const app = express();
  app.use(express.json());
  app.use('/api/endpoints', endpointsRouter);
  server = await listen(app);
});

afterEach(async () => {
  restores.forEach((r) => r());
  restores = [];
  await server.close();
  unhandled.stop();
  console.error = origError;
});

const req = (method: string, path: string, body?: object) =>
  within(
    fetch(`${server.url}/api/endpoints${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
    1500,
    `${method} ${path}`,
  );

test('POST creates endpoint, aor and auth', async () => {
  const db = makeFakeDb();
  useDb(db);
  const res = await req('POST', '', { id: 'alice' });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { username: string };
  assert.equal(body.username, 'alice');
  assert.equal(db.tables.ps_endpoints.length, 1);
  assert.equal(db.tables.ps_aors.length, 1);
  assert.equal(db.tables.ps_auths.length, 1);
});

test('POST failing half-way leaves no half-created endpoint behind', async () => {
  // e.g. a stale ps_aors row: ps_endpoints insert succeeds, ps_aors fails —
  // the endpoint exists without aor/auth and every retry now gets 409.
  const db = makeFakeDb({ failInsertInto: 'ps_aors' });
  useDb(db);
  const res = await req('POST', '', { id: 'alice' });
  assert.equal(res.status, 409);
  assert.deepEqual(db.tables.ps_endpoints, [], 'ps_endpoints row left behind');
  assert.deepEqual(db.tables.ps_auths, []);
});

test('DELETE answers 500 on a DB error instead of hanging / crashing', async () => {
  useDb(makeFakeDb({ failAll: true }));
  const res = await req('DELETE', '/alice');
  assert.equal(res.status, 500);
  assert.deepEqual(unhandled.seen, [], 'unhandled rejection (crashes the process)');
});

test('GET answers a single 500 on a DB error', async () => {
  useDb(makeFakeDb({ failAll: true }));
  const res = await req('GET', '/alice');
  assert.equal(res.status, 500);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(unhandled.seen, [], 'second response attempt threw "headers already sent"');
});

test('GET returns credentials / 404', async () => {
  const db = makeFakeDb();
  useDb(db);
  db.tables.ps_auths.push({ id: 'alice', username: 'alice', password: 'x' });
  assert.equal((await req('GET', '/alice')).status, 200);
  assert.equal((await req('GET', '/bob')).status, 404);
});

test('PUT updates max_contacts and responds (does not hang)', async () => {
  const db = makeFakeDb();
  useDb(db);
  db.tables.ps_aors.push({ id: 'alice', max_contacts: 3 });
  const res = await req('PUT', '/alice', { maxContacts: 5 });
  assert.equal(res.status, 200);
  assert.equal(db.tables.ps_aors[0].max_contacts, 5);
  assert.equal((await req('PUT', '/nobody', { maxContacts: 5 })).status, 404);
});
