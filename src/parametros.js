/*
 * MÓDULO DE PARÂMETROS LEGAIS
 * ---------------------------------------------------------------------------
 * Todos os valores legais usados pelo motor tributário ficam aqui, separados
 * por ano-calendário. Nenhum outro arquivo deve conter alíquotas, faixas ou
 * limites. Para um novo ano, copie o bloco do ano mais recente, ajuste os
 * valores, informe fonte/vigência e marque o status de validação.
 *
 * STATUS DE VALIDAÇÃO usados:
 *   'conferido_secundaria'  valor conferido em fontes secundárias na data de
 *                           consulta; a fonte oficial não pôde ser acessada no
 *                           ambiente de desenvolvimento e deve ser conferida.
 *   'transcrito'            valor transcrito da legislação conhecida pelo
 *                           desenvolvedor, sem nova conferência online.
 *   'derivado'              valor calculado a partir de outros parâmetros.
 *   'projetado'             valor ainda não publicado; premissa para simulação.
 *   'interpretacao'         regra cuja aplicação depende de interpretação.
 *   'personalizado'         alterado pelo usuário.
 *
 * Nenhum parâmetro deste arquivo está marcado como "verificado na fonte
 * oficial". A aplicação não se atualiza sozinha.
 */
(function (raiz) {
  'use strict';

  var CONSULTA = '2026-10-26';

  var FONTES = {
    lc123: {
      titulo: 'Lei Complementar nº 123/2006 (Simples Nacional), art. 3º, 17, 18 e Anexos I, III e V, redação da LC nº 155/2016',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
      consulta: CONSULTA
    },
    cgsn140: {
      titulo: 'Resolução CGSN nº 140/2018, arts. 22, 25, 26 e 145 (receita bruta, início de atividade, fator "r", distribuição de lucros)',
      url: 'https://normas.receita.fazenda.gov.br/ (pesquisar "Resolução CGSN nº 140/2018")',
      consulta: CONSULTA
    },
    cgsn190: {
      titulo: 'Resolução CGSN nº 190/2026 (adequação do Simples Nacional à reforma do consumo; RBT12/FS12 com defasagem de um mês; fator "r" = 0,28 nos dois primeiros meses; fim do regime de caixa)',
      url: 'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=152832',
      consulta: CONSULTA
    },
    l15270: {
      titulo: 'Lei nº 15.270/2025 (redução do IRPF mensal e anual, retenção de 10% sobre lucros e dividendos, tributação mínima IRPFM — arts. 3º-A, 6º-A, 16-A e 16-B da Lei nº 9.250/1995)',
      url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm',
      consulta: CONSULTA
    },
    l15191: {
      titulo: 'Lei nº 15.191/2025 (tabela progressiva mensal do IRPF a partir de maio de 2025; desconto simplificado mensal de R$ 607,20)',
      url: 'https://www.planalto.gov.br/ (pesquisar "Lei nº 15.191/2025")',
      consulta: CONSULTA
    },
    rfbTabelas: {
      titulo: 'Receita Federal — tabelas do IRPF (incidência mensal e anual)',
      url: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas',
      consulta: CONSULTA
    },
    l9250: {
      titulo: 'Lei nº 9.250/1995 (IRPF: deduções, desconto simplificado, dependentes, instrução)',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
      consulta: CONSULTA
    },
    l9249: {
      titulo: 'Lei nº 9.249/1995, arts. 10 e 15 (isenção de lucros e dividendos; percentuais de presunção, inclusive serviços hospitalares)',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/l9249.htm',
      consulta: CONSULTA
    },
    l9430: {
      titulo: 'Lei nº 9.430/1996 (apuração trimestral do IRPJ e da CSLL; adicional de 10%)',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/l9430.htm',
      consulta: CONSULTA
    },
    lc224: {
      titulo: 'Lei Complementar nº 224/2025 (acréscimo de 10% nos percentuais de presunção sobre a receita que exceder R$ 5 milhões/ano; questionada na ADI 7936)',
      url: 'https://www.planalto.gov.br/ (pesquisar "Lei Complementar nº 224/2025")',
      consulta: CONSULTA
    },
    l9718: {
      titulo: 'Lei nº 9.718/1998 (PIS/Cofins cumulativos: 0,65% e 3%)',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/l9718compilada.htm',
      consulta: CONSULTA
    },
    l10637: {
      titulo: 'Leis nº 10.637/2002 e 10.833/2003 (PIS/Cofins não cumulativos: 1,65% e 7,6%)',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.833.htm',
      consulta: CONSULTA
    },
    l8212: {
      titulo: 'Lei nº 8.212/1991, arts. 21, 22 e 28 (contribuição do contribuinte individual, contribuição patronal de 20%, RAT e salário de contribuição)',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
      consulta: CONSULTA
    },
    l10666: {
      titulo: 'Lei nº 10.666/2003, art. 4º (retenção de 11% do contribuinte individual pela empresa)',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.666.htm',
      consulta: CONSULTA
    },
    portariaInss2026: {
      titulo: 'Portaria Interministerial MPS/MF nº 13/2026 (teto do salário de contribuição de R$ 8.475,55 e salário mínimo de R$ 1.621,00 em 2026)',
      url: 'https://www.in.gov.br/ (pesquisar "Portaria Interministerial MPS/MF nº 13, de 2026")',
      consulta: CONSULTA
    },
    in1700: {
      titulo: 'Instrução Normativa RFB nº 1.700/2017, art. 238 (limite de distribuição isenta sem escrituração contábil)',
      url: 'https://normas.receita.fazenda.gov.br/ (pesquisar "IN RFB 1700/2017")',
      consulta: CONSULTA
    },
    lc116: {
      titulo: 'Lei Complementar nº 116/2003 (ISS: alíquota mínima de 2% e máxima de 5%) e Decreto-Lei nº 406/1968, art. 9º, §§ 1º e 3º (ISS fixo de sociedades uniprofissionais)',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm',
      consulta: CONSULTA
    },
    lc214: {
      titulo: 'Emenda Constitucional nº 132/2023 e Lei Complementar nº 214/2025 (CBS/IBS; ano de teste 2026; CBS plena a partir de 2027; redução de 60% para serviços de saúde)',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
      consulta: CONSULTA
    },
    secundarias: {
      titulo: 'Fontes secundárias usadas na conferência (portais contábeis e de legislação): tabelas IRPF 2026, teto INSS 2026, LC 224/2025, Res. CGSN 190/2026 e Lei 15.270/2025',
      url: 'https://www.contabilizei.com.br/contabilidade-online/tabela-imposto-de-renda/ ; https://valorfinal.com.br/tabela-inss-2026 ; https://www.contabeis.com.br/noticias/75261/ ; https://www.fecomercio-rs.org.br/ ; https://www.mayerbrown.com/pt/insights/publications/2025/12/',
      consulta: CONSULTA
    }
  };

  // Repartição dos tributos no DAS: [IRPJ, CSLL, COFINS, PIS, CPP, ISS ou ICMS]
  function faixa(ate, aliq, pd, rep) {
    return {
      ate: ate, aliquota: aliq, parcelaDeduzir: pd,
      reparticao: { IRPJ: rep[0], CSLL: rep[1], COFINS: rep[2], PIS: rep[3], CPP: rep[4], ISS: rep[5] }
    };
  }

  var ANEXO_III = {
    nome: 'Anexo III',
    descricao: 'Serviços (inclui atividades do § 5º-I do art. 18 da LC 123 quando o fator "r" ≥ 28%)',
    faixas: [
      faixa(180000.00, 0.06, 0.00, [0.04, 0.035, 0.1282, 0.0278, 0.434, 0.335]),
      faixa(360000.00, 0.112, 9360.00, [0.04, 0.035, 0.1405, 0.0305, 0.434, 0.32]),
      faixa(720000.00, 0.135, 17640.00, [0.04, 0.035, 0.1364, 0.0296, 0.434, 0.325]),
      faixa(1800000.00, 0.16, 35640.00, [0.04, 0.035, 0.1364, 0.0296, 0.434, 0.325]),
      faixa(3600000.00, 0.21, 125640.00, [0.04, 0.035, 0.1282, 0.0278, 0.434, 0.335]),
      faixa(4800000.00, 0.33, 648000.00, [0.35, 0.15, 0.1603, 0.0347, 0.305, 0])
    ],
    status: 'conferido_secundaria',
    fontes: ['lc123'],
    observacao: 'Faixas e parcelas a deduzir conferidas em fonte secundária. Repartição transcrita da LC 123 (sem conferência online). ISS limitado a 5% efetivo, com transferência proporcional da diferença aos tributos federais (nota da 5ª faixa).'
  };

  var ANEXO_V = {
    nome: 'Anexo V',
    descricao: 'Serviços do § 5º-I do art. 18 da LC 123 (inclui medicina, inclusive laboratorial) quando o fator "r" < 28%',
    faixas: [
      faixa(180000.00, 0.155, 0.00, [0.25, 0.15, 0.141, 0.0305, 0.2885, 0.14]),
      faixa(360000.00, 0.18, 4500.00, [0.23, 0.15, 0.141, 0.0305, 0.2785, 0.17]),
      faixa(720000.00, 0.195, 9900.00, [0.24, 0.15, 0.1492, 0.0323, 0.2385, 0.19]),
      faixa(1800000.00, 0.205, 17100.00, [0.21, 0.15, 0.1574, 0.0341, 0.2385, 0.21]),
      faixa(3600000.00, 0.23, 62100.00, [0.23, 0.125, 0.141, 0.0305, 0.2385, 0.235]),
      faixa(4800000.00, 0.305, 540000.00, [0.35, 0.155, 0.1644, 0.0356, 0.295, 0])
    ],
    status: 'transcrito',
    fontes: ['lc123'],
    observacao: 'Alíquotas nominais 15,5% a 30,5% confirmadas em fonte secundária; parcelas a deduzir e repartição transcritas da LC 123 — conferir no Portal do Simples Nacional.'
  };

  var ANEXO_I = {
    nome: 'Anexo I',
    descricao: 'Comércio (revenda de mercadorias). A coluna "ISS" corresponde ao ICMS neste anexo.',
    faixas: [
      faixa(180000.00, 0.04, 0.00, [0.055, 0.035, 0.1274, 0.0276, 0.415, 0.34]),
      faixa(360000.00, 0.073, 5940.00, [0.055, 0.035, 0.1274, 0.0276, 0.415, 0.34]),
      faixa(720000.00, 0.095, 13860.00, [0.055, 0.035, 0.1274, 0.0276, 0.42, 0.335]),
      faixa(1800000.00, 0.107, 22500.00, [0.055, 0.035, 0.1274, 0.0276, 0.42, 0.335]),
      faixa(3600000.00, 0.143, 87300.00, [0.055, 0.035, 0.1274, 0.0276, 0.42, 0.335]),
      faixa(4800000.00, 0.19, 378000.00, [0.135, 0.10, 0.2827, 0.0613, 0.421, 0])
    ],
    status: 'transcrito',
    fontes: ['lc123'],
    observacao: 'Incluído para receitas de revenda segregadas. Transcrito da LC 123; conferir.'
  };

  function clonar(o) { return JSON.parse(JSON.stringify(o)); }

  var TABELA_MENSAL_DESDE_MAI_2025 = [
    { ate: 2428.80, aliquota: 0, deducao: 0 },
    { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
    { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
    { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
    { ate: null, aliquota: 0.275, deducao: 908.73 }
  ];

  var TABELA_MENSAL_ATE_ABR_2025 = [
    { ate: 2259.20, aliquota: 0, deducao: 0 },
    { ate: 2826.65, aliquota: 0.075, deducao: 169.44 },
    { ate: 3751.05, aliquota: 0.15, deducao: 381.44 },
    { ate: 4664.68, aliquota: 0.225, deducao: 662.77 },
    { ate: null, aliquota: 0.275, deducao: 896.00 }
  ];

  var ANO_2026 = {
    ano: 2026,
    rotulo: '2026 (vigente)',
    status: 'conferido_secundaria',
    resumoStatus: 'Parâmetros de 2026 conferidos em fontes secundárias em ' + CONSULTA + '. As páginas oficiais (planalto.gov.br, gov.br/receitafederal) não puderam ser acessadas no ambiente de desenvolvimento: confira antes de decidir.',
    simples: {
      limiteAnual: 4800000.00,
      limiteMensalInicioAtividade: 400000.00,
      sublimiteIssIcms: 3600000.00,
      sublimiteMensalInicioAtividade: 300000.00,
      limiteFatorR: 0.28,
      issEfetivoMaximo: 0.05,
      issEfetivoMinimo: 0.02,
      limiteIssFixoMe: 360000.00,
      regimeCaixaPermitido: true,
      apuracao: {
        defasagemMeses: 0,
        regraInicioAtividade: 'res140',
        descricao: 'RBT12 e FS12 = 12 meses anteriores ao período de apuração. Início de atividade: no 1º mês, receita do próprio mês × 12; nos 11 meses seguintes, média dos meses anteriores × 12 (Res. CGSN 140, art. 22). Fator "r" no início de atividade: mesma proporcionalização para folha e receita; se houver folha sem receita, r = 0,28 (art. 26, § 6º, conforme fonte secundária).',
        status: 'interpretacao',
        fontes: ['cgsn140', 'lc123']
      },
      folhaFatorR: {
        descricao: 'FS12 = remunerações pagas a pessoas físicas pelo trabalho (pró-labore, salários, 13º, férias, autônomos informados no eSocial/GFIP) + FGTS + contribuição patronal previdenciária efetivamente recolhida fora do DAS. Não entram: distribuição de lucros e aluguéis (LC 123, art. 18, §§ 24 a 26). Folha considerada pelo regime de caixa (Solução de Consulta Cosit nº 17, conforme fonte secundária).',
        status: 'interpretacao',
        fontes: ['lc123', 'cgsn140']
      },
      anexos: { I: clonar(ANEXO_I), III: clonar(ANEXO_III), V: clonar(ANEXO_V) },
      fontes: ['lc123', 'cgsn140']
    },
    presumido: {
      presuncao: {
        servicos: { irpj: 0.32, csll: 0.32, rotulo: 'Serviços em geral (consultas, plantões, procedimentos ambulatoriais)' },
        hospitalar: { irpj: 0.08, csll: 0.12, rotulo: 'Serviços hospitalares e de auxílio diagnóstico e terapia (exige sociedade empresária e normas da Anvisa)' },
        comercio: { irpj: 0.08, csll: 0.12, rotulo: 'Revenda de mercadorias' }
      },
      irpjAliquota: 0.15,
      adicionalAliquota: 0.10,
      adicionalLimiteMensal: 20000.00,
      csllAliquota: 0.09,
      pis: 0.0065,
      cofins: 0.03,
      cbs: null,
      lc224: {
        ativo: true,
        limiteTrimestral: 1250000.00,
        acrescimo: 0.10,
        mesInicioIrpj: 1,
        mesInicioCsll: 4,
        status: 'interpretacao',
        observacao: 'Acréscimo de 10% nos percentuais de presunção sobre a parcela da receita acumulada no ano que exceder R$ 1,25 milhão por trimestre (R$ 5 milhões/ano). CSLL a partir de abril/2026 (anterioridade nonagesimal). Norma questionada no STF (ADI 7936) e com liminares pontuais.'
      },
      limiteReceitaAnual: 78000000.00,
      fontes: ['l9249', 'l9430', 'l9718', 'lc224'],
      status: 'conferido_secundaria'
    },
    real: {
      irpjAliquota: 0.15,
      adicionalAliquota: 0.10,
      adicionalLimiteMensal: 20000.00,
      csllAliquota: 0.09,
      pis: 0.0165,
      cofins: 0.076,
      pisReceitaFinanceira: 0.0065,
      cofinsReceitaFinanceira: 0.04,
      limiteCompensacaoPrejuizo: 0.30,
      cbs: null,
      fontes: ['l9430', 'l10637'],
      status: 'transcrito'
    },
    reformaConsumo: {
      descricao: '2026 é ano de teste: CBS 0,9% e IBS 0,1% destacados em documento fiscal, compensáveis com PIS/Cofins ou dispensados para quem cumpre as obrigações acessórias. O simulador considera custo efetivo zero em 2026. Optantes pelo Simples continuam recolhendo pelo DAS.',
      custoEfetivo: 0,
      status: 'interpretacao',
      fontes: ['lc214']
    },
    previdencia: {
      salarioMinimo: 1621.00,
      teto: 8475.55,
      aliquotaContribuinteIndividual: 0.11,
      patronalProLabore: 0.20,
      patronalEmpregados: 0.20,
      ratPadrao: 0.02,
      terceirosPadrao: 0.058,
      fgts: 0.08,
      fontes: ['l8212', 'l10666', 'portariaInss2026'],
      status: 'conferido_secundaria',
      observacao: 'Contribuição do sócio: 11% sobre o pró-labore, limitada ao teto (R$ 932,31). Nos Anexos III e V a CPP patronal está dentro do DAS; no Lucro Presumido e no Real, 20% sobre o pró-labore e 20% + RAT×FAP + terceiros sobre salários.'
    },
    irpf: {
      mensal: [
        { desdeMes: 1, faixas: clonar(TABELA_MENSAL_DESDE_MAI_2025), descontoSimplificado: 607.20, deducaoDependente: 189.59 }
      ],
      reducaoMensal: { ativo: true, limiteIsencao: 5000.00, reducaoMaxima: 312.89, limiteSuperior: 7350.00, a: 978.62, b: 0.133145 },
      anual: {
        faixas: [
          { ate: 29145.60, aliquota: 0, deducao: 0 },
          { ate: 33919.80, aliquota: 0.075, deducao: 2185.92 },
          { ate: 45012.60, aliquota: 0.15, deducao: 4729.91 },
          { ate: 55976.16, aliquota: 0.225, deducao: 8105.85 },
          { ate: null, aliquota: 0.275, deducao: 10904.66 }
        ],
        descontoSimplificadoPercentual: 0.20,
        descontoSimplificadoLimite: 17640.00,
        deducaoDependente: 2275.08,
        limiteInstrucaoPorPessoa: 3561.50,
        limitePgblPercentual: 0.12
      },
      reducaoAnual: { ativo: true, limiteIsencao: 60000.00, reducaoMaxima: 2694.15, limiteSuperior: 88200.00, a: 8429.73, b: 0.095575 },
      dispensaRetencaoAte: 10.00,
      fontes: ['l15270', 'l15191', 'rfbTabelas', 'l9250', 'secundarias'],
      status: 'conferido_secundaria',
      observacao: 'Tabela progressiva mensal mantida desde maio/2025; redução mensal (até R$ 5.000 zera o imposto; até R$ 7.350 redução decrescente) e anual (até R$ 60.000; até R$ 88.200) da Lei 15.270/2025. A redução é limitada ao imposto calculado pela tabela.'
    },
    dividendos: {
      retencao: { ativo: true, limiteMensalPorFonte: 50000.00, aliquota: 0.10, incideSobreTotal: true },
      naoResidente: { aliquota: 0.10 },
      transicao: {
        ativo: true,
        descricao: 'Lucros apurados até o ano-calendário de 2025, com distribuição aprovada até 31/12/2025 (prazo possivelmente prorrogado para 31/01/2026 por cautelar do STF) e pagos em 2026, 2027 ou 2028 nos termos do ato de aprovação: sem retenção e fora da base do IRPFM (art. 16-A, § 1º, XII, conforme fonte secundária).',
        excluiRetencao: true,
        excluiBaseIrpfm: true,
        status: 'interpretacao'
      },
      limiteSemEscrituracao: 'Sem escrituração contábil, a parcela isenta fica limitada ao lucro presumido (percentual de presunção × receita) menos os tributos devidos (IN RFB 1.700/2017, art. 238; LC 123, art. 14, § 1º — no Simples, menos o IRPJ do DAS).',
      fontes: ['l15270', 'l9249', 'in1700', 'lc123'],
      status: 'conferido_secundaria'
    },
    irpfm: {
      ativo: true,
      limiteInferior: 600000.00,
      limiteSuperior: 1200000.00,
      aliquotaMaxima: 0.10,
      redutorLimitePJ: 0.34,
      fontes: ['l15270', 'secundarias'],
      status: 'interpretacao',
      observacao: 'Alíquota (%) = rendimentos/60.000 − 10, entre R$ 600 mil e R$ 1,2 milhão; 10% acima. Deduzem-se o IRPF devido na tabela progressiva e o IR exclusivo/definitivo; a retenção de 10% sobre dividendos é antecipação. Redutor do art. 16-B simplificado: aplica-se quando a alíquota efetiva da PJ (IRPJ+CSLL/lucro contábil) somada à do IRPFM excede 34%, e exige demonstrações financeiras.'
    }
  };

  var ANO_2025 = clonar(ANO_2026);
  ANO_2025.ano = 2025;
  ANO_2025.rotulo = '2025 (retrospectivo)';
  ANO_2025.status = 'transcrito';
  ANO_2025.resumoStatus = 'Parâmetros de 2025 transcritos (tabela mensal do IRPF com mudança em maio/2025). A tabela anual foi conferida apenas quanto à consistência interna. Sem retenção de dividendos e sem IRPFM em 2025.';
  ANO_2025.previdencia.salarioMinimo = 1518.00;
  ANO_2025.previdencia.teto = 8157.41;
  ANO_2025.previdencia.status = 'transcrito';
  ANO_2025.previdencia.fontes = ['l8212', 'l10666'];
  ANO_2025.presumido.lc224.ativo = false;
  ANO_2025.irpf.mensal = [
    { desdeMes: 1, faixas: clonar(TABELA_MENSAL_ATE_ABR_2025), descontoSimplificado: 564.80, deducaoDependente: 189.59 },
    { desdeMes: 5, faixas: clonar(TABELA_MENSAL_DESDE_MAI_2025), descontoSimplificado: 607.20, deducaoDependente: 189.59 }
  ];
  ANO_2025.irpf.reducaoMensal.ativo = false;
  ANO_2025.irpf.reducaoAnual.ativo = false;
  ANO_2025.irpf.anual.faixas = [
    { ate: 28467.20, aliquota: 0, deducao: 0 },
    { ate: 33919.80, aliquota: 0.075, deducao: 2135.04 },
    { ate: 45012.60, aliquota: 0.15, deducao: 4679.03 },
    { ate: 55976.16, aliquota: 0.225, deducao: 8054.97 },
    { ate: null, aliquota: 0.275, deducao: 10853.78 }
  ];
  ANO_2025.irpf.anual.descontoSimplificadoLimite = 16754.34;
  ANO_2025.irpf.status = 'transcrito';
  ANO_2025.irpf.fontes = ['l15191', 'rfbTabelas', 'l9250'];
  ANO_2025.irpf.observacao = 'Jan–abr/2025: isenção até R$ 2.259,20 e desconto simplificado de R$ 564,80. Mai–dez/2025: isenção até R$ 2.428,80 e desconto de R$ 607,20. Sem a redução da Lei 15.270 (vigente a partir de 2026).';
  ANO_2025.dividendos.retencao.ativo = false;
  ANO_2025.dividendos.transicao.ativo = false;
  ANO_2025.dividendos.status = 'transcrito';
  ANO_2025.irpfm.ativo = false;
  ANO_2025.reformaConsumo.descricao = 'Sem CBS/IBS em 2025.';

  var ANO_2027 = clonar(ANO_2026);
  ANO_2027.ano = 2027;
  ANO_2027.rotulo = '2027 (projetado)';
  ANO_2027.status = 'projetado';
  ANO_2027.resumoStatus = 'PROJEÇÃO NÃO OFICIAL. Tabelas do IRPF, teto do INSS e salário mínimo de 2027 não publicados: repetidos os valores de 2026. Simples Nacional com as regras da Res. CGSN 190/2026 (defasagem de um mês na RBT12/FS12, fator "r" = 0,28 nos dois primeiros meses, sem regime de caixa). No Lucro Presumido e no Real, PIS/Cofins substituídos por CBS estimada (alíquota de referência ainda não fixada).';
  ANO_2027.simples.regimeCaixaPermitido = false;
  ANO_2027.simples.apuracao = {
    defasagemMeses: 1,
    regraInicioAtividade: 'res190',
    descricao: 'Res. CGSN 190/2026 (efeitos a partir de 01/01/2027, conforme fontes secundárias): RBT12 e FS12 = 12 meses anteriores ao mês imediatamente anterior ao período de apuração (defasagem de um mês). Fator "r" = 0,28 nos dois primeiros meses de atividade; do 3º ao 13º mês, média aritmética × 12. Premissa do simulador para a RBT12 dos dois primeiros meses: média dos meses de atividade até o próprio mês × 12.',
    status: 'interpretacao',
    fontes: ['cgsn190']
  };
  ANO_2027.simples.fontes = ['lc123', 'cgsn140', 'cgsn190'];
  ANO_2027.presumido.lc224.mesInicioCsll = 1;
  ANO_2027.presumido.pis = 0;
  ANO_2027.presumido.cofins = 0;
  ANO_2027.presumido.cbs = { aliquotaReferencia: 0.088, reducaoSaude: 0.60, aliquotaCreditoInsumos: 0.088, status: 'projetado', observacao: 'Alíquota de referência estimada (não fixada pelo Senado). Serviços de saúde com redução de 60% (LC 214/2025). Créditos estimados sobre despesas marcadas como geradoras de crédito.' };
  ANO_2027.real.pis = 0;
  ANO_2027.real.cofins = 0;
  ANO_2027.real.pisReceitaFinanceira = 0;
  ANO_2027.real.cofinsReceitaFinanceira = 0;
  ANO_2027.real.cbs = clonar(ANO_2027.presumido.cbs);
  ANO_2027.reformaConsumo = {
    descricao: '2027 (projeção): PIS e Cofins extintos; CBS plena com redução de 60% para serviços de saúde; IBS de teste (0,1%) não modelado. Optantes pelo Simples permanecem no DAS, salvo opção pelo regime regular de IBS/CBS.',
    custoEfetivo: 0,
    status: 'projetado',
    fontes: ['lc214', 'cgsn190']
  };
  ANO_2027.previdencia.status = 'projetado';
  ANO_2027.irpf.status = 'projetado';
  ANO_2027.irpfm.status = 'interpretacao';
  ANO_2027.dividendos.status = 'interpretacao';

  var TRATAMENTOS = {
    simples: {
      fator_r: 'Medicina (Anexo III se fator "r" ≥ 28%; senão Anexo V)',
      III: 'Anexo III (sem fator "r")',
      V: 'Anexo V (sem fator "r")',
      I: 'Anexo I (revenda de mercadorias)',
      nao_segregada: 'Não segregada (tratada como medicina, com alerta)'
    },
    presumido: {
      servicos: 'Presunção de 32% (IRPJ e CSLL)',
      hospitalar: 'Presunção de 8% IRPJ / 12% CSLL (equiparação hospitalar, se cumpridos os requisitos)',
      comercio: 'Presunção de 8% IRPJ / 12% CSLL (revenda)'
    }
  };

  var CODIGOS_RECEITA = {
    '2089': { tributo: 'IRPJ', descricao: 'IRPJ — Lucro Presumido' },
    '2372': { tributo: 'CSLL', descricao: 'CSLL — Lucro Presumido' },
    '8109': { tributo: 'PIS', descricao: 'PIS — regime cumulativo' },
    '2172': { tributo: 'COFINS', descricao: 'Cofins — regime cumulativo' },
    '6912': { tributo: 'PIS', descricao: 'PIS — regime não cumulativo' },
    '5856': { tributo: 'COFINS', descricao: 'Cofins — regime não cumulativo' },
    '2362': { tributo: 'IRPJ', descricao: 'IRPJ — Lucro Real, estimativa mensal' },
    '2484': { tributo: 'CSLL', descricao: 'CSLL — Lucro Real, estimativa mensal' },
    '0220': { tributo: 'IRPJ', descricao: 'IRPJ — Lucro Real trimestral' },
    '6012': { tributo: 'CSLL', descricao: 'CSLL — Lucro Real trimestral' },
    '0561': { tributo: 'IRRF', descricao: 'IRRF — rendimento do trabalho assalariado' },
    '0588': { tributo: 'IRRF', descricao: 'IRRF — rendimento do trabalho sem vínculo empregatício (pró-labore)' },
    '1708': { tributo: 'IRRF', descricao: 'IRRF — serviços profissionais prestados por PJ' },
    '5952': { tributo: 'CSRF', descricao: 'Retenção de CSLL, Cofins e PIS' },
    '3208': { tributo: 'IRRF', descricao: 'IRRF — aluguéis e royalties pagos a PF' },
    '0190': { tributo: 'IRPF', descricao: 'Carnê-leão' },
    '0211': { tributo: 'IRPF', descricao: 'IRPF — quota da declaração de ajuste' }
  };

  var PARAMETROS_LEGAIS = {
    versao: '2026.10.1',
    dataAtualizacao: CONSULTA,
    aviso: 'Parâmetros embarcados no arquivo. A aplicação não consulta a internet e não se atualiza sozinha. Data da última revisão dos parâmetros: ' + CONSULTA + '.',
    anos: { 2025: ANO_2025, 2026: ANO_2026, 2027: ANO_2027 },
    anoPadrao: 2026,
    fontes: FONTES,
    tratamentos: TRATAMENTOS,
    codigosReceita: CODIGOS_RECEITA,
    clonar: clonar
  };

  raiz.ParametrosLegais = PARAMETROS_LEGAIS;
})(typeof window !== 'undefined' ? window : globalThis);
