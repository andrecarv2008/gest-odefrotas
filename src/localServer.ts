import rowsB64 from './rows.gz.b64.txt?raw';
import { mapRowsToViagens } from '@/lib/parseRows';
import { getViagensFromDB, saveViagensToDB, clearViagensFromDB } from '@/lib/db';
import { loadFromDb, saveToDb, loadEmbedded } from '@/lib/persist';

const FILE_NAME = 'VISAO FROTA - EXTERNA.xlsx';
const LS = {
  flag: 'gm_user_imported', meta: 'gm_srv_meta', logs: 'gm_srv_logs', just: 'gm_srv_justificativas'
};
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };
const lsDel = (k: string) => { try { localStorage.removeItem(k); } catch {} };
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let embedded: any[] | null = null;
async function inflateRows(): Promise<any[]> {
  const bin = atob(rowsB64.trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
async function getEmbedded() {
  if (!embedded) {
    const rows = await inflateRows();
    // Mesma leitura do ImportModal: primeira aba -> mapRowsToViagens
    embedded = mapRowsToViagens(rows);
    const keys = Object.keys(rows[0] || {}).concat(Object.keys(rows[rows.length - 1] || {}));
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const found = keys.some(k => { const n = norm(k); const c = n.replace(/[^a-z0-9]/g, ''); const r = /despesa.*oficina|oficina|despesa_oficina/i; return r.test(n) || r.test(c); });
    lsSet('despesa_oficina_col_not_found', String(!found));
    lsSet('last_uploaded_filename', FILE_NAME);
  }
  return embedded;
}
const embeddedMeta = () => ({ id: 'last_update', lastUploadedAt: 'Base inicial', uploaderName: 'Planilha embutida', fileName: FILE_NAME, recordCount: (embedded || []).length });

let session: { viagens: any[]; metadata: any; logs: any[] } | null = null;

// Ordem de leitura: banco do artifact -> importação feita neste navegador -> dados embutidos no HTML -> planilha original
async function loadSession() {
  if (session) return session;
  const dbRes = await loadFromDb();
  if (dbRes) {
    session = dbRes.empty ? { viagens: [], metadata: null, logs: [] } : dbRes.payload;
    return session!;
  }
  if (lsGet(LS.flag) === '1') {
    if (lsGet(LS.flag + '_empty') === '1') { session = { viagens: [], metadata: null, logs: [] }; return session; }
    const saved = await getViagensFromDB().catch(() => null);
    if (saved && saved.length) {
      let metadata = null, logs: any[] = [];
      try { metadata = JSON.parse(lsGet(LS.meta) || 'null'); } catch {}
      try { logs = JSON.parse(lsGet(LS.logs) || '[]'); } catch {}
      session = { viagens: saved, metadata, logs };
      return session;
    }
  }
  const emb = await loadEmbedded();
  if (emb && Array.isArray(emb.viagens)) { session = { viagens: emb.viagens, metadata: emb.metadata || null, logs: emb.logs || [] }; return session; }
  session = { viagens: await getEmbedded(), metadata: embeddedMeta(), logs: [] };
  return session;
}

async function currentData() { return (await loadSession()).viagens; }

export async function getSessionPayload() {
  const s = await loadSession();
  return { viagens: s.viagens, metadata: s.metadata, logs: s.logs };
}

async function handleViagens(method: string, init?: RequestInit) {
  if (method === 'GET') {
    const sess = await loadSession();
    return json({ success: true, count: sess.viagens.length, data: sess.viagens,
      metadata: sess.metadata || embeddedMeta(), logs: sess.logs || [] });
  }
  if (method === 'POST') {
    const body = JSON.parse(String(init?.body || '{}'));
    const { viagens, mode = 'substituir', metadata, log } = body;
    if (!Array.isArray(viagens)) return json({ success: false, error: 'viagens must be an array' }, 400);
    let final = viagens;
    if (mode === 'somar') {
      const existing = await currentData(); const ids = new Set(existing.map((v: any) => v.id));
      final = [...existing, ...viagens.filter((v: any) => !ids.has(v.id))];
    }
    lsSet(LS.flag, '1'); lsDel(LS.flag + '_empty');
    await saveViagensToDB(final).catch(() => {});
    let meta = null;
    if (metadata) { meta = { id: 'last_update', lastUploadedAt: metadata.lastUploadedAt || new Date().toLocaleString('pt-BR'), uploaderName: metadata.uploaderName || 'Administrador', fileName: metadata.fileName || 'Planilha_Importada.xlsx', recordCount: final.length }; lsSet(LS.meta, JSON.stringify(meta)); }
    let logs: any[] = []; try { logs = JSON.parse(lsGet(LS.logs) || '[]'); } catch {}
    if (log) { logs.unshift(log); logs = logs.slice(0, 50); lsSet(LS.logs, JSON.stringify(logs)); }
    session = { viagens: final, metadata: meta || (session && session.metadata) || null, logs };
    saveToDb({ viagens: final, metadata: session.metadata, logs }).catch(() => {});
    return json({ success: true, count: final.length, metadata: meta, logs });
  }
  if (method === 'DELETE') {
    lsSet(LS.flag, '1'); lsSet(LS.flag + '_empty', '1');
    lsDel(LS.meta); lsDel(LS.logs);
    await clearViagensFromDB().catch(() => {});
    session = { viagens: [], metadata: null, logs: [] };
    saveToDb(null).catch(() => {});
    return json({ success: true });
  }
  return json({ success: false }, 405);
}

function handleJust(method: string, init?: RequestInit) {
  let cur: Record<string, any> = {}; try { cur = JSON.parse(lsGet(LS.just) || '{}'); } catch {}
  if (method === 'GET') return json({ success: true, data: cur });
  const { key, item, remove } = JSON.parse(String(init?.body || '{}'));
  if (!key) return json({ success: false }, 400);
  if (remove) { delete cur[key]; const [p] = key.split('_'); delete cur[p]; }
  else { cur[key] = item; const p = item?.placa || key.split('_')[0]; if (p) cur[p] = item; }
  lsSet(LS.just, JSON.stringify(cur));
  return json({ success: true, data: cur });
}

export function installLocalServer() {
  const orig = window.fetch.bind(window);
  window.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = (init?.method || 'GET').toUpperCase();
    if (url.startsWith('/api/viagens')) return handleViagens(method, init);
    if (url.startsWith('/api/justificativas')) return handleJust(method, init);
    return orig(input, init);
  }) as any;
}
