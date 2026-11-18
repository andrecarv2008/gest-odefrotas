'use client';
import React from 'react';
import { Chart, registerables } from 'chart.js';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas-pro';
import baseCss from './despesas/panel.css?raw';
import css from './medias/medias.css?raw';
import rowsRaw from './medias/rows.json';
import { saveFile, saveWorkbook } from '@/lib/saveFile';
import { loadEmbedded } from '@/lib/persist';
import { kvGet, kvSet } from '@/lib/idbkv';
import {
  Rec, Ag, fromArr, fromSheet, MES_ABR, MES_FULL, groupBy, kmlOf, cpkOf, metaOf, devOf, mode,
  ganhosPerdas, driverHistory, Driver, zero, add,
} from '@/lib/medias';

Chart.register(...registerables);

const nf = (d: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const n0 = nf(0), n1 = nf(1), n2 = nf(2);
const brl = (v: number) => (v < 0 ? '-' : '') + 'R$ ' + n2.format(Math.abs(v));
const brl0 = (v: number) => 'R$ ' + n0.format(v);
const kfmt = (v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : n0.format(v));
const esc = (s: string) => s;

const valueLabels: any = {
  id: 'valueLabels',
  afterDatasetsDraw(chart: any, _a: any, opts: any) {
    if (!opts || opts.display === false) return;
    const ctx = chart.ctx; ctx.save(); ctx.font = '700 10px Manrope, sans-serif'; ctx.fillStyle = opts.color || '#44546a';
    chart.data.datasets.forEach((ds: any, i: number) => {
      chart.getDatasetMeta(i).data.forEach((el: any, j: number) => {
        const v = ds.data[j]; if (v == null) return;
        const t = opts.fmt ? opts.fmt(v) : String(v);
        if (chart.options.indexAxis === 'y') { ctx.textAlign = 'left'; ctx.fillText(t, el.x + 6, el.y + 3); }
        else { ctx.textAlign = 'center'; ctx.fillText(t, el.x, el.y - 7); }
      });
    });
    ctx.restore();
  },
};

function Cv({ build, deps, cls }: { build: () => any; deps: any[]; cls?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const ch = new Chart(ref.current, build());
    return () => ch.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <div className={'mdchart ' + (cls || '')}><canvas ref={ref} /></div>;
}

const I = {
  fuel: <svg className="ico" viewBox="0 0 24 24"><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h4"/></svg>,
  coin: <svg className="ico" viewBox="0 0 24 24"><path d="M12 2v20M17 6.5C16 5 14 4.5 12 4.5c-2.5 0-4.5 1.2-4.5 3s1.8 2.6 4.5 3 4.5 1.2 4.5 3-2 3-4.5 3c-2.2 0-4.2-.7-5-2.5"/></svg>,
  road: <svg className="ico" viewBox="0 0 24 24"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/></svg>,
  gauge: <svg className="ico" viewBox="0 0 24 24"><path d="M3 15a9 9 0 1 1 18 0M12 15l4-5"/></svg>,
  target: <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>,
  list: <svg className="ico" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>,
  truck: <svg className="ico" viewBox="0 0 24 24"><path d="M1 6h13v10H1zM14 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>,
  user: <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>,
  pin: <svg className="ico" viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>,
  trend: <svg className="ico" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>,
  down: <svg className="ico" viewBox="0 0 24 24"><path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/></svg>,
  warn: <svg className="ico" viewBox="0 0 24 24"><path d="M12 3l10 18H2zM12 10v5M12 18v.5"/></svg>,
  award: <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></svg>,
  trophy: <svg className="ico" viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>,
  users: <svg className="ico" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>,
  filter: <svg className="ico" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>,
  search: <svg className="ico" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>,
  up: <svg className="ico" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="M12 3v12M7 8l5-5 5 5M4 17v3h16v-3"/></svg>,
  dl: <svg className="ico" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="M12 15V3M7 10l5 5 5-5M4 17v3h16v-3"/></svg>,
  sheet: <svg className="ico" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6"/></svg>,
  cam: <svg className="ico" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>,
  reset: <svg className="ico" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>,
  back: <svg className="ico" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>,
};

const EMPTY_F = { ano: '', mes: '', fil: '', pl: '', mod: '', sup: '', q: '' };
const uniq = (a: (string | number)[]) => [...new Set(a)].filter(x => x !== '' && x != null);

export default function PainelMedias() {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [all, setAll] = React.useState<Rec[] | null>(null);
  const [custom, setCustom] = React.useState(false);
  const [F, setF] = React.useState({ ...EMPTY_F });
  const [view, setView] = React.useState<'dash' | 'drv'>('dash');
  const [sel, setSel] = React.useState('');
  const [modal, setModal] = React.useState<{ t: 'pl' | 'rt'; k: string } | null>(null);
  const [cmp, setCmp] = React.useState<string[]>([]);
  const [tq, setTq] = React.useState('');
  const [ts, setTs] = React.useState<{ k: string; d: number }>({ k: 'n', d: -1 });
  const [pg, setPg] = React.useState(0);
  const [toast, setToast] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [fold, setFold] = React.useState<Record<string, boolean>>({});
  const tg = (k: string) => setFold(f => ({ ...f, [k]: !f[k] }));
  const FB = ({ k }: { k: string }) => <button type="button" className="fold" aria-expanded={!fold[k]} onClick={() => tg(k)}>{fold[k] ? '▼ Expandir' : '▲ Recolher'}</button>;
  const tt = React.useRef<any>(null);
  const say = (t: string, ms = 3500) => { setToast(t); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(''), ms); };

  React.useEffect(() => {
    if (!document.getElementById('dsp-plex')) {
      const l = document.createElement('link'); l.id = 'dsp-plex'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap';
      document.head.appendChild(l);
    }
    (async () => {
      const saved = await kvGet('medias');
      if (Array.isArray(saved) && saved.length && saved[0].mot !== undefined) { setAll(saved); setCustom(true); return; }
      // HTML baixado: base de médias importada vem embutida no próprio arquivo
      try {
        const emb = await loadEmbedded();
        if (emb && Array.isArray(emb.medias) && emb.medias.length && emb.medias[0].mot !== undefined) { setAll(emb.medias); setCustom(true); return; }
      } catch {}
      setAll((rowsRaw as any[]).map(fromArr).filter(Boolean) as Rec[]);
    })();
  }, []);

  const opts = React.useMemo(() => {
    const a = all || [];
    return {
      ano: uniq(a.map(r => r.ano)).sort() as number[],
      mes: (uniq(a.map(r => r.mes)) as number[]).sort((x, y) => x - y),
      fil: uniq(a.map(r => r.fil)).sort() as string[],
      pl: uniq(a.map(r => r.pl)).sort() as string[],
      mod: uniq(a.map(r => r.mod)).sort() as string[],
      sup: uniq(a.map(r => r.sup)).sort() as string[],
    };
  }, [all]);

  const rows = React.useMemo(() => {
    if (!all) return [] as Rec[];
    const q = F.q.trim().toUpperCase();
    return all.filter(r =>
      (!F.ano || r.ano === +F.ano) && (!F.mes || r.mes === +F.mes) && (!F.fil || r.fil === F.fil) &&
      (!F.pl || r.pl === F.pl) && (!F.mod || r.mod === F.mod) && (!F.sup || r.sup === F.sup) &&
      (!q || r.pl.includes(q) || r.mot.includes(q) || r.rota.toUpperCase().includes(q)));
  }, [all, F]);

  const D = React.useMemo(() => {
    const tot = zero(); rows.forEach(r => add(tot, r));
    const mm = groupBy(rows, r => String(r.mes));
    const months = [...mm.keys()].map(Number).sort((a, b) => a - b);
    const monthly = months.map(m => ({ m, ag: mm.get(String(m))! }));
    const fil = [...groupBy(rows, r => r.fil).entries()].map(([k, a]) => ({ k, kml: kmlOf(a) })).sort((a, b) => b.kml - a.kml);
    // placas
    const pm = new Map<string, { ag: Ag; dr: Set<string>; fil: string[]; mod: string[]; sup: string[] }>();
    for (const r of rows) {
      if (!r.pl) continue;
      let e = pm.get(r.pl); if (!e) { e = { ag: zero(), dr: new Set(), fil: [], mod: [], sup: [] }; pm.set(r.pl, e); }
      add(e.ag, r); e.dr.add(r.mot); e.fil.push(r.fil); e.mod.push(r.mod); e.sup.push(r.sup);
    }
    const plates = [...pm.entries()].map(([k, e]) => ({ k, ag: e.ag, nd: e.dr.size, fil: mode(e.fil), mod: mode(e.mod), sup: mode(e.sup) || '—' }));
    const piores = [...plates].sort((a, b) => devOf(b.ag) - devOf(a.ag)).slice(0, 5);
    const melhores = [...plates].sort((a, b) => kmlOf(b.ag) - kmlOf(a.ag)).slice(0, 5);
    const custo = [...plates].sort((a, b) => cpkOf(b.ag) - cpkOf(a.ag)).slice(0, 5);
    // rotas
    const rm = [...groupBy(rows, r => r.rota).entries()].map(([k, ag]) => ({ k, ag }));
    const rMais = [...rm].sort((a, b) => b.ag.l - a.ag.l).slice(0, 5);
    const rPior = [...rm].sort((a, b) => devOf(b.ag) - devOf(a.ag)).slice(0, 5);
    const rMelhor = [...rm].sort((a, b) => kmlOf(b.ag) - kmlOf(a.ag)).slice(0, 5);
    // modelos
    const mods = [...groupBy(rows, r => r.mod).entries()].map(([k, ag]) => ({ k, ag })).sort((a, b) => kmlOf(b.ag) - kmlOf(a.ag));
    const hist = driverHistory(rows);
    const drv5 = [...hist.all].sort((a, b) => kmlOf(b.ag) - kmlOf(a.ag) || a.ord - b.ord).slice(0, 5);
    return { tot, monthly, fil, plates, piores, melhores, custo, rMais, rPior, rMelhor, mods, hist, drv5, gp: ganhosPerdas(rows) };
  }, [rows]);

  const { tot } = D;
  const dentro = tot.d, fora = tot.f;
  const pctMeta = dentro + fora ? (dentro / (dentro + fora)) * 100 : 0;
  const vpl = tot.l ? tot.v / tot.l : 0;

  /* ---- tabela geral ---- */
  const tbl = React.useMemo(() => {
    const q = tq.trim().toUpperCase();
    let a = D.plates.filter(p => !q || p.k.includes(q) || p.fil.toUpperCase().includes(q) || p.mod.toUpperCase().includes(q) || p.sup.toUpperCase().includes(q));
    const val = (p: any): any => ({ k: p.k, fil: p.fil, mod: p.mod, sup: p.sup, nd: p.nd, n: p.ag.n, km: p.ag.km, l: p.ag.l, v: p.ag.v, kml: kmlOf(p.ag) } as any)[ts.k];
    a = [...a].sort((x, y) => { const A = val(x), B = val(y); return (typeof A === 'string' ? A.localeCompare(B) : A - B) * ts.d; });
    return a;
  }, [D.plates, tq, ts]);
  const PS = 50, pages = Math.max(1, Math.ceil(tbl.length / PS));
  React.useEffect(() => { setPg(0); }, [tq, ts, rows]);
  const sortBy = (k: string) => setTs(s => (s.k === k ? { k, d: -s.d } : { k, d: ['k', 'fil', 'mod', 'sup'].includes(k) ? 1 : -1 }));
  const arrow = (k: string) => (ts.k === k ? (ts.d < 0 ? ' ↓' : ' ↑') : '');

  const openDriver = (key: string) => { setSel(key); setView('drv'); setTimeout(() => rootRef.current?.scrollIntoView({ block: 'start' }), 30); };
  const setFv = (k: string, v: string) => setF(f => ({ ...f, [k]: v }));
  const nfilt = Object.entries(F).filter(([, v]) => v).length;

  /* ---- importação / exportação / print ---- */
  const importFile = async (file: File) => {
    setBusy(true); say('Lendo ' + file.name + '…', 8000);
    await new Promise(r => setTimeout(r, 60));
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, dense: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const recs = fromSheet(XLSX.utils.sheet_to_json(ws, { defval: null, raw: true }));
      if (!recs.length) throw new Error('Nenhuma linha válida (confira as colunas FILIAL, MÊS, MOTORISTA, PLACA, KM RODADO, LITROS ABASTECIDOS, VALOR ABASTECIDO R$).');
      setAll(recs); setCustom(true); setF({ ...EMPTY_F }); setView('dash'); setCmp([]);
      await kvSet('medias', recs);
      say('Base importada: ' + n0.format(recs.length) + ' viagens.', 4500);
    } catch (e: any) { say('Não foi possível importar: ' + (e?.message || e), 7000); }
    setBusy(false);
  };
  const resetBase = async () => {
    setAll((rowsRaw as any[]).map(fromArr).filter(Boolean) as Rec[]); setCustom(false); setF({ ...EMPTY_F }); setView('dash'); setCmp([]);
    await kvSet('medias', null); say('Base original restaurada.', 2500);
  };
  const exportXlsx = (only?: 'hist') => {
    const wb = XLSX.utils.book_new();
    const H = D.hist;
    const hrow = (e: Driver, i: number, side: string) => [i + 1, side, e.mot, e.fil, e.plates.join(', '), kmlOf(e.ag), e.ag.km, e.ag.n, side === 'Melhor' ? e.top10 : e.pior10];
    const hist = [['Posição', 'Grupo', 'Motorista', 'Filial', 'Placas', 'KM/L', 'KM rodados', 'Viagens', 'Vezes no Top'],
      ...H.melhores.map((e, i) => hrow(e, i, 'Melhor')), ...H.piores.map((e, i) => hrow(e, i, 'Pior'))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hist), 'Histórico motoristas');
    if (only !== 'hist') {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Indicador', 'Valor'],
        ['Litros abastecidos', tot.l], ['Valor abastecido (R$)', tot.v], ['KM rodados', tot.km], ['Média KM/L', kmlOf(tot)],
        ['Custo por KM (R$)', cpkOf(tot)], ['% dentro da meta', pctMeta], ['Viagens', tot.n]]), 'Resumo');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Mês', 'Litros', 'Valor (R$)', 'KM', 'KM/L'],
        ...D.monthly.map(x => [MES_FULL[x.m - 1], x.ag.l, x.ag.v, x.ag.km, kmlOf(x.ag)])]), 'Mensal');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Placa', 'Filial', 'Tipo', 'Supervisor', 'Motoristas', 'Viagens', 'KM rodado', 'Litros', 'Valor abastecido (R$)', 'KM/L', 'Meta KM/L', 'Custo/KM'],
        ...tbl.map(p => [p.k, p.fil, p.mod, p.sup, p.nd, p.ag.n, p.ag.km, p.ag.l, p.ag.v, kmlOf(p.ag), metaOf(p.ag) ?? '', cpkOf(p.ag)])]), 'Placas');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Motorista', 'Filial', 'Placas', 'Viagens', 'KM', 'Litros', 'KM/L', 'Vezes no Top 10', 'Vezes no Top 10 piores'],
        ...[...H.all].sort((a, b) => kmlOf(b.ag) - kmlOf(a.ag)).map(e => [e.mot, e.fil, e.plates.join(', '), e.ag.n, e.ag.km, e.ag.l, kmlOf(e.ag), e.top10, e.pior10])]), 'Motoristas');
    }
    saveWorkbook(wb, only === 'hist' ? 'historico-motoristas-kml.xlsx' : 'medias-combustivel.xlsx');
  };
  const printPanel = async () => {
    const el = rootRef.current; if (!el || busy) return;
    setBusy(true); say('Gerando imagem…', 8000);
    try {
      await new Promise(r => setTimeout(r, 80));
      const pd = 24, w = el.scrollWidth, h = el.scrollHeight, sc = Math.max(1, Math.min(2, 15000 / (h + 2 * pd)));
      const cv = await html2canvas(el, { scale: sc, backgroundColor: '#ffffff', useCORS: true, logging: false, x: -pd, y: -pd, width: w + 2 * pd, height: h + 2 * pd, windowWidth: w + 2 * pd, scrollX: 0, scrollY: 0, ignoreElements: (n: any) => n.classList && (n.classList.contains('actions') || n.classList.contains('toast')) } as any);
      const blob: Blob | null = await new Promise(r => cv.toBlob(r, 'image/png'));
      if (!blob) throw new Error('png');
      const d = new Date(), p = (x: number) => String(x).padStart(2, '0');
      await saveFile('painel-medias-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.png', blob);
    } catch { say('Não foi possível gerar a imagem.', 4000); }
    setBusy(false);
  };

  /* ---- subcomponentes ---- */
  const devCls = (d: number) => (d >= 20 ? 'r' : d > 0 ? 'y' : 'g');
  const Sel = ({ k, label, list, fmt }: { k: string; label: string; list: (string | number)[]; fmt?: (v: any) => string }) => (
    <div className="fld"><label>{label}</label>
      <select className={(F as any)[k] ? 'on' : ''} value={(F as any)[k]} onChange={e => setFv(k, e.target.value)}>
        <option value="">Todos</option>{list.map(v => <option key={v} value={v}>{fmt ? fmt(v) : v}</option>)}
      </select></div>
  );
  const Kpi = ({ c, t, ic, big, cap }: { c: string; t: string; ic: any; big: string; cap?: string }) => (
    <div className={'kpi s ' + c}><div className="lab"><span>{t}</span><span className="bico" style={{ background: 'var(--surface2)', color: 'currentColor' }}>{ic}</span></div>
      <div className="big" title={big} style={{ color: 'var(--ink)' }}>{big}</div>{cap && <div className="cap">{cap}</div>}</div>
  );
  const TopCard = ({ title, ic, head, body }: { title: string; ic: any; head: string[]; body: React.ReactNode }) => (
    <div className="panel mdtop"><div className="sechead" style={{ marginBottom: 6 }}><h3 className="mdh3">{ic}{title}</h3><span className="hint">Clique para detalhes</span></div>
      <table><thead><tr>{head.map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead><tbody>{body}</tbody></table></div>
  );

  /* ---- modal de placa / rota ---- */
  const renderModal = () => {
    if (!modal) return null;
    const isPl = modal.t === 'pl';
    const rs = rows.filter(r => (isPl ? r.pl === modal.k : r.rota === modal.k));
    const ag = zero(); rs.forEach(r => add(ag, r));
    const sub1 = [...groupBy(rs, r => (isPl ? r.mot : r.pl)).entries()].map(([k, a]) => ({ k, a })).sort((x, y) => y.a.km - x.a.km);
    const sub2 = isPl ? [...groupBy(rs, r => r.fil).entries()].map(([k, a]) => ({ k, a })).sort((x, y) => y.a.km - x.a.km)
      : [...groupBy(rs, r => r.mot).entries()].map(([k, a]) => ({ k, a })).sort((x, y) => y.a.km - x.a.km);
    const sub3 = isPl ? [...groupBy(rs, r => r.rota).entries()].map(([k, a]) => ({ k, a })).sort((x, y) => y.a.km - x.a.km).slice(0, 8) : [];
    const meta = metaOf(ag);
    const Tb = ({ title, ic, data, first, money, lim }: any) => (
      <div className="mdsub"><h5 style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{ic}{title}</h5>
        <div className="scroll"><table><thead><tr><th>{first}</th><th>KM total</th><th>Litros</th>{money ? <th>Valor R$</th> : <th>KM/L</th>}<th>Viagens</th></tr></thead>
          <tbody>{data.slice(0, lim || 99).map((x: any) => <tr key={x.k}><td style={{ whiteSpace: 'normal', maxWidth: 260 }}>{x.k}</td><td>{n0.format(x.a.km)}</td><td>{n0.format(x.a.l)}</td>
            {money ? <td>{brl0(x.a.v)}</td> : <td>{n2.format(kmlOf(x.a))}</td>}<td>{x.a.n}</td></tr>)}</tbody></table></div></div>
    );
    return (
      <div className="mdov" onClick={() => setModal(null)} data-nocap>
        <div className="mdmod" onClick={e => e.stopPropagation()} role="dialog">
          <div className="mdmh"><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{isPl ? I.truck : I.pin}<div><h3>{modal.k}</h3><p>{ag.n} registro{ag.n === 1 ? '' : 's'} encontrado{ag.n === 1 ? '' : 's'}</p></div></div>
            <button type="button" onClick={() => setModal(null)} aria-label="Fechar">×</button></div>
          <div className="mdmb">
            <div className="mdmini">
              <div><b>{n0.format(ag.km)}</b><small>KM total</small></div><div><b>{n0.format(ag.l)}</b><small>Litros total</small></div>
              <div><b>{brl(ag.v)}</b><small>Valor total</small></div><div><b>{n2.format(kmlOf(ag))}</b><small>KM/L realizado</small></div>
              <div><b>{meta != null ? n2.format(meta) : '—'}</b><small>Meta KM/L</small></div><div><b>{brl(cpkOf(ag))}</b><small>Custo/KM</small></div>
              <div><b>{ag.d}/{ag.n}</b><small>Dentro meta</small></div><div><b>{ag.d + ag.f ? n1.format((ag.d / (ag.d + ag.f)) * 100) : '0,0'}%</b><small>% na meta</small></div>
            </div>
            {isPl ? <Tb title="Motoristas que usaram esta placa" ic={I.user} data={sub1} first="Motorista" />
              : <Tb title="Placas que rodaram nesta rota" ic={I.truck} data={sub1} first="Placa" />}
            {isPl ? <Tb title="Filiais onde esta placa operou" ic={I.pin} data={sub2} first="Filial" money />
              : <Tb title="Motoristas nesta rota" ic={I.user} data={sub2} first="Motorista" lim={12} />}
            {isPl && <Tb title="Rotas percorridas (Top 8)" ic={I.pin} data={sub3} first="Rota" />}
          </div>
        </div>
      </div>
    );
  };

  /* ---- visão do motorista ---- */
  const renderDriver = () => {
    const H = D.hist; const e = H.map.get(sel);
    const SideList = ({ list, title, ic, p }: { list: Driver[]; title: string; ic: any; p?: boolean }) => (
      <div className="panel lst"><h3 className="mdh3" style={{ marginBottom: 6 }}>{ic}{title}</h3>
        {list.map((x, i) => <button type="button" key={x.key} className={'it' + (x.key === sel ? ' on' : '') + (p ? ' p' : '')} onClick={() => openDriver(x.key)}>
          <span className={'bdg ' + (p ? 'r' : 'g')}>{i + 1}º</span><span className="n">{x.mot}</span><b>{n2.format(kmlOf(x.ag))}</b></button>)}
      </div>);
    return (
      <div className="mdview">
        <div className="mdvh"><div className="l"><button type="button" className="btn sq" onClick={() => setView('dash')} aria-label="Voltar">{I.back}</button>
          <div><h2>Histórico de Motoristas — KM/L</h2><p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Ranking de Melhores e Piores Motoristas</p></div></div>
          <button type="button" className="btn" onClick={() => exportXlsx('hist')}>{I.dl}<span>Exportador</span></button></div>
        <div className="mdvgrid">
          <div className="mdside">
            <SideList list={H.melhores} title="Os 10 Melhores Motoristas (KM/L)" ic={I.award} />
            <SideList list={H.piores} title="Top 10 Piores Motoristas (KM/L)" ic={I.down} p />
          </div>
          {!e ? <div className="panel card"><div className="empty">Selecione um motorista na lista.</div></div> : (() => {
            const k = kmlOf(e.ag), meta = e.meta, ac = meta ? (k / meta - 1) * 100 : null;
            const rk = H.rank.get(e.key)!; const inB = H.melhores.indexOf(e), inW = H.piores.indexOf(e);
            const ms = e.months;
            return (<div className="mdview">
              <div className="panel card"><div className="mdid"><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><div className="av">{I.user}</div>
                <div><h2>{e.mot}</h2><p>Motorista · {e.plates.join(', ') || 'sem placa'} · {e.fil}</p></div></div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <span className="tag">{rk}º de {H.all.length} por KM/L no período</span>
                  {inB >= 0 && <span className="xx g">MELHOR MOTORISTA · {inB + 1}º</span>}{inW >= 0 && <span className="xx r">PIOR MOTORISTA · {inW + 1}º</span>}</div></div></div>
              <div className="mdkp">
                <div><small>KM/L</small><b style={{ color: 'var(--good)' }}>{n2.format(k)}</b></div><div><small>Rodados KM</small><b>{n0.format(e.ag.km)}</b></div>
                <div><small>Viagens</small><b>{e.ag.n}</b></div><div><small>Vezes no Top 10</small><b style={{ color: 'var(--good)' }}>{e.top10}x</b></div>
                <div><small>Vezes no Top 10 Piores</small><b style={{ color: 'var(--bad)' }}>{e.pior10}x</b></div></div>
              <div className="mdsm">
                <div className="panel card"><h3 className="mdh3">Evolução do KM/L Médio por Mês</h3>
                  <Cv cls="t" deps={[sel, rows]} build={() => ({ type: 'line', plugins: [valueLabels], data: { labels: ms.map(m => MES_ABR[m.mes - 1]), datasets: [{ data: ms.map(m => +m.kml.toFixed(2)), borderColor: '#1baf7a', backgroundColor: '#fff', pointBorderColor: '#1baf7a', pointBackgroundColor: '#fff', pointRadius: 4, tension: .3, borderWidth: 2.2 }] },
                    options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 18 } }, plugins: { legend: { display: false }, valueLabels: { fmt: (v: number) => n2.format(v) } }, scales: { y: { display: false, beginAtZero: true }, x: { grid: { display: false } } } } })} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="panel mdres"><h4>Resumo no Período</h4>
                    <div className="mdrow"><span>Litros Abastecidos</span><b>{n0.format(e.ag.l)}</b></div><div className="mdrow"><span>Valor Abastecido</span><b>{brl(e.ag.v)}</b></div>
                    <div className="mdrow"><span>Custo por KM</span><b>{brl(cpkOf(e.ag))}</b></div><div className="mdrow"><span>Média KM/L no Período</span><b>{n2.format(k)}</b></div>
                    <div className="mdrow"><span>Meta KM/L da Frota</span><b>{meta != null ? n2.format(meta) : '—'}</b></div>
                    <div className="mdrow"><span>% Acima da Meta</span><b className={ac != null && ac >= 0 ? 'pos' : 'neg'}>{ac != null ? (ac > 0 ? '+' : '') + n1.format(ac) + '%' : '—'}</b></div></div>
                  <div className="panel mdres"><h4>Classificação no Período</h4>
                    <div className="mdrow"><span>Melhor posição</span><b className="pos">{e.best}º</b></div><div className="mdrow"><span>Pior posição</span><b className="neg">{e.worst}º</b></div>
                    <div className="mdrow"><span>Média</span><b>{n1.format(e.avg)}º</b></div><div className="mdrow"><span>Vezes no Top 3</span><b className="pos">{e.top3}x</b></div>
                    <div className="mdrow"><span>Vezes entre 4º e 10º</span><b>{e.mid}x</b></div><div className="mdrow"><span>Vezes no Top 10 Piores</span><b className="neg">{e.pior10}x</b></div></div>
                </div></div>
              <div className="panel card"><h3 className="mdh3">Histórico de Posições no Ranking — Mês a Mês</h3>
                <div className="scroll"><table className="dt"><thead><tr><th>Mês</th><th>KM/L</th><th>Rodados KM</th><th>Viagens</th><th>Posição</th><th>Top 10</th><th>Top 10 Pior</th><th>% Acima Meta</th><th>Litros</th><th>Valor (R$)</th></tr></thead>
                  <tbody>{ms.map(m => { const a = m.meta ? (m.kml / m.meta - 1) * 100 : null; return <tr key={m.mes}>
                    <td>{MES_ABR[m.mes - 1]} / {rows.find(r => r.mes === m.mes)?.ano}</td><td className="f">{n2.format(m.kml)}</td><td>{n0.format(m.ag.km)}</td><td>{m.ag.n}</td>
                    <td><span className={'bdg ' + (m.pos <= 10 ? 'g' : '')} style={m.pos > 10 ? { background: 'var(--flat-bg)' } : undefined}>{m.pos}º</span></td>
                    <td className={m.pos <= 10 ? 'pos' : 'dim'}>{m.pos <= 10 ? '✓ Sim' : '—'}</td><td className={m.posPior <= 10 ? 'neg' : 'dim'}>{m.posPior <= 10 ? '✕ Sim' : '—'}</td>
                    <td className={a != null && a >= 0 ? 'pos' : 'neg'}>{a != null ? (a > 0 ? '+' : '') + n1.format(a) + ' %' : '—'}</td><td>{n0.format(m.ag.l)}</td><td>{brl(m.ag.v)}</td></tr>; })}</tbody></table></div></div>
            </div>);
          })()}
        </div>
      </div>
    );
  };

  /* ---- dashboard ---- */
  const modelCmp = D.mods.filter(m => cmp.includes(m.k));
  const renderDash = () => (<>
    <section className="panel filters" aria-label="Filtros">
      <div className="fhead"><div className="ftitle">{I.filter}Filtros</div>
        <div className="fsearch"><label className="input">{I.search}<input type="search" value={F.q} onChange={e => setFv('q', e.target.value)} placeholder="Buscar placa, motorista, rota..." aria-label="Pesquisa" /></label>
          <button type="button" className="btn" style={{ height: 38 }} onClick={() => setF({ ...EMPTY_F })}>{I.reset}Limpar Filtros</button><FB k="filtros" /></div></div>
      {fold.filtros ? <div className="tip" style={{ textAlign: 'left' }}>{nfilt ? nfilt + ' filtro' + (nfilt > 1 ? 's' : '') + ' ativo' + (nfilt > 1 ? 's' : '') : 'Nenhum filtro ativo'}</div> : <div className="fgrid">
        <Sel k="ano" label="Ano" list={opts.ano} /><Sel k="mes" label="Mês" list={opts.mes} fmt={v => MES_FULL[v - 1]} />
        <Sel k="fil" label="Filial" list={opts.fil} /><Sel k="pl" label="Placa" list={opts.pl} />
        <Sel k="mod" label="Tipo de veículo" list={opts.mod} /><Sel k="sup" label="Supervisão" list={opts.sup} />
      </div>}
    </section>

    {!rows.length ? <div className="panel card"><div className="empty">Nenhuma viagem para os filtros selecionados.</div></div> : <>
    <section className="kpis mdk" aria-label="Indicadores">
      <Kpi c="c-g" t="Litros Abastecidos" ic={I.fuel} big={n0.format(tot.l)} />
      <Kpi c="c-t" t="Valor Abastecido" ic={I.coin} big={brl(tot.v)} />
      <Kpi c="c-t" t="Preço Médio do Litro" ic={I.fuel} big={brl(vpl)} cap="Média ponderada pelos litros" />
      <Kpi c="c-f" t="Rodados KM" ic={I.road} big={n0.format(tot.km)} />
      <Kpi c="c-f" t="Média KM/Litro" ic={I.gauge} big={n2.format(kmlOf(tot))} />
      <Kpi c="c-g" t="Custo por KM" ic={I.coin} big={brl(cpkOf(tot))} />
      <Kpi c="c-t" t="Dentro da Meta" ic={I.target} big={n1.format(pctMeta) + '%'} cap={'R$ ' + n2.format(vpl) + '/L médio'} />
      <Kpi c="c-f" t="Viagens (Conhecimentos)" ic={I.list} big={n0.format(tot.n)} />
    </section>

    <section className="mdg3">
      <div className="panel card"><h3 className="mdh3">Consumo em Litros por Mês</h3>
        <Cv deps={[rows]} build={() => ({ type: 'bar', plugins: [valueLabels], data: { labels: D.monthly.map(x => MES_ABR[x.m - 1]), datasets: [{ data: D.monthly.map(x => Math.round(x.ag.l)), backgroundColor: '#eda100', borderRadius: 3, maxBarThickness: 36 }] },
          options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false }, valueLabels: { fmt: kfmt, color: '#b45309' }, tooltip: { callbacks: { label: (c: any) => ' ' + n0.format(c.parsed.y) + ' L' } } }, scales: { y: { display: false, beginAtZero: true }, x: { grid: { display: false } } } } })} /></div>
      <div className="panel card"><h3 className="mdh3">Valor Gasto por Mês (R$)</h3>
        <Cv deps={[rows]} build={() => ({ type: 'line', plugins: [valueLabels], data: { labels: D.monthly.map(x => MES_ABR[x.m - 1]), datasets: [{ data: D.monthly.map(x => Math.round(x.ag.v)), borderColor: '#13a3c4', backgroundColor: '#13a3c4', pointRadius: 3.5, tension: .35, borderWidth: 2.2 }] },
          options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 18, right: 14 } }, plugins: { legend: { display: false }, valueLabels: { fmt: (v: number) => 'R$' + kfmt(v), color: '#0b7285' }, tooltip: { callbacks: { label: (c: any) => ' ' + brl(c.parsed.y) } } }, scales: { y: { display: false, beginAtZero: true }, x: { grid: { display: false } } } } })} /></div>
      <div className="panel card"><h3 className="mdh3">Média KM/Litro por Mês</h3>
        <Cv deps={[rows]} build={() => ({ type: 'line', plugins: [valueLabels], data: { labels: D.monthly.map(x => MES_ABR[x.m - 1]), datasets: [{ data: D.monthly.map(x => +kmlOf(x.ag).toFixed(2)), borderColor: '#8b5cf6', backgroundColor: '#8b5cf6', pointRadius: 3.5, tension: .35, borderWidth: 2.2 }] },
          options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 18, right: 14 } }, plugins: { legend: { display: false }, valueLabels: { fmt: (v: number) => n2.format(v), color: '#6d28d9' } }, scales: { y: { display: false }, x: { grid: { display: false } } } } })} /></div>
    </section>

    <section className="mdg2">
      <div className="panel card"><h3 className="mdh3">Status vs Meta</h3>
        <div className="donut" style={{ height: 210 }}><Cv cls="" deps={[rows]} build={() => ({ type: 'doughnut', data: { labels: ['Dentro da Meta', 'Fora da Meta'], datasets: [{ data: [dentro, fora], backgroundColor: ['#22c55e', '#ef4444'], borderColor: '#fff', borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '62%', plugins: { legend: { display: false } } } })} />
          <div className="mid"><small>NA META</small><b>{n1.format(pctMeta)}%</b></div></div>
        <div className="legend" style={{ maxHeight: 'none' }}>
          <div><i style={{ background: '#22c55e' }} /><span>Dentro da Meta</span><span className="v">{n0.format(dentro)}</span><span className="p">{n0.format(dentro + fora ? (dentro / (dentro + fora)) * 100 : 0)}%</span></div>
          <div><i style={{ background: '#ef4444' }} /><span>Fora da Meta</span><span className="v">{n0.format(fora)}</span><span className="p">{n0.format(dentro + fora ? (fora / (dentro + fora)) * 100 : 0)}%</span></div></div></div>
      <div className="panel card"><h3 className="mdh3">KM/Litro por Filial</h3>
        <Cv deps={[rows]} build={() => ({ type: 'bar', plugins: [valueLabels], data: { labels: D.fil.map(x => x.k), datasets: [{ data: D.fil.map(x => +x.kml.toFixed(2)), backgroundColor: ['#8b5cf6', '#a45be0', '#c85fe0', '#e063d6', '#e86bb4', '#ef7390'].slice(0, D.fil.length), borderRadius: 4, maxBarThickness: 34 }] },
          options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { right: 40 } }, plugins: { legend: { display: false }, valueLabels: { fmt: (v: number) => n2.format(v) } }, scales: { x: { beginAtZero: true, grid: { color: '#eef1f5' } }, y: { grid: { display: false } } } } })} /></div>
    </section>

    <section className="panel card" aria-label="Tabela geral de placas">
      <div className="sechead"><div className="l"><div className="sico softb">{I.truck}</div><div><h2>Tabela Geral de Placas <span className="tag" style={{ marginLeft: 8 }}>{n0.format(tbl.length)} placas</span></h2><p>Clique em uma placa para ver os detalhes</p></div></div>
        <label className="input">{I.search}<input type="search" value={tq} onChange={e => setTq(e.target.value)} placeholder="Buscar por placa, filial, tipo ou supervisor..." aria-label="Buscar na tabela" style={{ width: 'min(300px,60vw)' }} /></label><FB k="placas" /></div>
      {!fold.placas && <><div className="scroll"><table className="dt mdt"><thead><tr>
        {([['k', 'Placa'], ['fil', 'Filial'], ['mod', 'Tipo'], ['sup', 'Supervisor'], ['nd', 'Motoristas'], ['n', 'Viagens'], ['km', 'KM rodado'], ['l', 'Litros'], ['v', 'Valor abastecido'], ['kml', 'Média KM/L']] as [string, string][]).map(([k, t]) => <th key={k} onClick={() => sortBy(k)} style={{ textAlign: ['k', 'fil', 'mod', 'sup'].includes(k) ? 'left' : 'right' }}>{t}{arrow(k)}</th>)}</tr></thead>
        <tbody>{tbl.slice(pg * PS, pg * PS + PS).map(p => <tr key={p.k} className="clk" onClick={() => setModal({ t: 'pl', k: p.k })}>
          <td>{p.k}</td><td style={{ textAlign: 'left', fontFamily: 'var(--f-ui)' }}>{p.fil}</td><td style={{ textAlign: 'left', fontFamily: 'var(--f-ui)' }}>{p.mod}</td><td style={{ textAlign: 'left', fontFamily: 'var(--f-ui)' }}>{p.sup}</td>
          <td>{p.nd}</td><td style={{ fontWeight: 700 }}>{p.ag.n}</td><td>{n0.format(p.ag.km)}</td><td>{n0.format(p.ag.l)}</td><td>{brl(p.ag.v)}</td><td style={{ fontWeight: 700 }}>{n2.format(kmlOf(p.ag))}</td></tr>)}</tbody></table></div>
      <div className="mdpg"><span>Página {pg + 1} de {pages}</span><button type="button" disabled={pg === 0} onClick={() => setPg(pg - 1)}>‹ Anterior</button><button type="button" disabled={pg >= pages - 1} onClick={() => setPg(pg + 1)}>Próxima ›</button></div></>}
    </section>

    <section className="mdg4">
      <TopCard title="Top 5 Piores Desempenho KM/L" ic={<span style={{ color: 'var(--bad)' }}>{I.down}</span>} head={['Placa', 'KM/L real', 'Meta', 'Desvio']}
        body={D.piores.map(p => <tr key={p.k} onClick={() => setModal({ t: 'pl', k: p.k })}><td>{p.k}</td><td style={{ textAlign: 'right' }}>{n2.format(kmlOf(p.ag))}</td><td style={{ textAlign: 'right' }}>{n2.format(metaOf(p.ag) || 0)}</td><td style={{ textAlign: 'right' }}><span className={'dev ' + devCls(devOf(p.ag))}>{n1.format(devOf(p.ag))} %</span></td></tr>)} />
      <TopCard title="Top 5 Melhores KM/L" ic={<span style={{ color: '#e8a200' }}>{I.award}</span>} head={['Placa', 'KM/L real', 'KM total', 'Litros']}
        body={D.melhores.map(p => <tr key={p.k} onClick={() => setModal({ t: 'pl', k: p.k })}><td>{p.k}</td><td style={{ textAlign: 'right' }}>{n2.format(kmlOf(p.ag))}</td><td style={{ textAlign: 'right' }}>{n0.format(p.ag.km)}</td><td style={{ textAlign: 'right' }}>{n0.format(p.ag.l)}</td></tr>)} />
      <TopCard title="Top 5 Custo por KM" ic={<span style={{ color: 'var(--geral)' }}>{I.warn}</span>} head={['Placa', 'R$/KM', 'Total R$', 'KM']}
        body={D.custo.map(p => <tr key={p.k} onClick={() => setModal({ t: 'pl', k: p.k })}><td>{p.k}</td><td style={{ textAlign: 'right' }}>{brl(cpkOf(p.ag))}</td><td style={{ textAlign: 'right' }}>{brl0(p.ag.v)}</td><td style={{ textAlign: 'right' }}>{n0.format(p.ag.km)}</td></tr>)} />
      <TopCard title="Top 5 Motoristas KM/L" ic={<span style={{ color: 'var(--good)' }}>{I.trend}</span>} head={['Motorista', 'KM/L', 'KM total']}
        body={D.drv5.map(e => <tr key={e.key} onClick={() => openDriver(e.key)}><td title={e.mot + ' · ' + e.fil}>{e.mot}</td><td style={{ textAlign: 'right' }}>{n2.format(kmlOf(e.ag))}</td><td style={{ textAlign: 'right' }}>{n0.format(e.ag.km)}</td></tr>)} />
    </section>

    <div className="mdsec">{I.trend}Ganhos &amp; Perdas — Dentro vs Fora da Meta</div>
    <section className="mdg2">
      <div className="mdbox g"><span className="pillt">✔ DENTRO DA META</span>
        <div className="mdrow"><span>Economia de combustível</span><b>{n2.format(D.gp.dentro.lit)} litros</b></div><div className="mdrow"><span>Economia financeira</span><b>{brl(D.gp.dentro.rs)}</b></div>
        <div className="mdrow"><span>Autonomia operacional gerada</span><b>{n2.format(D.gp.dentro.km)} km</b></div><div className="mdrow"><span>Média operacional considerada</span><b>{n2.format(D.gp.dentro.media)} km/L</b></div></div>
      <div className="mdbox r"><span className="pillt">✕ FORA DA META</span>
        <div className="mdrow"><span>Perda de combustível</span><b>{n2.format(D.gp.fora.lit)} litros</b></div><div className="mdrow"><span>Impacto financeiro</span><b>{brl(D.gp.fora.rs)}</b></div>
        <div className="mdrow"><span>Perda operacional equivalente</span><b>{n2.format(D.gp.fora.km)} km</b></div><div className="mdrow"><span>Média operacional considerada</span><b>{n2.format(D.gp.fora.media)} km/L</b></div></div>
    </section>
    {(() => { const sl = D.gp.dentro.lit - D.gp.fora.lit, sr = D.gp.dentro.rs - D.gp.fora.rs, sk = D.gp.dentro.km - D.gp.fora.km;
      const cell = (t: string, v: number, f: string) => <div><small>{t}</small><b>{f}</b><em className={v >= 0 ? 'pos' : 'neg'}>{v >= 0 ? '↗ positivos' : '↘ negativos'}</em></div>;
      return <section className="panel card"><span className="tag" style={{ alignSelf: 'flex-start' }}>SALDO FINAL OPERACIONAL</span>
        <div className="mdsaldo">{cell('Litros', sl, n2.format(Math.abs(sl)) + ' litros')}{cell('Financeiro', sr, brl(Math.abs(sr)))}{cell('KM operacional', sk, n2.format(Math.abs(sk)) + ' km')}</div></section>; })()}

    <div className="mdsec">{I.pin}Rotas principais</div>
    <section className="mdg3">
      <TopCard title="Top 5 Rotas Mais Consumidas" ic={<span style={{ color: '#e8a200' }}>{I.fuel}</span>} head={['Rota', 'Litros', 'KM', 'Viagens']}
        body={D.rMais.map(r => <tr key={r.k} onClick={() => setModal({ t: 'rt', k: r.k })}><td title={r.k}>{r.k}</td><td style={{ textAlign: 'right' }}>{n0.format(r.ag.l)}</td><td style={{ textAlign: 'right' }}>{n0.format(r.ag.km)}</td><td style={{ textAlign: 'right' }}>{r.ag.n}</td></tr>)} />
      <TopCard title="Top 5 Rotas Piores KM/L" ic={<span style={{ color: 'var(--bad)' }}>{I.down}</span>} head={['Rota', 'KM/L real', 'Meta', 'Desvio']}
        body={D.rPior.map(r => <tr key={r.k} onClick={() => setModal({ t: 'rt', k: r.k })}><td title={r.k}>{r.k}</td><td style={{ textAlign: 'right' }}>{n2.format(kmlOf(r.ag))}</td><td style={{ textAlign: 'right' }}>{n2.format(metaOf(r.ag) || 0)}</td><td style={{ textAlign: 'right' }}><span className={'dev ' + devCls(devOf(r.ag))}>{n1.format(devOf(r.ag))} %</span></td></tr>)} />
      <TopCard title="Top 5 Rotas Melhores KM/L" ic={<span style={{ color: 'var(--good)' }}>{I.award}</span>} head={['Rota', 'KM/L', 'KM total', 'R$/KM']}
        body={D.rMelhor.map(r => <tr key={r.k} onClick={() => setModal({ t: 'rt', k: r.k })}><td title={r.k}>{r.k}</td><td style={{ textAlign: 'right' }}>{n2.format(kmlOf(r.ag))}</td><td style={{ textAlign: 'right' }}>{n0.format(r.ag.km)}</td><td style={{ textAlign: 'right' }}>{brl(cpkOf(r.ag))}</td></tr>)} />
    </section>

    <div className="mdsec">{I.truck}Ranking &amp; Comparativo por Modelos de Veículo</div>
    <section className="mdg2">
      <div className="panel card"><h3 className="mdh3">{I.trend}Classificação KM/Litro por Modelo</h3>
        <div className="scroll"><table className="dt"><thead><tr><th>#</th><th>Modelo</th><th>KM/L</th><th>Meta</th><th>vs Meta</th><th>% na meta</th></tr></thead>
          <tbody>{D.mods.map((m, i) => { const mt = metaOf(m.ag), vs = mt ? (kmlOf(m.ag) / mt - 1) * 100 : 0, pc = m.ag.d + m.ag.f ? (m.ag.d / (m.ag.d + m.ag.f)) * 100 : 0;
            return <tr key={m.k}><td className="dim" style={{ textAlign: 'left', fontFamily: 'var(--f-ui)' }}>{i + 1}</td><td style={{ whiteSpace: 'normal' }}>{m.k}</td><td style={{ fontWeight: 700 }}>{n2.format(kmlOf(m.ag))}</td><td className="dim">{mt != null ? n2.format(mt) : '—'}</td>
              <td><span className={'xx ' + (vs >= 0 ? 'g' : 'r')}>{vs >= 0 ? '+' : ''}{n1.format(vs)} %</span></td><td><span className={'xx ' + (pc >= 70 ? 'g' : 'r')}>{n0.format(pc)} %</span></td></tr>; })}</tbody></table></div></div>
      <div className="panel card"><h3 className="mdh3">{I.coin}Ranking Custo por KM (Modelo)</h3>
        <div className="scroll"><table className="dt"><thead><tr><th>#</th><th>Modelo</th><th>R$/KM</th><th>KM total</th><th>Valor total</th></tr></thead>
          <tbody>{[...D.mods].sort((a, b) => cpkOf(b.ag) - cpkOf(a.ag)).map((m, i) => <tr key={m.k}><td className="dim" style={{ textAlign: 'left', fontFamily: 'var(--f-ui)' }}>{i + 1}</td><td style={{ whiteSpace: 'normal' }}>{m.k}</td><td style={{ color: 'var(--geral)', fontWeight: 700 }}>{brl(cpkOf(m.ag))}</td><td>{n0.format(m.ag.km)}</td><td>{brl0(m.ag.v)}</td></tr>)}</tbody></table></div></div>
    </section>
    <section className="panel card"><div className="sechead"><div className="l"><div className="sico softb">{I.trend}</div><div><h2>Comparativo entre Modelos</h2><p>Clique nos cartões abaixo para comparar (mín. 2)</p></div></div>
      {cmp.length > 0 && <button type="button" className="btn" onClick={() => setCmp([])}>Limpar seleção</button>}</div>
      <div className="mdg4">{D.mods.map((m, i) => { const mt = metaOf(m.ag), vs = mt ? (kmlOf(m.ag) / mt - 1) * 100 : 0;
        return <button type="button" key={m.k} className={'mdmodel' + (cmp.includes(m.k) ? ' on' : '')} onClick={() => setCmp(c => (c.includes(m.k) ? c.filter(x => x !== m.k) : [...c, m.k]))}>
          <h4><span className="rk">{i + 1}</span>{m.k}</h4><small>{n0.format(m.ag.n)} viagens</small>
          <div className="g2"><div><span>KM/L Real</span><b>{n2.format(kmlOf(m.ag))}</b></div><div><span>Meta KM/L</span><b>{mt != null ? n2.format(mt) : '—'}</b></div>
            <div><span>Custo/KM</span><b>{brl(cpkOf(m.ag))}</b></div><div><span>% vs Meta</span><b className={vs >= 0 ? 'pos' : 'neg'}>{vs >= 0 ? '+' : ''}{n1.format(vs)}%</b></div></div></button>; })}</div>
      {modelCmp.length >= 2 && <div className="mdcmp scroll"><table className="dt"><thead><tr><th>Indicador</th>{modelCmp.map(m => <th key={m.k}>{m.k}</th>)}</tr></thead><tbody>
        {([['KM/L real', (a: Ag) => kmlOf(a), (v: number) => n2.format(v), 1], ['Custo por KM', (a: Ag) => cpkOf(a), (v: number) => brl(v), -1], ['% dentro da meta', (a: Ag) => (a.d + a.f ? (a.d / (a.d + a.f)) * 100 : 0), (v: number) => n1.format(v) + '%', 1], ['Litros', (a: Ag) => a.l, (v: number) => n0.format(v), 0], ['KM rodados', (a: Ag) => a.km, (v: number) => n0.format(v), 0], ['Valor abastecido', (a: Ag) => a.v, (v: number) => brl(v), 0], ['Viagens', (a: Ag) => a.n, (v: number) => n0.format(v), 0]] as any[]).map(([t, f, fm, dir]) => {
          const vals = modelCmp.map(m => f(m.ag)); const best = dir ? (dir > 0 ? Math.max(...vals) : Math.min(...vals)) : null;
          return <tr key={t}><td style={{ textAlign: 'left', fontFamily: 'var(--f-ui)', fontWeight: 700 }}>{t}</td>{vals.map((v: number, i: number) => <td key={i} className={best != null && v === best ? 'b' : ''}>{fm(v)}</td>)}</tr>; })}</tbody></table></div>}
      {cmp.length === 1 && <div className="tip">Selecione mais um modelo para comparar.</div>}
    </section>

    <div className="sechead"><div className="l"><div className="sico">{I.trophy}</div><div><h2>Histórico de Motoristas — KM/L</h2><p>Ranking de melhores e piores motoristas (posição mensal) • clique em um motorista para ver os detalhes</p></div></div>
      <div style={{ display: 'flex', gap: 10 }}><FB k="hist" /><button type="button" className="btn" onClick={() => exportXlsx('hist')}>{I.dl}<span>Exportador</span></button></div></div>
    {!fold.hist && <><section className="kpis mdk">
      <Kpi c="c-t" t="Melhores motoristas no período" ic={I.award} big={String(D.hist.melhores.length)} />
      <Kpi c="c-g" t="Piores motoristas no período" ic={I.trophy} big={String(D.hist.piores.length)} />
      <Kpi c="c-f" t="Total de motoristas no período" ic={I.users} big={n0.format(D.hist.all.length)} cap="motorista + filial" />
      <Kpi c="c-f" t="KM rodados no período" ic={I.road} big={n1.format(tot.km)} />
    </section>
    <section className="mdg2">
      {([['Os 10 Melhores Motoristas (KM/L)', D.hist.melhores, false, I.award], ['Top 10 Piores Motoristas (KM/L)', D.hist.piores, true, I.down]] as [string, Driver[], boolean, any][]).map(([title, list, p, ic]) => {
        const mx = Math.max(...list.map(e => kmlOf(e.ag)), 1);
        return <div className="panel card" key={title}><div className="sechead"><h3 className="mdh3" style={{ color: p ? 'var(--bad)' : 'var(--good)' }}>{ic}{title}</h3><span className="tag">{list.length} motoristas</span></div>
          <div className="scroll"><table className="dt mdrank"><thead><tr><th>Posição</th><th style={{ textAlign: 'left' }}>Motorista</th><th>KM/L</th><th>Rodados KM</th><th>Viagens</th><th>Vezes no top</th></tr></thead>
            <tbody>{list.map((e, i) => <tr key={e.key} onClick={() => openDriver(e.key)}><td style={{ textAlign: 'left' }}><span className={'bdg ' + (p ? 'r' : 'g')}>{i + 1}º</span></td>
              <td className="nm"><b>{e.mot}</b><small title={e.plates.join(', ') + ' · ' + e.fil}>{e.plates.join(', ')} · {e.fil}</small></td>
              <td style={{ whiteSpace: 'nowrap' }}><span className="mdbar"><i style={{ width: (kmlOf(e.ag) / mx) * 100 + '%', background: p ? 'var(--bad)' : 'var(--good)' }} /></span><b>{n2.format(kmlOf(e.ag))}</b></td>
              <td>{n0.format(e.ag.km)}</td><td>{e.ag.n}</td><td><span className={'xx ' + (p ? 'r' : 'g')}>{p ? e.pior10 : e.top10} x</span></td></tr>)}</tbody></table></div></div>; })}
    </section></>}
    </>}
  </>);

  if (!all) return <><style>{baseCss}{css}</style><div id="dsp"><div className="empty" style={{ padding: 60 }}>Carregando base de médias…</div></div></>;
  const anos = opts.ano.length ? opts.ano.join(' / ') : '';
  return (
    <>
      <style>{baseCss}{css}</style>
      <div id="dsp" ref={rootRef}>
        <div className="wrap md" style={{ paddingTop: 18 }}>
          {view === 'drv' ? renderDriver() : <>
            <header className="top">
              <div className="brand"><div>
                <div className="eyebrow"><span className="tag blue">FROTA LOG • EXECUTIVE BI</span><span className="tag">{n0.format(rows.length)} viagens analisadas</span>{custom && <span className="tag green">BASE IMPORTADA</span>}</div>
                <h1>MÉDIAS DE COMBUSTÍVEL - KM/LITRO</h1>
                <div className="sub"><span className="f">CONSUMO</span><span className="x">×</span><span className="t">META</span><span className="x">|</span><span className="yrs">{anos}{opts.mes.length ? ' · ' + MES_ABR[opts.mes[0] - 1] + ' a ' + MES_ABR[opts.mes[opts.mes.length - 1] - 1] : ''}</span></div></div></div>
              <div className="actions">
                <button className="btn pri gm-adm" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>{I.up}<span>Importar XLS</span></button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
                <button className="btn ok" type="button" onClick={() => exportXlsx()}>{I.sheet}<span>Exportar Excel</span></button>
                <button className="btn" type="button" onClick={printPanel} disabled={busy} title="Gerar imagem (PNG) do painel">{I.cam}<span>Print</span></button>
                <button className="btn sq" type="button" onClick={resetBase} title="Voltar à base original" aria-label="Voltar à base original">{I.reset}</button>
              </div>
            </header>
            {renderDash()}
          </>}
          <div className="fnote">Regras: KM/L = KM rodados ÷ litros abastecidos (somados). Meta = média das metas informadas. Custo por KM = valor abastecido ÷ KM rodados. Motorista = nome + filial (o mesmo motorista em várias placas é somado; o ranking mensal compara motoristas no mês). Faturamento não faz parte deste painel.</div>
        </div>
        {renderModal()}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}
