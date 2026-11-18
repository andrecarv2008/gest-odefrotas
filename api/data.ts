// Vercel Function: armazenamento compartilhado dos dados importados (Vercel Blob).
//   GET    /api/data?key=lp      -> qualquer pessoa lê (dados em gzip)
//   PUT    /api/data?key=lp      -> só com o cabeçalho x-admin-key == ADMIN_KEY
//   DELETE /api/data?key=lp      -> idem
import { put, get, del } from '@vercel/blob';

const KEYS = new Set(['viagens', 'medias', 'vel', 'lp', 'despesas']);
type Acc = 'private' | 'public';
let acc: Acc | null = (process.env.BLOB_ACCESS as Acc) || null; // detectado automaticamente
const order = (): Acc[] => (acc ? [acc, acc === 'private' ? 'public' : 'private'] : ['private', 'public']);
const path = (k: string) => `gestao-frotas/${k}.json.gz`;
const hdr = { 'Cache-Control': 'no-store', 'x-gm-api': '1' };

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const key = url.searchParams.get('key') || '';
    if (!KEYS.has(key)) return new Response('bad key', { status: 400, headers: hdr });

    if (req.method === 'GET') {
      for (const a of order()) {
        try {
          const r = await get(path(key), { access: a, useCache: false });
          acc = a;
          if (!r || r.statusCode !== 200) return new Response('not found', { status: 404, headers: hdr });
          return new Response(r.stream, { status: 200, headers: { ...hdr, 'Content-Type': 'application/octet-stream' } });
        } catch (e: any) {
          if (/not.?found/i.test(String(e?.name || e?.message))) return new Response('not found', { status: 404, headers: hdr });
        }
      }
      return new Response('storage error', { status: 500, headers: hdr });
    }

    if (req.method === 'PUT' || req.method === 'DELETE') {
      const adminKey = process.env.ADMIN_KEY;
      if (!adminKey) return new Response('ADMIN_KEY não configurada no Vercel', { status: 500, headers: hdr });
      if (req.headers.get('x-admin-key') !== adminKey) return new Response('unauthorized', { status: 401, headers: hdr });
      try {
        if (req.method === 'DELETE') { await del(path(key)).catch(() => {}); return new Response('ok', { headers: hdr }); }
        const body = new Uint8Array(await req.arrayBuffer());
        let lastErr: any = null;
        for (const a of order()) {
          try {
            await put(path(key), body as any, { access: a, addRandomSuffix: false, allowOverwrite: true, contentType: 'application/octet-stream', cacheControlMaxAge: 60 });
            acc = a;
            return new Response('ok', { headers: hdr });
          } catch (e) { lastErr = e; }
        }
        return new Response('storage error: ' + String(lastErr?.message || lastErr), { status: 500, headers: hdr });
      } catch (e: any) { return new Response('error: ' + String(e?.message || e), { status: 500, headers: hdr }); }
    }
    return new Response('method not allowed', { status: 405, headers: hdr });
  },
};
