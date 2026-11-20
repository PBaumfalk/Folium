import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyAddress, FetchBlockedError, FetchBudget, safeFetch, type FetchPolicy } from '../src/server/lib/safefetch.js';

let server: http.Server;
let port = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') return res.end('<html>hallo</html>');
    if (req.url === '/redirect-intern') {
      res.writeHead(302, { location: 'http://127.0.0.2/' });
      return res.end();
    }
    if (req.url === '/redirect-metadaten') {
      res.writeHead(301, { location: 'http://169.254.169.254/latest/meta-data/' });
      return res.end();
    }
    if (req.url?.startsWith('/kette')) {
      const n = Number(req.url.split('/')[2] ?? 0);
      res.writeHead(302, { location: `/kette/${n + 1}` });
      return res.end();
    }
    if (req.url === '/gross') return res.end(Buffer.alloc(300_000, 65));
    if (req.url === '/langsam') {
      setTimeout(() => res.end('spät'), 2000);
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

// Der Testserver läuft auf 127.0.0.1; nur diese eine Adresse wird ausdrücklich freigegeben.
const policy = (extra: Partial<FetchPolicy> = {}): FetchPolicy => ({ allowHosts: ['127.0.0.1'], allowPrivate: false, timeoutMs: 1000, userAgent: 'folium-test', ...extra });
const blocked = async (url: string, p: FetchPolicy = policy({ allowHosts: [] }), opts = {}) => {
  try {
    await safeFetch(url, p, opts);
  } catch (e) {
    expect(e).toBeInstanceOf(FetchBlockedError);
    return (e as FetchBlockedError).reason;
  }
  throw new Error(`nicht blockiert: ${url}`);
};

describe('Abgesicherter Abruf', () => {
  it('classifies internal addresses', () => {
    for (const ip of ['127.0.0.1', '169.254.169.254', '0.0.0.0', '::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe']) expect(classifyAddress(ip), ip).toBe('blocked');
    for (const ip of ['10.0.0.5', '192.168.178.35', '172.18.0.2', '100.64.1.1', 'fd00::1']) expect(classifyAddress(ip), ip).toBe('private');
    expect(classifyAddress('46.38.243.10')).toBe('public');
  });

  it('blocks loopback, metadata, private and odd notations', async () => {
    for (const u of ['http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/', 'http://0x7f000001/', 'http://2130706433/', 'http://127.1/', 'http://localhost/']) {
      expect(['address', 'dns'], u).toContain(await blocked(u));
    }
  });

  it('blocks non-http schemes and credentials', async () => {
    for (const u of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://x/', 'javascript:alert(1)', 'http://user:pw@example.com/']) expect(await blocked(u)).toBe('scheme');
  });

  it('blocks ports other than 80 and 443', async () => {
    expect(await blocked('http://93.184.215.14:8081/', policy({ allowHosts: [] }))).toBe('port');
    expect(await blocked('http://93.184.215.14:22/', policy({ allowHosts: [] }))).toBe('port');
  });

  it('blocks a DNS name that resolves to a private address', async () => {
    const p = policy({ allowHosts: [], lookup: async () => [{ address: '10.20.0.7', family: 4 }] });
    expect(await blocked('http://intranet.kanzlei.example/', p)).toBe('address');
  });

  it('blocks when one of several DNS answers is internal', async () => {
    const p = policy({ allowHosts: [], lookup: async () => [{ address: '93.184.215.14', family: 4 }, { address: '127.0.0.1', family: 4 }] });
    expect(await blocked('http://gemischt.example/', p)).toBe('address');
  });

  it('connects to the checked IP (no second DNS lookup)', async () => {
    let calls = 0;
    // Erste Auflösung liefert die freigegebene Testadresse; jede weitere würde auf ein internes Ziel zeigen (DNS-Rebinding).
    const p = policy({
      lookup: async () => (calls++ === 0 ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '10.0.0.1', family: 4 }]),
      allowHosts: ['127.0.0.1'],
    });
    const r = await safeFetch(`http://rebind.example:${port}/ok`, p);
    expect(r.body.toString()).toContain('hallo');
    expect(calls).toBe(1);
  });

  it('follows redirects but blocks a redirect to an internal address', async () => {
    expect(await blocked(`http://127.0.0.1:${port}/redirect-intern`, policy())).toBe('address');
    expect(await blocked(`http://127.0.0.1:${port}/redirect-metadaten`, policy())).toBe('address');
  });

  it('stops after 5 redirects', async () => {
    expect(await blocked(`http://127.0.0.1:${port}/kette/0`, policy())).toBe('redirects');
  });

  it('rejects responses over the size limit', async () => {
    expect(await blocked(`http://127.0.0.1:${port}/gross`, policy(), { maxBytes: 100_000 })).toBe('size');
  });

  it('times out slow servers', async () => {
    expect(await blocked(`http://127.0.0.1:${port}/langsam`, policy({ timeoutMs: 300 }))).toBe('timeout');
  });

  it('enforces a shared budget of requests', async () => {
    const budget = new FetchBudget({ maxRequests: 2, deadlineMs: 10_000 });
    await safeFetch(`http://127.0.0.1:${port}/ok`, policy(), { budget });
    await safeFetch(`http://127.0.0.1:${port}/ok`, policy(), { budget });
    expect(await blocked(`http://127.0.0.1:${port}/ok`, policy(), { budget })).toBe('budget');
  });
});
