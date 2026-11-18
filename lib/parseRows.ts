import { Viagem } from '@/lib/types';

// Helper to dynamically normalize strings and find values in spreadsheet row objects
export const findValueByRegex = (obj: any, regex: RegExp, defaultValue: any = null): any => {
  if (!obj || typeof obj !== 'object') return defaultValue;
  const keys = Object.keys(obj);
  const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  
  for (const k of keys) {
    const normKey = normalize(k);
    const normClean = normKey.replace(/[^a-z0-9]/g, '');
    if (regex.test(normKey) || regex.test(normClean)) {
      return obj[k];
    }
  }
  return defaultValue;
};

export const parseNumber = (val: any, defaultValue: number = 0): number => {
  if (val === undefined || val === null) return defaultValue;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  const pointsCount = (cleaned.match(/\./g) || []).length;
  let finalStr = cleaned;
  if (pointsCount > 1) {
    finalStr = cleaned.split('.').join('');
  }
  const num = parseFloat(finalStr);
  return isNaN(num) ? defaultValue : num;
};

// Maps spreadsheet rows to standard Viagem interfaces
export const mapRowsToViagens = (rows: any[]): Viagem[] => {
  return rows.map((row, idx) => {
    const filial = String(findValueByRegex(row, /filial/i, 'Filial São Luís')).trim();
    const ano = String(findValueByRegex(row, /ano/i, '2026')).trim();
    const rawMes = String(findValueByRegex(row, /mes|m[êe]s/i, 'Maio')).trim();
    const normalizeMonthName = (m: string): string => {
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
    };
    const mes = normalizeMonthName(rawMes);
    const rota = String(findValueByRegex(row, /rota|trajeto|itinerario/i, '3131 - CHAPADINHA X MATA ROMA-MA')).trim();
    const modeloVeiculo = String(findValueByRegex(row, /modelo.*veiculo|veiculo|tipo/i, '20 - TRUCK BAU CARGA SECA')).trim();
    const placa = String(findValueByRegex(row, /placa/i, `OJD-${1000 + (idx % 9000)}`)).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/^([A-Z]{3})([0-9][A-Z0-9][0-9]{2})$/, '$1-$2');
    const motorista = String(findValueByRegex(row, /motorista|nome|num_condutor/i, 'ADRIANO RICARDO SANTOS')).trim().toUpperCase();
    const conhecimentoVal = String(findValueByRegex(row, /conhecimento|id|cod|viagem/i, `${8350000 + idx}`)).trim();
    const id = `${conhecimentoVal.replace(/\//g, '-')}_${idx}`;
    let supervisao = String(findValueByRegex(row, /supervisor|supervisao|supervis[ãa]o/i, ano === '2026' ? 'LEONAN' : 'Sem Supervisor')).trim().toUpperCase();
    if (supervisao === 'LEONAN BRAGA NONATO' || supervisao.includes('LEONAN')) {
      supervisao = 'LEONAN';
    }
    
    const kmRodado = parseNumber(findValueByRegex(row, /km.*rodado|km_rodado|distancia|km/i, 650));
    const metaKm = parseNumber(findValueByRegex(row, /meta.*km/i, 700));
    const ganhoPerdaKm = parseNumber(findValueByRegex(row, /ganho.*perda.*km/i, -50));
    
    const valorAbastecido = parseNumber(findValueByRegex(row, /valor.*abastecido|abastecido/i, 1200));
    const litros = parseNumber(findValueByRegex(row, /litros/i, 200));
    const valorLitro = parseNumber(findValueByRegex(row, /valor.*litro/i, 6.0));
    const metaKmL = parseNumber(findValueByRegex(row, /meta.*km.*l|kml/i, 3.5));
    const kmLRealizado = parseNumber(findValueByRegex(row, /km.*l.*realizado|kml.*realizado/i, 3.25));
    const ganhoPerdaLitro = parseNumber(findValueByRegex(row, /ganho.*perda.*litro/i, -12));
    const ganhoPerdaRS = parseNumber(findValueByRegex(row, /ganho.*perda.*r/i, -72));
    const statusMeta = String(findValueByRegex(row, /status.*meta|status/i, kmLRealizado >= metaKmL ? 'METAS_ATINGIDAS' : 'FORA_DA_META')).trim();
    
    const despesaOficinaRaw = findValueByRegex(row, /despesa.*oficina|oficina|despesa_oficina/i, null);
    const despesaOficina = despesaOficinaRaw !== null ? parseNumber(despesaOficinaRaw) : undefined;

    // Read faturamento using flexible resolver (valor_frete, valor_faturado, faturamento, frete, valor frete, valor etc.)
    const valorCarga = parseNumber(findValueByRegex(row, /faturamento|faturado|valor.*carga|valor.*faturado|carga/i, 210000));

    // Parse Expense Panel & Fleet fields
    const rawTipoFrota = String(findValueByRegex(row, /tipo.*frota|frota|categoria.*frota/i, 'FROTA PROPRIA')).trim().toUpperCase();
    const tipoFrota = rawTipoFrota.includes('TERC') ? 'TERCEIROS' : 'FROTA PROPRIA';

    const bloco = String(findValueByRegex(row, /bloco|setor|segmento/i, 'SECOS')).trim().toUpperCase();
    const prestacao = String(findValueByRegex(row, /presta[cç][aã]o|num.*prest|prest/i, `PC-${ano}-${conhecimentoVal}`)).trim().toUpperCase();

    const combustivel = parseNumber(findValueByRegex(row, /combustivel|combust[ií]vel|abastecimento|valor.*abastecido/i, valorAbastecido || 0));
    const salarioMotorista = parseNumber(findValueByRegex(row, /salario|sal[aá]rio|salario.*motorista|motorista.*custo/i, 0));
    const descarga = parseNumber(findValueByRegex(row, /descarga|chapa|taxa.*descarga/i, 0));
    const travessias = parseNumber(findValueByRegex(row, /travessia|travessias|balsa|ped[aá]gio/i, 0));
    const diarias = parseNumber(findValueByRegex(row, /diaria|di[aá]rias|ajuda.*custo/i, 0));
    const freteExtra = parseNumber(findValueByRegex(row, /frete.*extra|extra.*frete/i, 0));
    const descargaExtra = parseNumber(findValueByRegex(row, /descarga.*extra|extra.*descarga/i, 0));
    const oficina = parseNumber(findValueByRegex(row, /oficina|despesa.*oficina|manuten[cç][aã]o/i, despesaOficina || 0));
    const pecas = parseNumber(findValueByRegex(row, /pe[cç]as|peca|auto.*pe[cç]as/i, 0));
    const freteTerceiros = parseNumber(findValueByRegex(row, /frete.*terceiro|terceiro.*frete|valor.*terceiro|frete_terceiros/i, tipoFrota === 'TERCEIROS' ? valorCarga * 0.15 : 0));

    // Despesa Total Oficial (DESPTOTAL): utilize sempre o valor oficial se informado
    const rawDespTotal = findValueByRegex(row, /desptotal|desp.*total|total.*despesa|despesa.*total|custo.*total/i, null);
    let despTotal: number;
    if (rawDespTotal !== null && rawDespTotal !== undefined) {
      despTotal = parseNumber(rawDespTotal);
    } else {
      if (tipoFrota === 'TERCEIROS') {
        despTotal = freteTerceiros;
      } else {
        despTotal = combustivel + salarioMotorista + descarga + travessias + diarias + freteExtra + descargaExtra + oficina + pecas;
      }
    }

    return {
      id,
      tipoVeiculo: modeloVeiculo,
      rota,
      placa,
      motorista,
      kmRodado,
      valorCarga,
      qtdDias: 3 + (idx % 4),
      mediaDias: 3 + (idx % 4),
      metaViagem: 4,
      supervisao: supervisao,
      qtd: 1,

      // Integrated fields
      filial,
      ano,
      mes,
      conhecimento: conhecimentoVal,
      modeloVeiculo,
      metaKm,
      ganhoPerdaKm,
      valorAbastecido: combustivel,
      litros,
      valorLitro,
      metaKmL,
      kmLRealizado,
      ganhoPerdaLitro,
      ganhoPerdaRS,
      statusMeta,
      despesaOficina: oficina,

      // Expense comparison fields
      tipoFrota,
      bloco,
      prestacao,
      despTotal,
      combustivel,
      salarioMotorista,
      descarga,
      travessias,
      diarias,
      freteExtra,
      descargaExtra,
      oficina,
      pecas,
      freteTerceiros
    };
  });
};
