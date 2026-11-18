// Empacotamento (gzip + base64) e gravação dos dados importados no banco do artifact (capacidade "db").
export async function packData(payload: any): Promise<string> {
  const json = JSON.stringify(payload);
  let bytes: Uint8Array = new TextEncoder().encode(json);
  const CS = (window as any).CompressionStream;
  if (CS) {
    const cs = new CS('gzip');
    const w = cs.writable.getWriter(); w.write(bytes); w.close();
    bytes = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return 'g:' + toB64(bytes);
  }
  return 'r:' + toB64(bytes);
}

export async function unpackData(b64: string): Promise<any> {
  const gz = b64.startsWith('g:');
  let bytes = fromB64(b64.slice(2));
  if (gz) {
    const ds = new (window as any).DecompressionStream('gzip');
    const w = ds.writable.getWriter(); w.write(bytes); w.close();
    bytes = new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function toB64(bytes: Uint8Array): string {
  let s = ''; const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const CHUNK = 180000;

async function getDb(): Promise<any | null> {
  try {
    const c = (window as any).claude;
    return c && c.use ? await c.use('db') : null;
  } catch { return null; }
}

/** Lê os dados salvos no banco do artifact. Retorna null se não houver banco ou dados. */
export async function loadFromDb(): Promise<{ empty: boolean; payload?: any } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const meta = await db.doc('base/meta').get();
    if (!meta.exists) return null;
    const m: any = meta.data();
    if (m.empty) return { empty: true };
    const snaps = await Promise.all(Array.from({ length: m.chunks as number }, (_, i) => db.doc('chunks/c' + i).get()));
    let b64 = '';
    for (const s of snaps) { if (!s.exists) return null; b64 += (s.data() as any).d; }
    return { empty: false, payload: await unpackData(b64) };
  } catch (e) { console.warn('db load failed', e); return null; }
}

/** Grava os dados importados no banco do artifact (um documento por vez). */
export async function saveToDb(payload: any | null): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    let old = 0;
    try { const m = await db.doc('base/meta').get(); if (m.exists) old = Number((m.data() as any).chunks || 0); } catch {}
    if (payload === null) {
      await db.doc('base/meta').set({ empty: true, chunks: 0, savedAt: Date.now() });
      for (let i = 0; i < old; i++) await db.doc('chunks/c' + i).delete();
      return true;
    }
    const b64 = await packData(payload);
    const n = Math.ceil(b64.length / CHUNK);
    for (let i = 0; i < n; i++) await db.doc('chunks/c' + i).set({ i, d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
    await db.doc('base/meta').set({ empty: false, chunks: n, savedAt: Date.now(), count: payload.viagens?.length || 0 });
    for (let i = n; i < old; i++) await db.doc('chunks/c' + i).delete();
    return true;
  } catch (e) { console.warn('db save failed', e); return false; }
}

/** Dados embutidos no próprio arquivo HTML (gerado por "Salvar HTML com dados"). */
export async function loadEmbedded(): Promise<any | null> {
  try {
    const el = document.getElementById('gm-data');
    const t = el && el.textContent ? el.textContent.trim() : '';
    if (!t) return null;
    return await unpackData(t);
  } catch (e) { console.warn('embedded data failed', e); return null; }
}
