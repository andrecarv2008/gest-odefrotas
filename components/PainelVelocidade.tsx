import React from 'react';
import * as XLSX from 'xlsx';
import { kvGet, kvSet } from '@/lib/idbkv';
import { loadEmbedded } from '@/lib/persist';
import { saveWorkbook } from '@/lib/saveFile';

/* ============ dados ============ */
interface Inf { d: string; fil: string; mot: string; pl: string; v: number; lim: number; trat: string; loc: string }
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DSEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const nf = (n: number, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

type Faixa = 'seguro' | 'atencao' | 'grave' | 'gravissimo';
const FX: Record<Faixa, { l: string; r: string; c: string; bg: string }> = {
  seguro: { l: 'Seguro', r: 'até 79 km/h', c: '#5b8f74', bg: '#eef5f1' },
  atencao: { l: 'Atenção', r: '80 a 89 km/h', c: '#c49a3a', bg: '#f8f2e4' },
  grave: { l: 'Grave', r: '90 a 99 km/h', c: '#c4713a', bg: '#f8ede4' },
  gravissimo: { l: 'Gravíssimo', r: '≥ 100 km/h', c: '#b64545', bg: '#f6e8e8' },
};
const faixaOf = (v: number): Faixa => (v >= 100 ? 'gravissimo' : v >= 90 ? 'grave' : v >= 80 ? 'atencao' : 'seguro');

function parseDate(v: any): string | null {
  if (v instanceof Date && !isNaN(+v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v ?? '').trim(); if (!s) return null;
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
const numv = (v: any) => { if (typeof v === 'number') return v; const x = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(x) ? x : 0; };

import velB64 from '@/src/vel.gz.b64.txt?raw';
async function baseOficial(): Promise<Inf[]> {
  const bin = atob(velB64.trim()); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const rows: any[][] = JSON.parse(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  return rows.map(r => ({ d: r[0], fil: r[1], mot: r[2], pl: r[3], v: r[4], lim: 80, trat: r[5], loc: '' }));
}
function fromSheet(rows: any[]): Inf[] {
  if (!rows.length) return [];
  const H: Record<string, string> = {}; Object.keys(rows[0]).forEach(k => { const n = norm(k); if (!(n in H)) H[n] = k; });
  const find = (...c: string[]) => { for (const x of c) { if (H[x]) return H[x]; } const k = Object.keys(H).find(h => c.some(x => h.includes(x))); return k ? H[k] : ''; };
  const cV = find('infracaokm', 'velocidaderegistrada', 'velocidadeatingida', 'velocidade', 'kmh', 'infracao'), cD = find('datadainfracao', 'data', 'datahora', 'ocorrencia', 'dia'), cF = find('filial', 'agrupamento', 'unidade', 'base'),
    cM = find('motorista', 'condutor', 'nome'), cP = find('placa', 'veiculo'), cL = find('limite'), cT = find('tratativa', 'tratamento', 'acao', 'medida'), cLoc = find('trecho', 'local', 'rodovia', 'rota');
  const miss = [!cV && 'velocidade', !cD && 'data', !cP && 'placa'].filter(Boolean);
  if (miss.length) throw new Error('Colunas não encontradas: ' + miss.join(', '));
  const out: Inf[] = [];
  for (const r of rows) {
    const d = parseDate(r[cD]); const v = numv(r[cV]); if (!d || !v) continue;
    out.push({ d, fil: String(r[cF] ?? '').trim().replace(/\.0$/, '') || '—', mot: String(r[cM] ?? '').replace(/\s+/g, ' ').trim().toUpperCase() || '(SEM MOTORISTA)',
      pl: String(r[cP] ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^([A-Z]{3})([0-9][A-Z0-9][0-9]{2})$/, '$1-$2'), v, lim: cL ? numv(r[cL]) || 80 : 80,
      trat: String(r[cT] ?? '').trim(), loc: String(r[cLoc] ?? '').trim() });
  }
  return out;
}

/* ============ velocímetro ============ */
const GMAX = 160;
const SEG: [number, number, string][] = [[0, 80, '#22c55e'], [80, 90, '#facc15'], [90, 100, '#f97316'], [100, GMAX, '#ef4444']];
const pt = (v: number, r: number) => { const t = (Math.PI * (GMAX - v)) / GMAX; return [60 + r * Math.cos(t), 62 - r * Math.sin(t)]; };
const arc = (a: number, b: number, r: number) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };
function Gauge({ value, label }: { value: number; label?: string }) {
  const target = -90 + (Math.min(Math.max(value, 0), GMAX) / GMAX) * 180;
  const [ang, setAng] = React.useState(-90);
  React.useEffect(() => { const t = setTimeout(() => setAng(target), 80); return () => clearTimeout(t); }, [target]);
  const c = SEG.find(x => value >= x[0] && value < x[1])?.[2] || '#ef4444';
  return (
    <svg viewBox="0 0 120 76" className="w-[136px] shrink-0" role="img" aria-label={`Velocímetro: ${Math.round(value)} km/h`}>
      {SEG.map(([a, b, col]) => <path key={a} d={arc(a, b - (b === GMAX ? 0 : 0.6), 46)} fill="none" stroke={col} strokeWidth="9" />)}
      {[0, 40, 80, 120, 160].map(v => { const [x1, y1] = pt(v, 38), [x2, y2] = pt(v, 41.5), [tx, ty] = pt(v, 30); return (<g key={v}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth="1" /><text x={tx} y={ty + 2.5} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#94a3b8">{v}</text></g>); })}
      <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: '60px 62px', transition: 'transform 1.4s cubic-bezier(.22,1.25,.36,1)' }}>
        <polygon points="58.6,62 61.4,62 60,20" fill={c} />
      </g>
      <circle cx="60" cy="62" r="5" fill="#0b1c30" /><circle cx="60" cy="62" r="1.8" fill="#fff" />
      {label && <text x="60" y="75" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#64748b">{label}</text>}
    </svg>
  );
}

/* ============ multisseleção ============ */
export function MultiSel({ all, value, onChange, opts }: { all: string; value: string[]; onChange: (v: string[]) => void; opts: { v: string; l: string }[] }) {
  const [open, setOpen] = React.useState(false); const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const lab = !value.length ? all : value.length === 1 ? (opts.find(o => o.v === value[0])?.l || value[0]) : `${value.length} selecionados`;
  const tog = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className="border border-[#d3dae4] rounded-lg px-2.5 py-1.5 text-xs font-bold bg-white min-w-[150px] flex items-center justify-between gap-2" style={value.length ? { borderColor: '#004ac6', color: '#004ac6' } : undefined} aria-haspopup="listbox" aria-expanded={open}>
        <span>{lab}</span><span className="text-[9px]">▾</span>
      </button>
      {open && <div className="absolute z-30 mt-1 w-56 max-h-72 overflow-auto bg-white border border-[#d3dae4] rounded-xl shadow-lg p-1.5">
        <button type="button" onClick={() => onChange([])} className="w-full text-left px-2 py-1.5 rounded-md text-xs font-extrabold hover:bg-slate-50" style={{ color: value.length ? '#004ac6' : '#64748b' }}>{all}</button>
        <div className="my-1 border-t border-[#eef2f7]" />
        {opts.map(o => <label key={o.v} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"><input type="checkbox" checked={value.includes(o.v)} onChange={() => tog(o.v)} />{o.l}</label>)}
      </div>}
    </div>);
}

/* ============ componente ============ */
export default function PainelVelocidade() {
  const [all, setAll] = React.useState<Inf[] | null>(null);
  const [msg, setMsg] = React.useState('');
  const [mesS, setMesS] = React.useState<string[]>([]);  // YYYY-MM (vazio = todos)
  const [filS, setFilS] = React.useState<string[]>([]);
  const mes = mesS.length === 1 ? mesS[0] : '';           // mês único (habilita comparação com o anterior)
  const fil = filS.join(',');
  const setMes = (v: string) => setMesS(v ? [v] : []);
  const setFil = (v: string) => setFilS(v ? [v] : []);
  const [fx, setFx] = React.useState<Faixa | ''>('');
  const [q, setQ] = React.useState('');
  const [rank, setRank] = React.useState<'mais' | 'menos'>('mais');
  const [pg, setPg] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const iniRef = React.useRef(false);
  const [pA, setPA] = React.useState(''); const [pB, setPB] = React.useState('');
  const [rkey, setRkey] = React.useState<'mot' | 'pl'>('mot');
  const [rOpen, setROpen] = React.useState(() => { try { return localStorage.getItem('vel_reinc_open') !== '0'; } catch { return true; } });
  const toggleR = () => setROpen(o => { try { localStorage.setItem('vel_reinc_open', o ? '0' : '1'); } catch {} return !o; });

  React.useEffect(() => { (async () => {
    let saved: any = null; try { saved = await kvGet('vel'); } catch {}
    if (!(Array.isArray(saved) && saved.length)) { try { const e = await loadEmbedded(); if (e && Array.isArray(e.vel)) saved = e.vel; } catch {} }
    if (!(Array.isArray(saved) && saved.length)) { try { saved = await baseOficial(); } catch {} }
    setAll(Array.isArray(saved) ? saved : []);
  })(); }, []);

  const meses = React.useMemo(() => Array.from(new Set((all || []).map(r => r.d.slice(0, 7)))).sort(), [all]);
  React.useEffect(() => { if (meses.length && mesS.some(k => !meses.includes(k))) setMesS(a => a.filter(k => meses.includes(k))); if (meses.length && mes === '' && !iniRef.current) { iniRef.current = true; setMes(meses[meses.length - 1]); setPB('m:' + meses[meses.length - 1]); setPA('m:' + (meses[meses.length - 2] || meses[meses.length - 1])); } }, [meses]);
  const filiais = React.useMemo(() => Array.from(new Set((all || []).map(r => r.fil))).sort(), [all]);
  const mLabel = (k: string) => { const [y, m] = k.split('-'); return `${MESES[+m - 1].slice(0, 3)}/${y}`; };

  const baseSemMes = React.useMemo(() => (all || []).filter(r => (!filS.length || filS.includes(r.fil)) && (!fx || faixaOf(r.v) === fx) && (!q || (r.pl + r.mot).toLowerCase().includes(q.toLowerCase()))), [all, filS, fx, q]);
  const rows = React.useMemo(() => baseSemMes.filter(r => !mesS.length || mesS.includes(r.d.slice(0, 7))), [baseSemMes, mesS]);
  const mesLbl = mesS.length ? mesS.map(mLabel).join(', ') : 'todos os meses';
  const prevMes = mes ? meses[meses.indexOf(mes) - 1] : '';
  const prevRows = React.useMemo(() => prevMes ? baseSemMes.filter(r => r.d.startsWith(prevMes)) : [], [baseSemMes, prevMes]);

  const stats = (list: Inf[]) => {
    const pl = new Set(list.map(r => r.pl)), mo = new Set(list.map(r => r.mot));
    const comTrat = list.filter(r => r.trat && !/^(n[aã]o tratado|sem retorno)$/i.test(r.trat)).length;
    return { n: list.length, pl: pl.size, mo: mo.size, max: list.reduce((a, r) => Math.max(a, r.v), 0), avg: list.length ? list.reduce((a, r) => a + r.v, 0) / list.length : 0, trat: list.length ? (comTrat / list.length) * 100 : 0 };
  };
  const S = React.useMemo(() => stats(rows), [rows]); const P = React.useMemo(() => stats(prevRows), [prevRows]);

  const anosL = React.useMemo(() => Array.from(new Set(meses.map(k => k.slice(0, 4)))), [meses]);
  const pOpts = React.useMemo(() => [...meses.slice().reverse().map(k => ({ v: 'm:' + k, l: mLabel(k) })), ...anosL.slice().reverse().map(y => ({ v: 'y:' + y, l: 'Ano ' + y + ' (completo)' }))], [meses, anosL]);
  const pLabel = (v: string) => (pOpts.find(o => o.v === v)?.l || '—');
  const pRows = (v: string) => { const k = v.slice(2); return baseSemMes.filter(r => r.d.startsWith(k)); };
  const reinc = (list: Inf[], by: 'mot' | 'pl') => {
    const m = new Map<string, { k: string; fil: string; n: number; dias: Set<string>; max: number; pl: Set<string>; mot: Set<string> }>();
    list.forEach(r => { if (by === 'mot' && r.mot === '(SEM MOTORISTA)') return; const k = by === 'mot' ? r.mot : r.pl; const o = m.get(k) || { k, fil: r.fil, n: 0, dias: new Set(), max: 0, pl: new Set(), mot: new Set() }; o.n++; o.dias.add(r.d); o.max = Math.max(o.max, r.v); o.pl.add(r.pl); o.mot.add(r.mot); m.set(k, o); });
    const all = [...m.values()]; const re = all.filter(o => o.n >= 2);
    return { total: all.length, re: re.length, rate: all.length ? (re.length / all.length) * 100 : 0, f2: re.filter(o => o.n === 2).length, f34: re.filter(o => o.n >= 3 && o.n <= 4).length, f5: re.filter(o => o.n >= 5).length,
      share: list.length ? (re.reduce((a, o) => a + o.n, 0) / list.length) * 100 : 0, top: [...re].sort((a, b) => b.n - a.n || b.max - a.max).slice(0, 8) };
  };
  const cmpP = React.useMemo(() => {
    const mk = (v: string) => { const l = v ? pRows(v) : []; const st = stats(l); const c = { seguro: 0, atencao: 0, grave: 0, gravissimo: 0 }; l.forEach(r => c[faixaOf(r.v)]++); return { st, c, g: c.grave + c.gravissimo, re: reinc(l, rkey) }; };
    return { a: mk(pA), b: mk(pB) };
  }, [baseSemMes, pA, pB, rkey]);
  const rcur = React.useMemo(() => reinc(rows, rkey), [rows, rkey]);

  const porFaixa = React.useMemo(() => { const c = { seguro: 0, atencao: 0, grave: 0, gravissimo: 0 }; rows.forEach(r => c[faixaOf(r.v)]++); return c; }, [rows]);
  const porFilial = React.useMemo(() => { const m = new Map<string, Record<Faixa, number>>(); rows.forEach(r => { const o = m.get(r.fil) || { seguro: 0, atencao: 0, grave: 0, gravissimo: 0 }; o[faixaOf(r.v)]++; m.set(r.fil, o); });
    return [...m.entries()].map(([f, o]) => ({ f, o, t: o.seguro + o.atencao + o.grave + o.gravissimo })).sort((a, b) => b.t - a.t); }, [rows]);
  const rankMot = React.useMemo(() => { const m = new Map<string, { mot: string; fil: string; n: number; max: number; pl: Set<string> }>();
    rows.forEach(r => { const k = r.mot + '|' + r.fil; const o = m.get(k) || { mot: r.mot, fil: r.fil, n: 0, max: 0, pl: new Set() }; o.n++; o.max = Math.max(o.max, r.v); o.pl.add(r.pl); m.set(k, o); });
    const a = [...m.values()].sort((x, y) => (rank === 'mais' ? y.n - x.n : x.n - y.n) || y.max - x.max); return a.slice(0, 10); }, [rows, rank]);
  const rankPl = React.useMemo(() => { const m = new Map<string, { pl: string; fil: string; n: number; max: number }>();
    rows.forEach(r => { const o = m.get(r.pl) || { pl: r.pl, fil: r.fil, n: 0, max: 0 }; o.n++; o.max = Math.max(o.max, r.v); m.set(r.pl, o); });
    return [...m.values()].sort((a, b) => b.n - a.n || b.max - a.max).slice(0, 10); }, [rows]);
  const serie = React.useMemo(() => meses.slice(-12).map(k => ({ k, n: baseSemMes.filter(r => r.d.startsWith(k)).length, g: baseSemMes.filter(r => r.d.startsWith(k) && r.v >= 90).length })), [meses, baseSemMes]);
  const dsem = React.useMemo(() => { const c = [0, 0, 0, 0, 0, 0, 0]; rows.forEach(r => c[new Date(r.d + 'T12:00:00').getDay()]++); return c; }, [rows]);
  const dsemG = React.useMemo(() => { const c = [0, 0, 0, 0, 0, 0, 0]; rows.forEach(r => { if (r.v >= 90) c[new Date(r.d + 'T12:00:00').getDay()]++; }); return c; }, [rows]);
  const [vis, setVis] = React.useState<'mes' | 'sem'>('mes');

  const mser = React.useMemo(() => meses.slice(-14).map(k => { const l = baseSemMes.filter(r => r.d.startsWith(k)); return { k, n: l.length, g: l.filter(r => r.v >= 90).length }; }), [meses, baseSemMes]);

  const tabela = React.useMemo(() => [...rows].sort((a, b) => b.v - a.v || (a.d < b.d ? 1 : -1)), [rows]);
  React.useEffect(() => setPg(0), [mesS, filS, fx, q]);
  const PER = 10; const pages = Math.max(1, Math.ceil(tabela.length / PER));

  /* ações */
  const onFile = async (f?: File | null) => {
    if (!f) return; setMsg('Lendo planilha…');
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      let recs: Inf[] = [];
      for (const sn of wb.SheetNames) { try { recs = fromSheet(XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' })); } catch (e) { if (sn === wb.SheetNames[wb.SheetNames.length - 1] && !recs.length) throw e; } if (recs.length) break; }
      if (!recs.length) throw new Error('Nenhuma infração válida encontrada (confira as colunas de data, placa e velocidade).');
      iniRef.current = false; setMesS([]); setFilS([]); setFx(''); setQ(''); setAll(recs); await kvSet('vel', recs);
      setMsg(`${nf(recs.length)} registros importados e salvos.`);
    } catch (e: any) { setMsg('Erro: ' + (e?.message || e)); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const limpar = async () => { if (!confirm('Remover os dados de velocidade importados?')) return; setAll([]); try { await kvSet('vel', []); } catch {} iniRef.current = false; setMesS([]); setMsg('Dados removidos.'); };
  const exportar = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Data', 'Filial', 'Motorista', 'Placa', 'Velocidade (km/h)', 'Limite', '% acima', 'Classificação', 'Tratativa'],
      ...tabela.map(r => [r.d.split('-').reverse().join('/'), r.fil, r.mot, r.pl, r.v, r.lim, +(((r.v - r.lim) / r.lim) * 100).toFixed(1), FX[faixaOf(r.v)].l, r.trat])]), 'Infrações');
    saveWorkbook(wb, `excesso-velocidade-${mesS.length ? mesS.join('_') : 'todos'}.xlsx`);
  };
  const modelo = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['DATA', 'FILIAL', 'MOTORISTA', 'PLACA', 'VELOCIDADE', 'LIMITE', 'TRATATIVA'], ['15/04/2026', '87', 'NOME DO MOTORISTA', 'ABC-1234', 85, 80, 'VERBAL']]), 'Modelo'); saveWorkbook(wb, 'modelo-excesso-velocidade.xlsx'); };

  /* ui helpers */
  const card = 'bg-white border border-[#d3dae4] rounded-2xl shadow-xs';
  const Var = ({ a, b, inv = true }: { a: number; b: number; inv?: boolean }) => { if (!prevMes || !b) return null; const d = ((a - b) / b) * 100; const bad = inv ? d > 0 : d < 0;
    return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md" style={{ background: Math.abs(d) < 0.05 ? '#f1f5f9' : bad ? '#f6e8e8' : '#eaf3ee', color: Math.abs(d) < 0.05 ? '#64748b' : bad ? '#b64545' : '#5b8f74' }}>{d > 0 ? '▲' : d < 0 ? '▼' : '•'} {nf(Math.abs(d), 0)}%</span>; };
  const Kpi = ({ t, v, u, sub, ac, extra, side }: { t: string; v: string; u?: string; sub: string; ac: string; extra?: React.ReactNode; side?: React.ReactNode }) => (
    <div className={card + ' p-4'} style={{ borderTop: '3px solid #cfd8e3' }} data-ac={ac}>
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 flex justify-between items-center">{t}{extra}</div>
      <div className="mt-1.5 flex items-center justify-between gap-1"><div className="flex items-baseline gap-1.5"><span className="text-3xl font-black text-[#0b1c30]">{v}</span>{u && <span className="text-xs font-bold text-slate-400">{u}</span>}</div>{side}</div>
      <div className="text-[11px] text-slate-500 font-semibold mt-1">{sub}</div>
    </div>);
  const sel = 'border border-[#d3dae4] rounded-lg px-2.5 py-1.5 text-xs font-bold bg-white';
  const chip = (on: boolean, c = '#004ac6') => ({ background: on ? c : '#fff', color: on ? '#fff' : '#475569', borderColor: on ? c : '#d3dae4' });

  if (all === null) return <div className="p-10 text-center text-slate-400 text-sm">Carregando…</div>;

  /* estado vazio */
  if (!all.length) return (
    <div className="max-w-2xl mx-auto mt-8 text-center space-y-4">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      <div className={card + ' p-8'}>
        <div className="text-4xl mb-2">🚦</div>
        <h2 className="text-xl font-black text-[#0b1c30]">Excesso de Velocidade</h2>
        <p className="text-sm text-slate-500 mt-2">Importe a planilha de infrações para montar o painel: totais, faixas de gravidade, rankings de motoristas e placas, evolução semanal e mapeamento completo.</p>
        <p className="text-[11px] text-slate-500 mt-3"><b>Colunas reconhecidas:</b> DATA, FILIAL, MOTORISTA, PLACA, VELOCIDADE, LIMITE (opcional, padrão 80) e TRATATIVA (opcional).</p>
        <div className="flex gap-2 justify-center mt-5 flex-wrap">
          <button className="px-4 py-2 rounded-lg bg-[#004ac6] text-white text-sm font-extrabold" onClick={() => fileRef.current?.click()}>Importar planilha</button>
          <button className="px-4 py-2 rounded-lg border border-[#d3dae4] text-sm font-extrabold text-slate-600" onClick={modelo}>Baixar modelo</button>
        </div>
        {msg && <p className="text-xs font-bold text-amber-700 mt-3">{msg}</p>}
      </div>
    </div>);

  const maxF = Math.max(...porFilial.map(x => x.t), 1);
  const mx = Math.max(...serie.map(s => s.n), 1);
  const mxD = Math.max(...dsem, 1);
  const pctBase = Math.max(S.n, 1);

  // gráfico mensal
  const MW = 760, MH = 250, mpl = 36, mpr = 36, mpt = 34, mpb = 26;
  const mmax = Math.max(...mser.map(m => m.n), 1);
  const MX = (i: number) => mpl + (mser.length > 1 ? (i / (mser.length - 1)) * (MW - mpl - mpr) : (MW - mpl - mpr) / 2);
  const MY = (v: number) => MH - mpb - (v / (mmax * 1.18)) * (MH - mpb - mpt);

  return (
    <div className="space-y-5" data-testid="vel">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      {/* cabeçalho */}
      <section className={card + ' p-5'}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-[10px] font-extrabold text-[#737686] uppercase tracking-widest">Segurança viária</h2>
            <h3 className="text-2xl font-black text-[#0b1c30] leading-tight">Excesso de Velocidade</h3>
            <p className="text-xs text-slate-500 mt-0.5">{nf(all.length)} registros · {mLabel(meses[0])} a {mLabel(meses[meses.length - 1])} · limite de referência 80 km/h</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button className="gm-adm px-3 py-1.5 rounded-lg bg-[#004ac6] text-white text-xs font-extrabold" onClick={() => fileRef.current?.click()}>Importar planilha</button>
            <button className="px-3 py-1.5 rounded-lg border border-[#d3dae4] text-xs font-extrabold text-slate-600" onClick={exportar}>Exportar Excel</button>
            <button className="px-3 py-1.5 rounded-lg border border-[#d3dae4] text-xs font-extrabold text-slate-600" onClick={() => window.print()}>Imprimir / PDF</button>
            <button className="gm-adm px-3 py-1.5 rounded-lg border border-red-200 text-xs font-extrabold text-red-600" onClick={limpar}>Limpar dados</button>
          </div>
        </div>
        {msg && <p className="text-xs font-bold text-emerald-700 mt-2">{msg}</p>}
        <div className="flex flex-wrap gap-2 items-center mt-4 pt-4 border-t border-[#eef2f7]">
          <MultiSel all="Todos os meses" value={mesS} onChange={setMesS} opts={meses.slice().reverse().map(k => ({ v: k, l: mLabel(k) }))} />
          <MultiSel all="Todas as filiais" value={filS} onChange={setFilS} opts={filiais.map(f => ({ v: f, l: 'Filial ' + f }))} />
          <div className="flex gap-1.5 flex-wrap">
            <button className="px-3 py-1.5 rounded-full border text-[11px] font-extrabold" style={chip(fx === '')} onClick={() => setFx('')}>Todas as faixas</button>
            {(Object.keys(FX).filter(k => k !== 'seguro') as Faixa[]).map(k => <button key={k} className="px-3 py-1.5 rounded-full border text-[11px] font-extrabold" style={chip(fx === k, FX[k].c)} onClick={() => setFx(fx === k ? '' : k)}>{FX[k].l}</button>)}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar placa ou motorista…" className={sel + ' min-w-[200px] font-semibold'} />
        </div>
      </section>

      {!rows.length ? <div className={card + ' p-10 text-center text-sm text-slate-400'}>Nenhuma infração para os filtros selecionados.</div> : <>
      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi t="Total de infrações" v={nf(S.n)} sub={prevMes ? `vs ${mLabel(prevMes)}: ${nf(P.n)}` : 'volume acumulado'} ac="#004ac6" extra={<Var a={S.n} b={P.n} />} />
        <Kpi t="Placas infratoras" v={nf(S.pl)} u="veículos" sub={`${nf(S.n / Math.max(S.pl, 1), 1)} infrações por placa`} ac="#64748b" extra={<Var a={S.pl} b={P.pl} />} />
        <Kpi t="Motoristas infratores" v={nf(S.mo)} u="condutores" sub={`${nf(S.n / Math.max(S.mo, 1), 1)} infrações por motorista`} ac="#64748b" extra={<Var a={S.mo} b={P.mo} />} />
        <Kpi t="Maior velocidade" v={nf(S.max)} u="km/h" sub="velocidade máxima registrada" ac="#b64545" side={<Gauge key={`max|${mes}|${fil}|${fx}|${q}`} value={S.max} />} />
        <Kpi t="Velocidade média" v={nf(S.avg, 1)} u="km/h" sub="média dos excessos" ac="#c49a3a" extra={<Var a={S.avg} b={P.avg} />} side={<Gauge key={`avg|${mes}|${fil}|${fx}|${q}`} value={S.avg} />} />
        <Kpi t="Taxa de tratativa" v={nf(S.trat, 1) + '%'} sub="infrações com tratativa registrada" ac="#5b8f74" extra={<Var a={S.trat} b={P.trat} inv={false} />} />
      </section>

      {/* filial + rankings */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className={card + ' p-5'}>
          <h4 className="text-sm font-black text-[#0b1c30]">Infrações por filial</h4><p className="text-[11px] text-slate-500 mb-3">Composição por faixa de gravidade</p>
          <div className="space-y-3">{porFilial.map(x => (
            <div key={x.f}><div className="flex justify-between text-[11px] font-extrabold text-slate-700"><span>Filial {x.f}</span><span>{nf(x.t)}</span></div>
              <div className="flex h-5 rounded overflow-hidden bg-[#eef2f7] mt-1" style={{ width: `${(x.t / maxF) * 100}%`, minWidth: 30 }}>
                {(['seguro', 'atencao', 'grave', 'gravissimo'] as Faixa[]).map(k => x.o[k] > 0 && <div key={k} title={`${FX[k].l}: ${x.o[k]}`} style={{ width: `${(x.o[k] / x.t) * 100}%`, background: FX[k].c }} className="text-[9px] font-black text-white flex items-center justify-center">{x.o[k] / x.t > 0.14 ? x.o[k] : ''}</div>)}
              </div></div>))}</div>
          <div className="flex flex-wrap gap-3 mt-4 text-[10px] font-bold text-slate-500">{(Object.keys(FX).filter(k => k !== 'seguro') as Faixa[]).map(k => <span key={k} className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm inline-block" style={{ background: FX[k].c }} />{FX[k].l}</span>)}</div>
        </div>

        <div className={card + ' p-5'}>
          <div className="flex justify-between items-start mb-3"><div><h4 className="text-sm font-black text-[#0b1c30]">Ranking de motoristas</h4><p className="text-[11px] text-slate-500">Top 10 por nº de infrações</p></div>
            <div className="flex gap-1">{(['mais', 'menos'] as const).map(k => <button key={k} onClick={() => setRank(k)} className="px-2.5 py-1 rounded-md border text-[10px] font-extrabold" style={chip(rank === k)}>{k === 'mais' ? 'Mais' : 'Menos'}</button>)}</div></div>
          <div className="space-y-2.5">{rankMot.map((m, i) => (
            <div key={m.mot + m.fil} className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md text-[10px] font-black flex items-center justify-center shrink-0" style={{ background: i === 0 && rank === 'mais' ? '#fee2e2' : '#f1f5f9', color: i === 0 && rank === 'mais' ? '#b64545' : '#64748b' }}>{i + 1}º</span>
              <div className="flex-1 min-w-0"><div className="text-[11px] font-extrabold text-slate-800 truncate" title={m.mot}>{m.mot}</div>
                <div className="h-1.5 bg-[#eef2f7] rounded mt-1"><div className="h-full rounded bg-[#004ac6]" style={{ width: `${(m.n / Math.max(...rankMot.map(z => z.n), 1)) * 100}%` }} /></div>
                <div className="text-[11px] font-semibold text-black mt-0.5">Filial {m.fil} · máx {m.max} km/h · {m.pl.size} placa(s)</div></div>
              <span className="text-xs font-black text-slate-800 shrink-0">{m.n}</span>
            </div>))}</div>
        </div>

        <div className={card + ' p-5'}>
          <h4 className="text-sm font-black text-[#0b1c30]">Infrações por placa</h4><p className="text-[11px] text-slate-500 mb-3">Top 10 veículos</p>
          <div className="space-y-2.5">{rankPl.map(p => (
            <div key={p.pl}><div className="flex justify-between items-center"><span className="text-[11px] font-black bg-[#f1f5f9] rounded px-1.5 py-0.5 text-slate-700 font-mono">{p.pl}</span><span className="text-[11px] font-semibold text-black">Filial {p.fil} · máx {p.max}</span><span className="text-xs font-black">{p.n}</span></div>
              <div className="h-1.5 bg-[#eef2f7] rounded mt-1"><div className="h-full rounded" style={{ width: `${(p.n / Math.max(...rankPl.map(z => z.n), 1)) * 100}%`, background: '#004ac6' }} /></div></div>))}</div>
        </div>
      </section>
      </>}

      {/* evolução */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className={card + ' p-5 lg:col-span-2'}>
          <div className="flex flex-wrap justify-between gap-2 items-start">
            <div><h4 className="text-sm font-black text-[#0b1c30]">{vis === 'mes' ? 'Evolução mensal de infrações' : 'Infrações por dia da semana'}</h4><p className="text-[11px] text-slate-500">{vis === 'mes' ? 'Mês a mês, com variação sobre o mês anterior · filtros de filial, faixa e busca se aplicam' : `Seleção atual (${mesLbl}) · mostra em que dias da semana as infrações se concentram`}</p></div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-1 p-0.5 rounded-lg bg-[#eef2f7]">{([['mes', 'Por mês'], ['sem', 'Por dia da semana']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setVis(k)} className="px-3 py-1 rounded-md text-[11px] font-extrabold" style={{ background: vis === k ? '#fff' : 'transparent', color: vis === k ? '#004ac6' : '#64748b', boxShadow: vis === k ? '0 1px 2px rgba(0,0,0,.1)' : 'none' }}>{l}</button>)}</div>
            <div className="flex gap-3 text-[11px] font-bold text-slate-500"><span><i className="inline-block w-4 border-t-[3px] border-[#004ac6] mr-1 align-middle" />Total</span><span><i className="inline-block w-4 border-t-[3px] border-[#b64545] mr-1 align-middle" />Graves + gravíssimos (≥ 90)</span></div></div>
          </div>
          {vis === 'sem' && (() => { const WX = (i: number) => mpl + (i / 6) * (MW - mpl - mpr); const dm = Math.max(...dsem, 1); const WY = (v: number) => MH - mpb - (v / (dm * 1.2)) * (MH - mpb - mpt); const top = dsem.indexOf(Math.max(...dsem)); return (
            <svg viewBox={`0 0 ${MW} ${MH}`} className="w-full mt-2">
              {[0, 0.5, 1].map(t => <line key={t} x1={mpl} x2={MW - mpr} y1={WY(dm * 1.2 * t)} y2={WY(dm * 1.2 * t)} stroke="#e5eaf1" />)}
              <rect x={WX(top) - 26} y={mpt - 6} width="52" height={MH - mpb - mpt + 6} rx="8" fill="#b64545" opacity="0.08" />
              {DSEM.map((d, i) => <text key={d} x={WX(i)} y={MH - 8} textAnchor="middle" fontSize="10.5" fontWeight={i === top ? 800 : 600} fill={i === top ? '#b64545' : '#64748b'}>{d}</text>)}
              <polyline fill="none" stroke="#b64545" strokeWidth="2" points={dsemG.map((v, i) => `${WX(i)},${WY(v)}`).join(' ')} />
              <polyline fill="none" stroke="#004ac6" strokeWidth="2.8" points={dsem.map((v, i) => `${WX(i)},${WY(v)}`).join(' ')} />
              {dsem.map((v, i) => (<g key={i}><circle cx={WX(i)} cy={WY(v)} r={i === top ? 5 : 3.5} fill="#fff" stroke="#004ac6" strokeWidth="2.2"><title>{`${DSEM[i]}: ${v} infrações (${dsemG[i]} graves/gravíssimas)`}</title></circle>
                <text x={WX(i)} y={WY(v) - 10} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#0b1c30">{v}</text>
                <circle cx={WX(i)} cy={WY(dsemG[i])} r="3" fill="#b64545" /><text x={WX(i)} y={WY(dsemG[i]) + 14} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#b64545">{dsemG[i]}</text></g>))}
            </svg>); })()}
          {vis === 'mes' && <div className="overflow-x-auto"><svg viewBox={`0 0 ${MW} ${MH}`} className="w-full mt-2" style={{ minWidth: Math.min(MW, 140 + mser.length * 56) }}>
            {[0, 0.5, 1].map(t => <line key={t} x1={mpl} x2={MW - mpr} y1={MY(mmax * 1.18 * t)} y2={MY(mmax * 1.18 * t)} stroke="#e5eaf1" />)}
            {mser.map((m, i) => (('m:' + m.k) === pA || ('m:' + m.k) === pB) && <rect key={'sel' + m.k} x={MX(i) - 22} y={mpt - 6} width="44" height={MH - mpb - mpt + 6} rx="8" fill={('m:' + m.k) === pB ? '#004ac6' : '#64748b'} opacity="0.09" />)}
            {mser.map((m, i) => <text key={m.k} x={MX(i)} y={MH - 8} textAnchor="middle" fontSize="10" fontWeight={mesS.includes(m.k) ? 800 : 600} fill={mesS.includes(m.k) ? '#004ac6' : '#64748b'}>{mLabel(m.k).replace('/20', '/')}</text>)}
            <polyline fill="none" stroke="#b64545" strokeWidth="2" strokeDasharray="0" points={mser.map((m, i) => `${MX(i)},${MY(m.g)}`).join(' ')} />
            <polyline fill="none" stroke="#004ac6" strokeWidth="2.8" points={mser.map((m, i) => `${MX(i)},${MY(m.n)}`).join(' ')} />
            {mser.map((m, i) => { const pv = i ? mser[i - 1].n : 0; const d = pv ? ((m.n - pv) / pv) * 100 : null; return (<g key={m.k}>
              <circle cx={MX(i)} cy={MY(m.n)} r={mesS.includes(m.k) ? 5 : 3.5} fill="#fff" stroke="#004ac6" strokeWidth="2.2"><title>{`${mLabel(m.k)}: ${m.n} infrações (${m.g} graves/gravíssimas)`}</title></circle>
              <text x={MX(i)} y={MY(m.n) - 9} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#0b1c30">{m.n}</text>
              {d !== null && <text x={MX(i)} y={MY(m.n) - 21} textAnchor="middle" fontSize="9" fontWeight="800" fill={d > 0 ? '#b64545' : d < 0 ? '#5b8f74' : '#94a3b8'}>{d > 0 ? '▲' : d < 0 ? '▼' : '•'}{nf(Math.abs(d), 0)}%</text>}
              <circle cx={MX(i)} cy={MY(m.g)} r="3" fill="#b64545" />
              <text x={MX(i)} y={MY(m.g) + 14} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#b64545">{m.g}</text></g>); })}
          </svg></div>}
        </div>

        <div className={card + ' p-5 flex flex-col'}>
          <h4 className="text-sm font-black text-[#0b1c30]">Faixas de gravidade</h4><p className="text-[11px] text-slate-500 mb-3">Clique para filtrar a tela por faixa</p>
          <div className="flex-1 flex flex-col gap-2.5 justify-between">
            {(Object.keys(FX).filter(k => k !== 'seguro') as Faixa[]).slice().reverse().map(k => (
              <button key={k} onClick={() => setFx(fx === k ? '' : k)} className="text-left rounded-xl px-3.5 py-2.5 border bg-white transition hover:shadow-sm flex-1" style={{ borderColor: fx === k ? FX[k].c : '#d3dae4', borderLeft: `4px solid ${FX[k].c}`, boxShadow: fx === k ? `0 0 0 1px ${FX[k].c}` : undefined }}>
                <div className="flex justify-between items-center">
                  <div><div className="text-[11px] font-black uppercase" style={{ color: FX[k].c }}>{FX[k].l}</div><div className="text-[10px] font-bold text-slate-500">{FX[k].r}</div></div>
                  <div className="text-right"><div className="text-2xl font-black leading-none" style={{ color: FX[k].c }}>{nf(porFaixa[k])}</div><div className="text-[10px] font-bold text-slate-500 mt-0.5">{nf((porFaixa[k] / pctBase) * 100, 1)}%</div></div>
                </div>
                <div className="h-1.5 bg-[#eef2f7] rounded mt-2"><div className="h-full rounded" style={{ width: `${(porFaixa[k] / pctBase) * 100}%`, background: FX[k].c }} /></div>
              </button>))}
          </div>
        </div>
      </section>

      {/* comparativo de períodos + reincidência */}
      <section className={card + ' p-5'}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div><h4 className="text-sm font-black text-[#0b1c30]">Comparativo de períodos</h4><p className="text-[11px] text-slate-500">Escolha dois meses ou dois anos quaisquer (ex.: Abr/2026 x Mai/2026, ou Ano 2025 x Ano 2026)</p></div>
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <select className={sel} value={pA} onChange={e => setPA(e.target.value)}>{pOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select><span className="text-slate-400">x</span>
            <select className={sel} value={pB} onChange={e => setPB(e.target.value)}>{pOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-[#e5eaf1]"><th className="text-left py-2">Indicador</th><th className="text-center px-3">{pLabel(pA).replace(' (completo)', '')}</th><th className="text-center px-3">{pLabel(pB).replace(' (completo)', '')}</th><th className="text-center px-3">Variação</th></tr></thead>
            <tbody>{([
              ['Infrações', cmpP.a.st.n, cmpP.b.st.n, 0, true], ['Graves + gravíssimos (≥ 90)', cmpP.a.g, cmpP.b.g, 0, true], ['Placas infratoras', cmpP.a.st.pl, cmpP.b.st.pl, 0, true],
              ['Motoristas infratores', cmpP.a.st.mo, cmpP.b.st.mo, 0, true], ['Velocidade média (km/h)', cmpP.a.st.avg, cmpP.b.st.avg, 1, true], ['Maior velocidade (km/h)', cmpP.a.st.max, cmpP.b.st.max, 0, true],
              ['Taxa de tratativa (%)', cmpP.a.st.trat, cmpP.b.st.trat, 1, false], [rkey === 'mot' ? 'Motoristas reincidentes' : 'Placas reincidentes', cmpP.a.re.re, cmpP.b.re.re, 0, true], ['Taxa de reincidência (%)', cmpP.a.re.rate, cmpP.b.re.rate, 1, true],
            ] as any[]).map(([t, a, b, dc, inv]) => { const d = a ? ((b - a) / a) * 100 : 0; const bad = inv ? d > 0 : d < 0; return (
              <tr key={t} className="border-b border-[#f0f3f8]"><td className="py-2.5 font-extrabold text-slate-700">{t}</td><td className="px-3 text-center text-slate-500 font-bold">{nf(a, dc)}</td><td className="px-3 text-center font-black text-[#0b1c30]">{nf(b, dc)}</td>
                <td className="px-3 text-center font-black whitespace-nowrap" style={{ color: Math.abs(d) < 0.05 ? '#94a3b8' : bad ? '#b64545' : '#5b8f74' }}>{a ? `${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${nf(Math.abs(d), 1)}%` : '—'}</td></tr>); })}</tbody>
          </table></div>
          <div>
            <div className="text-[10px] font-extrabold uppercase text-slate-500 mb-2">Infrações por faixa</div>
            <div className="space-y-3">{(['gravissimo', 'grave', 'atencao'] as Faixa[]).map(k => { const a = cmpP.a.c[k], b = cmpP.b.c[k]; const mxF = Math.max(cmpP.a.c.gravissimo, cmpP.a.c.grave, cmpP.a.c.atencao, cmpP.a.c.seguro, cmpP.b.c.gravissimo, cmpP.b.c.grave, cmpP.b.c.atencao, cmpP.b.c.seguro, 1); const d = a ? ((b - a) / a) * 100 : 0;
              return (<div key={k}><div className="flex justify-between text-[11px] font-extrabold"><span style={{ color: FX[k].c }}>{FX[k].l} <span className="text-slate-400 font-bold">{FX[k].r}</span></span>
                <span style={{ color: Math.abs(d) < 0.05 || !a ? '#94a3b8' : (k === 'seguro' ? d < 0 : d > 0) ? '#b64545' : '#5b8f74' }}>{a ? `${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${nf(Math.abs(d), 0)}%` : ''}</span></div>
                {[[a, 0.35, pA], [b, 1, pB]].map(([v, op, lab]: any, i) => <div key={i} className="flex items-center gap-2 mt-1"><div className="h-3.5 rounded" style={{ width: `${(v / mxF) * 100}%`, minWidth: v ? 3 : 0, background: FX[k].c, opacity: op }} /><span className="text-[10px] font-black text-slate-600">{nf(v)}</span></div>)}
              </div>); })}</div>
            <div className="flex gap-4 text-[10px] font-bold text-slate-500 mt-3"><span>Barra clara: {pLabel(pA).replace(' (completo)', '')}</span><span>Barra escura: {pLabel(pB).replace(' (completo)', '')}</span></div>
          </div>
        </div>
      </section>

      <section className={card + ' p-5'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h4 className="text-sm font-black text-[#0b1c30]">Reincidência</h4><p className="text-[11px] text-slate-500">Quem infringiu 2 vezes ou mais na seleção atual ({mesLbl})</p></div>
          <div className="flex gap-1.5 items-center">{rOpen && <><button className="px-3 py-1.5 rounded-full border text-[11px] font-extrabold" style={chip(rkey === 'mot')} onClick={() => setRkey('mot')}>Por motorista</button><button className="px-3 py-1.5 rounded-full border text-[11px] font-extrabold" style={chip(rkey === 'pl')} onClick={() => setRkey('pl')}>Por placa</button></>}
            <button type="button" onClick={toggleR} className="px-3 py-1.5 rounded-full border border-[#d3dae4] text-[11px] font-extrabold text-slate-600 bg-white">{rOpen ? '▲ Recolher' : '▼ Expandir'}</button></div>
        </div>
        {!rOpen && <p className="text-xs text-slate-500 mt-3"><b className="text-[#0b1c30]">{nf(rcur.rate, 1)}%</b> de reincidência · {nf(rcur.re)} de {nf(rcur.total)} {rkey === 'mot' ? 'motoristas' : 'placas'} · respondem por <b className="text-[#b64545]">{nf(rcur.share, 0)}%</b> das infrações</p>}
        {rOpen && <>
        {rkey === 'mot' && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-3 font-semibold">Nomes incompletos ou escritos de formas diferentes contam como pessoas distintas e reduzem a reincidência. Use "Por placa" como referência enquanto os nomes não forem padronizados.</p>}
        <div className="grid lg:grid-cols-3 gap-5 mt-4">
          <div className="space-y-3">
            <div className="rounded-xl p-4 bg-[#f8fafc] border border-[#e5eaf1]"><div className="text-[10px] font-extrabold uppercase text-slate-500">Taxa de reincidência</div><div className="text-3xl font-black text-[#0b1c30] mt-1">{nf(rcur.rate, 1)}%</div>
              <div className="text-[11px] text-slate-500 font-semibold">{nf(rcur.re)} de {nf(rcur.total)} {rkey === 'mot' ? 'motoristas' : 'placas'} infratores</div><div className="text-[11px] text-slate-500 font-semibold mt-1">Respondem por <b className="text-[#b64545]">{nf(rcur.share, 0)}%</b> das infrações</div></div>
            <div><div className="text-[10px] font-extrabold uppercase text-slate-500 mb-2">Perfil dos reincidentes</div>
              {[['2 infrações', rcur.f2, '#c49a3a'], ['3 a 4 infrações', rcur.f34, '#c4713a'], ['5 ou mais', rcur.f5, '#b64545']].map(([l, v, c]: any) => (
                <div key={l} className="flex items-center gap-2 mb-1.5"><span className="w-24 text-[11px] font-bold text-slate-600">{l}</span><div className="flex-1 h-3 bg-[#eef2f7] rounded"><div className="h-full rounded" style={{ width: `${rcur.re ? (v / rcur.re) * 100 : 0}%`, background: c }} /></div><span className="w-8 text-right text-[11px] font-black">{v}</span></div>))}</div>
          </div>
          <div className="lg:col-span-2 overflow-x-auto">
            {rcur.top.length === 0 ? <p className="text-xs text-slate-400 py-6 text-center">Nenhum reincidente na seleção atual.</p> : (
              <table className="w-full text-xs"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-[#e5eaf1]"><th className="text-left py-2">{rkey === 'mot' ? 'Motorista' : 'Placa'}</th><th className="px-3">Filial</th><th className="px-3">Infrações</th><th className="px-3">Dias distintos</th><th className="px-3">Máx. km/h</th><th className="px-3">{rkey === 'mot' ? 'Placas' : 'Motoristas'}</th></tr></thead>
                <tbody>{rcur.top.map(o => (<tr key={o.k} className="border-b border-[#f0f3f8] text-center"><td className="py-2.5 text-left font-extrabold text-slate-800">{o.k}</td><td className="px-3 font-bold">{o.fil}</td>
                  <td className="px-3"><span className="px-2 py-0.5 rounded-md font-black text-[11px]" style={{ background: o.n >= 5 ? '#fee2e2' : o.n >= 3 ? '#ffedd5' : '#fef3c7', color: o.n >= 5 ? '#b64545' : o.n >= 3 ? '#c4713a' : '#b45309' }}>{o.n}</span></td>
                  <td className="px-3 font-bold text-slate-600">{o.dias.size}</td><td className="px-3 font-black" style={{ color: FX[faixaOf(o.max)].c }}>{nf(o.max)}</td><td className="px-3 text-slate-500 font-semibold">{rkey === 'mot' ? o.pl.size : o.mot.size}</td></tr>))}</tbody></table>)}
          </div>
        </div>
        </>}
      </section>

      {/* tabela */}
      {rows.length > 0 && (
        <section className={card + ' overflow-hidden'}>
          <div className="px-5 py-4 flex justify-between items-center flex-wrap gap-2"><div><h4 className="text-sm font-black text-[#0b1c30]">Mapeamento geral de infrações</h4><p className="text-[11px] text-slate-500">Ordenado pela maior velocidade · {nf(tabela.length)} registros</p></div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600"><button disabled={pg === 0} onClick={() => setPg(p => p - 1)} className="px-2.5 py-1 border border-[#d3dae4] rounded-lg disabled:opacity-40">‹</button>Página {pg + 1} de {nf(pages)}<button disabled={pg >= pages - 1} onClick={() => setPg(p => p + 1)} className="px-2.5 py-1 border border-[#d3dae4] rounded-lg disabled:opacity-40">›</button></div></div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="bg-[#f1f5f9] text-[10px] uppercase text-slate-500"><th className="py-2.5 px-4 text-left">Data</th><th className="px-3">Filial</th><th className="px-3 text-left">Motorista</th><th className="px-3">Placa</th><th className="px-3">Velocidade</th><th className="px-3">Classificação</th><th className="px-3">Tratativa</th></tr></thead>
            <tbody>{tabela.slice(pg * PER, pg * PER + PER).map((r, i) => { const f = FX[faixaOf(r.v)]; const ac = ((r.v - r.lim) / r.lim) * 100; return (
              <tr key={i} className="border-t border-[#eef2f7] hover:bg-[#f8fafc] text-center">
                <td className="py-2.5 px-4 text-left font-bold text-slate-600 whitespace-nowrap">{r.d.split('-').reverse().join('/')}</td><td className="px-3 font-bold">{r.fil}</td>
                <td className="px-3 text-left font-extrabold text-slate-800">{r.mot}</td><td className="px-3 font-mono font-bold">{r.pl}</td>
                <td className="px-3"><b className="text-sm">{nf(r.v)} km/h</b><div className="text-[10px] font-bold" style={{ color: ac > 0 ? '#b64545' : '#5b8f74' }}>{ac > 0 ? '+' : ''}{nf(ac, 0)}% s/ limite ({r.lim})</div></td>
                <td className="px-3"><span className="px-2 py-1 rounded-md text-[10px] font-black uppercase" style={{ background: f.bg, color: f.c }}>{f.l}</span></td>
                <td className="px-3">{r.trat ? <span className="px-2 py-1 rounded-md text-[10px] font-extrabold bg-blue-50 text-blue-700">{r.trat}</span> : <span className="text-slate-300">—</span>}</td></tr>); })}</tbody>
          </table></div>
        </section>)}
    </div>
  );
}
