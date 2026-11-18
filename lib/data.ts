import { Viagem, ExecutiveMetrics, PlacaMetrics, MotoristaMetrics, RouteMetrics } from './types';
import { 
  INITIAL_VIAGENS as BASE_INITIAL_VIAGENS, 
  INITIAL_METADATA as BASE_INITIAL_METADATA, 
  INITIAL_LOGS as BASE_INITIAL_LOGS,
  MetadataLastUpdate as IMetadataLastUpdate,
  ImportLog as IImportLog
} from './initialData';

export type MetadataLastUpdate = IMetadataLastUpdate;
export type ImportLog = IImportLog;

export const INITIAL_VIAGENS: Viagem[] = BASE_INITIAL_VIAGENS.map((v) => {
  let sup = v.supervisao || 'LEONAN';
  if (sup.toUpperCase().includes('LEONAN')) {
    sup = 'LEONAN BRAGA';
  }
  return {
    ...v,
    supervisao: sup,
    filial: v.filial || '338 - ARMAZEM MATEUS S.A. CD 338 ALTOS',
    ano: v.ano || '2026',
    mes: v.mes || 'Janeiro'
  };
});

export const INITIAL_METADATA: MetadataLastUpdate = BASE_INITIAL_METADATA;
export const INITIAL_LOGS: ImportLog[] = BASE_INITIAL_LOGS;

export const MOCK_DRIVER_AVATARS: Record<string, string> = {
  "FRANCISCO GOMES MENDES": "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=120&q=80",
  "JOSE RIBAMAR GUIMARAES J.": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&q=80",
  "ADRIANO RICARDO SANTOS": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=120&q=80",
  "FLAVIO RICARDO RODRIGUES DE ARAUJO": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
  "SILVESTRE SOUZA LOPES": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80",
  "RONILSON MARINHO LOPES": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80",
  "TIAGO MOURA DO NASCIMENTO": "https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?auto=format&fit=crop&w=120&q=80"
};

// Avatares gerados localmente (iniciais + cor), sem depender de imagens externas.
function initialsAvatar(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  const ini = ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  const palette = ['#004ac6', '#006c49', '#ab0b1c', '#7c3aed', '#b45309', '#0e7490', '#be185d', '#4d7c0f'];
  const bg = palette[h % palette.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="${bg}"/><text x="60" y="60" dy=".35em" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="46" fill="#ffffff">${ini}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function getDriverAvatar(nome: string): string {
  return initialsAvatar(nome || '?');
}

function localNormalizeMonthName(m: string): string {
  const lower = m.toLowerCase().trim();
  if (lower.includes('jan')) return 'Janeiro';
  if (lower.includes('fev') || lower.includes('fêv')) return 'Fevereiro';
  if (lower.includes('mar')) return 'Março';
  if (lower.includes('abr')) return 'Abril';
  if (lower.includes('mai')) return 'Maio';
  if (lower.includes('jun')) return 'Junho';
  if (lower.includes('jul')) return 'Julho';
  if (lower.includes('ago')) return 'Agosto';
  if (lower.includes('set')) return 'Setembro';
  if (lower.includes('out')) return 'Outubro';
  if (lower.includes('nov')) return 'Novembro';
  if (lower.includes('dez')) return 'Dezembro';
  return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
}

// Business rule for "SEM FATURAMENTO":
// CONHECIMENTO = "N/D", ROTA = "N/D", FATURAMENTO (valorCarga) empty, null, or zero
export function isSemFaturamento(v: { conhecimento?: string; id?: string; rota?: string; valorCarga?: number }): boolean {
  const c = String(v.conhecimento || v.id || '').trim().toUpperCase();
  const r = String(v.rota || '').trim().toUpperCase();
  const val = v.valorCarga ?? 0;
  return (c === 'N/D' || c.includes('N/D')) && (r === 'N/D' || r.includes('N/D')) && val === 0;
}

// Compute dynamic executive metrics from any array of viajes (which supports imports perfectly)
export function computeExecutiveMetrics(viagens: Viagem[]): ExecutiveMetrics {
  const faturamentoTotal = viagens.reduce((sum, v) => sum + v.valorCarga, 0);
  
  // Group unique/conhecimentos per plate per month-year combo
  const plateMonthConhecimentos: Record<string, Record<string, Set<string>>> = {};
  
  const platesWithBilling = new Set<string>();
  const platesWithoutBilling = new Set<string>();

  viagens.forEach(v => {
    const p = v.placa.trim().toUpperCase();
    if (!p) return;
    
    if (isSemFaturamento(v)) {
      platesWithoutBilling.add(p);
    } else {
      platesWithBilling.add(p);
    }

    const m = localNormalizeMonthName(v.mes || 'Maio');
    const y = String(v.ano || '2026');
    const key = `${m} | ${y}`;
    
    const conId = (v.conhecimento || v.id || '').trim();
    if (conId && conId.toUpperCase() !== 'N/D' && !conId.toUpperCase().includes('N/D')) {
      if (!plateMonthConhecimentos[p]) {
        plateMonthConhecimentos[p] = {};
      }
      if (!plateMonthConhecimentos[p][key]) {
        plateMonthConhecimentos[p][key] = new Set<string>();
      }
      plateMonthConhecimentos[p][key].add(conId);
    }
  });

  let dentroMetaCount = 0;
  let foraMetaCount = 0;
  
  Object.keys(plateMonthConhecimentos).forEach(p => {
    const monthsObj = plateMonthConhecimentos[p];
    Object.keys(monthsObj).forEach(key => {
      const count = monthsObj[key].size;
      if (count >= 4) {
        dentroMetaCount++;
      } else {
        foraMetaCount++;
      }
    });
  });

  const totalPlateMonths = dentroMetaCount + foraMetaCount;
  const metaGlobal = totalPlateMonths * 4; // Target is 4 voyages per plate-month combo
  
  // Unique plates count (vehicles unique on route)
  const totalPlacas = new Set(viagens.map(v => v.placa.trim().toUpperCase()).filter(Boolean)).size;
  
  // Unique trip achievements based on "conhecimento" code (excluding 'N/D' and sem faturamento)
  const totalUniqueConhecimentos = new Set(
    viagens
      .filter(v => !isSemFaturamento(v))
      .map(v => (v.conhecimento || v.id || '').trim())
      .filter(c => c && c.toUpperCase() !== 'N/D' && !c.toUpperCase().includes('N/D'))
  ).size;

  const percentMetaAtingida = metaGlobal > 0 ? Math.round((totalUniqueConhecimentos / metaGlobal) * 100) : 0;

  const kmRodadoTotal = viagens.reduce((sum, v) => sum + v.kmRodado, 0);
  const despesaOficinaTotal = viagens.reduce((sum, v) => sum + (v.despesaOficina || 0), 0);

  // A plate is considered truly "without faturamento" if it has NO billed/active rows in the selection
  const finalPlatesWithoutBilling = new Set<string>();
  platesWithoutBilling.forEach(p => {
    if (!platesWithBilling.has(p)) {
      finalPlatesWithoutBilling.add(p);
    }
  });

  return {
    faturamentoTotal,
    totalViagens: totalUniqueConhecimentos,
    metaGlobal,
    percentMetaAtingida,
    totalPlacas,
    dentroMetaCount,
    foraMetaCount,
    kmRodadoTotal,
    despesaOficinaTotal,
    placasNaoFaturadasCount: finalPlatesWithoutBilling.size
  };
}

// Compute plate ranking
export function computePlacaMetrics(
  viagens: Viagem[],
  allViagens?: Viagem[],
  forceMonthsCount?: number
): PlacaMetrics[] {
  // We group by plate-month combo to avoid merging of voyages over multiple months
  // and treat each active month/vehicle combination as an individual occurrence.
  const placaGroup: Record<string, {
    placa: string;
    mes: string;
    ano: string;
    faturamento: number;
    kmTotal: number;
    despesaOficinaTotal: number;
    supervisores: Record<string, number>;
    motoristas: Record<string, number>;
    conhecimentos: Set<string>;
    ultimaRota: string;
    hasBilling: boolean;
  }> = {};

  viagens.forEach(v => {
    const p = v.placa.trim().toUpperCase();
    if (!p) return;
    
    const m = localNormalizeMonthName(v.mes || 'Maio');
    const a = String(v.ano || '2026');
    const groupKey = `${p} | ${m} | ${a}`;

    if (!placaGroup[groupKey]) {
      placaGroup[groupKey] = {
        placa: p,
        mes: m,
        ano: a,
        faturamento: 0,
        kmTotal: 0,
        despesaOficinaTotal: 0,
        supervisores: {},
        motoristas: {},
        conhecimentos: new Set<string>(),
        ultimaRota: '',
        hasBilling: false
      };
    }
    const g = placaGroup[groupKey];
    g.faturamento += v.valorCarga || 0;
    g.kmTotal += v.kmRodado || 0;
    g.despesaOficinaTotal += v.despesaOficina || 0;

    if (!isSemFaturamento(v)) {
      g.hasBilling = true;
    }

    const sup = v.supervisao || 'Sem Supervisor';
    g.supervisores[sup] = (g.supervisores[sup] || 0) + 1;

    const mot = v.motorista || 'Sem Motorista';
    g.motoristas[mot] = (g.motoristas[mot] || 0) + 1;

    if (v.rota) {
      g.ultimaRota = v.rota;
    }

    const conId = (v.conhecimento || v.id || '').trim();
    if (conId && !isSemFaturamento(v)) {
      if (conId.toUpperCase() !== 'N/D' && !conId.toUpperCase().includes('N/D')) {
        g.conhecimentos.add(conId);
      }
    }
  });

  return Object.keys(placaGroup).map(key => {
    const data = placaGroup[key];
    const voyagesCount = data.conhecimentos.size;
    const targetTripsForThisPlate = 4; // Target is strictly 4 trips per plate-month combo
    const percentMeta = Math.min(1000, Math.round((voyagesCount / targetTripsForThisPlate) * 100));

    // Determine principal supervisor
    let pSupervisor = 'Sem Supervisor';
    const sups = data.supervisores;
    const realSups = Object.keys(sups).filter(sup => {
      const s = sup.toUpperCase().trim();
      return s !== 'CAMINHAO PARADO' && s !== 'SEM SUPERVISOR' && s !== '';
    });
    
    if (realSups.length > 0) {
      let maxSupCount = -1;
      realSups.forEach(sup => {
        if (sups[sup] > maxSupCount) {
          maxSupCount = sups[sup];
          pSupervisor = sup;
        }
      });
    } else {
      let maxSupCount = -1;
      Object.keys(sups).forEach(sup => {
        if (sups[sup] > maxSupCount) {
          maxSupCount = sups[sup];
          pSupervisor = sup;
        }
      });
    }

    // Determine principal motorista
    let pMotorista = 'Sem Motorista';
    let maxMotCount = -1;
    Object.keys(data.motoristas).forEach(mot => {
      if (data.motoristas[mot] > maxMotCount) {
        maxMotCount = data.motoristas[mot];
        pMotorista = mot;
      }
    });

    return {
      placa: data.placa,
      viagensCount: voyagesCount,
      faturamentoTotal: data.faturamento,
      percentMeta,
      supervisor: pSupervisor,
      motorista: pMotorista,
      kmRodadoTotal: data.kmTotal,
      conhecimentosCount: voyagesCount,
      statusMeta: voyagesCount >= targetTripsForThisPlate ? 'Dentro da Meta' : 'Fora da Meta',
      despesaOficinaTotal: data.despesaOficinaTotal,
      targetMeta: targetTripsForThisPlate,
      mes: data.mes,
      ano: data.ano,
      ultimaRota: data.ultimaRota || 'Sem rota programada',
      statusFaturamento: (data.hasBilling ? 'FATUROU' : 'SEM FATURAMENTO') as 'FATUROU' | 'SEM FATURAMENTO'
    };
  }).sort((a, b) => b.viagensCount - a.viagensCount || b.faturamentoTotal - a.faturamentoTotal);
}

// Compute driver metrics
export function computeMotoristaMetrics(viagens: Viagem[]): MotoristaMetrics[] {
  const driverGroup: Record<string, { faturamento: number; conhecimentos: Set<string> }> = {};
  
  viagens.forEach(v => {
    const m = v.motorista ? v.motorista.trim() : 'Sem Motorista';
    if (!driverGroup[m]) {
      driverGroup[m] = { faturamento: 0, conhecimentos: new Set<string>() };
    }
    driverGroup[m].faturamento += v.valorCarga || 0;
    if (!isSemFaturamento(v)) {
      const conId = (v.conhecimento || v.id || '').trim();
      if (conId && conId.toUpperCase() !== 'N/D' && !conId.toUpperCase().includes('N/D')) {
        driverGroup[m].conhecimentos.add(conId);
      }
    }
  });

  return Object.keys(driverGroup).map((nome, index): MotoristaMetrics => {
    const data = driverGroup[nome];
    const trips = data.conhecimentos.size;
    const target = 4; // goal
    const progress = Math.round((trips / target) * 100);
    return {
      id: `0${2934 + index}`,
      nome,
      categoria: trips % 2 === 0 ? "Categoria D" : "Categoria E",
      faturamento: data.faturamento,
      viagensRealizadas: trips,
      metaViagens: target,
      percentProgresso: progress,
      statusMeta: trips >= target ? 'METAS_ATINGIDAS' : 'FORA_DA_META'
    };
  }).sort((a, b) => b.viagensRealizadas - a.viagensRealizadas || b.faturamento - a.faturamento);
}

// Compute Route Performance
export function computeRouteMetrics(viagens: Viagem[]): RouteMetrics[] {
  const routeGroup: Record<string, { daysSum: number; trips: number; kmSum: number; valueSum: number }> = {};
  
  viagens.forEach(v => {
    const r = v.rota;
    if (!routeGroup[r]) {
      routeGroup[r] = { daysSum: 0, trips: 0, kmSum: 0, valueSum: 0 };
    }
    routeGroup[r].daysSum += v.qtdDias;
    if (!isSemFaturamento(v)) {
      routeGroup[r].trips += 1;
    }
    routeGroup[r].kmSum += v.kmRodado;
    routeGroup[r].valueSum += v.valorCarga;
  });

  return Object.keys(routeGroup).map(rota => {
    const data = routeGroup[rota];
    const tripsCount = data.trips;
    return {
      rota,
      avgDays: tripsCount > 0 ? parseFloat((data.daysSum / tripsCount).toFixed(1)) : 0,
      totalTrips: tripsCount,
      avgKm: tripsCount > 0 ? Math.round(data.kmSum / tripsCount) : 0,
      totalValue: data.valueSum
    };
  }).sort((a, b) => b.totalTrips - a.totalTrips);
}
