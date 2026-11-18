import React from 'react';
import * as XLSX from 'xlsx';
import { kvGet, kvSetShared as kvSet } from '@/lib/idbkv';
import rowsMedias from './medias/rows.json';
import { fromArr as medFromArr } from '@/lib/medias';
import { loadEmbedded } from '@/lib/persist';
import { saveWorkbook } from '@/lib/saveFile';
import { MultiSel } from '@/components/PainelVelocidade';
import lpB64 from '@/src/lp.gz.b64.txt?raw';

/* ============ constantes (iguais ao BI) ============ */
let META_PCT = 0.04;          // regra: até 4% de consumo ligado parado (ajustável no filtro: 3, 4 ou 5%)
const isFora = (r: Rec) => (r.litTot ? r.litPar / r.litTot > META_PCT : false);
const PRECO_LITRO = 5.35;     // preço padrão (set–dez/2025 e meses sem dado na aba Médias)
/** Preço do litro por mês (R$): valor abastecido ÷ litros da aba Médias de Combustível. Set–Dez/2025 ficam em 5,35. */
let PRECOS: Record<string, number> = {};
let PRECO_ULT = PRECO_LITRO;
const precoDe = (m: string) => (m < '2026-01' ? PRECO_LITRO : PRECOS[m] ?? PRECO_ULT);
function calcPrecos(med: any[]) {
  const a: Record<string, { v: number; l: number }> = {};
  for (const x of med) { const r: any = Array.isArray(x) ? medFromArr(x) : x; if (!r || !r.ano || !r.mes || !(r.l > 0) || !(r.v > 0)) continue; const k = `${r.ano}-${String(r.mes).padStart(2, '0')}`; (a[k] ||= { v: 0, l: 0 }); a[k].v += r.v; a[k].l += r.l; }
  const out: Record<string, number> = {}; Object.keys(a).sort().forEach(k => { if (k >= '2026-01') out[k] = a[k].v / a[k].l; });
  PRECOS = out; const ks = Object.keys(out).sort(); PRECO_ULT = ks.length ? out[ks[ks.length - 1]] : PRECO_LITRO;
}
     // Impac finan = Excesso Sobre Meta × 5,35
const MAB = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MFULL = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const nf = (n: number, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
const brl = (n: number) => 'R$ ' + nf(n, 2);
const pct = (n: number, d = 1) => nf(n * 100, d) + '%';
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const mLabel = (k: string) => { const [y, m] = k.split('-'); return `${MAB[+m - 1]}/${y.slice(2)}`; };
const hms = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtPlaca = (p: string) => String(p).replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^([A-Z]{3})([0-9][A-Z0-9][0-9]{2})$/, '$1-$2');

const C = { ok: '#5b8f74', warn: '#c49a3a', bad: '#b64545', blue: '#004ac6', ink: '#0b1c30', mute: '#64748b', line: '#d3dae4' };
const mcol = (i: number, n: number) => `hsl(${Math.round(215 - (i / Math.max(n - 1, 1)) * 215)} 42% ${Math.round(62 - (i % 2) * 9)}%)`;

/* registro: um veículo em um mês (linha da planilha BASE GESTÃO IMOBTRACK) */
interface Rec { pl: string; fil: string; m: string; nota: number; km: number; kmlMed: number; litMov: number; custoMov: number; litTot: number; custoTot: number; litPar: number; perdaKm: number; custoPar: number; tempo: number; fora: number }

const fromArr = (a: any[]): Rec => ({ pl: fmtPlaca(a[0]), fil: String(a[1]), m: a[2], nota: a[3] || 0, km: a[4] || 0, kmlMed: a[5] || 0, litMov: a[6] || 0, custoMov: a[7] || 0, litTot: a[8] || 0, custoTot: a[9] || 0, litPar: a[10] || 0, perdaKm: a[11] || 0, custoPar: a[12] || 0, tempo: a[13] || 0, fora: a[14] ? 1 : 0 });
const toArr = (r: Rec) => [r.pl, r.fil, r.m, r.nota, r.km, r.kmlMed, r.litMov, r.custoMov, r.litTot, r.custoTot, r.litPar, r.perdaKm, r.custoPar, r.tempo, r.fora];

/* Consolida o que a planilha traz repetido: períodos divididos no mesmo mês (somados) e a mesma placa
   duplicada com valores idênticos em duas filiais (conta uma vez). */
function consolidar(recs: Rec[]): Rec[] {
  const vistos = new Map<string, Rec>(); const unicos: Rec[] = [];
  for (const r of recs) {
    const k = `${r.pl}|${r.m}|${r.km}|${r.litTot}|${r.litPar}`; const v = vistos.get(k);
    if (v && v.fil !== r.fil) continue;           // cópia idêntica em outra filial
    vistos.set(k, r); unicos.push(r);
  }
  const mapa = new Map<string, Rec>();
  for (const r of unicos) {
    const k = `${r.pl}|${r.m}|${r.fil}`; const a = mapa.get(k);
    if (!a) { mapa.set(k, { ...r }); continue; }
    a.km += r.km; a.litMov += r.litMov; a.custoMov += r.custoMov; a.litTot += r.litTot; a.custoTot += r.custoTot; a.litPar += r.litPar; a.perdaKm += r.perdaKm; a.custoPar += r.custoPar; a.tempo += r.tempo;
    a.nota = (a.nota + r.nota) / 2; a.fora = Math.max(a.fora, r.fora); a.kmlMed = a.litTot ? a.km / a.litTot : a.kmlMed;
  }
  return [...mapa.values()];
}

async function baseOficial(): Promise<Rec[]> {
  const bin = atob(lpB64.trim()); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const rows: any[][] = JSON.parse(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  return consolidar(rows.map(fromArr));
}

const numv = (v: any) => { if (typeof v === 'number') return isFinite(v) ? v : 0; const s = String(v ?? '').trim(); if (!s) return 0; const x = parseFloat(s.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(x) ? x : 0; };
const secsOf = (v: any) => { if (typeof v === 'number') return v < 50 ? Math.round(v * 86400) : 0; const m = String(v ?? '').match(/(\d+):(\d+)(?::(\d+))?/); return m ? +m[1] * 3600 + +m[2] * 60 + (+m[3] || 0) : 0; };

/* leitura da planilha original (aba "BASE GESTÃO IMOBTRACK") */
function fromSheet(rows: any[]): Rec[] {
  if (!rows.length) return [];
  const H: Record<string, string> = {}; Object.keys(rows[0]).forEach(k => { const n = norm(k); if (!(n in H)) H[n] = k; });
  const find = (...c: string[]) => { for (const x of c) if (H[x]) return H[x]; const k = Object.keys(H).find(h => c.some(x => h.includes(x))); return k ? H[k] : ''; };
  const cP = find('placa'), cF = find('filial'), cM = find('mes'), cA = find('ano'), cKm = find('distanciatotalkm', 'distanciatotal'), cKl = find('consumomediokmporlitro'),
    cLm = find('consumomovimentol'), cCm = find('custoconsumomovimento'), cLt = find('consumototall'), cCt = find('custototal'), cLp = find('consumoligadoparadol'),
    cPk = find('perdadekm'), cCp = find('custoligadoparado'), cT = find('tempoligadoparado'), cMeta = find('meta4', 'meta5', 'meta');
  const miss = [!cP && 'PLACA', !cF && 'FILIAL', !cM && 'MÊS', !cKm && 'DISTÂNCIA TOTAL (KM)', !cLt && 'CONSUMO TOTAL (L)', !cLp && 'CONSUMO LIGADO PARADO (L)'].filter(Boolean);
  if (miss.length) throw new Error('Colunas não encontradas: ' + miss.join(', '));
  const out: Rec[] = [];
  for (const r of rows) {
    const txt = String(r[cM] ?? '').toUpperCase(); const mi = MFULL.findIndex(n => txt.includes(n)); if (mi < 0 || !String(r[cP] ?? '').trim()) continue;
    const ym = txt.match(/(20\d{2})/); const y = ym ? +ym[1] : numv(r[cA]) || new Date().getFullYear();
    out.push({ pl: fmtPlaca(r[cP]), fil: String(r[cF]).trim().replace(/\.0$/, ''), m: `${y}-${String(mi + 1).padStart(2, '0')}`, nota: numv(r[find('nota')]), km: numv(r[cKm]), kmlMed: cKl ? numv(r[cKl]) : 0,
      litMov: cLm ? numv(r[cLm]) : 0, custoMov: cCm ? numv(r[cCm]) : 0, litTot: numv(r[cLt]), custoTot: cCt ? numv(r[cCt]) : 0, litPar: numv(r[cLp]), perdaKm: cPk ? numv(r[cPk]) : 0,
      custoPar: cCp ? numv(r[cCp]) : 0, tempo: cT ? secsOf(r[cT]) : 0, fora: /FORA/i.test(String(r[cMeta] ?? '')) ? 1 : 0 });
  }
  return consolidar(out);
}

/* ============ medidas DAX do BI ============ */
function medidas(l: Rec[]) {
  let km = 0, litTot = 0, litPar = 0, perdaKm = 0, custoTot = 0, custoPar = 0, litMov = 0, custoMov = 0, tempo = 0;
  let rsPar = 0, rsPerm = 0; const pl = new Set<string>();
  for (const r of l) { km += r.km; litTot += r.litTot; litPar += r.litPar; perdaKm += r.perdaKm; custoTot += r.custoTot; custoPar += r.custoPar; litMov += r.litMov; custoMov += r.custoMov; tempo += r.tempo; pl.add(r.pl); const pr = precoDe(r.m); rsPar += r.litPar * pr; rsPerm += r.litTot * META_PCT * pr; }
  const pctReal = litTot ? litPar / litTot : 0;                       // % Perda Real
  const meta4 = litTot * META_PCT;                                    // Meta 4% Permitida (L)
  const excesso = litPar - meta4;                                     // Excesso Sobre Meta (L)
  const kmL = litTot ? km / litTot : 0;                               // KM por Litro
  const kmMeta = km * META_PCT;                                       // KM Meta Permitido (mesmo % da meta)
  const kmPerdReal = litPar * kmL;                                    // KM Perdido Real
  const pctPerdaKm = km ? perdaKm / km : 0;                           // % Perda KM
  return { km, litTot, litPar, perdaKm, custoTot, custoPar, litMov, custoMov, tempo, placas: pl.size, pctReal, meta4, excesso, impac: rsPar - rsPerm, rsPar, rsPerm, precoMed: litPar ? rsPar / litPar : PRECO_ULT, kmL, kmMeta, kmPerdReal,
    difKm: kmMeta - kmPerdReal, ppAcima: pctReal - META_PCT, pctPerdaKm, statusDentro: pctReal <= META_PCT };
}

/* ============ componentes visuais ============ */
const card = 'bg-white border border-[#d3dae4] rounded-2xl shadow-xs';

function Gauge({ value, meta, max = 0.12 }: { value: number; meta: number; max?: number }) {
  const R = 52, cx = 70, cy = 70;
  const pt = (v: number, r = R) => { const t = Math.PI * (1 - Math.min(Math.max(v / max, 0), 1)); return [cx + r * Math.cos(t), cy - r * Math.sin(t)]; };
  const arc = (a: number, b: number) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };
  const target = -90 + (Math.min(Math.max(value / max, 0), 1)) * 180; const [ang, setAng] = React.useState(-90);
  React.useEffect(() => { const t = setTimeout(() => setAng(target), 80); return () => clearTimeout(t); }, [target]);
  const col = value <= meta ? C.ok : value <= meta * 1.5 ? C.warn : C.bad; const [mx1, my1] = pt(meta, R - 8), [mx2, my2] = pt(meta, R + 8);
  return (
    <svg viewBox="0 0 140 86" className="w-[170px] shrink-0" role="img" aria-label={`${pct(value)} contra meta de ${pct(meta, 0)}`}>
      <path d={arc(0, meta)} fill="none" stroke="#22c55e" strokeWidth="11" /><path d={arc(meta, meta * 1.5)} fill="none" stroke="#facc15" strokeWidth="11" /><path d={arc(meta * 1.5, max)} fill="none" stroke="#ef4444" strokeWidth="11" />
      <line x1={mx1} y1={my1} x2={mx2} y2={my2} stroke="#0b1c30" strokeWidth="2" />
      <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 1.4s cubic-bezier(.22,1.25,.36,1)' }}><polygon points={`${cx - 1.8},${cy} ${cx + 1.8},${cy} ${cx},${cy - 44}`} fill={col} /></g>
      <circle cx={cx} cy={cy} r="6" fill="#0b1c30" /><circle cx={cx} cy={cy} r="2.2" fill="#fff" />
      <text x="14" y="84" fontSize="7" fontWeight="700" fill="#94a3b8" textAnchor="middle">0%</text><text x="126" y="84" fontSize="7" fontWeight="700" fill="#94a3b8" textAnchor="middle">{pct(max, 0)}</text>
    </svg>);
}

/* gráfico de linhas/barras mensal em SVG */
function LinhaMes({ dados, series, fmt, h = 250, refLine }: { dados: { k: string }[] & Record<string, any>[]; series: { key: string; label: string; color: string; dash?: boolean; bold?: boolean }[]; fmt: (n: number) => string; h?: number; refLine?: { v: number; label: string } }) {
  const W = 640, PL = 46, PR = 16, PT = 24, PB = 30; const n = dados.length;
  const vals = dados.flatMap(d => series.map(s => d[s.key] as number)).concat(refLine ? [refLine.v] : []); const mx = Math.max(...vals, 1e-9) * 1.18;
  const X = (i: number) => PL + (n <= 1 ? (W - PL - PR) / 2 : (i * (W - PL - PR)) / (n - 1)); const Y = (v: number) => PT + (1 - v / mx) * (h - PT - PB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * mx);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role="img">
      {ticks.map((t, i) => <g key={i}><line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} stroke="#eef2f7" /><text x={PL - 6} y={Y(t) + 3} fontSize="9" textAnchor="end" fill="#94a3b8" fontWeight="600">{fmt(t)}</text></g>)}
      {refLine && <g><line x1={PL} x2={W - PR} y1={Y(refLine.v)} y2={Y(refLine.v)} stroke={C.ok} strokeDasharray="5 4" strokeWidth="1.6" /><text x={W - PR} y={Y(refLine.v) - 5} fontSize="9" textAnchor="end" fill={C.ok} fontWeight="800">{refLine.label}</text></g>}
      {series.map(s => { const pts = dados.map((d, i) => `${X(i)},${Y(d[s.key])}`).join(' ');
        return (<g key={s.key}><polyline points={pts} fill="none" stroke={s.color} strokeWidth={s.bold ? 2.8 : 2} strokeDasharray={s.dash ? '5 4' : undefined} strokeLinejoin="round" />
          {dados.map((d, i) => <g key={i}><circle cx={X(i)} cy={Y(d[s.key])} r={s.dash ? 2.5 : 4} fill="#fff" stroke={s.color} strokeWidth="2"><title>{`${mLabel(d.k)} · ${s.label}: ${fmt(d[s.key])}`}</title></circle>
            {!s.dash && <text x={X(i)} y={Y(d[s.key]) - 9} fontSize="9.5" fontWeight="800" textAnchor="middle" fill="#0b1c30">{fmt(d[s.key])}</text>}</g>)}</g>); })}
      {dados.map((d, i) => <text key={d.k} x={X(i)} y={h - 9} fontSize="10" fontWeight="700" textAnchor="middle" fill="#64748b">{mLabel(d.k)}</text>)}
    </svg>);
}

/* ============ painel ============ */
export default function PainelLigadoParado() {
  const [all, setAll] = React.useState<Rec[] | null>(null);
  const [msg, setMsg] = React.useState('');
  const [mesS, setMesS] = React.useState<string[]>([]);
  const [filS, setFilS] = React.useState<string[]>([]);
  const [meta, setMeta] = React.useState(0.04);
  META_PCT = meta;
  const [st, setSt] = React.useState<'' | 'dentro' | 'fora'>('');
  const [q, setQ] = React.useState('');
  const [cA, setCA] = React.useState('');
  const [cB, setCB] = React.useState('');
  const [kmView, setKmView] = React.useState<'top' | 'bottom'>('top');
  const [topN, setTopN] = React.useState(10);
  const [pg, setPg] = React.useState(0);
  const [tabOpen, setTabOpen] = React.useState(() => { try { return localStorage.getItem('lp_tab_open') === '1'; } catch { return false; } });
  const toggleTab = () => setTabOpen(o => { const n = !o; try { localStorage.setItem('lp_tab_open', n ? '1' : '0'); } catch {} return n; });
  const [sort, setSort] = React.useState<{ k: string; d: 1 | -1 }>({ k: 'litMov', d: -1 });
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { (async () => {
    try { let med: any = await kvGet('medias'); if (!(Array.isArray(med) && med.length)) { const e = await loadEmbedded(); med = e && Array.isArray(e.medias) && e.medias.length ? e.medias : rowsMedias; } calcPrecos(med); } catch (e) { console.warn('precos', e); try { calcPrecos(rowsMedias as any[]); } catch {} }
    let saved: any = null; try { saved = await kvGet('lp'); } catch {}
    if (!(Array.isArray(saved) && saved.length)) { try { const e = await loadEmbedded(); if (e && Array.isArray(e.lp)) saved = e.lp; } catch {} }
    if (Array.isArray(saved) && saved.length) { setAll(consolidar(saved.map(fromArr))); return; }
    try { setAll(await baseOficial()); } catch { setAll([]); }
  })(); }, []);

  const meses = React.useMemo(() => Array.from(new Set((all || []).map(r => r.m))).sort(), [all]);
  const filiais = React.useMemo(() => Array.from(new Set((all || []).map(r => r.fil))).sort((a, b) => +a - +b), [all]);

  const base = React.useMemo(() => (all || []).filter(r => (!filS.length || filS.includes(r.fil)) && (!q || r.pl.toLowerCase().includes(q.toLowerCase().replace(/[^a-z0-9]/gi, '')) || r.pl.toLowerCase().includes(q.toLowerCase()))), [all, filS, q]);
  const rows = React.useMemo(() => base.filter(r => (!mesS.length || mesS.includes(r.m)) && (!st || (st === 'fora' ? isFora(r) : !isFora(r)))), [base, mesS, st, meta]);
  const M = React.useMemo(() => medidas(rows), [rows, meta]);

  /* série mensal (respeita filial/busca; ignora filtro de mês para mostrar a evolução inteira) */
  const serie = React.useMemo(() => meses.map(k => { const l = base.filter(r => r.m === k && (!st || (st === 'fora' ? isFora(r) : !isFora(r)))); const m = medidas(l); return { k, litPar: m.litPar, meta4: m.meta4, pct: m.pctReal, sel: !mesS.length || mesS.includes(k) }; }), [base, meses, st, mesS, meta]);

  /* por placa */
  const porPlaca = React.useMemo(() => { const m = new Map<string, Rec[]>(); rows.forEach(r => { const a = m.get(r.pl) || []; a.push(r); m.set(r.pl, a); });
    return [...m.entries()].map(([pl, l]) => ({ pl, fil: l[0].fil, l, ...medidas(l), kmlMed: l.reduce((s, r) => s + r.kmlMed, 0) / l.length, fora: l.filter(isFora).length, n: l.length })); }, [rows, meta]);
  const rankPar = React.useMemo(() => porPlaca.slice().sort((a, b) => b.litPar - a.litPar).slice(0, topN), [porPlaca, topN]);
  const rankKml = React.useMemo(() => porPlaca.filter(p => p.litTot > 0).sort((a, b) => kmView === 'top' ? b.kmL - a.kmL : a.kmL - b.kmL).slice(0, topN), [porPlaca, kmView, topN]);

  /* por filial */
  const porFilial = React.useMemo(() => filiais.map(f => { const l = rows.filter(r => r.fil === f); const m = medidas(l); const meses2 = meses.map(k => ({ k, v: l.filter(r => r.m === k).reduce((s, r) => s + r.custoTot, 0) })); return { f, l, ...m, dentro: l.filter(r => !isFora(r)).length, fora: l.filter(isFora).length, meses2 }; }).filter(x => x.l.length), [rows, filiais, meses, meta]);

  const tabela = React.useMemo(() => { const k = sort.k as keyof (typeof porPlaca)[0]; return porPlaca.slice().sort((a: any, b: any) => (typeof a[k] === 'string' ? String(a[k]).localeCompare(String(b[k])) : (a[k] - b[k])) * sort.d); }, [porPlaca, sort]);
  React.useEffect(() => setPg(0), [mesS, filS, st, q, sort]);
  const PG = 12; const pgs = Math.max(1, Math.ceil(tabela.length / PG));

  const onFile = async (f?: File | null) => {
    if (!f) return; setMsg('Lendo planilha…');
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }); let recs: Rec[] = []; let err: any = null;
      const ordem = [...wb.SheetNames].sort((a, b) => (/base|imob/i.test(b) ? 1 : 0) - (/base|imob/i.test(a) ? 1 : 0));
      for (const sn of ordem) { try { recs = fromSheet(XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' })); } catch (e) { err = e; } if (recs.length) break; }
      if (!recs.length) throw err || new Error('Nenhum registro válido encontrado (confira PLACA, FILIAL, MÊS e as colunas de consumo).');
      setMesS([]); setFilS([]); setSt(''); setQ(''); setAll(recs); await kvSet('lp', recs.map(toArr)); setMsg(`${nf(recs.length)} registros importados e salvos.`);
    } catch (e: any) { setMsg('Erro: ' + (e?.message || e)); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const restaurar = async () => { if (!confirm('Voltar para a base oficial do BI (set/2025 a fev/2026)?')) return; try { await kvSet('lp', []); } catch {} setAll(await baseOficial()); setMesS([]); setMsg('Base oficial restaurada.'); };
  const exportar = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Filial', 'Placa', 'Distância total (km)', 'Consumo movimento (L)', 'Custo consumo movimento', 'Km/L exato movimento', 'Consumo total (L)', 'Km/L médio', 'Consumo ligado parado (L)', 'Custo total', 'Custo ligado parado', 'Perda de km', 'Tempo ligado parado', '% Perda km', 'Meses fora da meta', 'Meses'],
      ...tabela.map(p => [p.fil, p.pl, +p.km.toFixed(1), +p.litMov.toFixed(1), +p.custoMov.toFixed(2), p.litMov ? +(p.km / p.litMov).toFixed(2) : 0, +p.litTot.toFixed(1), +p.kmlMed.toFixed(2), +p.litPar.toFixed(1), +p.custoTot.toFixed(2), +p.custoPar.toFixed(2), +p.perdaKm.toFixed(1), hms(p.tempo), +(p.pctPerdaKm * 100).toFixed(2), p.fora, p.n])]), 'Placas');
    saveWorkbook(wb, 'ligado-parado.xlsx');
  };

  const sel = 'border border-[#d3dae4] rounded-lg px-2.5 py-1.5 text-xs font-bold bg-white';
  const chip = (on: boolean, c = C.blue) => ({ background: on ? c : '#fff', color: on ? '#fff' : '#475569', borderColor: on ? c : C.line });

  if (all === null) return <div className="p-10 text-center text-slate-400 text-sm">Carregando…</div>;
  if (!all.length) return (
    <div className="max-w-2xl mx-auto mt-8 text-center space-y-4">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      <div className={card + ' p-8'}><div className="text-4xl mb-2">⛽</div><h2 className="text-xl font-black text-[#0b1c30]">Consumo Ligado Parado</h2>
        <p className="text-sm text-slate-500 mt-2">Importe a planilha CONTROLE IMOBTRACK (aba BASE GESTÃO IMOBTRACK).</p>
        <button className="gm-adm mt-5 px-4 py-2 rounded-lg bg-[#004ac6] text-white text-sm font-extrabold" onClick={() => fileRef.current?.click()}>Importar planilha</button>
        {msg && <p className="text-xs font-bold text-amber-700 mt-3">{msg}</p>}</div></div>);

  const mesLbl = mesS.length ? mesS.map(mLabel).join(', ') : `${mLabel(meses[0])} a ${mLabel(meses[meses.length - 1])}`;
  const Kpi = ({ t, v, sub, tone, big }: { t: string; v: string; sub?: string; tone?: string; big?: boolean }) => (
    <div className={card + ' p-4'} style={{ borderTop: `3px solid ${tone || '#cfd8e3'}` }}>
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{t}</div>
      <div className={(big ? 'text-3xl' : 'text-2xl') + ' font-black mt-1.5'} style={{ color: tone && tone !== '#cfd8e3' ? tone : C.ink }}>{v}</div>
      {sub && <div className="text-[11px] text-slate-500 font-semibold mt-1">{sub}</div>}
    </div>);
  const acima = M.ppAcima > 0; const toneM = acima ? C.bad : C.ok;
  const maxPar = Math.max(...rankPar.map(p => p.litPar), 1), maxKml = Math.max(...rankKml.map(p => p.kmL), 1);
  const maxFil = Math.max(...porFilial.map(f => f.dentro + f.fora), 1), maxCusto = Math.max(...porFilial.map(f => f.custoTot), 1);
  const th = (k: string, l: string, left = false) => <th className={'px-2.5 py-2 cursor-pointer select-none whitespace-nowrap ' + (left ? 'text-left' : 'text-center')} onClick={() => setSort(s => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : -1 }))}>{l}{sort.k === k ? (sort.d === 1 ? ' ▲' : ' ▼') : ''}</th>;
  const pagina = tabela.slice(pg * PG, pg * PG + PG);

  return (
    <div className="space-y-5" data-testid="lp">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />

      {/* cabeçalho + filtros */}
      <div className={card + ' p-5'}>
        <div className="flex flex-wrap justify-between gap-3 items-start">
          <div><div className="text-[10px] font-extrabold tracking-[.18em] uppercase text-slate-500">Eficiência operacional</div>
            <h2 className="text-2xl font-black text-[#0b1c30] leading-tight">Consumo Ligado Parado</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{nf(all.length)} registros · {nf(new Set(all.map(r => r.pl)).size)} placas · {mLabel(meses[0])} a {mLabel(meses[meses.length - 1])} · regra: até {pct(meta, 0)} do consumo ligado parado</p></div>
          <div className="flex flex-wrap gap-2 items-center">
            <button className="gm-adm px-3 py-1.5 rounded-lg bg-[#004ac6] text-white text-xs font-extrabold" onClick={() => fileRef.current?.click()}>Importar planilha</button>
            <button className="px-3 py-1.5 rounded-lg border border-[#d3dae4] text-xs font-extrabold text-slate-600" onClick={exportar}>Exportar Excel</button>
            <button className="px-3 py-1.5 rounded-lg border border-[#d3dae4] text-xs font-extrabold text-slate-600" onClick={() => window.print()}>Imprimir / PDF</button>
            <button className="gm-adm px-3 py-1.5 rounded-lg border border-[#d3dae4] text-xs font-extrabold text-slate-600" onClick={restaurar}>Base oficial</button>
          </div>
        </div>
        {msg && <p className="text-xs font-bold text-amber-700 mt-2">{msg}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-[#eef2f7]">
          <MultiSel all="Todos os meses" value={mesS} onChange={setMesS} opts={meses.slice().reverse().map(k => ({ v: k, l: mLabel(k) }))} />
          <MultiSel all="Todas as filiais" value={filS} onChange={setFilS} opts={filiais.map(f => ({ v: f, l: 'Filial ' + f }))} />
          <div className="flex items-center gap-1.5 pl-1 pr-1 py-0.5 rounded-lg border border-[#d3dae4] bg-[#f6f8fb]"><span className="text-[10px] font-extrabold uppercase text-slate-500 pl-1.5">Meta</span>{[0.03, 0.04, 0.05].map(v => <button key={v} className="px-2.5 py-1 rounded-md text-[11px] font-extrabold" style={{ background: meta === v ? C.blue : 'transparent', color: meta === v ? '#fff' : C.mute }} onClick={() => setMeta(v)} aria-pressed={meta === v}>{pct(v, 0)}</button>)}</div>
          {([['', 'Todas'], ['dentro', 'Dentro da meta'], ['fora', 'Fora da meta']] as const).map(([k, l]) => <button key={k} className="px-3 py-1.5 rounded-full border text-[11px] font-extrabold" style={chip(st === k, k === 'fora' ? C.bad : k === 'dentro' ? C.ok : C.blue)} onClick={() => setSt(k)}>{l}</button>)}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar placa…" className={sel + ' w-44 font-semibold'} />
        </div>
      </div>

      {!rows.length && <div className={card + ' p-8 text-center text-slate-400 text-sm font-semibold'}>Nenhum registro para os filtros selecionados.</div>}

      {/* indicador principal */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1.25fr) repeat(3,minmax(0,1fr))' }}>
        <div className={card + ' p-4 flex items-center justify-between gap-2'} style={{ borderTop: `3px solid ${toneM}` }}>
          <div><div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">% perda real (ligado parado ÷ consumo)</div>
            <div className="text-4xl font-black mt-1" style={{ color: toneM }}>{pct(M.pctReal, 2)}</div>
            <div className="text-[11px] font-bold mt-1" style={{ color: toneM }}>{acima ? '▲' : '▼'} {nf(Math.abs(M.ppAcima) * 100, 2)} p.p. {acima ? 'acima' : 'abaixo'} da meta de {pct(META_PCT, 0)}</div>
            <div className="text-[11px] text-slate-500 font-semibold mt-0.5">{mesLbl}</div></div>
          <Gauge key={`g|${mesS}|${filS}|${st}|${q}|${meta}`} value={M.pctReal} meta={META_PCT} />
        </div>
        <Kpi t="Consumo ligado parado (L)" v={nf(M.litPar, 1)} sub={`de ${nf(M.litTot, 0)} L consumidos`} big />
        <Kpi t="Excesso de perda (L)" v={(M.excesso > 0 ? '+' : '') + nf(M.excesso, 1)} sub={`perda permitida (${pct(meta, 0)}): ${nf(M.meta4, 1)} L`} tone={M.excesso > 0 ? C.bad : C.ok} big />
        <Kpi t="Impacto financeiro" v={brl(M.impac)} sub={`excesso × preço do litro do mês (média R$ ${nf(M.precoMed, 2)}/L)`} tone={M.impac > 0 ? C.bad : C.ok} big />
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }}>
        <Kpi t={`Perda permitida (${pct(meta, 0)}) · litros`} v={nf(M.meta4, 1)} sub={`${pct(meta, 0)} do consumo total`} />
        <Kpi t="Perda permitida (km)" v={nf(M.kmMeta, 1)} sub={`${pct(meta, 0)} da distância percorrida`} />
        <Kpi t="KM total perdido" v={nf(M.kmPerdReal, 1)} sub={`ligado parado × ${nf(M.kmL, 2)} km/L`} />
        <Kpi t="Excesso de perda km" v={(M.difKm > 0 ? '+' : '') + nf(M.difKm, 1)} sub="perda permitida − km perdido" tone={M.difKm < 0 ? C.bad : C.ok} />
        <Kpi t="Status meta de perda" v={M.statusDentro ? 'Dentro da meta' : 'Fora da meta'} sub={`% perda real: ${pct(M.pctReal, 2)} (limite ${pct(meta, 0)})`} tone={M.statusDentro ? C.ok : C.bad} />
      </div>

      {/* evolução mensal */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)' }}>
        <div className={card + ' p-5'}><h4 className="text-sm font-black text-[#0b1c30]">Consumo ligado parado por mês</h4><p className="text-[11px] text-slate-500 mb-1">Litros no mês contra a meta de {pct(meta, 0)} permitida (tracejado)</p>
          <div className="flex gap-4 text-[10px] font-bold text-slate-500 mb-1"><span><i className="inline-block w-3 h-[3px] align-middle mr-1" style={{ background: C.blue }} />Ligado parado (L)</span><span><i className="inline-block w-3 h-[3px] align-middle mr-1" style={{ background: C.ok }} />Meta {pct(meta, 0)} permitida (L)</span></div>
          <LinhaMes dados={serie as any} series={[{ key: 'litPar', label: 'Ligado parado (L)', color: C.blue, bold: true }, { key: 'meta4', label: `Meta ${pct(meta, 0)} (L)`, color: C.ok, dash: true }]} fmt={n => nf(n, 0)} /></div>
        <div className={card + ' p-5'}><h4 className="text-sm font-black text-[#0b1c30]">% perda mês a mês</h4><p className="text-[11px] text-slate-500 mb-1">% perda real mensal; a linha verde é a meta de {pct(meta, 0)}</p>
          <div className="h-[18px]" />
          <LinhaMes dados={serie as any} series={[{ key: 'pct', label: '% perda real', color: C.bad, bold: true }]} fmt={n => pct(n, 1)} refLine={{ v: META_PCT, label: `Meta ${pct(meta, 0)}` }} /></div>
      </div>

      {/* rankings por placa */}
      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">Mostrar <select className={sel} value={topN} onChange={e => setTopN(+e.target.value)}>{[5, 10, 15, 20, 30].map(n => <option key={n} value={n}>Top {n}</option>)}</select> placas nos rankings</div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className={card + ' p-5'}><h4 className="text-sm font-black text-[#0b1c30]">Consumo ligado parado por placa (L)</h4><p className="text-[11px] text-slate-500 mb-3">Quem mais gasta combustível com o veículo parado e ligado</p>
          <div className="space-y-2.5">{rankPar.map((p, i) => (<div key={p.pl}><div className="flex justify-between items-center text-xs"><span><span className="text-slate-400 font-bold mr-1.5">{i + 1}º</span><span className="font-mono font-black bg-[#f1f5f9] rounded px-1.5 py-0.5 text-[11px]">{p.pl}</span> <span className="text-[11px] font-semibold text-black ml-1">Filial {p.fil} · {pct(p.pctReal, 1)} do consumo</span></span><b>{nf(p.litPar, 1)}</b></div>
            <div className="h-2 rounded bg-[#eef2f7] mt-1"><div className="h-full rounded" style={{ width: `${(p.litPar / maxPar) * 100}%`, background: p.pctReal > META_PCT ? C.bad : C.blue }} /></div></div>))}</div>
          <p className="text-[10px] text-slate-400 mt-3"><span style={{ color: C.bad }}>■</span> acima da meta de {pct(meta, 0)} · <span style={{ color: C.blue }}>■</span> dentro da meta</p></div>
        <div className={card + ' p-5'}>
          <div className="flex justify-between items-start gap-2"><div><h4 className="text-sm font-black text-[#0b1c30]">Custos financeiros · km por litro</h4><p className="text-[11px] text-slate-500 mb-3">Eficiência de consumo por placa (distância ÷ litros)</p></div>
            <div className="flex gap-1 p-0.5 rounded-lg bg-[#eef2f7]">{([['top', 'Melhores'], ['bottom', 'Piores']] as const).map(([k, l]) => <button key={k} onClick={() => setKmView(k)} className="px-3 py-1 rounded-md text-[11px] font-extrabold" style={{ background: kmView === k ? '#fff' : 'transparent', color: kmView === k ? C.blue : C.mute }}>{l}</button>)}</div></div>
          <div className="space-y-2.5">{rankKml.map((p, i) => (<div key={p.pl}><div className="flex justify-between items-center text-xs"><span><span className="text-slate-400 font-bold mr-1.5">{i + 1}º</span><span className="font-mono font-black bg-[#f1f5f9] rounded px-1.5 py-0.5 text-[11px]">{p.pl}</span> <span className="text-[11px] font-semibold text-black ml-1">Filial {p.fil} · {brl(p.custoTot)}</span></span><b>{nf(p.kmL, 2)} km/L</b></div>
            <div className="h-2 rounded bg-[#eef2f7] mt-1"><div className="h-full rounded" style={{ width: `${(p.kmL / maxKml) * 100}%`, background: kmView === 'top' ? C.ok : C.warn }} /></div></div>))}</div></div>
      </div>

      {/* filiais */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)' }}>
        <div className={card + ' p-5'}><h4 className="text-sm font-black text-[#0b1c30]">Dentro da meta × fora da meta · por filial</h4><p className="text-[11px] text-slate-500 mb-3">Registros (placa-mês) com % de ligado parado acima ou abaixo da meta de {pct(meta, 0)}</p>
          <div className="space-y-3">{porFilial.map(f => { const t = f.dentro + f.fora; return (<div key={f.f}><div className="flex justify-between text-xs font-bold"><span>Filial {f.f}</span><span className="text-slate-500 font-semibold">{nf(f.dentro)} dentro · {nf(f.fora)} fora · {pct(t ? f.fora / t : 0, 0)} fora</span></div>
            <div className="flex h-6 rounded overflow-hidden mt-1 bg-[#eef2f7]" style={{ width: `${(t / maxFil) * 100}%`, minWidth: 60 }}><div title={`Dentro: ${f.dentro}`} style={{ width: `${(f.dentro / t) * 100}%`, background: C.ok }} className="text-[10px] font-extrabold text-white flex items-center justify-center">{f.dentro || ''}</div><div title={`Fora: ${f.fora}`} style={{ width: `${(f.fora / t) * 100}%`, background: C.bad }} className="text-[10px] font-extrabold text-white flex items-center justify-center">{f.fora || ''}</div></div></div>); })}</div>
          <p className="text-[10px] text-slate-400 mt-3"><span style={{ color: C.ok }}>■</span> dentro da meta · <span style={{ color: C.bad }}>■</span> fora da meta</p></div>
        <div className={card + ' p-5'}><h4 className="text-sm font-black text-[#0b1c30]">Custo total por filial e mês</h4><p className="text-[11px] text-slate-500 mb-3">Combustível (R$), empilhado por mês</p>
          <div className="space-y-3">{porFilial.slice().sort((a, b) => b.custoTot - a.custoTot).map(f => (<div key={f.f}><div className="flex justify-between text-xs font-bold"><span>Filial {f.f}</span><span>{brl(f.custoTot)}</span></div>
            <div className="flex h-6 rounded overflow-hidden mt-1 bg-[#eef2f7]" style={{ width: `${(f.custoTot / maxCusto) * 100}%`, minWidth: 40 }}>{f.meses2.filter(x => x.v > 0).map(x => <div key={x.k} title={`${mLabel(x.k)}: ${brl(x.v)}`} style={{ width: `${(x.v / (f.custoTot || 1)) * 100}%`, background: mcol(meses.indexOf(x.k), meses.length) }} />)}</div></div>))}</div>
          <div className="flex flex-wrap gap-3 mt-3 text-[10px] font-bold text-slate-500">{meses.map((k, i) => <span key={k}><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: mcol(i, meses.length) }} />{mLabel(k)}</span>)}</div></div>
      </div>

      {/* o que perdemos */}
      {rows.length > 0 && (() => {
        const exc = M.excesso, tem = exc > 0, permL = Math.min(M.litPar, M.meta4), excL = Math.max(exc, 0);
        const kmPerm = M.meta4 * M.kmL, kmExc = excL * M.kmL;
        const colunas = [
          { t: 'Permitido', s: `${pct(meta, 0)} do consumo`, l: M.meta4, r: M.rsPerm, k: kmPerm, c: C.ok, bg: '#eef5f1' },
          { t: 'Consumido parado', s: 'o que realmente foi gasto', l: M.litPar, r: M.rsPar, k: M.kmPerdReal, c: C.blue, bg: '#eef3fb' },
          { t: tem ? 'Perda além da meta' : 'Folga dentro da meta', s: tem ? 'consumido − permitido' : 'permitido − consumido', l: Math.abs(exc), r: Math.abs(M.impac), k: Math.abs(tem ? kmExc : (M.kmMeta - M.kmPerdReal)), c: tem ? C.bad : C.ok, bg: tem ? '#f8ecec' : '#eef5f1' },
        ];
        return (
          <div className={card + ' p-5'} style={{ borderTop: `3px solid ${tem ? C.bad : C.ok}` }}>
            <div className="text-[10px] font-extrabold tracking-[.18em] uppercase text-slate-500">Resumo para a gerência · {mesLbl}</div>
            <h3 className="text-xl font-black text-[#0b1c30] mt-0.5">{tem ? 'O que perdemos' : 'Dentro da meta'}</h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              {tem ? <>Dos <b>{nf(M.litPar, 0)} L</b> gastos com veículos ligados parados, o permitido era <b>{nf(M.meta4, 0)} L</b> ({pct(meta, 0)} do consumo). Perdemos <b style={{ color: C.bad }}>{nf(exc, 0)} L a mais</b> — <b>{pct(M.litPar ? exc / M.litPar : 0, 0)}</b> do consumo parado —, o equivalente a <b style={{ color: C.bad }}>{brl(M.impac)}</b> e <b>{nf(kmExc, 0)} km</b> que o combustível teria rodado.</>
                : <>O consumo parado ficou <b>{nf(Math.abs(exc), 0)} L abaixo</b> do permitido ({nf(M.meta4, 0)} L). Folga de <b style={{ color: C.ok }}>{brl(Math.abs(M.impac))}</b>.</>}
            </p>
            <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
              {colunas.map((c, i) => (
                <div key={i} className="rounded-xl p-4 relative" style={{ background: c.bg }}>
                  {i === 2 && <span className="absolute -left-[13px] top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg" aria-hidden>=</span>}
                  {i === 1 && <span className="absolute -left-[13px] top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg" aria-hidden>−</span>}
                  <div className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: c.c }}>{c.t}</div>
                  <div className="text-[10px] text-slate-500 font-semibold">{c.s}</div>
                  <div className="text-3xl font-black mt-1.5" style={{ color: c.c }}>{nf(c.l, 0)}<span className="text-sm font-extrabold ml-1">L</span></div>
                  <div className="text-base font-black text-[#0b1c30] mt-0.5">{brl(c.r)}</div>
                  <div className="text-[11px] font-bold text-slate-600">{nf(c.k, 0)} km rodáveis</div>
                </div>))}
            </div>
            <div className="mt-5">
              <div className="flex justify-between text-[11px] font-extrabold text-slate-500 mb-1.5"><span>Dos {nf(M.litPar, 0)} L consumidos parados: quanto era permitido e quanto foi perda</span><span>ligado parado = {pct(M.pctReal, 1)} do consumo total ({nf(M.litTot, 0)} L)</span></div>
              <div className="relative h-11 rounded-lg overflow-hidden bg-[#eef2f7] flex" role="img" aria-label="Consumo parado dividido em permitido e perda além da meta">
                <div style={{ width: `${(permL / (M.litPar || 1)) * 100}%`, background: C.ok }} className="flex items-center justify-center text-[11px] font-extrabold text-white" title={`Permitido: ${nf(permL, 0)} L`}>Permitido · {nf(permL, 0)} L · {pct(permL / (M.litPar || 1), 0)}</div>
                <div style={{ width: `${(excL / (M.litPar || 1)) * 100}%`, background: C.bad }} className="flex items-center justify-center text-[11px] font-extrabold text-white" title={`Perda além da meta: ${nf(excL, 0)} L`}>{excL > 0 ? `Perda · ${nf(excL, 0)} L · ${pct(excL / (M.litPar || 1), 0)}` : ''}</div>
              </div>
              <div className="flex flex-wrap gap-4 mt-2 text-[10px] font-bold text-slate-500"><span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: C.ok }} />Parado dentro do permitido ({pct(meta, 0)} do consumo)</span><span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: C.bad }} />Perda além da meta</span></div>
            </div>
          </div>);
      })()}

      {/* onde está a perda */}
      {rows.length > 0 && (() => {
        const excP = porPlaca.map(p => ({ ...p, exc: p.litPar - p.litTot * meta })).filter(p => p.exc > 0).sort((a, b) => b.exc - a.exc);
        const excF = porFilial.map(f => ({ ...f, exc: f.litPar - f.litTot * meta })).sort((a, b) => b.exc - a.exc);
        const totalExc = excP.reduce((s, p) => s + p.exc, 0), top = excP.slice(0, topN), topSum = top.reduce((s, p) => s + p.exc, 0), maxE = Math.max(...top.map(p => p.exc), 1);
        const maxF = Math.max(...excF.map(f => Math.abs(f.exc)), 1);
        return (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.25fr)' }}>
            <div className={card + ' p-5'}><h4 className="text-sm font-black text-[#0b1c30]">Perda além da meta por filial</h4><p className="text-[11px] text-slate-500 mb-3">Litros e reais acima do permitido ({pct(meta, 0)}); verde = abaixo da meta</p>
              <div className="space-y-3.5">{excF.map(f => { const bad = f.exc > 0; return (<div key={f.f}>
                <div className="flex justify-between items-baseline text-xs"><b>Filial {f.f}</b><span className="font-black" style={{ color: bad ? C.bad : C.ok }}>{bad ? '+' : '−'}{nf(Math.abs(f.exc), 0)} L · {brl(Math.abs(f.impac))}</span></div>
                <div className="h-3 rounded bg-[#eef2f7] mt-1"><div className="h-full rounded" style={{ width: `${(Math.abs(f.exc) / maxF) * 100}%`, background: bad ? C.bad : C.ok }} /></div>
                <div className="text-[11px] font-semibold text-black mt-0.5">consumiu {nf(f.litPar, 0)} L parado · permitido {nf(f.litTot * meta, 0)} L · {pct(f.pctReal, 1)} do consumo</div></div>); })}</div></div>
            <div className={card + ' p-5'}><h4 className="text-sm font-black text-[#0b1c30]">Placas que mais geraram perda além da meta</h4>
              <p className="text-[11px] text-slate-500 mb-3">Só entram placas acima de {pct(meta, 0)} · {nf(excP.length)} de {nf(porPlaca.length)} placas · as {top.length} primeiras somam {pct(totalExc ? topSum / totalExc : 0, 0)} da perda</p>
              <div className="space-y-2.5">{top.map((p, i) => (<div key={p.pl}>
                <div className="flex justify-between items-center text-xs"><span><span className="text-slate-400 font-bold mr-1.5">{i + 1}º</span><span className="font-mono font-black bg-[#f1f5f9] rounded px-1.5 py-0.5 text-[11px]">{p.pl}</span> <span className="text-[11px] font-semibold text-black ml-1">Filial {p.fil} · gastou {nf(p.litPar, 0)} L · permitido {nf(p.litTot * meta, 0)} L</span></span><b style={{ color: C.bad }}>+{nf(p.exc, 0)} L · {brl(p.impac)}</b></div>
                <div className="h-2 rounded bg-[#eef2f7] mt-1"><div className="h-full rounded" style={{ width: `${(p.exc / maxE) * 100}%`, background: C.bad }} /></div></div>))}
                {!top.length && <p className="text-sm text-slate-400 font-semibold py-4 text-center">Nenhuma placa acima da meta.</p>}</div></div>
          </div>);
      })()}

      {/* comparativo entre filiais */}
      {porFilial.length > 0 && (() => {
        const F = porFilial.map(f => ({ ...f, exc: f.litPar - f.litTot * meta, nP: new Set(f.l.map(r => r.pl)).size, acima: new Set(f.l.filter(isFora).map(r => r.pl)).size }))
          .map(f => ({ ...f, porPlaca: f.nP ? f.litPar / f.nP : 0, parPct: f.pctReal }));
        if (F.length < 2) return (<div className={card + ' p-5'}><h4 className="text-sm font-black text-[#0b1c30]">Comparativo entre filiais</h4><p className="text-sm text-slate-500 mt-1">Selecione duas ou mais filiais (ou limpe o filtro de filial) para comparar.</p></div>);
        const ord = F.slice().sort((x, y) => y.litPar - x.litPar);
        const A = F.find(f => f.f === cA) || ord[0], B = F.find(f => f.f === cB && f.f !== A.f) || ord.filter(f => f.f !== A.f).slice(-1)[0];
        const dif = (a: number, b: number) => ({ d: a - b, p: b ? (a - b) / Math.abs(b) : 0 });
        const L = dif(A.litPar, B.litPar);
        const sinal = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
        const linhas: { l: string; a: number; b: number; f: (n: number) => string; pior: 'alto' | 'baixo' | null }[] = [
          { l: 'Consumo ligado parado (L)', a: A.litPar, b: B.litPar, f: n => nf(n, 0), pior: 'alto' },
          { l: '% do consumo total parado', a: A.pctReal, b: B.pctReal, f: n => pct(n, 2), pior: 'alto' },
          { l: `Permitido (${pct(meta, 0)}) em litros`, a: A.litTot * meta, b: B.litTot * meta, f: n => nf(n, 0), pior: null },
          { l: 'Perda além da meta (L)', a: Math.max(A.exc, 0), b: Math.max(B.exc, 0), f: n => nf(n, 0), pior: 'alto' },
          { l: 'Perda além da meta (R$)', a: Math.max(A.impac, 0), b: Math.max(B.impac, 0), f: brl, pior: 'alto' },
          { l: 'Custo total de combustível', a: A.custoTot, b: B.custoTot, f: brl, pior: null },
          { l: 'Consumo total (L)', a: A.litTot, b: B.litTot, f: n => nf(n, 0), pior: null },
          { l: 'Km por litro', a: A.kmL, b: B.kmL, f: n => nf(n, 2), pior: 'baixo' },
          { l: 'Placas na análise', a: A.nP, b: B.nP, f: n => nf(n, 0), pior: null },
          { l: 'Placas acima da meta', a: A.acima, b: B.acima, f: n => nf(n, 0), pior: 'alto' },
          { l: 'Ligado parado por placa (L)', a: A.porPlaca, b: B.porPlaca, f: n => nf(n, 1), pior: 'alto' },
        ];
        const melhor = (k: 'pctReal' | 'kmL', maior: boolean) => F.slice().sort((x, y) => (maior ? y[k] - x[k] : x[k] - y[k]))[0];
        const pior = melhor('pctReal', true), bom = melhor('pctReal', false), maxExc = F.slice().sort((x, y) => y.exc - x.exc)[0], efi = melhor('kmL', true);
        const media = F.reduce((t, f) => t + f.litPar, 0) / F.length;
        const optA = F.map(f => <option key={f.f} value={f.f}>Filial {f.f}</option>);
        return (
          <div className={card + ' p-5'}>
            <div className="flex justify-between items-start flex-wrap gap-3">
              <div><h4 className="text-lg font-black text-[#0b1c30]">Comparativo entre filiais</h4><p className="text-[11px] text-slate-500">Escolha duas filiais para ver a diferença em litros, reais e porcentagem · meta de {pct(meta, 0)}</p></div>
              <div className="flex items-center gap-2 text-xs font-bold"><select className={sel} value={A.f} onChange={e => setCA(e.target.value)}>{optA}</select><span className="text-slate-400">contra</span><select className={sel} value={B.f} onChange={e => setCB(e.target.value)}>{F.filter(f => f.f !== A.f).map(f => <option key={f.f} value={f.f}>Filial {f.f}</option>)}</select></div>
            </div>

            <div className="mt-4 rounded-xl p-4 text-sm leading-relaxed" style={{ background: L.d > 0 ? '#f8ecec' : '#eef5f1' }}>
              A <b>Filial {A.f}</b> consumiu <b style={{ color: L.d > 0 ? C.bad : C.ok }}>{nf(Math.abs(L.d), 0)} L {L.d >= 0 ? 'a mais' : 'a menos'}</b> de combustível parado que a <b>Filial {B.f}</b> (<b>{sinal(L.p)}{nf(Math.abs(L.p) * 100, 0)}%</b>), uma diferença de <b>{brl(Math.abs(A.rsPar - B.rsPar))}</b>.
              {' '}Em proporção do consumo, a Filial {A.f} deixa <b>{pct(A.pctReal, 1)}</b> parado contra <b>{pct(B.pctReal, 1)}</b> da Filial {B.f} ({sinal(A.pctReal - B.pctReal)}{nf(Math.abs(A.pctReal - B.pctReal) * 100, 1)} p.p.).
              {' '}Perda além da meta: <b style={{ color: C.bad }}>{nf(Math.max(A.exc, 0), 0)} L</b> contra <b style={{ color: C.bad }}>{nf(Math.max(B.exc, 0), 0)} L</b>.
            </div>

            <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
              <div className="overflow-x-auto"><table className="w-full text-[11px]">
                <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-[#e5eaf1] bg-[#f6f8fb]"><th className="px-2.5 py-2 text-left">Indicador</th><th className="px-2.5 py-2 text-center">Filial {A.f}</th><th className="px-2.5 py-2 text-center">Filial {B.f}</th><th className="px-2.5 py-2 text-center">Diferença</th><th className="px-2.5 py-2 text-center">%</th></tr></thead>
                <tbody>{linhas.map(r => { const d = dif(r.a, r.b); const ruim = r.pior && d.d !== 0 ? ((r.pior === 'alto') === (d.d > 0)) : null; const cor = ruim === null ? C.ink : ruim ? C.bad : C.ok;
                  return (<tr key={r.l} className="border-b border-[#f0f3f8]"><td className="px-2.5 py-2 font-bold text-slate-700">{r.l}</td><td className="text-center font-black">{r.f(r.a)}</td><td className="text-center font-black">{r.f(r.b)}</td>
                    <td className="text-center font-extrabold" style={{ color: cor }}>{sinal(d.d)}{r.f(Math.abs(d.d))}</td><td className="text-center font-extrabold" style={{ color: cor }}>{r.b ? `${sinal(d.p)}${nf(Math.abs(d.p) * 100, 0)}%` : '—'}</td></tr>); })}</tbody></table>
                <p className="text-[10px] text-slate-400 mt-2"><span style={{ color: C.bad }}>■</span> pior para a filial A · <span style={{ color: C.ok }}>■</span> melhor para a filial A · diferença = A − B</p></div>
              <div className="space-y-2.5">
                {[{ t: 'Mais litros parados', v: `Filial ${ord[0].f}`, s: `${nf(ord[0].litPar, 0)} L · ${nf(ord[0].litPar - ord[ord.length - 1].litPar, 0)} L a mais que a Filial ${ord[ord.length - 1].f}`, c: C.bad },
                  { t: 'Maior % de consumo parado', v: `Filial ${pior.f}`, s: `${pct(pior.pctReal, 1)} do consumo · ${nf((pior.pctReal - bom.pctReal) * 100, 1)} p.p. acima da Filial ${bom.f}`, c: C.bad },
                  { t: 'Maior perda além da meta', v: `Filial ${maxExc.f}`, s: `${nf(Math.max(maxExc.exc, 0), 0)} L · ${brl(Math.max(maxExc.impac, 0))}`, c: C.bad },
                  { t: 'Menor % de consumo parado', v: `Filial ${bom.f}`, s: `${pct(bom.pctReal, 1)} do consumo`, c: C.ok },
                  { t: 'Mais eficiente (km/L)', v: `Filial ${efi.f}`, s: `${nf(efi.kmL, 2)} km por litro`, c: C.ok }].map(x => (
                  <div key={x.t} className="rounded-xl border border-[#e5eaf1] px-3.5 py-2.5" style={{ borderLeft: `4px solid ${x.c}` }}>
                    <div className="text-[10px] font-extrabold uppercase text-slate-500">{x.t}</div><div className="text-base font-black" style={{ color: x.c }}>{x.v}</div><div className="text-[11px] font-semibold text-black">{x.s}</div></div>))}
              </div>
            </div>

            <h5 className="text-xs font-black text-[#0b1c30] mt-5 mb-2">Todas as filiais · diferença para a média ({nf(media, 0)} L parados por filial)</h5>
            <div className="space-y-2">{ord.map(f => { const d = media ? (f.litPar - media) / media : 0; return (
              <div key={f.f} className="grid items-center gap-3 text-xs" style={{ gridTemplateColumns: '78px minmax(0,1fr) 220px' }}>
                <b>Filial {f.f}</b>
                <div className="h-5 rounded bg-[#eef2f7] relative overflow-hidden"><div className="h-full rounded" style={{ width: `${(f.litPar / (ord[0].litPar || 1)) * 100}%`, background: f.pctReal > meta ? C.bad : C.ok }} /><span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-extrabold text-white mix-blend-normal" style={{ textShadow: '0 0 2px rgba(0,0,0,.45)' }}>{nf(f.litPar, 0)} L</span></div>
                <span className="font-semibold text-black">{pct(f.pctReal, 1)} do consumo · <b style={{ color: d > 0 ? C.bad : C.ok }}>{sinal(d)}{nf(Math.abs(d) * 100, 0)}% vs média</b></span></div>); })}</div>
          </div>);
      })()}

      {/* tabela */}
      <div className={card + ' p-5'}>
        <div className="flex justify-between items-center flex-wrap gap-2"><button type="button" onClick={toggleTab} aria-expanded={tabOpen} className="text-left flex items-center gap-3"><span className="w-7 h-7 rounded-lg bg-[#eef2f7] flex items-center justify-center text-xs font-black text-slate-600">{tabOpen ? '▾' : '▸'}</span><span><span className="block text-sm font-black text-[#0b1c30]">Visão geral · placas</span><span className="block text-[11px] text-slate-500">{nf(tabela.length)} placas · {tabOpen ? 'clique no título da coluna para ordenar' : 'clique para expandir a tabela detalhada'}</span></span></button>
          {tabOpen && <div className="flex items-center gap-2 text-xs font-bold"><button className={sel} disabled={pg === 0} onClick={() => setPg(p => p - 1)}>‹</button>Página {pg + 1} de {pgs}<button className={sel} disabled={pg >= pgs - 1} onClick={() => setPg(p => p + 1)}>›</button></div>}</div>
        {tabOpen && <div className="overflow-x-auto mt-3"><table className="w-full text-[11px]" style={{ minWidth: 1180 }}>
          <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-[#e5eaf1] bg-[#f6f8fb]">{th('fil', 'Filial', true)}{th('pl', 'Placa', true)}{th('km', 'Distância (km)')}{th('litMov', 'Consumo mov. (L)')}{th('custoMov', 'Custo mov.')}{th('kmL', 'Km/L mov.')}{th('litTot', 'Consumo total (L)')}{th('kmlMed', 'Km/L médio')}{th('litPar', 'Lig. parado (L)')}{th('custoTot', 'Custo total')}{th('custoPar', 'Custo lig. parado')}{th('perdaKm', 'Perda km')}{th('tempo', 'Tempo lig. parado')}{th('pctPerdaKm', '% perda km')}{th('fora', 'Meta')}</tr></thead>
          <tbody>{pagina.map(p => { const dentro = p.fora === 0, fora = p.fora === p.n; return (<tr key={p.fil + p.pl} className="border-b border-[#f0f3f8] text-center hover:bg-[#f9fafc]">
            <td className="px-2.5 py-2 text-left font-bold">{p.fil}</td><td className="px-2.5 text-left font-mono font-black">{p.pl}</td><td>{nf(p.km, 1)}</td><td>{nf(p.litMov, 1)}</td><td>{brl(p.custoMov)}</td><td>{p.litMov ? nf(p.km / p.litMov, 2) : '—'}</td><td>{nf(p.litTot, 1)}</td><td>{nf(p.kmlMed, 2)}</td>
            <td className="font-extrabold" style={{ color: p.pctReal > META_PCT ? C.bad : C.ink }}>{nf(p.litPar, 1)}</td><td>{brl(p.custoTot)}</td><td>{brl(p.custoPar)}</td><td>{nf(p.perdaKm, 1)}</td><td>{p.tempo ? hms(p.tempo) : '—'}</td>
            <td className="font-extrabold" style={{ color: p.pctPerdaKm > META_PCT ? C.bad : C.ok }}>{pct(p.pctPerdaKm, 1)}</td>
            <td><span className="px-2 py-1 rounded-md text-[10px] font-extrabold whitespace-nowrap" style={{ background: dentro ? '#eaf3ee' : fora ? '#f6e8e8' : '#f8f2e4', color: dentro ? C.ok : fora ? C.bad : '#9a7a1c' }}>{dentro ? 'Dentro' : fora ? 'Fora' : `Fora ${p.fora}/${p.n}`}</span></td></tr>); })}</tbody>
          <tfoot><tr className="text-center font-extrabold bg-[#f6f8fb] border-t border-[#e5eaf1]"><td colSpan={2} className="px-2.5 py-2 text-left">Total</td><td>{nf(M.km, 1)}</td><td>{nf(M.litMov, 1)}</td><td>{brl(M.custoMov)}</td><td>{M.litMov ? nf(M.km / M.litMov, 2) : '—'}</td><td>{nf(M.litTot, 1)}</td><td>{nf(M.kmL, 2)}</td><td>{nf(M.litPar, 1)}</td><td>{brl(M.custoTot)}</td><td>{brl(M.custoPar)}</td><td>{nf(M.perdaKm, 1)}</td><td>{hms(M.tempo)}</td><td>{pct(M.pctPerdaKm, 1)}</td><td /></tr></tfoot></table></div>}
      </div>
    </div>);
}
