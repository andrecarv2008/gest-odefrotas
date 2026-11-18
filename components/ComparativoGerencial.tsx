import React from 'react';
import { isSemFaturamento } from '@/lib/data';
import type { Viagem } from '@/lib/types';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ABR = MESES.map(m => m.slice(0, 3));
const COR = ['#94a3b8', '#64748b', '#f59e0b', '#0ea5e9', '#004ac6'];
const nf = (n: number, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
const brl = (n: number) => 'R$ ' + nf(n);
const brlC = (n: number) => { const a = Math.abs(n); const s = n < 0 ? '-' : ''; return a >= 1e9 ? `${s}R$ ${nf(a / 1e9, 2)} bi` : a >= 1e6 ? `${s}R$ ${nf(a / 1e6, 1)} mi` : a >= 1e3 ? `${s}R$ ${nf(a / 1e3, 0)} mil` : `${s}R$ ${nf(a)}`; };
const mi = (m: string) => MESES.indexOf(m);

interface M { fat: number; km: number; viagens: number; veic: number; pm: number; naMeta: number; meses: number }
const mkKey = (v: Viagem) => `${v.ano || 2026}|${mi(v.mes)}`;

function metrics(list: Viagem[], keys: Set<string>): M {
  let fat = 0, km = 0;
  const conh = new Set<string>(), pm = new Map<string, Set<string>>();
  list.forEach(v => {
    const k = mkKey(v); if (!keys.has(k)) return;
    fat += v.valorCarga || 0; km += v.kmRodado || 0;
    const p = (v.placa || '').trim().toUpperCase(); if (!p) return;
    const id = p + '#' + k; let s = pm.get(id); if (!s) { s = new Set(); pm.set(id, s); }
    if (!isSemFaturamento(v)) { const c = (v.conhecimento || v.id || '').trim(); if (c && !c.toUpperCase().includes('N/D')) { conh.add(c); s.add(c); } }
  });
  let naMeta = 0; pm.forEach(s => { if (s.size >= 4) naMeta++; });
  const meses = keys.size || 1;
  return { fat, km, viagens: conh.size, veic: pm.size / meses, pm: pm.size, naMeta, meses };
}

const IND: { id: string; l: string; g: (m: M) => number; f: (n: number) => string; hint: string }[] = [
  { id: 'fat', l: 'Faturamento', g: m => m.fat, f: brlC, hint: 'Soma do valor de carga' },
  { id: 'via', l: 'Viagens', g: m => m.viagens, f: n => nf(n), hint: 'Conhecimentos faturados únicos' },
  { id: 'vei', l: 'Veículos ativos / mês', g: m => m.veic, f: n => nf(n), hint: 'Média mensal de placas ativas' },
  { id: 'vpv', l: 'Viagens por veículo / mês', g: m => (m.pm ? m.viagens / m.pm : 0), f: n => nf(n, 2), hint: 'Produtividade (meta: 4)' },
  { id: 'tkt', l: 'Faturamento por viagem', g: m => (m.viagens ? m.fat / m.viagens : 0), f: n => brl(n), hint: 'Ticket médio' },
  { id: 'fpv', l: 'Faturamento por veículo / mês', g: m => (m.pm ? m.fat / m.pm : 0), f: n => brl(n), hint: 'Receita média por veículo' },
  { id: 'km', l: 'KM rodado', g: m => m.km, f: n => nf(n), hint: 'Total de quilômetros' },
  { id: 'fkm', l: 'Faturamento por KM', g: m => (m.km ? m.fat / m.km : 0), f: n => 'R$ ' + nf(n, 2), hint: 'Eficiência do KM rodado' },
  { id: 'meta', l: 'Veículos na meta (≥ 4 viagens)', g: m => (m.pm ? (m.naMeta / m.pm) * 100 : 0), f: n => nf(n, 1) + '%', hint: '% dos veículos/mês que bateram a meta' },
];

type Modo = 'ano' | 'mes' | 'yoy';
const dlt = (a: number, b: number) => (b ? ((a - b) / Math.abs(b)) * 100 : a ? 100 : 0);
const cor = (d: number) => (d > 0.05 ? '#059669' : d < -0.05 ? '#dc2626' : '#94a3b8');
const seta = (d: number) => (d > 0.05 ? '▲' : d < -0.05 ? '▼' : '•');

export default function ComparativoGerencial({ viagens, renderPlacas }: { viagens: Viagem[]; renderPlacas?: (anos: string[], base: string, comp: string) => React.ReactNode }) {
  const { keysAll, anos, porMes } = React.useMemo(() => {
    const set = new Set<string>(); const pm: Record<string, M> = {};
    viagens.forEach(v => { if (mi(v.mes) >= 0) set.add(mkKey(v)); });
    const keys = Array.from(set).sort((a, b) => { const [ya, ma] = a.split('|').map(Number), [yb, mb] = b.split('|').map(Number); return ya - yb || ma - mb; });
    keys.forEach(k => { pm[k] = metrics(viagens, new Set([k])); });
    return { keysAll: keys, anos: Array.from(new Set(keys.map(k => k.split('|')[0]))), porMes: pm };
  }, [viagens]);

  // último mês "fechado": ignora o último mês se ele tem < 60% das viagens do anterior
  const fechado = React.useMemo(() => {
    const n = keysAll.length; if (!n) return '';
    if (n > 1 && porMes[keysAll[n - 1]].viagens < porMes[keysAll[n - 2]].viagens * 0.6) return keysAll[n - 2];
    return keysAll[n - 1];
  }, [keysAll, porMes]);

  const [modo, setModo] = React.useState<Modo>('ano');
  const [sel, setSel] = React.useState<string>('');           // mês de referência (key)
  const [metr, setMetr] = React.useState<string>('fat');
  const [dim, setDim] = React.useState<'sup' | 'filial' | 'rota'>('sup');
  React.useEffect(() => { if (!sel || !keysAll.includes(sel)) setSel(fechado); }, [fechado, keysAll, sel]);
  // modo ano a ano: ano base x ano comparado, acumulado até o mês
  const [yB, setYB] = React.useState<string>(''); const [yA, setYA] = React.useState<string>(''); const [mAte, setMAte] = React.useState<number>(11);
  const [anosGraf, setAnosGraf] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    if (!fechado || (yA && anos.includes(yA))) return;
    const [fy, fm] = fechado.split('|').map(Number);
    setYA(String(fy)); setYB(anos.includes(String(fy - 1)) ? String(fy - 1) : anos[Math.max(0, anos.indexOf(String(fy)) - 1)]); setMAte(fm);
  }, [fechado, anos, yA]);

  const per = React.useMemo(() => {
    if (!sel || !yA) return null;
    const [y, m] = sel.split('|').map(Number);
    let A: string[] = [], B: string[] = [], la = '', lb = '';
    if (modo === 'ano') {
      const ate = mAte === 11 ? 'Dez' : ABR[mAte];
      A = keysAll.filter(k => { const [yy, mm] = k.split('|').map(Number); return String(yy) === yA && mm <= mAte; });
      B = keysAll.filter(k => { const [yy, mm] = k.split('|').map(Number); return String(yy) === yB && mm <= mAte; });
      la = `${yA} (Jan–${ate})`; lb = `${yB} (Jan–${ate})`;
    } else if (modo === 'yoy') {
      A = [sel]; B = keysAll.filter(k => k === `${y - 1}|${m}`); la = `${ABR[m]}/${y}`; lb = `${ABR[m]}/${y - 1}`;
    } else {
      const i = keysAll.indexOf(sel); A = [sel]; B = i > 0 ? [keysAll[i - 1]] : [];
      const [py, pm2] = (B[0] || '0|0').split('|').map(Number);
      la = `${ABR[m]}/${y}`; lb = B[0] ? `${ABR[pm2]}/${py}` : '—';
    }
    return { A: new Set(A), B: new Set(B), la, lb };
  }, [modo, sel, keysAll, yA, yB, mAte]);

  const mA = React.useMemo(() => per ? metrics(viagens, per.A) : null, [per, viagens]);
  const mB = React.useMemo(() => per ? metrics(viagens, per.B) : null, [per, viagens]);

  // quem puxou o resultado
  const quem = React.useMemo(() => {
    if (!per || !per.B.size) return null;
    const kf = (v: Viagem) => dim === 'sup' ? (v.supervisao || 'SEM SUPERVISOR') : dim === 'filial' ? (v.filial || '—').replace(/^\d+\s*-\s*/, '') : (v.rota || '—').replace(/^\d+\s*-\s*/, '');
    const a: Record<string, number> = {}, b: Record<string, number> = {};
    viagens.forEach(v => { const k = mkKey(v); const n = kf(v); if (per.A.has(k)) a[n] = (a[n] || 0) + (v.valorCarga || 0); if (per.B.has(k)) b[n] = (b[n] || 0) + (v.valorCarga || 0); });
    const rows = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).filter(n => !/SEM SUPERVISOR|N\/D/i.test(n)).map(n => ({ n, a: a[n] || 0, b: b[n] || 0, d: (a[n] || 0) - (b[n] || 0) }));
    const up = rows.filter(r => r.d > 0).sort((x, y) => y.d - x.d).slice(0, 5);
    const down = rows.filter(r => r.d < 0).sort((x, y) => x.d - y.d).slice(0, 5);
    const semInfo = dim === 'sup' && (!rows.some(r => r.b > 0) || !rows.some(r => r.a > 0));
    return { up, down, max: Math.max(...rows.map(r => Math.abs(r.d)), 1), total: rows.length, semInfo };
  }, [per, viagens, dim]);

  if (!keysAll.length || !per || !mA || !mB) return null;
  const ind = IND.find(i => i.id === metr)!;
  const temB = per.B.size > 0;
  const rowsInd = IND.map(i => { const a = i.g(mA), b = i.g(mB); return { i, a, b, d: temB ? dlt(a, b) : 0 }; });

  // leitura executiva
  const get = (id: string) => rowsInd.find(r => r.i.id === id)!;
  const bullets: string[] = [];
  if (temB) {
    const f = get('fat'), v = get('via'), t = get('tkt'), p = get('vpv'), me = get('meta');
    const sinal = (d: number) => (d >= 0 ? 'cresceu' : 'caiu');
    bullets.push(`Faturamento ${sinal(f.d)} ${nf(Math.abs(f.d), 1)}% (${f.a - f.b >= 0 ? '+' : '-'}${brlC(Math.abs(f.a - f.b))}) em ${per.la} frente a ${per.lb}.`);
    bullets.push(`Viagens ${v.d >= 0 ? 'subiram' : 'recuaram'} ${nf(Math.abs(v.d), 1)}% e o ticket médio por viagem ${t.d >= 0 ? 'subiu' : 'caiu'} ${nf(Math.abs(t.d), 1)}% — ${Math.abs(v.d) >= Math.abs(t.d) ? 'o volume de viagens explica a maior parte da variação' : 'o preço médio por viagem explica a maior parte da variação'}.`);
    bullets.push(`Produtividade: ${nf(p.a, 2)} viagens por veículo/mês (antes ${nf(p.b, 2)}); ${nf(me.a, 1)}% dos veículos bateram a meta de 4 viagens (antes ${nf(me.b, 1)}%).`);
  }

  // gráfico de linhas por ano
  const W = 760, H = 230, pl = 52, pr = 16, pt = 16, pb = 26;
  const anosShow = (anosGraf ?? [yB, yA]).filter((y, i, a) => anos.includes(y) && a.indexOf(y) === i).sort();
  const PAL = ['#94a3b8', '#64748b', '#f59e0b', '#0ea5e9', '#004ac6', '#059669'];
  const corAno = (y: string) => PAL[(PAL.length - 1 - (anos.length - 1 - anos.indexOf(y)) % PAL.length + PAL.length) % PAL.length];
  const rotulo = (v: number) => ind.id === 'fat' ? nf(v / 1e6, 1) + 'M' : ind.id === 'km' ? nf(v / 1e3, 0) + 'k' : ind.id === 'vpv' || ind.id === 'fkm' ? nf(v, 2) : ind.id === 'meta' ? nf(v, 0) + '%' : ind.id === 'tkt' || ind.id === 'fpv' ? nf(v / 1e3, 0) + 'k' : nf(v);
  const val = (k: string) => (porMes[k] ? ind.g(porMes[k]) : null);
  const allV = anosShow.flatMap(y => MESES.map((_, m) => val(`${y}|${m}`))).filter((x): x is number => x != null && x > 0);
  const sortedV = [...allV].sort((a, b) => a - b);
  const p92 = sortedV.length ? sortedV[Math.floor(0.92 * (sortedV.length - 1))] : 1;
  const realMax = Math.max(...allV, 1);
  const maxV = realMax > p92 * 1.4 ? p92 * 1.4 : realMax;
  const clipped = realMax > maxV;
  const X = (m: number) => pl + (m / 11) * (W - pl - pr), Y = (v: number) => H - pb - (Math.min(v, maxV) / maxV) * (H - pb - pt);
  const heat = anos.slice().reverse();
  const heatMax = maxV;

  const btn = (on: boolean) => `px-3 py-1.5 rounded-full text-[11px] font-extrabold border transition ${on ? 'bg-[#004ac6] text-white border-[#004ac6]' : 'bg-white text-slate-600 border-[#d3dae4] hover:border-[#004ac6]'}`;
  const card = 'bg-white border border-[#d3dae4] rounded-2xl p-5 sm:p-6 shadow-xs';
  const H2 = ({ t, s }: { t: string; s?: string }) => (<div className="mb-3"><h4 className="text-[10px] font-extrabold text-[#737686] uppercase tracking-widest">{t}</h4>{s && <p className="text-[11px] text-slate-500 mt-0.5">{s}</p>}</div>);

  return (
    <div className="space-y-5" data-testid="cmp-ger">
      {/* controles */}
      <section className={card}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-[10px] font-extrabold text-[#737686] uppercase tracking-widest leading-none">Comparativo gerencial de indicadores</h2>
            <h3 className="text-xl font-black mt-1 text-[#0b1c30]">{per.lb} <span className="text-slate-400 font-bold text-base">x</span> {per.la}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btn(modo === 'ano')} onClick={() => setModo('ano')}>Ano a ano (acumulado)</button>
            <button className={btn(modo === 'yoy')} onClick={() => setModo('yoy')}>Mês vs mesmo mês do ano anterior</button>
            <button className={btn(modo === 'mes')} onClick={() => setModo('mes')}>Mês vs mês anterior</button>
            {modo === 'ano' ? (
              <>
                <select value={yB} onChange={e => setYB(e.target.value)} className="border border-[#d3dae4] rounded-lg px-2 py-1.5 text-xs font-bold bg-white" title="Ano base">{anos.map(y => <option key={y} value={y}>{y}</option>)}</select>
                <span className="text-xs font-black text-slate-400">x</span>
                <select value={yA} onChange={e => setYA(e.target.value)} className="border border-[#d3dae4] rounded-lg px-2 py-1.5 text-xs font-bold bg-white" title="Ano comparado">{anos.map(y => <option key={y} value={y}>{y}</option>)}</select>
                <select value={mAte} onChange={e => setMAte(Number(e.target.value))} className="border border-[#d3dae4] rounded-lg px-2 py-1.5 text-xs font-bold bg-white" title="Acumulado até">
                  {MESES.map((m, i) => <option key={m} value={i}>{i === 11 ? 'ano completo' : `até ${m}`}</option>)}
                </select>
              </>
            ) : (
              <select value={sel} onChange={e => setSel(e.target.value)} className="border border-[#d3dae4] rounded-lg px-2 py-1.5 text-xs font-bold bg-white" title="Mês de referência">
                {keysAll.slice().reverse().map(k => { const [y, m] = k.split('|').map(Number); return <option key={k} value={k}>{`${ABR[m]}/${y}`}</option>; })}
              </select>
            )}
          </div>
        </div>
        {modo !== 'ano' && (sel !== keysAll[keysAll.length - 1] || fechado !== keysAll[keysAll.length - 1]) ? (
          <p className="text-[11px] text-slate-500 mt-3">O mês mais recente da base parece em andamento, por isso a referência padrão é o último mês fechado.</p>
        ) : null}
        {!temB && <p className="text-[12px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">Não há dados do período de comparação para esta referência. Escolha outro mês ou modo.</p>}
      </section>

      {/* leitura executiva */}
      {bullets.length > 0 && (
        <section className={card + ' border-l-4 border-l-[#004ac6]'}>
          <H2 t="Leitura executiva" />
          <ul className="space-y-1.5 text-[13px] text-[#0b1c30] font-semibold list-disc pl-5">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </section>
      )}

      {/* scorecard */}
      <section className={card}>
        <H2 t="Painel de indicadores" s="Barra à direita mostra a variação % do período A sobre o período B." />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-[#e5eaf1]">
              <th className="text-left py-2 pr-3">Indicador</th><th className="px-3 text-right">{per.lb}</th><th className="px-3 text-right">{per.la}</th><th className="px-3 text-right">Variação</th><th className="pl-3 min-w-[150px]"></th>
            </tr></thead>
            <tbody>
              {rowsInd.map(({ i, a, b, d }) => (
                <tr key={i.id} className="border-b border-[#f0f3f8] hover:bg-[#f8fafc] cursor-pointer" onClick={() => setMetr(i.id)} title={i.hint}>
                  <td className="py-2.5 pr-3 font-extrabold text-slate-700">{i.l}</td>
                  <td className="px-3 text-right text-slate-500 font-bold whitespace-nowrap">{temB ? i.f(b) : '—'}</td>
                  <td className="px-3 text-right text-[#0b1c30] font-black whitespace-nowrap">{i.f(a)}</td>
                  <td className="px-3 text-right font-black whitespace-nowrap" style={{ color: temB ? cor(d) : '#94a3b8' }}>{temB ? `${seta(d)} ${d > 0 ? '+' : ''}${nf(d, 1)}%` : '—'}</td>
                  <td className="pl-3">
                    <div className="relative h-2.5 bg-[#eef2f7] rounded">
                      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-300" />
                      {temB && <div className="absolute top-0 bottom-0 rounded" style={{ background: cor(d), left: d >= 0 ? '50%' : `${50 - Math.min(Math.abs(d), 100) / 2}%`, width: `${Math.min(Math.abs(d), 100) / 2}%` }} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* tendência + mapa de calor */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <H2 t="Evolução mensal por ano" s={`${ind.l} — clique em um indicador no painel acima para trocar.`} />
          <select value={metr} onChange={e => setMetr(e.target.value)} className="border border-[#d3dae4] rounded-lg px-2 py-1.5 text-xs font-bold bg-white">{IND.map(i => <option key={i.id} value={i.id}>{i.l}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label="Evolução mensal por ano">
            {[0, 0.25, 0.5, 0.75, 1].map(t => (<g key={t}><line x1={pl} x2={W - pr} y1={Y(maxV * t)} y2={Y(maxV * t)} stroke="#e5eaf1" /><text x={pl - 6} y={Y(maxV * t) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{ind.id === 'fat' ? brlC(maxV * t).replace('R$ ', '') : ind.f(maxV * t).replace('R$ ', '')}</text></g>))}
            {ABR.map((m, i) => <text key={m} x={X(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#64748b">{m}</text>)}
            {anosShow.map((y, yi) => {
              const c = corAno(y); const last = yi === anosShow.length - 1;
              const pts = MESES.map((_, m) => ({ m, v: val(`${y}|${m}`) })).filter(p => p.v != null && p.v > 0) as { m: number; v: number }[];
              if (!pts.length) return null;
              return (<g key={y}>
                <polyline fill="none" stroke={c} strokeWidth={last ? 2.8 : 1.8} strokeLinejoin="round" points={pts.map(p => `${X(p.m)},${Y(p.v)}`).join(' ')} />
                {pts.map(p => <g key={p.m}><circle cx={X(p.m)} cy={Y(p.v)} r={last ? 3.2 : 2.4} fill={c}><title>{`${ABR[p.m]}/${y}: ${ind.f(p.v)}`}</title></circle>
                  <text x={X(p.m)} y={Y(p.v) + (anosShow.every(o => o === y || (val(`${o}|${p.m}`) ?? 0) <= p.v) ? -8 : 14)} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={c} stroke="#fff" strokeWidth="2.5" paintOrder="stroke">{rotulo(p.v)}</text></g>)}
              </g>);
            })}
          </svg>
        </div>
        {clipped && <p className="text-[10px] text-amber-700 font-bold mt-1">Eixo limitado para não distorcer o gráfico: meses muito acima dos demais (ex.: janeiro) ficam no topo — passe o mouse no ponto para ver o valor real.</p>}
        <div className="flex gap-2 flex-wrap items-center text-[11px] font-bold mt-2">
          <span className="text-slate-400">Anos no gráfico:</span>
          {anos.map(y => { const on = anosShow.includes(y); return (
            <button key={y} type="button" onClick={() => setAnosGraf(on ? anosShow.filter(x => x !== y) : [...anosShow, y])}
              className="px-2.5 py-1 rounded-full border text-[11px] font-extrabold flex items-center gap-1.5"
              style={{ borderColor: on ? corAno(y) : '#d3dae4', background: on ? corAno(y) : '#fff', color: on ? '#fff' : '#64748b' }}>{y}</button>); })}
        </div>

        <div className="mt-5">
          <H2 t="Mapa de calor — ano × mês" s="Quanto mais escuro, maior o valor do indicador." />
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-separate" style={{ borderSpacing: 3 }}>
              <thead><tr><th></th>{ABR.map(m => <th key={m} className="text-slate-500 font-bold uppercase">{m}</th>)}</tr></thead>
              <tbody>
                {heat.map(y => (
                  <tr key={y}>
                    <td className="font-extrabold text-slate-700 pr-2">{y}</td>
                    {MESES.map((_, m) => {
                      const v = val(`${y}|${m}`); const t = v && v > 0 ? Math.min(1, v / heatMax) : 0;
                      return <td key={m} className="text-center rounded font-bold py-2 min-w-[46px]" style={{ background: v && v > 0 ? `rgba(0,74,198,${0.08 + t * 0.85})` : '#f3f5f8', color: t > 0.5 ? '#fff' : '#334155' }} title={v != null && v > 0 ? `${ABR[m]}/${y}: ${ind.f(v)}` : 'sem dados'}>{v && v > 0 ? (ind.id === 'fat' ? nf(v / 1e6, 1) + 'M' : ind.id === 'km' ? nf(v / 1e3, 0) + 'k' : ind.f(v).replace('R$ ', '')) : '–'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {renderPlacas && renderPlacas(anosShow.length ? anosShow : anos, yB, yA)}

      {/* quem puxou o resultado */}
      {quem && (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <H2 t="O que puxou o resultado" s={`Variação de faturamento: ${per.la} vs ${per.lb}.`} />
            <div className="flex gap-2">
              <button className={btn(dim === 'sup')} onClick={() => setDim('sup')}>Supervisor</button>
              <button className={btn(dim === 'filial')} onClick={() => setDim('filial')}>Filial</button>
              <button className={btn(dim === 'rota')} onClick={() => setDim('rota')}>Rota</button>
            </div>
          </div>
          {quem.total === 0 || quem.semInfo ? <p className="text-xs text-slate-500 mt-2">{quem.semInfo ? 'O supervisor não está informado em um dos períodos comparados (anos anteriores a 2026 não trazem supervisão). Use Filial ou Rota.' : 'Sem dados para esta dimensão nos dois períodos.'}</p> : (
            <div className="grid md:grid-cols-2 gap-5 mt-2">
              {[{ t: '▲ Maiores altas', r: quem.up, c: '#059669' }, { t: '▼ Maiores quedas', r: quem.down, c: '#dc2626' }].map(col => (
                <div key={col.t}>
                  <div className="text-[11px] font-extrabold mb-2" style={{ color: col.c }}>{col.t}</div>
                  {col.r.length === 0 ? <p className="text-xs text-slate-400">Nenhum.</p> : col.r.map(r => (
                    <div key={r.n} className="mb-2.5">
                      <div className="flex justify-between gap-3 text-[11px] font-bold text-slate-700"><span className="truncate" title={r.n}>{r.n}</span><span style={{ color: col.c }} className="whitespace-nowrap font-black">{r.d > 0 ? '+' : ''}{brlC(r.d)}</span></div>
                      <div className="h-1.5 rounded bg-[#eef2f7] mt-1"><div className="h-full rounded" style={{ width: `${(Math.abs(r.d) / quem.max) * 100}%`, background: col.c }} /></div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{brlC(r.b)} → {brlC(r.a)} ({r.b ? `${r.d > 0 ? '+' : ''}${nf(dlt(r.a, r.b), 1)}%` : 'novo'})</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
