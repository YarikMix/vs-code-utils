import { expect, test } from 'bun:test';
import { startSessionBridge } from '../../src/session-bridge.ts';

const id = '01a14ff0-3f2d-7d71-b4e5-0b63839ec381';

test('a per-window loopback bridge accepts one valid resume request', async () => {
  const launched: string[] = [];
  const bridge = await startSessionBridge((sessionId) => { launched.push(sessionId); });
  try {
    const address = new URL(bridge.endpoint);
    expect(address.hostname).toBe('127.0.0.1');
    expect(address.pathname).toMatch(/^\/[a-f0-9]{64}$/);
    const response = await fetch(`${bridge.endpoint}/${id}`, { method: 'POST' });
    expect(response.status).toBe(202);
    expect(launched).toEqual([id]);
  } finally {
    await bridge.close();
  }
});

test('bridge rejects wrong token, method and malformed session IDs', async () => {
  const launched: string[] = [];
  const bridge = await startSessionBridge((sessionId) => { launched.push(sessionId); });
  try {
    const base = new URL(bridge.endpoint);
    const requests: [string, RequestInit][] = [
      [`${base.origin}/wrong/${id}`, { method: 'POST' }],
      [`${bridge.endpoint}/${id}`, { method: 'GET' }],
      [`${bridge.endpoint}/not-a-uuid`, { method: 'POST' }],
      [`${bridge.endpoint}/${id}%3Becho%20bad`, { method: 'POST' }],
      [`${bridge.endpoint}/${id}?extra=1`, { method: 'POST' }],
    ];
    for (const [url, options] of requests) {
      expect((await fetch(url, options)).status).toBe(404);
    }
    expect(launched).toEqual([]);
  } finally {
    await bridge.close();
  }
});

test('two windows have separate endpoints and launch only in the addressed window', async () => {
  const firstLaunch: string[] = [];
  const secondLaunch: string[] = [];
  const first = await startSessionBridge((sessionId) => { firstLaunch.push(sessionId); });
  const second = await startSessionBridge((sessionId) => { secondLaunch.push(sessionId); });
  try {
    expect(first.endpoint).not.toBe(second.endpoint);
    expect((await fetch(`${second.endpoint}/${id}`, { method: 'POST' })).status).toBe(202);
    expect(firstLaunch).toEqual([]);
    expect(secondLaunch).toEqual([id]);
  } finally {
    await first.close();
    await second.close();
  }
});

test('terminal creation failure is returned to the caller', async () => {
  const bridge = await startSessionBridge(() => { throw new Error('private details'); });
  try {
    const response = await fetch(`${bridge.endpoint}/${id}`, { method: 'POST' });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('');
  } finally {
    await bridge.close();
  }
});
