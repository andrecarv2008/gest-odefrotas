import React from 'react';
import { computePlacaMetrics } from '@/lib/data';
import type { Viagem } from '@/lib/types';

const FAIXAS = [
  { label: '1 viagem', cor: '#ef4444' },
  { label: '2 viagens', cor: '#f59e0b' },
  { label: '3 viagens', cor: '#eab308' },
  { label: '4 viagens', cor: '#22c55e' },
  { label: '5 ou mais', cor: '#0ea5e9' },
];
const fmt = (n: number) => n.toLocaleString('pt-BR');
const pct = (n: number, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';

/** Placas por faixa de viagens — mesma contagem do donut "Distribuição de Placas (%)" (placa/mês), por ano. */
export default function ComparativoAnualPlacas({ viagens, anos, base, comp }: { viagens: Viagem[]; anos: string[]; base: string; comp: string }) {
  const dados = React.useMemo(() => {
    const por: Record<string, Viagem[]> = {};
    viagens.forEach(v => { (por[String(v.ano || 2026)] = por[String(v.ano || 2026)] || []).push(v); });
    return [...anos].sort().filter(a => por[a]).map(ano => {
      const r = computePlacaMetrics(por[ano], por[ano]);
      const c = [0, 0, 0, 0, 0];
      r.forEach(x => { if (x.viagensCount >= 1) c[Math.min(x.viagensCount, 5) - 1]++; });
      const total = c.reduce((a, b) => a + b, 0);
      return { ano, c, total, p: c.map(n => (total ? (n / total) * 100 : 0)) };
    });
  }, [viagens, anos]);
  if (!dados.length) return null;
  const A = dados.find(d => d.ano === base), B = dados.find(d => d.ano === comp);
  const dif = A && B && A.ano !== B.ano && A.total > 0 && B.total > 0;

  return (
    <section className="bg-white border border-[#d3dae4] rounded-2xl p-5 sm:p-6 shadow-xs" data-testid="cmp-anual">
      <h4 className="text-[10px] font-extrabold text-[#737686] uppercase tracking-widest">Placas por quantidade de viagens</h4>
      <p className="text-[11px] text-slate-500 mt-0.5 mb-4">Mesma contagem do gráfico "Distribuição de Placas (%)" (placa/mês). Anos escolhidos nos chips do gráfico acima.</p>

      <div className="space-y-2.5">
        {dados.map(d => (
          <div key={d.ano} className="flex items-center gap-3">
            <span className="w-10 text-xs font-black text-slate-700">{d.ano}</span>
            <div className="flex-1 flex h-7 rounded-md overflow-hidden bg-[#eef2f7]">
              {d.p.map((p, i) => p > 0 && (
                <div key={i} style={{ width: `${p}%`, background: FAIXAS[i].cor }} className="flex items-center justify-center text-[10px] font-black text-white" title={`${FAIXAS[i].label}: ${fmt(d.c[i])} placas (${pct(p)})`}>{p >= 6 ? Math.round(p) + '%' : ''}</div>
              ))}
            </div>
            <span className="w-16 text-right text-[11px] font-bold text-slate-500">{fmt(d.total)}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-[11px] font-bold text-slate-600">
        {FAIXAS.map(f => <span key={f.label} className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: f.cor }} />{f.label}</span>)}
      </div>

      <div className="overflow-x-auto mt-4">
        <table className="w-full text-xs text-center">
          <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-[#e5eaf1]">
            <th className="text-left py-2">Faixa</th>{dados.map(d => <th key={d.ano} className="px-3">{d.ano}</th>)}
            {dif && <th className="px-3 text-[#004ac6]">{A!.ano} → {B!.ano}</th>}
          </tr></thead>
          <tbody>
            {FAIXAS.map((f, i) => {
              const dp = dif ? B!.p[i] - A!.p[i] : 0;
              return (
                <tr key={f.label} className="border-b border-[#f0f3f8]">
                  <td className="text-left py-2 font-extrabold text-slate-700 whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: f.cor }} />{f.label}</td>
                  {dados.map(d => <td key={d.ano} className="px-3"><b className="text-[#0b1c30]">{fmt(d.c[i])}</b> <span className="text-slate-400">({pct(d.p[i], 0)})</span></td>)}
                  {dif && <td className="px-3 font-black whitespace-nowrap" style={{ color: dp > 0.05 ? '#059669' : dp < -0.05 ? '#dc2626' : '#94a3b8' }}>{dp > 0.05 ? '▲ +' : dp < -0.05 ? '▼ ' : ''}{dp.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.</td>}
                </tr>
              );
            })}
            <tr className="font-black text-slate-800"><td className="text-left py-2">Total</td>{dados.map(d => <td key={d.ano} className="px-3">{fmt(d.total)}</td>)}{dif && <td />}</tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
