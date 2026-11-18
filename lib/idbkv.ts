import { remoteGet, remoteSet, remoteNotify } from './remote';
// Pequeno armazenamento chave/valor no navegador (IndexedDB), para guardar planilhas importadas.
const DB = 'gm_kv', ST = 'kv';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(ST); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function kvGet(key: string): Promise<any> {
  const rv = await remoteGet(key); if (rv !== undefined && rv !== null) return rv; // dado compartilhado (Vercel)
  try { const db = await open(); return await new Promise(res => { const q = db.transaction(ST).objectStore(ST).get(key); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); }); } catch { return null; }
}
export async function kvSet(key: string, v: any): Promise<void> {
  try { const db = await open(); await new Promise<void>(res => { const tx = db.transaction(ST, 'readwrite'); const s = tx.objectStore(ST); if (v == null) s.delete(key); else s.put(v, key); tx.oncomplete = () => res(); tx.onerror = () => res(); }); } catch { /* segue só na sessão */ }
}
/** Salva no navegador e publica online (se houver API). */
export async function kvSetShared(key: string, v: any): Promise<void> {
  await kvSet(key, v);
  remoteNotify(await remoteSet(key, v));
}
