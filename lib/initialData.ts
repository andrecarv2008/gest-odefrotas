import { Viagem } from './types';

export interface MetadataLastUpdate {
  id: string;
  lastUploadedAt: string;
  uploaderName: string;
  fileName: string;
  recordCount: number;
}

export interface ImportLog {
  id?: string;
  data: string;
  hora: string;
  usuario: string;
  nomePlanilha: string;
  quantidadeRegistros: number;
  timestamp: number;
}

export const INITIAL_METADATA: MetadataLastUpdate = {
  id: 'last_update',
  lastUploadedAt: '01/09/2026 às 14:45',
  uploaderName: 'Administrador',
  fileName: 'VISAO FROTA - EXTERNA.xlsx',
  recordCount: 100
};

export const INITIAL_LOGS: ImportLog[] = [
  {
    id: 'log_init_001',
    data: '01/09/2026',
    hora: '14:45:00',
    usuario: 'Administrador',
    nomePlanilha: 'VISAO FROTA - EXTERNA.xlsx',
    quantidadeRegistros: 100,
    timestamp: 1788288300000
  }
];

const PLACAS = [
  'OXW-1115', 'MWD-7145', 'QRN-3A45', 'PTZ-8890', 'OXR-9012', 
  'NHP-4421', 'QRM-1980', 'PSV-6632', 'OXZ-5510', 'NXA-3321',
  'HQG-9988', 'MYK-7123', 'PTK-2201', 'QWP-4567', 'NXX-1122'
];

const MOTORISTAS = [
  'LENI FERREIRA COSTA',
  'ANTONIO FRANCISCO PINTO VIEIRA JUNIOR',
  'FRANCISCO GOMES MENDES',
  'JOSE RIBAMAR GUIMARAES J.',
  'ADRIANO RICARDO SANTOS',
  'FLAVIO RICARDO RODRIGUES DE ARAUJO',
  'SILVESTRE SOUZA LOPES',
  'RONILSON MARINHO LOPES',
  'TIAGO MOURA DO NASCIMENTO',
  'CARLOS EDUARDO SILVA',
  'MARCOS AURELIO SOUZA',
  'RAIMUNDO NONATO PEREIRA'
];

const ROTAS = [
  '3568 - TERESINA X NAZARIA-PI',
  '1204 - SAO LUIS X CAXIAS-MA',
  '4402 - IMPERATRIZ X BACABAL-MA',
  '5510 - TERESINA X TIMON-MA',
  '3390 - ALTOS X CAMPO MAIOR-PI',
  '7712 - FORTALEZA X SOBRAL-CE',
  '8820 - TERESINA X FLORIANO-PI',
  '6610 - SAO LUIS X SANTA INES-MA',
  '9910 - TERESINA X PICOS-PI',
  '2230 - PARNAIBA X PIRIPIRI-PI'
];

const FILIAIS = [
  '338 - ARMAZEM MATEUS S.A. CD 338 ALTOS',
  '102 - ARMAZEM MATEUS S.A. CD 102 SAO LUIS',
  '205 - ARMAZEM MATEUS S.A. CD 205 IMPERATRIZ',
  '410 - ARMAZEM MATEUS S.A. CD 410 TERESINA'
];

const TIPOS_VEICULO = [
  '20 - TRUCK BAU CARGA SECA',
  '30 - CARRETA BAU 28 PALETES',
  '10 - TOCO REFRIGERADO',
  '40 - BITREM CARGA SECA'
];

const SUPERVISORES = [
  'LEONAN BRAGA',
  'MARCOS VINICIUS',
  'RAIMUNDO NONATO',
  'CARLOS EDUARDO',
  'FLAVIO SANTOS'
];

const BLOCOS = ['SECOS', 'FRIOS', 'HORTI', 'FARMA'];

function generateInitialViagens(): Viagem[] {
  const list: Viagem[] = [];
  const anos = ['2025', '2026'];
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  
  let idCounter = 1000;

  // Generate structured trips for both 2025 and 2026
  anos.forEach((ano) => {
    // Generate trips per month for each supervisor
    meses.forEach((mes, mesIdx) => {
      SUPERVISORES.forEach((sup, supIdx) => {
        // Between 2 to 4 trips per supervisor per month
        const tripsCount = 3 + ((supIdx + mesIdx) % 2);
        for (let t = 0; t < tripsCount; t++) {
          idCounter++;
          const isTerceiro = (idCounter + mesIdx) % 4 === 0; // ~25% Terceiros, 75% Frota Própria
          const tipoFrota = isTerceiro ? 'TERCEIROS' : 'FROTA PROPRIA';
          const placa = isTerceiro ? `TER-${2000 + (idCounter % 500)}` : PLACAS[(idCounter + supIdx) % PLACAS.length];
          const motorista = isTerceiro ? `AGREGADO / ${MOTORISTAS[(idCounter) % MOTORISTAS.length]}` : MOTORISTAS[(idCounter) % MOTORISTAS.length];
          const rota = ROTAS[(idCounter + mesIdx) % ROTAS.length];
          const filial = FILIAIS[(supIdx + idCounter) % FILIAIS.length];
          const tipoVeic = TIPOS_VEICULO[(idCounter + t) % TIPOS_VEICULO.length];
          const bloco = BLOCOS[(idCounter + t) % BLOCOS.length];
          const prestacao = `PC-${ano}-${String(idCounter).padStart(5, '0')}`;

          const km = 180 + ((idCounter * 47) % 750);
          // Valor de faturamento/carga proporcional
          const valorCarga = 25000 + ((idCounter * 1650) % 95000);
          const dias = 2 + (idCounter % 5);

          // Year 2026 vs 2025 variations (e.g. slight efficiency gain or inflation)
          const yearMultiplier = ano === '2026' ? 0.96 : 1.0; // 4% average optimization in 2026
          
          let combustivel = 0;
          let salarioMotorista = 0;
          let descarga = 0;
          let travessias = 0;
          let diarias = 0;
          let freteExtra = 0;
          let descargaExtra = 0;
          let oficina = 0;
          let pecas = 0;
          let freteTerceiros = 0;
          let despTotal = 0;

          if (isTerceiro) {
            // Regra Crítica: Terceiros é exclusivamente o valor do frete pago (FRETE TERCEIROS)
            freteTerceiros = Math.round((2800 + ((idCounter * 310) % 7200)) * yearMultiplier);
            despTotal = freteTerceiros;
          } else {
            // Frota Própria: Todas as categorias operacionais
            const lit = Math.round(km / 3.1);
            const valLitro = ano === '2026' ? 5.85 : 6.10;
            combustivel = Math.round(lit * valLitro);
            salarioMotorista = Math.round(850 * yearMultiplier + ((idCounter % 5) * 40));
            descarga = Math.round(220 + ((idCounter % 4) * 50));
            travessias = (idCounter % 3 === 0) ? Math.round(140 + ((idCounter % 3) * 60)) : 0;
            diarias = Math.round(280 + ((idCounter % 3) * 70));
            freteExtra = (idCounter % 5 === 0) ? Math.round(300 + ((idCounter % 2) * 120)) : 0;
            descargaExtra = (idCounter % 6 === 0) ? Math.round(180 + ((idCounter % 2) * 70)) : 0;
            oficina = (idCounter % 4 === 0) ? Math.round(650 + ((idCounter % 5) * 180)) : 0;
            pecas = (idCounter % 4 === 0) ? Math.round(450 + ((idCounter % 4) * 150)) : 0;

            // Despesa total oficial
            despTotal = combustivel + salarioMotorista + descarga + travessias + diarias + freteExtra + descargaExtra + oficina + pecas;
          }

          const litConsumido = isTerceiro ? 0 : Math.round(km / 3.2);
          const valLitro = 5.95;
          const kmLReal = litConsumido > 0 ? Number((km / litConsumido).toFixed(2)) : 3.5;
          const metaKmL = 3.5;
          const statusMeta = kmLReal >= metaKmL ? 'DENTRO_DA_META' : 'FORA_DA_META';

          list.push({
            id: `VIG_${idCounter}`,
            tipoVeiculo: tipoVeic,
            rota: rota,
            placa: placa,
            motorista: motorista,
            kmRodado: km,
            valorCarga: valorCarga,
            qtdDias: dias,
            mediaDias: dias,
            metaViagem: 4,
            supervisao: sup,
            qtd: 1,
            filial: filial,
            ano: ano,
            mes: mes,
            conhecimento: `790${idCounter}`,
            modeloVeiculo: tipoVeic,
            metaKm: 700,
            ganhoPerdaKm: km - 700,
            valorAbastecido: combustivel,
            litros: litConsumido,
            valorLitro: valLitro,
            metaKmL: metaKmL,
            kmLRealizado: kmLReal,
            ganhoPerdaLitro: Number((litConsumido - (km / metaKmL)).toFixed(1)),
            ganhoPerdaRS: Number(((litConsumido - (km / metaKmL)) * valLitro).toFixed(2)),
            statusMeta: statusMeta,
            despesaOficina: oficina,
            statusFaturamento: 'FATUROU',

            // New comparative expense fields
            tipoFrota: tipoFrota,
            bloco: bloco,
            prestacao: prestacao,
            despTotal: despTotal,
            combustivel: combustivel,
            salarioMotorista: salarioMotorista,
            descarga: descarga,
            travessias: travessias,
            diarias: diarias,
            freteExtra: freteExtra,
            descargaExtra: descargaExtra,
            oficina: oficina,
            pecas: pecas,
            freteTerceiros: freteTerceiros
          });
        }
      });
    });
  });

  // Add sem faturamento entries for 2026
  for (let s = 0; s < 4; s++) {
    idCounter++;
    list.push({
      id: `ND_${idCounter}`,
      tipoVeiculo: '20 - TRUCK BAU CARGA SECA',
      rota: 'N/D',
      placa: PLACAS[(s + 8) % PLACAS.length],
      motorista: 'SEM MOTORISTA REGISTRADO',
      kmRodado: 0,
      valorCarga: 0,
      qtdDias: 0,
      mediaDias: 0,
      metaViagem: 4,
      supervisao: SUPERVISORES[s % SUPERVISORES.length],
      qtd: 1,
      filial: FILIAIS[0],
      ano: '2026',
      mes: 'Janeiro',
      conhecimento: 'N/D',
      modeloVeiculo: '20 - TRUCK BAU CARGA SECA',
      metaKm: 700,
      ganhoPerdaKm: 0,
      valorAbastecido: 0,
      litros: 0,
      valorLitro: 0,
      metaKmL: 3.5,
      kmLRealizado: 0,
      ganhoPerdaLitro: 0,
      ganhoPerdaRS: 0,
      statusMeta: 'FORA_DA_META',
      despesaOficina: 0,
      statusFaturamento: 'SEM FATURAMENTO',
      tipoFrota: 'FROTA PROPRIA',
      bloco: 'SECOS',
      prestacao: `PC-2026-${idCounter}`,
      despTotal: 0,
      combustivel: 0,
      salarioMotorista: 0,
      descarga: 0,
      travessias: 0,
      diarias: 0,
      freteExtra: 0,
      descargaExtra: 0,
      oficina: 0,
      pecas: 0,
      freteTerceiros: 0
    });
  }

  return list;
}

export const INITIAL_VIAGENS: Viagem[] = generateInitialViagens();

