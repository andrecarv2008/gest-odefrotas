import { JustificativaVeiculo } from './types';
import { db } from './firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const STORAGE_KEY = 'gm_justificativas_veiculos_v1';
const FIRESTORE_COLLECTION = 'justificativas';

export const JUSTIFICATIVAS_PRESETS = [
  { label: 'EM OFICINA A 15 DIAS', categoria: 'OFICINA', icon: 'wrench' },
  { label: 'EM OFICINA HÁ MAIS DE 30 DIAS', categoria: 'OFICINA', icon: 'wrench' },
  { label: 'AGUARDANDO PEÇA DE REPOSIÇÃO', categoria: 'PECA', icon: 'cog' },
  { label: 'MANUTENÇÃO PREVENTIVA PROGRAMADA', categoria: 'MANUTENCAO', icon: 'shield' },
  { label: 'VEÍCULO RESERVA NO PÁTIO', categoria: 'RESERVA', icon: 'parking' },
  { label: 'SEM MOTORISTA ESCALADO NO PERÍODO', categoria: 'MOTORISTA', icon: 'user-x' },
  { label: 'SINISTRO / AGUARDANDO SEGURO', categoria: 'SINISTRO', icon: 'alert-triangle' },
  { label: 'VEÍCULO EM PROCESSO DE DESMOBILIZAÇÃO', categoria: 'DESMOBILIZADO', icon: 'slash' },
  { label: 'DOCUMENTAÇÃO / EMPLACAMENTO PENDENTE', categoria: 'OUTROS', icon: 'file-text' },
  { label: 'REVISÃO PERIÓDICA CONCESSIONÁRIA', categoria: 'MANUTENCAO', icon: 'check-circle' }
] as const;

export const INITIAL_JUSTIFICATIVAS_SEED: Record<string, JustificativaVeiculo> = {
  "BWP-5980_Março": {
    placa: "BWP-5980",
    mes: "Março",
    justificativa: "EM OFICINA A 15 DIAS",
    categoria: "OFICINA",
    diasParado: 15,
    dataAtualizacao: "02/09/2026 às 13:00",
    usuario: "Supervisão de Frota",
    observacoes: "Veículo em manutenção corretiva de sistema de freios e suspensão"
  },
  "BWP-5980": {
    placa: "BWP-5980",
    mes: "Março",
    justificativa: "EM OFICINA A 15 DIAS",
    categoria: "OFICINA",
    diasParado: 15,
    dataAtualizacao: "02/09/2026 às 13:00",
    usuario: "Supervisão de Frota"
  },
  "CYR-2944_Março": {
    placa: "CYR-2944",
    mes: "Março",
    justificativa: "AGUARDANDO PEÇA DE REPOSIÇÃO (CÂMBIO)",
    categoria: "PECA",
    diasParado: 22,
    dataAtualizacao: "02/09/2026 às 11:30",
    usuario: "Manutenção Externa"
  },
  "NHP-5842_Março": {
    placa: "NHP-5842",
    mes: "Março",
    justificativa: "VEÍCULO RESERVA NO PÁTIO CD 338",
    categoria: "RESERVA",
    diasParado: 0,
    dataAtualizacao: "01/09/2026 às 16:20",
    usuario: "Operações Logísticas"
  }
};

export function normalizePlacaKey(placa: string): string {
  const clean = String(placa || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length === 7) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return String(placa || '').trim().toUpperCase();
}

export function makeJustificativaKey(placa: string, mes?: string): string {
  const normPlaca = normalizePlacaKey(placa);
  if (mes && mes !== 'TODOS' && mes !== 'GERAL') {
    return `${normPlaca}_${mes}`;
  }
  return normPlaca;
}

/**
 * Gets the active justification for a plate and month, checking month-specific first, then plate-level.
 */
export function findJustificativa(
  justificativas: Record<string, JustificativaVeiculo>,
  placa: string,
  mes?: string
): JustificativaVeiculo | null {
  if (!placa) return null;
  const normPlaca = normalizePlacaKey(placa);
  
  if (mes) {
    const keyWithMonth = `${normPlaca}_${mes}`;
    if (justificativas[keyWithMonth]) {
      return justificativas[keyWithMonth];
    }
  }

  // Fallback to plate-only key
  if (justificativas[normPlaca]) {
    return justificativas[normPlaca];
  }

  // Raw fallback
  const rawKey = mes ? `${placa}_${mes}` : placa;
  if (justificativas[rawKey]) return justificativas[rawKey];
  if (justificativas[placa]) return justificativas[placa];

  return null;
}

/**
 * Loads all justifications from LocalStorage, Server API, and Cloud Firestore.
 */
export async function loadAllJustificativas(): Promise<Record<string, JustificativaVeiculo>> {
  let result: Record<string, JustificativaVeiculo> = { ...INITIAL_JUSTIFICATIVAS_SEED };

  // 1. Try LocalStorage for zero-latency instant cache
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          result = { ...result, ...parsed };
        }
      }
    } catch (e) {
      console.warn('Could not read justificativas from localStorage:', e);
    }
  }

  // 2. Try Server API (/api/justificativas)
  try {
    const res = await fetch('/api/justificativas', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        result = { ...result, ...json.data };
      }
    }
  } catch (e) {
    // Non-blocking fallback
  }

  // 3. Try Cloud Firestore
  try {
    const querySnapshot = await getDocs(collection(db, FIRESTORE_COLLECTION));
    if (!querySnapshot.empty) {
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data() as JustificativaVeiculo;
        if (data && data.placa && data.justificativa) {
          const key = docSnap.id;
          result[key] = data;
        }
      });
    }
  } catch (e) {
    // Non-blocking fallback
  }

  // Sync back to localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch {}
  }

  return result;
}

/**
 * Saves a vehicle unbilled justification across LocalStorage, Server API, and Cloud Firestore.
 */
export async function saveJustificativaRecord(params: {
  placa: string;
  mes?: string;
  justificativa: string;
  categoria?: string;
  usuario?: string;
  diasParado?: number;
  observacoes?: string;
}): Promise<{ key: string; item: JustificativaVeiculo }> {
  const normPlaca = normalizePlacaKey(params.placa);
  const key = makeJustificativaKey(normPlaca, params.mes);
  const now = new Date();
  const formattedDate = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  const item: JustificativaVeiculo = {
    placa: normPlaca,
    mes: params.mes,
    justificativa: params.justificativa.trim().toUpperCase(),
    categoria: (params.categoria as any) || 'OFICINA',
    diasParado: params.diasParado,
    dataAtualizacao: formattedDate,
    usuario: params.usuario || 'Supervisão de Transporte',
    observacoes: params.observacoes?.trim()
  };

  // 1. LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const current = stored ? JSON.parse(stored) : { ...INITIAL_JUSTIFICATIVAS_SEED };
      current[key] = item;
      // Also set normPlaca as general fallback
      current[normPlaca] = item;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  // 2. Server API
  fetch('/api/justificativas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, item })
  }).catch(() => {});

  // 3. Firestore
  try {
    const firestoreKey = key.replace(/\//g, '_');
    const docRef = doc(db, FIRESTORE_COLLECTION, firestoreKey);
    await setDoc(docRef, item, { merge: true });
  } catch (e) {
    console.warn('Firestore save error:', e);
  }

  return { key, item };
}

/**
 * Removes a vehicle justification.
 */
export async function deleteJustificativaRecord(placa: string, mes?: string): Promise<string> {
  const normPlaca = normalizePlacaKey(placa);
  const key = makeJustificativaKey(normPlaca, mes);

  // 1. LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const current = JSON.parse(stored);
        delete current[key];
        delete current[normPlaca];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      }
    } catch {}
  }

  // 2. Server API
  fetch('/api/justificativas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, remove: true })
  }).catch(() => {});

  // 3. Firestore
  try {
    const firestoreKey = key.replace(/\//g, '_');
    const docRef = doc(db, FIRESTORE_COLLECTION, firestoreKey);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Firestore delete error:', e);
  }

  return key;
}
