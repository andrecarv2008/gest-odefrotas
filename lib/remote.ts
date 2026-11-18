// Camada de armazenamento compartilhado (Vercel Function /api/data + Vercel Blob).
// Se a API não existir (artifact, arquivo local, dev) tudo falha em silêncio e o app usa o navegador.
const KS = 'gm_admin_key';
const ls = { g: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  s: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  d: (k: string) => { try { localStorage.removeItem(k); } catch {} } };

export const REMOTE_KEYS = new Set(['viagens', 'medias', 'vel', 'lp', 'despesas']);
const enabled = () => typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/claude\.(ai|site)|claudeusercontent/i.test(location.hostname);

async function gz(text: string): Promise<Uint8Array> {
  const cs = new (window as any).CompressionStream('gzip');
  const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(text)); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function gunzip(buf: ArrayBuffer): Promise<string> {
  const ds = new (window as any).DecompressionStream('gzip');
  const w = ds.writable.getWriter(); w.write(new Uint8Array(buf)); w.close();
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}

/** Lê o valor compartilhado. undefined = API indisponível / sem dado; senão o valor salvo. */
export async function remoteGet(key: string): Promise<any | undefined> {
  if (!enabled()) return undefined;
  try {
    const r = await fetch('/api/data?key=' + key, { cache: 'no-store' });
    if (!r.ok || r.headers.get('x-gm-api') !== '1') return undefined;
    return JSON.parse(await gunzip(await r.arrayBuffer()));
  } catch { return undefined; }
}

export type RemoteRes = { ok: boolean; reason?: 'noapi' | 'cancel' | 'auth' | 'size' | 'error'; msg?: string };

async function send(method: 'PUT' | 'DELETE', key: string, body?: Uint8Array, adminKey?: string): Promise<Response> {
  return fetch('/api/data?key=' + key, { method, body: body as any, headers: { 'x-admin-key': adminKey || '' } });
}

/** Grava para todos. Pede a senha de administrador na 1ª vez (fica salva neste navegador). */
export async function remoteSet(key: string, value: any): Promise<RemoteRes> {
  if (!enabled()) return { ok: false, reason: 'noapi' };
  try {
    const probe = await fetch('/api/data?key=' + key, { cache: 'no-store' }).catch(() => null);
    if (!probe || probe.headers.get('x-gm-api') !== '1') return { ok: false, reason: 'noapi' };
    const del = value === null || value === undefined;
    const bytes = del ? undefined : await gz(JSON.stringify(value));
    if (bytes && bytes.length > 4_300_000) return { ok: false, reason: 'size', msg: 'Arquivo compactado acima de 4,3 MB (limite do Vercel).' };
    for (let tent = 0; tent < 2; tent++) {
      let k = ls.g(KS);
      if (!k) { k = prompt('Senha de administrador (ADMIN_KEY) para publicar os dados online para todos os usuários:'); if (!k) return { ok: false, reason: 'cancel' }; }
      const r = del ? await send('DELETE', key, undefined, k) : await send('PUT', key, bytes, k);
      if (r.ok) { ls.s(KS, k); return { ok: true }; }
      if (r.status === 401) { ls.d(KS); if (tent === 0) { alert('Senha incorreta. Tente novamente.'); continue; } return { ok: false, reason: 'auth' }; }
      if (r.status === 404 || r.status === 405) return { ok: false, reason: 'noapi' };
      if (r.status === 413) return { ok: false, reason: 'size', msg: 'Arquivo grande demais para o Vercel.' };
      return { ok: false, reason: 'error', msg: (await r.text().catch(() => '')).slice(0, 200) };
    }
    return { ok: false, reason: 'auth' };
  } catch (e: any) { return { ok: false, reason: 'error', msg: String(e?.message || e) }; }
}

/** Avisa o usuário quando a publicação online falhou (silencioso se não há API). */
export function remoteNotify(r: RemoteRes) {
  if (r.ok || r.reason === 'noapi' || r.reason === 'cancel') return;
  const m: Record<string, string> = { auth: 'Senha de administrador incorreta.', size: r.msg || 'Arquivo grande demais.', error: r.msg || 'Erro ao salvar no servidor.' };
  alert('Os dados foram salvos só neste navegador. Não foi possível publicar online: ' + (m[r.reason || 'error']));
}
