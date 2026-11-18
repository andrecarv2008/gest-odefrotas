'use client';

import * as React from 'react';
import { notify, askConfirm } from '@/lib/ui';
import { saveFile } from '@/lib/saveFile';
import {
  X,
  Search,
  AlertTriangle,
  Wrench,
  Plus,
  Edit3,
  Check,
  Download,
  Trash2,
  Clock,
  FileText,
  Shield,
  Filter
} from 'lucide-react';
import { Viagem, JustificativaVeiculo } from '@/lib/types';
import { isSemFaturamento } from '@/lib/data';
import {
  loadAllJustificativas,
  saveJustificativaRecord,
  deleteJustificativaRecord,
  findJustificativa,
  JUSTIFICATIVAS_PRESETS,
  normalizePlacaKey
} from '@/lib/justificativasService';

export interface PotentialRevenueDetailModalProps {
  mesSelected: string | null;
  preFilteredViagens: Viagem[];
  onClose: () => void;
}

export const PotentialRevenueDetailModal: React.FC<PotentialRevenueDetailModalProps> = ({
  mesSelected,
  preFilteredViagens,
  onClose
}) => {
  const [search, setSearch] = React.useState('');
  const [sortField, setSortField] = React.useState<string>('placa');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [filtroStatus, setFiltroStatus] = React.useState<'TODOS' | 'COM_JUSTIFICATIVA' | 'SEM_JUSTIFICATIVA'>('TODOS');
  const [justificativas, setJustificativas] = React.useState<Record<string, JustificativaVeiculo>>({});
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  // Modal editing state
  const [editingPlate, setEditingPlate] = React.useState<{
    placa: string;
    filial?: string;
    motorista?: string;
    supervisor?: string;
    tipoVeiculo?: string;
    justificativaTexto: string;
    categoria: string;
    diasParado: number;
    observacoes: string;
    isExisting: boolean;
  } | null>(null);

  // Load justifications from LocalStorage, API and Firestore
  React.useEffect(() => {
    loadAllJustificativas().then(data => {
      if (data) {
        setJustificativas(data);
      }
    });
  }, []);

  // Auto-dismiss toast
  React.useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  if (!mesSelected) return null;

  // Filter voyages to the chosen month
  const voyagesInMonth = preFilteredViagens.filter(v => (v.mes || 'Maio') === mesSelected);

  // Group by plate to find which ones did NOT bill
  const plateMap: Record<string, { faturamento: number; hasBilling: boolean; viagens: Viagem[] }> = {};
  
  voyagesInMonth.forEach(v => {
    const p = String(v.placa || '').trim().toUpperCase();
    if (!p) return;
    if (!plateMap[p]) {
      plateMap[p] = { faturamento: 0, hasBilling: false, viagens: [] };
    }
    plateMap[p].viagens.push(v);
    plateMap[p].faturamento += v.valorCarga || 0;
    if (!isSemFaturamento(v)) {
      plateMap[p].hasBilling = true;
    }
  });

  // Calculate unbilled plates
  const unbilledPlatesRaw = Object.keys(plateMap)
    .filter(p => !plateMap[p].hasBilling)
    .map(p => {
      const plateVoyages = plateMap[p].viagens;
      
      const branches = Array.from(new Set(plateVoyages.map(v => v.filial || 'Filial São Luís').filter(Boolean)));
      const drivers = Array.from(new Set(plateVoyages.map(v => v.motorista || 'Sem Motorista').filter(Boolean)));
      
      // Dynamic supervisor resolver that looks across ALL voyages in preFilteredViagens
      let resolvedSupervisor = '';
      
      const isRealSupervisorName = (name: string) => {
        if (!name) return false;
        const upper = name.trim().toUpperCase();
        return (
          upper !== '' &&
          upper !== 'N/D' &&
          upper !== 'SEM SUPERVISOR' &&
          upper !== 'UNDEFINED' &&
          upper !== 'NULL' &&
          upper !== 'LEONAN' &&
          upper !== 'VAZIO'
        );
      };

      // 1. Try to find any other voyage in preFilteredViagens for the exact same plate with a real supervisor name
      const samePlateVoyages = preFilteredViagens.filter(
        v => String(v.placa || '').trim().toUpperCase() === p
      );
      
      const realSupervisorsOfPlate = samePlateVoyages
        .map(v => String(v.supervisao || '').trim())
        .filter(isRealSupervisorName);

      if (realSupervisorsOfPlate.length > 0) {
        resolvedSupervisor = realSupervisorsOfPlate[0];
      } else {
        // 2. Try to find a real supervisor by filial across all voyages
        const filialName = branches[0] || '';
        if (filialName) {
          const sameFilialVoyages = preFilteredViagens.filter(
            v => String(v.filial || '').trim().toUpperCase() === filialName.toUpperCase()
          );
          const realSupervisorsOfFilial = sameFilialVoyages
            .map(v => String(v.supervisao || '').trim())
            .filter(isRealSupervisorName);
          
          if (realSupervisorsOfFilial.length > 0) {
            resolvedSupervisor = realSupervisorsOfFilial[0];
          }
        }
      }

      // 3. Fallback: if we still don't have supervisor, check if 'LEONAN' is verified as a real supervisor for this plate
      if (!resolvedSupervisor) {
        const hasBilledLeonan = samePlateVoyages.some(
          v => !isSemFaturamento(v) && String(v.supervisao || '').trim().toUpperCase() === 'LEONAN'
        );
        if (hasBilledLeonan) {
          resolvedSupervisor = 'LEONAN';
        } else {
          const filialName = branches[0] || '';
          const hasBilledLeonanForFilial = filialName && preFilteredViagens.some(
            v => String(v.filial || '').trim().toUpperCase() === filialName.toUpperCase() &&
                 !isSemFaturamento(v) && 
                 String(v.supervisao || '').trim().toUpperCase() === 'LEONAN'
          );
          if (hasBilledLeonanForFilial) {
            resolvedSupervisor = 'LEONAN';
          }
        }
      }

      // 4. Final resolve: fallback to any non-empty supervisao in this plate's voyages, or 'Vazio'
      if (!resolvedSupervisor) {
        const rawSups = plateVoyages.map(v => String(v.supervisao || '').trim()).filter(Boolean);
        const filteredRawSups = rawSups.filter(s => {
          const u = s.toUpperCase();
          return u !== 'N/D' && u !== 'SEM SUPERVISOR' && u !== 'UNDEFINED' && u !== 'NULL' && u !== 'LEONAN';
        });
        if (filteredRawSups.length > 0) {
          resolvedSupervisor = filteredRawSups[0];
        } else {
          resolvedSupervisor = 'Vazio';
        }
      }

      const routes = Array.from(new Set(plateVoyages.map(v => v.rota || 'N/D').filter(Boolean)));
      const shipTypes = Array.from(new Set(plateVoyages.map(v => v.tipoVeiculo || 'N/D').filter(Boolean)));
      const kmTotal = plateVoyages.reduce((sum, v) => sum + (v.kmRodado || 0), 0);
      const billedVoyagesCount = plateVoyages.filter(v => !isSemFaturamento(v)).length;
      
      const justItem = findJustificativa(justificativas, p, mesSelected);

      return {
        placa: p,
        filial: branches.join(', ') || 'Filial São Luís',
        motorista: drivers.join(', ') || 'Sem Motorista',
        supervisor: resolvedSupervisor,
        rotas: routes.join(', ') || 'N/D',
        tipoVeiculo: shipTypes.join(', ') || 'N/D',
        kmRodadoTotal: kmTotal,
        viagensCount: billedVoyagesCount,
        justificativaItem: justItem,
        justificativaTexto: justItem?.justificativa || '',
        categoria: justItem?.categoria || '',
        diasParado: justItem?.diasParado,
        observacoes: justItem?.observacoes || ''
      };
    });

  // Calculate stats for this month
  const totalUnbilledPlatesCount = unbilledPlatesRaw.length;
  const comJustificativaCount = unbilledPlatesRaw.filter(p => Boolean(p.justificativaTexto)).length;
  const semJustificativaCount = totalUnbilledPlatesCount - comJustificativaCount;

  // Faturamento médio das placas que FATURARAM neste mês (to calculate potential revenue lost)
  const billedPlates = Object.keys(plateMap).filter(p => plateMap[p].hasBilling);
  const faturamentoTotalBilled = voyagesInMonth.reduce((sum, v) => sum + (isSemFaturamento(v) ? 0 : (v.valorCarga || 0)), 0);
  const faturamentoMedio = billedPlates.length > 0 ? (faturamentoTotalBilled / billedPlates.length) : 0;
  const totalReceitaPotencialFaltante = faturamentoMedio * totalUnbilledPlatesCount;

  // Search and status filter
  const filteredPlates = unbilledPlatesRaw.filter(p => {
    // 1. Status filter (todos, com justificativa, sem justificativa)
    const hasJust = Boolean(p.justificativaTexto);
    if (filtroStatus === 'COM_JUSTIFICATIVA' && !hasJust) return false;
    if (filtroStatus === 'SEM_JUSTIFICATIVA' && hasJust) return false;

    // 2. Search term filter
    const term = search.toLowerCase().trim();
    if (!term) return true;

    return (
      p.placa.toLowerCase().includes(term) ||
      p.filial.toLowerCase().includes(term) ||
      p.motorista.toLowerCase().includes(term) ||
      p.supervisor.toLowerCase().includes(term) ||
      p.rotas.toLowerCase().includes(term) ||
      p.tipoVeiculo.toLowerCase().includes(term) ||
      p.justificativaTexto.toLowerCase().includes(term) ||
      p.observacoes.toLowerCase().includes(term)
    );
  });

  // Sorting
  const sortedPlates = [...filteredPlates].sort((a: any, b: any) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (sortField === 'justificativa') {
      valA = a.justificativaTexto || '';
      valB = b.justificativaTexto || '';
    }

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    } else {
      // numeric comparison
      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return sortDirection === 'asc' ? numA - numB : numB - numA;
    }
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (field: string) => {
    if (sortField !== field) return <span className="ml-1 opacity-20">↕</span>;
    return sortDirection === 'asc' ? <span className="ml-1 text-blue-500">↑</span> : <span className="ml-1 text-blue-500">↓</span>;
  };

  // Open Justification Modal for a specific plate
  const handleOpenJustificativa = (plateItem: any) => {
    const existing = plateItem.justificativaItem;
    setEditingPlate({
      placa: plateItem.placa,
      filial: plateItem.filial,
      motorista: plateItem.motorista,
      supervisor: plateItem.supervisor,
      tipoVeiculo: plateItem.tipoVeiculo,
      justificativaTexto: existing?.justificativa || '',
      categoria: existing?.categoria || 'OFICINA',
      diasParado: existing?.diasParado ?? 15,
      observacoes: existing?.observacoes || '',
      isExisting: Boolean(existing?.justificativa)
    });
  };

  // Save Justification
  const handleSaveJustificativa = async () => {
    if (!editingPlate || !editingPlate.justificativaTexto.trim()) {
      notify('Por favor, informe ou selecione o texto da justificativa.');
      return;
    }

    const { key, item } = await saveJustificativaRecord({
      placa: editingPlate.placa,
      mes: mesSelected,
      justificativa: editingPlate.justificativaTexto.trim(),
      categoria: editingPlate.categoria,
      diasParado: Number(editingPlate.diasParado) || 0,
      observacoes: editingPlate.observacoes.trim()
    });

    setJustificativas(prev => ({
      ...prev,
      [key]: item,
      [normalizePlacaKey(editingPlate.placa)]: item
    }));

    setToastMessage(`Justificativa salva com sucesso para a placa ${editingPlate.placa}!`);
    setEditingPlate(null);
  };

  // Delete Justification
  const handleDeleteJustificativa = async () => {
    if (!editingPlate) return;
    if (!(await askConfirm(`Deseja remover a justificativa da placa ${editingPlate.placa}?`, 'Remover'))) return;

    await deleteJustificativaRecord(editingPlate.placa, mesSelected);

    const norm = normalizePlacaKey(editingPlate.placa);
    setJustificativas(prev => {
      const copy = { ...prev };
      delete copy[`${norm}_${mesSelected}`];
      delete copy[norm];
      delete copy[editingPlate.placa];
      return copy;
    });

    setToastMessage(`Justificativa removida para a placa ${editingPlate.placa}.`);
    setEditingPlate(null);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Placa',
      'Filial',
      'Último Motorista',
      'Supervisor',
      'Viagens',
      'KM Percorrido',
      'Rotas',
      'Tipo de Veículo',
      'Justificativa Operacional',
      'Dias Parado',
      'Categoria Justificativa',
      'Data Atualização'
    ];

    const rows = sortedPlates.map(p => [
      `"${p.placa}"`,
      `"${p.filial}"`,
      `"${p.motorista}"`,
      `"${p.supervisor}"`,
      p.viagensCount,
      p.kmRodadoTotal,
      `"${p.rotas}"`,
      `"${p.tipoVeiculo}"`,
      `"${p.justificativaTexto || 'Sem Justificativa'}"`,
      p.diasParado || 0,
      `"${p.categoria || 'N/D'}"`,
      `"${p.justificativaItem?.dataAtualizacao || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveFile(`Placas_Sem_Faturamento_${mesSelected}_com_Justificativas.csv`, blob);
  };

  return (
    <div 
      className="fixed inset-0 bg-[#0b1c30]/65 backdrop-blur-xs z-55 flex items-center justify-center p-2 md:p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white w-[98vw] max-w-7xl xl:max-w-[96%] rounded-2xl shadow-2xl border border-[#c3c6d7]/30 flex flex-col h-[94vh] max-h-[94vh] overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Floating Toast Message */}
        {toastMessage && (
          <div className="absolute top-4 right-6 z-60 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header */}
        <div className="bg-[#0b1c30] px-6 py-3 md:py-3.5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div>
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest leading-none">
              Oportunidade e Receita Não Realizada
            </p>
            <h2 className="text-base md:text-lg font-black text-white mt-1 uppercase leading-tight">
              Placas sem Faturamento em {mesSelected}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 font-medium font-sans">
              Consulte aqui os veículos ociosos no mês, informe e consulte justificativas operacionais (ex: oficina, peças, manutenção).
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar janela"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Dynamic Monthly KPI Summaries */}
        <div className="bg-slate-50 border-b border-slate-100 p-3 shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3 font-sans text-xs">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-[#737686] font-extrabold uppercase tracking-wider block">
                Veículos Não Faturados ({mesSelected})
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl md:text-2xl font-black text-amber-600">
                  {totalUnbilledPlatesCount}
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                  ({comJustificativaCount} justificados • {semJustificativaCount} pendentes)
                </span>
              </div>
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block">
              Placas sem viagens produtivas faturadas no mês selecionado.
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-[#737686] font-extrabold uppercase tracking-wider block">
                Faturamento Médio por Placa Ativa
              </span>
              <span className="text-xl md:text-2xl font-black text-blue-600 block mt-0.5">
                R$ {faturamentoMedio.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block">
              Ticket médio gerado por veículos produtivos faturantes.
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between bg-amber-50/15 border-amber-200/40">
            <div>
              <span className="text-[9px] text-amber-700 font-extrabold uppercase tracking-wider block">
                Receita Potencial Não Faturada
              </span>
              <span className="text-xl md:text-2xl font-black text-rose-600 block mt-0.5">
                R$ {totalReceitaPotencialFaltante.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-amber-700 font-bold mt-1 block">
              Perda potencial calculada para as {totalUnbilledPlatesCount} placas inativas.
            </span>
          </div>
        </div>

        {/* Filter and Search controls */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-100 flex flex-col lg:flex-row items-center gap-3 justify-between shrink-0">
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-80 md:w-96">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por placa, filial, motorista, justificativa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-7 py-1.5 w-full bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-sans"
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Status Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setFiltroStatus('TODOS')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  filtroStatus === 'TODOS'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Todas ({totalUnbilledPlatesCount})
              </button>
              <button
                onClick={() => setFiltroStatus('COM_JUSTIFICATIVA')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  filtroStatus === 'COM_JUSTIFICATIVA'
                    ? 'bg-amber-100 text-amber-900 shadow-xs border border-amber-300'
                    : 'text-slate-500 hover:text-amber-800'
                }`}
              >
                <Wrench className="w-3 h-3 text-amber-600" />
                Justificadas ({comJustificativaCount})
              </button>
              <button
                onClick={() => setFiltroStatus('SEM_JUSTIFICATIVA')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  filtroStatus === 'SEM_JUSTIFICATIVA'
                    ? 'bg-rose-100 text-rose-900 shadow-xs border border-rose-300'
                    : 'text-slate-500 hover:text-rose-800'
                }`}
              >
                Pendentes ({semJustificativaCount})
              </button>
            </div>
          </div>

          {/* Counts & Export Actions */}
          <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
            <div className="text-[10px] md:text-[11px] text-[#737686] font-bold uppercase tracking-wider flex items-center gap-1.5">
              Exibindo <span className="text-slate-900 font-extrabold font-mono">{sortedPlates.length}</span> de <span className="text-slate-900 font-extrabold font-mono">{totalUnbilledPlatesCount}</span> placas
            </div>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 shadow-2xs transition-colors cursor-pointer"
              title="Baixar lista completa com justificativas em planilha CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Table Body Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0 bg-slate-50">
          {sortedPlates.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-xl shadow-xs">
              <AlertTriangle className="mx-auto h-12 w-12 text-slate-400 mb-2" />
              <p className="text-sm font-black text-slate-700 uppercase font-sans">Nenhum veículo encontrado</p>
              <p className="text-xs text-slate-500 font-medium font-sans mt-1">
                Refine seus termos de busca ou selecione outro filtro de justificativas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-md">
              <table className="w-full min-w-[1240px] text-left text-xs md:text-[13px] font-sans">
                <thead className="bg-slate-100/90 text-slate-600 text-[10px] md:text-xs uppercase font-black tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 cursor-pointer select-none text-center w-36 bg-slate-50/50" onClick={() => handleSort('placa')}>
                      Placa {getSortIndicator('placa')}
                    </th>
                    <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => handleSort('filial')}>
                      Filial / Unidade {getSortIndicator('filial')}
                    </th>
                    <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => handleSort('motorista')}>
                      Último Motorista {getSortIndicator('motorista')}
                    </th>
                    <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => handleSort('supervisor')}>
                      Supervisor Responsável {getSortIndicator('supervisor')}
                    </th>
                    <th className="px-3 py-2.5 cursor-pointer select-none text-center" onClick={() => handleSort('viagensCount')}>
                      Viagens {getSortIndicator('viagensCount')}
                    </th>
                    <th className="px-3 py-2.5 cursor-pointer select-none text-right" onClick={() => handleSort('kmRodadoTotal')}>
                      KM Percorrido {getSortIndicator('kmRodadoTotal')}
                    </th>
                    <th className="px-3 py-2.5">Rotas Recorrentes no Mês</th>
                    <th className="px-3 py-2.5">Tipo de Veículo</th>
                    <th className="px-3 py-2.5 cursor-pointer select-none bg-amber-50/60 text-amber-900 border-l border-amber-200/50 min-w-[230px]" onClick={() => handleSort('justificativa')}>
                      <div className="flex items-center gap-1">
                        <Wrench className="w-3.5 h-3.5 text-amber-600" />
                        <span>Justificativa Operacional {getSortIndicator('justificativa')}</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {sortedPlates.map((item, itemIdx) => {
                    const cleanPlaca = item.placa.trim().toUpperCase().replace('-', '');
                    const displayPlaca = cleanPlaca.length === 7 
                      ? `${cleanPlaca.slice(0, 3)}-${cleanPlaca.slice(3)}` 
                      : item.placa.trim().toUpperCase();

                    const hasJustificativa = Boolean(item.justificativaTexto);

                    return (
                      <tr key={`${item.placa}-${itemIdx}`} className="hover:bg-blue-50/10 transition-colors">
                        <td className="px-3 py-1.5 md:py-2 text-center bg-slate-50/30 whitespace-nowrap align-middle">
                          {/* Authentic Mercosul Styled Plate Badge */}
                          <div className="inline-flex flex-col w-28 h-9 border-2 border-slate-400 rounded-md bg-white shadow-xs select-none shrink-0 overflow-hidden">
                            {/* Blue Upper Strip with BRASIL & Mini Icon */}
                            <div className="bg-[#0051a8] text-white text-[7px] font-sans font-black px-1.5 h-3.5 flex justify-between items-center tracking-wider uppercase select-none leading-none">
                              <span className="flex items-center gap-0.5">
                                <span className="inline-block w-1.5 h-1 bg-green-500 rounded-2xs"></span>
                                BRASIL
                              </span>
                              <span className="text-[5.5px] opacity-80">MERCOSUL</span>
                            </div>
                            {/* Central Alphanumeric Area */}
                            <div className="flex-1 flex items-center justify-center font-mono text-[13px] font-[900] text-slate-900 tracking-wide leading-none bg-[#f8fafc]">
                              {displayPlaca}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 md:py-2 min-w-[190px] text-xs md:text-[13px] font-bold text-slate-800 uppercase leading-snug align-middle">
                          {item.filial}
                        </td>
                        <td className="px-3 py-1.5 md:py-2 text-xs md:text-[13px] font-semibold text-slate-700 uppercase truncate max-w-[150px] align-middle" title={item.motorista}>
                          {item.motorista}
                        </td>
                        <td className="px-3 py-1.5 md:py-2 text-xs md:text-[13px] font-bold text-slate-600 uppercase truncate max-w-[140px] align-middle" title={item.supervisor}>
                          {item.supervisor}
                        </td>
                        <td className="px-3 py-1.5 md:py-2 text-center text-xs md:text-[13px] font-black text-slate-900 align-middle">
                          {item.viagensCount}
                        </td>
                        <td className="px-3 py-1.5 md:py-2 text-right text-xs md:text-[13px] font-extrabold text-slate-800 font-mono align-middle">
                          {item.kmRodadoTotal.toLocaleString('pt-BR')} km
                        </td>
                        <td className="px-3 py-1.5 md:py-2 text-xs md:text-[13px] text-slate-600 font-medium truncate max-w-[130px] align-middle" title={item.rotas}>
                          {item.rotas}
                        </td>
                        <td className="px-3 py-1.5 md:py-2 text-xs md:text-[13px] text-slate-500 truncate max-w-[120px] align-middle" title={item.tipoVeiculo}>
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] md:text-[11px] font-extrabold rounded-md uppercase border border-slate-200">
                            {item.tipoVeiculo}
                          </span>
                        </td>

                        {/* Campo de Justificativa Operacional */}
                        <td className="px-3 py-1.5 md:py-2 align-middle bg-amber-50/20 border-l border-amber-200/40">
                          {hasJustificativa ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleOpenJustificativa(item)}
                                className="group/just inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black bg-amber-100/90 hover:bg-amber-200/80 text-amber-950 border border-amber-300 shadow-2xs transition-all text-left cursor-pointer max-w-[280px]"
                                title={`Justificado por ${item.justificativaItem?.usuario || 'Supervisão'} em ${item.justificativaItem?.dataAtualizacao || ''}. Clique para editar ou remover.`}
                              >
                                <Wrench className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <div className="flex flex-col overflow-hidden text-left leading-tight">
                                  <span className="truncate font-black tracking-tight uppercase">
                                    {item.justificativaTexto}
                                  </span>
                                  {item.diasParado !== undefined && item.diasParado > 0 && (
                                    <span className="text-[10px] text-amber-800 font-bold flex items-center gap-1 mt-0.5">
                                      <Clock className="w-2.5 h-2.5" />
                                      {item.diasParado} dias de parada
                                    </span>
                                  )}
                                </div>
                                <Edit3 className="w-3 h-3 text-amber-700 opacity-50 group-hover/just:opacity-100 shrink-0 ml-auto" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleOpenJustificativa(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold text-slate-600 bg-white hover:bg-amber-50 hover:text-amber-900 hover:border-amber-400 border border-dashed border-slate-300 shadow-2xs transition-all cursor-pointer select-none"
                              title="Adicionar justificativa para este veículo sem faturamento"
                            >
                              <Plus className="w-3.5 h-3.5 text-slate-500" />
                              <span>+ Justificar</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div className="text-[10px] md:text-[11px] text-[#737686] font-bold uppercase tracking-wider">
            Unidade Transp. Externo - Grupo Mateus • Módulo de Justificativas de Frota
          </div>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-[#0b1c30] text-white text-xs font-black rounded-lg hover:bg-opacity-90 transition-colors uppercase tracking-wider cursor-pointer shadow-sm hover:shadow-md"
          >
            Fechar
          </button>
        </div>

        {/* Modal de Registro / Edição de Justificativa */}
        {editingPlate && (
          <div 
            className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-4 animate-in fade-in duration-150"
            onClick={() => setEditingPlate(null)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-xl overflow-hidden font-sans flex flex-col max-h-[92vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-[#0b1c30] px-6 py-3.5 flex items-center justify-between text-white border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm md:text-base font-black uppercase tracking-wide">
                      {editingPlate.isExisting ? 'Editar Justificativa' : 'Inserir Justificativa'}
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Placa <span className="font-mono font-black text-amber-300">{editingPlate.placa}</span> • Mês de {mesSelected}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingPlate(null)}
                  className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 md:p-6 space-y-4 overflow-y-auto">
                {/* Informações do Veículo */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Filial</span>
                    <span className="font-bold text-slate-800 truncate block">{editingPlate.filial || 'Filial São Luís'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Supervisor</span>
                    <span className="font-bold text-slate-800 truncate block">{editingPlate.supervisor || 'N/D'}</span>
                  </div>
                </div>

                {/* Sugestões Rápidas de 1 Clique */}
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                    <span>Sugestões Rápidas (Clique para Preencher):</span>
                    <span className="text-[10px] text-amber-700 font-bold">1-Clique</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {JUSTIFICATIVAS_PRESETS.map((preset, pIdx) => {
                      const isSelected = editingPlate.justificativaTexto === preset.label;
                      const isRequestedExample = preset.label === 'EM OFICINA A 15 DIAS';

                      return (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => {
                            setEditingPlate(prev => prev ? {
                              ...prev,
                              justificativaTexto: preset.label,
                              categoria: preset.categoria,
                              diasParado: preset.label.includes('15 DIAS') ? 15 : preset.label.includes('30 DIAS') ? 30 : prev.diasParado
                            } : null);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all text-left flex items-center gap-1.5 cursor-pointer border ${
                            isSelected
                              ? 'bg-[#0b1c30] text-white border-[#0b1c30] shadow-xs'
                              : isRequestedExample
                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-400 font-black ring-1 ring-amber-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span>{preset.label}</span>
                          {isRequestedExample && (
                            <span className="text-[9px] bg-amber-600 text-white px-1 py-0.2 rounded uppercase font-black">
                              Exemplo
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Campo de Texto da Justificativa */}
                <div>
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider block mb-1">
                    Descrição da Justificativa <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={editingPlate.justificativaTexto}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setEditingPlate(prev => prev ? { ...prev, justificativaTexto: val } : null);
                    }}
                    placeholder="Ex: EM OFICINA A 15 DIAS AGUARDANDO PEÇAS..."
                    className="w-full px-3 py-2 text-xs md:text-sm font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white uppercase font-sans placeholder:normal-case transition-all"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Você pode selecionar uma sugestão acima ou digitar livremente qualquer motivo operacional.
                  </p>
                </div>

                {/* Campos Complementares */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Dias Parado (Estimativa)
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={editingPlate.diasParado}
                        onChange={(e) => {
                          const num = parseInt(e.target.value) || 0;
                          setEditingPlate(prev => prev ? { ...prev, diasParado: num } : null);
                        }}
                        className="pl-9 pr-3 py-1.5 w-full bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                        placeholder="Ex: 15"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Categoria Operacional
                    </label>
                    <select
                      value={editingPlate.categoria}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setEditingPlate(prev => prev ? { ...prev, categoria: cat } : null);
                      }}
                      className="px-3 py-1.5 w-full bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                    >
                      <option value="OFICINA">Oficina Mecânica</option>
                      <option value="MANUTENCAO">Manutenção Preventiva</option>
                      <option value="PECA">Aguardando Peça</option>
                      <option value="RESERVA">Veículo Reserva no Pátio</option>
                      <option value="MOTORISTA">Sem Motorista Disponível</option>
                      <option value="SINISTRO">Sinistro / Seguradora</option>
                      <option value="DESMOBILIZADO">Desmobilização de Frota</option>
                      <option value="OUTROS">Outros Motivos</option>
                    </select>
                  </div>
                </div>

                {/* Observações Opcionais */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Observações Adicionais (Opcional)
                  </label>
                  <input
                    type="text"
                    value={editingPlate.observacoes}
                    onChange={(e) => {
                      const obs = e.target.value;
                      setEditingPlate(prev => prev ? { ...prev, observacoes: obs } : null);
                    }}
                    placeholder="Ex: Previsão de liberação até sexta-feira, OS número 1042..."
                    className="px-3 py-1.5 w-full bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
                <div>
                  {editingPlate.isExisting && (
                    <button
                      type="button"
                      onClick={handleDeleteJustificativa}
                      className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover Justificativa</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPlate(null)}
                    className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveJustificativa}
                    className="inline-flex items-center gap-1.5 px-5 py-1.5 bg-[#004ac6] hover:bg-blue-700 text-white text-xs font-black rounded-lg shadow-sm hover:shadow-md transition-all uppercase tracking-wider cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Salvar Justificativa</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PotentialRevenueDetailModal;
