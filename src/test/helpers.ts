import http from 'http';
import type { AddressInfo } from 'net';
import type { Application } from 'express';

/** Collects unhandled promise rejections — in Node ≥15 each one crashes the process. */
export const trackUnhandledRejections = () => {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => seen.push(reason);
  process.on('unhandledRejection', listener);
  return {
    seen,
    stop: () => process.off('unhandledRejection', listener),
  };
};

/** Replaces obj[key] for the duration of a test; returns a restore function. */
export const stub = <T extends object, K extends keyof T>(obj: T, key: K, value: T[K]) => {
  const had = Object.prototype.hasOwnProperty.call(obj, key);
  const original = obj[key];
  obj[key] = value;
  return () => {
    if (had) obj[key] = original;
    else delete obj[key];
  };
};

export const listen = async (app: Application) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    // closeAllConnections: a request the code under test never answered must not keep the server open
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rejects if `promise` doesn't settle within `ms` (a hung request fails the test instead of hanging it). */
export const within = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: no result within ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
