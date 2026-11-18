// Cálculos do painel "Médias de Combustível" (KM/L, custo por KM, ranking de motoristas).
export interface Rec {
  fil: string; ano: number; mes: number; rota: string; mod: string; conh: string;
  mot: string; pl: string; km: number; l: number; v: number;
  meta: number | null; kml: number; gl: number; gr: number; st: '' | 'D' | 'F'; sup: string;
}

export const MES_ABR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
export const MES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Nomes de supervisão que são a mesma pessoa (grafias diferentes na planilha)
const SUP_ALIAS: Record<string, string> = { 'LUIS FERNANDO': 'LUIS FERNANDO CUNHA' };
const supNorm = (v: any) => { const x = String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase(); return SUP_ALIAS[x] || x; };

export const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const MESMAP: Record<string, number> = {};
['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'].forEach((m, i) => (MESMAP[m] = i + 1));

const num = (v: any): number => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const x = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return isFinite(x) ? x : 0;
};
const numN = (v: any): number | null => (v == null || v === '' ? null : num(v));

/** Normaliza uma linha bruta. O motorista é limpo (espaços/maiúsculas) e a placa sem espaços, para o mesmo motorista/placa não se duplicar. */
export function mk(o: { fil: any; ano: any; mes: any; rota: any; mod: any; conh: any; mot: any; pl: any; km: any; l: any; v: any; meta: any; kml: any; gl: any; gr: any; st: any; sup: any }): Rec | null {
  const mes = typeof o.mes === 'number' ? o.mes : MESMAP[norm(o.mes)];
  if (!mes) return null;
  const km = num(o.km), l = num(o.l);
  const st = norm(o.st);
  return {
    fil: String(o.fil ?? '').trim(), ano: num(o.ano) || new Date().getFullYear(), mes,
    rota: String(o.rota ?? '').replace(/\s+/g, ' ').trim(), mod: String(o.mod ?? '').replace(/\s+/g, ' ').trim(),
    conh: String(o.conh ?? ''), mot: String(o.mot ?? '').replace(/\s+/g, ' ').trim().toUpperCase() || '(SEM MOTORISTA)',
    pl: String(o.pl ?? '').replace(/\s+/g, '').toUpperCase(),
    km, l, v: num(o.v), meta: numN(o.meta), kml: o.kml != null && o.kml !== '' ? num(o.kml) : (l ? km / l : 0),
    gl: num(o.gl), gr: num(o.gr), st: st.startsWith('DENTRO') ? 'D' : st.startsWith('FORA') ? 'F' : '',
    sup: supNorm(o.sup),
  };
}
export function fromArr(a: any[]): Rec | null {
  return mk({ fil: a[0], ano: a[1], mes: a[2], rota: a[3], mod: a[4], conh: a[5], mot: a[6], pl: a[7], km: a[8], l: a[11], v: a[10], meta: a[12], kml: a[13], gl: a[14], gr: a[15], st: a[16], sup: a[17] });
}
/** Lê as linhas de uma planilha (objetos por cabeçalho) */
export function fromSheet(rows: any[]): Rec[] {
  if (!rows.length) return [];
  const H: Record<string, string> = {};
  Object.keys(rows[0]).forEach(k => { const n = norm(k); if (!(n in H)) H[n] = k; });
  const need = ['FILIAL', 'MES', 'MOTORISTA', 'PLACA', 'KM RODADO', 'LITROS ABASTECIDOS', 'VALOR ABASTECIDO R$'];
  const miss = need.filter(n => !(n in H));
  if (miss.length) throw new Error('Colunas não encontradas: ' + miss.join(', '));
  const g = (n: string) => H[n];
  const out: Rec[] = [];
  for (const r of rows) {
    const x = mk({
      fil: r[g('FILIAL')], ano: r[g('ANO')], mes: r[g('MES')], rota: r[g('ROTA')], mod: r[g('MODELO DE VEICULO')], conh: r[g('CONHECIMENTO')],
      mot: r[g('MOTORISTA')], pl: r[g('PLACA')], km: r[g('KM RODADO')], l: r[g('LITROS ABASTECIDOS')], v: r[g('VALOR ABASTECIDO R$')],
      meta: r[g('META KM/LITRO')], kml: r[g('KM/LITRO REALIZADO')], gl: r[g('GANHO X PERDA LITRO/ML')], gr: r[g('GANHO X PERDA R$')],
      st: r[g('STATUS META')], sup: r[g('SUPERVISAO')],
    });
    if (x) out.push(x);
  }
  return out;
}

/* ---------- agregação ---------- */
export interface Ag { n: number; km: number; l: number; v: number; ms: number; mn: number; d: number; f: number; kmlSum: number }
export const zero = (): Ag => ({ n: 0, km: 0, l: 0, v: 0, ms: 0, mn: 0, d: 0, f: 0, kmlSum: 0 });
export function add(a: Ag, r: Rec) {
  a.n++; a.km += r.km; a.l += r.l; a.v += r.v; a.kmlSum += r.kml;
  if (r.meta != null) { a.ms += r.meta; a.mn++; }
  if (r.st === 'D') a.d++; else if (r.st === 'F') a.f++;
}
export const kmlOf = (a: Ag) => (a.l ? a.km / a.l : 0);
export const cpkOf = (a: Ag) => (a.km ? a.v / a.km : 0);
export const metaOf = (a: Ag): number | null => (a.mn ? a.ms / a.mn : null);
export const devOf = (a: Ag) => { const m = metaOf(a); return m ? ((m - kmlOf(a)) / m) * 100 : 0; };
export function groupBy(rows: Rec[], key: (r: Rec) => string | null): Map<string, Ag> {
  const m = new Map<string, Ag>();
  for (const r of rows) { const k = key(r); if (k == null || k === '') continue; let a = m.get(k); if (!a) { a = zero(); m.set(k, a); } add(a, r); }
  return m;
}
export function mode(vals: string[]): string {
  const c = new Map<string, number>(); let best = '', bn = 0;
  for (const v of vals) { if (!v) continue; const n = (c.get(v) || 0) + 1; c.set(v, n); if (n > bn) { bn = n; best = v; } }
  return best;
}

/* ---------- ganhos e perdas ---------- */
export function ganhosPerdas(rows: Rec[]) {
  const D = { lit: 0, rs: 0, kmlSum: 0, n: 0 }, F = { lit: 0, rs: 0, kmlSum: 0, n: 0 };
  for (const r of rows) {
    const t = r.st === 'D' ? D : r.st === 'F' ? F : null; if (!t) continue;
    t.lit += Math.abs(r.gl); t.rs += Math.abs(r.gr); t.kmlSum += r.kml; t.n++;
  }
  const mD = D.n ? D.kmlSum / D.n : 0, mF = F.n ? F.kmlSum / F.n : 0;
  return { dentro: { lit: D.lit, rs: D.rs, media: mD, km: D.lit * mD }, fora: { lit: F.lit, rs: F.rs, media: mF, km: F.lit * mF } };
}

/* ---------- histórico de motoristas ---------- */
export interface MonthPos { mes: number; ag: Ag; kml: number; meta: number | null; pos: number; posPior: number; total: number }
export interface Driver {
  key: string; mot: string; fil: string; plates: string[]; ag: Ag; ord: number;
  months: MonthPos[]; top10: number; pior10: number; top3: number; mid: number;
  best: number; worst: number; avg: number; meta: number | null;
}
export function driverHistory(rows: Rec[]) {
  const ents = new Map<string, Driver>();
  const byMonth = new Map<number, Map<string, { ag: Ag; ord: number }>>();
  let ord = 0;
  for (const r of rows) {
    const key = r.mot + '|' + r.fil;
    let e = ents.get(key);
    if (!e) { e = { key, mot: r.mot, fil: r.fil, plates: [], ag: zero(), ord: ord++, months: [], top10: 0, pior10: 0, top3: 0, mid: 0, best: 0, worst: 0, avg: 0, meta: null }; ents.set(key, e); }
    add(e.ag, r);
    if (r.pl && !e.plates.includes(r.pl)) e.plates.push(r.pl);
    let mm = byMonth.get(r.mes); if (!mm) { mm = new Map(); byMonth.set(r.mes, mm); }
    let c = mm.get(key); if (!c) { c = { ag: zero(), ord: e.ord }; mm.set(key, c); }
    add(c.ag, r);
  }
  for (const mes of [...byMonth.keys()].sort((a, b) => a - b)) {
    const mm = byMonth.get(mes)!;
    const arr = [...mm.entries()].map(([key, c]) => ({ key, c, kml: kmlOf(c.ag) }));
    const desc = [...arr].sort((a, b) => b.kml - a.kml || a.c.ord - b.c.ord);
    const asc = [...arr].sort((a, b) => a.kml - b.kml || a.c.ord - b.c.ord);
    const pos = new Map<string, number>(), posP = new Map<string, number>();
    desc.forEach((x, i) => pos.set(x.key, i + 1)); asc.forEach((x, i) => posP.set(x.key, i + 1));
    for (const x of arr) {
      ents.get(x.key)!.months.push({ mes, ag: x.c.ag, kml: x.kml, meta: metaOf(x.c.ag), pos: pos.get(x.key)!, posPior: posP.get(x.key)!, total: arr.length });
    }
  }
  for (const e of ents.values()) {
    for (const m of e.months) {
      if (m.pos <= 10) e.top10++;
      if (m.pos <= 3) e.top3++; else if (m.pos <= 10) e.mid++;
      if (m.posPior <= 10) e.pior10++;
    }
    const ps = e.months.map(m => m.pos);
    e.best = Math.min(...ps); e.worst = Math.max(...ps); e.avg = ps.reduce((a, b) => a + b, 0) / ps.length;
    const ms = e.months.map(m => m.meta).filter((x): x is number => x != null);
    e.meta = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
  }
  const all = [...ents.values()];
  const melhores = all.filter(e => e.top10 > 0).sort((a, b) => b.top10 - a.top10 || kmlOf(b.ag) - kmlOf(a.ag) || a.ord - b.ord).slice(0, 10);
  const piores = all.filter(e => e.pior10 > 0).sort((a, b) => b.pior10 - a.pior10 || kmlOf(a.ag) - kmlOf(b.ag) || a.ord - b.ord).slice(0, 10);
  const byKml = [...all].sort((a, b) => kmlOf(b.ag) - kmlOf(a.ag) || a.ord - b.ord);
  const rank = new Map<string, number>(); byKml.forEach((e, i) => rank.set(e.key, i + 1));
  return { all, map: ents, melhores, piores, rank };
}
