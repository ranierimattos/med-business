/*
 * MOTOR TRIBUTÁRIO
 * ---------------------------------------------------------------------------
 * Funções puras, sem acesso à interface. Recebe o estado preenchido pelo
 * usuário e um conjunto de parâmetros legais (ParametrosLegais.anos[ano]) e
 * devolve resultados com memória de cálculo.
 *
 * Convenções:
 *  - Meses do ano analisado: k = 1..12.
 *  - Linha do tempo de 25 meses para RBT12/FS12: t = 0 → dez/(ano−2);
 *    t = 1..12 → jan..dez/(ano−1); t = 13..24 → jan..dez/(ano).
 *  - Valores monetários arredondados ao centavo (meio para cima) em cada
 *    tributo apurado; alíquotas mantidas com precisão total.
 *  - Retenções e antecipações são pagamentos do tributo correspondente e
 *    nunca somam como tributo adicional.
 */
(function (raiz) {
  'use strict';

  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // ---------------------------------------------------------------- utilidades

  function r2(v) {
    if (typeof v !== 'number' || !isFinite(v)) return 0;
    var s = v < 0 ? -1 : 1;
    var c = Math.round(Math.abs(v) * 100 + 1e-6);
    return (s * c) / 100 || 0;
  }

  // Aceita número ou texto em formato brasileiro ("1.234,56", "R$ 10", "12%").
  function num(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim();
    if (s === '') return null;
    s = s.replace(/R\$|\s|%/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function n0(v) { var n = num(v); return n === null ? 0 : n; }
  function soma(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function somaR2(a) { var c = 0; for (var i = 0; i < a.length; i++) c += Math.round(a[i] * 100); return c / 100; }
  function limitar(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function rotuloMes(k, ano) { return MESES[k - 1] + '/' + String(ano).slice(2); }
  function rotuloT(t, ano) {
    if (t === 0) return 'dez/' + String(ano - 2).slice(2);
    if (t <= 12) return MESES[t - 1] + '/' + String(ano - 1).slice(2);
    return MESES[t - 13] + '/' + String(ano).slice(2);
  }
  function brl(v) {
    var n = r2(v), neg = n < 0;
    var partes = Math.abs(n).toFixed(2).split('.');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '−' : '') + 'R$ ' + partes[0] + ',' + partes[1];
  }
  function pct(v, casas) {
    if (!isFinite(v)) return '—';
    return (v * 100).toFixed(casas === undefined ? 2 : casas).replace('.', ',') + '%';
  }

  // ------------------------------------------------------------ modelo de dados

  var TIPOS_RECEITA = [
    { id: 'servicosMedicos', rotulo: 'Serviços médicos (sem detalhamento)', simples: 'fator_r', presumido: 'servicos' },
    { id: 'consultas', rotulo: 'Consultas', simples: 'fator_r', presumido: 'servicos' },
    { id: 'plantoes', rotulo: 'Plantões', simples: 'fator_r', presumido: 'servicos' },
    { id: 'hospitalar', rotulo: 'Receita hospitalar', simples: 'fator_r', presumido: 'hospitalar' },
    { id: 'procedimentos', rotulo: 'Procedimentos', simples: 'fator_r', presumido: 'servicos' },
    { id: 'exames', rotulo: 'Exames e serviços laboratoriais', simples: 'fator_r', presumido: 'hospitalar' },
    { id: 'outrasMedicas', rotulo: 'Outras atividades médicas', simples: 'fator_r', presumido: 'servicos' },
    { id: 'naoMedicas', rotulo: 'Atividades não médicas', simples: 'nao_segregada', presumido: 'servicos' }
  ];

  var CAMPOS_MES_RECEITA = TIPOS_RECEITA.map(function (t) { return t.id; })
    .concat(['cancelamentos', 'descontos', 'outrasReceitas', 'recebida', 'aReceber']);

  // tipo: operacional | terceirizacao | transporte | formacao | ativo | juros | principal | pessoal
  var CATEGORIAS_DESPESA = [
    { grupo: 'Despesas operacionais profissionais', itens: [
      ['aluguel_consultorio', 'Aluguel de consultório', 'operacional', true],
      ['aluguel_hospitalar', 'Aluguel de sala ou espaço hospitalar', 'operacional', true],
      ['condominio', 'Condomínio', 'operacional', false],
      ['energia', 'Energia elétrica', 'operacional', true],
      ['agua', 'Água', 'operacional', false],
      ['internet', 'Internet', 'operacional', false],
      ['telefone', 'Telefone profissional', 'operacional', false],
      ['secretaria', 'Secretária (terceirizada)', 'terceirizacao', false],
      ['funcionarios', 'Funcionários (terceirizados)', 'terceirizacao', false],
      ['encargos_trabalhistas', 'Encargos trabalhistas', 'terceirizacao', false],
      ['contabilidade', 'Contabilidade', 'operacional', false],
      ['assessoria_tributaria', 'Assessoria tributária', 'operacional', false],
      ['assessoria_juridica', 'Assessoria jurídica', 'operacional', false],
      ['software_medico', 'Software médico', 'operacional', false],
      ['prontuario', 'Prontuário eletrônico', 'operacional', false],
      ['sistemas_gestao', 'Sistemas de gestão', 'operacional', false],
      ['equipamentos_medicos', 'Equipamentos médicos (aquisição)', 'ativo', true],
      ['manutencao_equipamentos', 'Manutenção de equipamentos', 'operacional', true],
      ['insumos', 'Insumos e materiais médicos', 'operacional', true],
      ['servicos_terceirizados', 'Serviços terceirizados', 'operacional', false],
      ['taxas_administrativas', 'Taxas administrativas', 'operacional', false],
      ['taxas_cartao', 'Taxas de cartões e meios de pagamento', 'operacional', false],
      ['taxas_plataformas', 'Taxas de plataformas de atendimento', 'operacional', false],
      ['seguros_profissionais', 'Seguros profissionais', 'operacional', false],
      ['seguro_rc', 'Seguro de responsabilidade civil', 'operacional', false],
      ['anuidades', 'Anuidade e registros profissionais', 'operacional', false],
      ['outras_profissionais', 'Outras despesas profissionais', 'operacional', false]
    ] },
    { grupo: 'Transporte profissional', itens: [
      ['veiculo_financiamento', 'Financiamento ou leasing de veículo', 'transporte', false],
      ['combustivel', 'Combustível', 'transporte', false],
      ['seguro_veiculo', 'Seguro do veículo', 'transporte', false],
      ['manutencao_veiculo', 'Manutenção do veículo', 'transporte', false],
      ['estacionamento', 'Estacionamento', 'transporte', false],
      ['pedagios', 'Pedágios', 'transporte', false],
      ['app_transporte', 'Transporte por aplicativo', 'transporte', false],
      ['passagens', 'Passagens e deslocamentos', 'transporte', false],
      ['outros_transporte', 'Outros gastos de transporte', 'transporte', false]
    ] },
    { grupo: 'Formação e desenvolvimento profissional', itens: [
      ['pos_graduacao', 'Pós-graduação', 'formacao', false],
      ['especializacao', 'Cursos de especialização', 'formacao', false],
      ['congressos', 'Congressos', 'formacao', false],
      ['atualizacoes', 'Atualizações profissionais', 'formacao', false],
      ['certificacoes', 'Certificações', 'formacao', false],
      ['livros', 'Livros e materiais técnicos', 'formacao', false],
      ['associacoes', 'Associações científicas', 'formacao', false],
      ['outros_educacionais', 'Outros gastos educacionais', 'formacao', false]
    ] },
    { grupo: 'Despesas financeiras e investimentos', itens: [
      ['juros', 'Juros de empréstimos', 'juros', false],
      ['parcelamentos', 'Parcelamentos (principal)', 'principal', false],
      ['tarifas_bancarias', 'Tarifas bancárias', 'operacional', false],
      ['equipamentos_financiados', 'Equipamentos financiados (parcelas do bem)', 'ativo', true],
      ['investimentos_estrutura', 'Investimentos em estrutura', 'ativo', false],
      ['compra_ativos', 'Compra de ativos', 'ativo', false],
      ['amortizacao_principal', 'Amortização de principal de dívidas', 'principal', false],
      ['outras_financeiras', 'Outras despesas financeiras', 'juros', false]
    ] },
    { grupo: 'Despesas pessoais', itens: [
      ['moradia', 'Moradia', 'pessoal', false],
      ['alimentacao', 'Alimentação', 'pessoal', false],
      ['veiculo_pessoal', 'Veículo de uso pessoal', 'pessoal', false],
      ['plano_saude', 'Plano de saúde', 'pessoal', false],
      ['seguro_pessoal', 'Seguro pessoal', 'pessoal', false],
      ['academia', 'Academia', 'pessoal', false],
      ['lazer', 'Lazer', 'pessoal', false],
      ['vestuario', 'Vestuário', 'pessoal', false],
      ['cursos_pessoais', 'Cursos pessoais', 'pessoal', false],
      ['dependentes', 'Dependentes', 'pessoal', false],
      ['outras_pessoais', 'Outras despesas pessoais', 'pessoal', false]
    ] }
  ];

  var CATEGORIA_POR_ID = {};
  CATEGORIAS_DESPESA.forEach(function (g) {
    g.itens.forEach(function (it) {
      CATEGORIA_POR_ID[it[0]] = { id: it[0], rotulo: it[1], tipo: it[2], credito: it[3], grupo: g.grupo };
    });
  });

  function mesesVazios(campos) {
    var a = [];
    for (var i = 0; i < 12; i++) {
      var o = {};
      campos.forEach(function (c) { o[c] = ''; });
      a.push(o);
    }
    return a;
  }

  function estadoVazio(ano) {
    ano = ano || 2026;
    var historico = [];
    for (var i = 0; i < 13; i++) historico.push({ receita: '', folha: '', fgts: '', cpp: '' });
    var tratamento = {};
    TIPOS_RECEITA.forEach(function (t) { tratamento[t.id] = { simples: t.simples, presumido: t.presumido }; });
    return {
      versaoEsquema: 1,
      meta: { exemplo: false, salvoEm: null },
      analise: {
        ano: ano, mesInicioPlanejamento: 1,
        cenarioReceita: 'base', fatorConservador: -15, fatorOtimista: 15, fatorPersonalizado: 0,
        crescimentoAnual: 0,
        incrementoProLabore: 250, proLaboreMinimo: '', proLaboreMaximo: '',
        variacaoProLabore: 'livre', fimHorizonte: 'sustentar',
        caixaInicialPJ: '', reservaCaixaMinima: '',
        regimeReconhecimento: 'competencia',
        materialidade: 1200
      },
      empresa: {
        nome: '', cnpj: '', municipio: '', uf: '', dataAbertura: '',
        atividadePrincipal: '', cnaePrincipal: '', cnaesSecundarios: '',
        naturezaJuridica: 'ltda',
        socios: [{ nome: 'Médico(a) analisado(a)', participacao: 100, analisado: true, residenteExterior: false }],
        temEmpregados: 'nao', outrasFontesRemuneracao: 'nao', participaOutrasEmpresas: 'nao',
        outrasEmpresasReceitaGlobalExcede: 'nao_sei',
        socioPessoaJuridica: 'nao', debitosSemSuspensao: 'nao_sei', obrigadaLucroReal: 'nao',
        regimeAtual: 'simples', regimeAnoAnterior: 'simples',
        contabilidadeRegular: 'nao_sei', temBalancetes: 'nao_sei', distribuicaoFormalApurada: 'nao_sei',
        requisitosHospitalares: 'nao',
        iss: { aliquota: 5, modoSimples: 'das', modoLP: 'aliquota', valorFixoPorProfissional: '', numProfissionais: 1 },
        retencoesFederaisPct: 0,
        custosAdm: { simples: 0, presumido: 250, real: 1200 },
        rat: 2, fap: 1, terceiros: 5.8,
        prejuizoFiscalAnterior: ''
      },
      receitas: {
        modoPreenchimento: 'variavel',
        fixa: { total: '', mix: { consultas: 100 } },
        tratamento: tratamento,
        meses: mesesVazios(CAMPOS_MES_RECEITA),
        historico: historico,
        primeiroFaturamento: '',
        estimativa12m: ''
      },
      despesas: [],
      tributosPagos: [],
      folha: {
        proLaboreAtual: '',
        proLaboreMes: ['', '', '', '', '', '', '', '', '', '', '', ''],
        pagoMes: ['', '', '', '', '', '', '', '', '', '', '', ''],
        inssDescontadoMes: ['', '', '', '', '', '', '', '', '', '', '', ''],
        irrfDescontadoMes: ['', '', '', '', '', '', '', '', '', '', '', ''],
        evidenciaPagamento: 'sim',
        inicioProLabore: '',
        multiplasFontes: 'nao',
        pessoas: []
      },
      pf: {
        dependentes: 0, pensaoMensal: '',
        outrasRendasTributaveisAnual: '', irRetidoOutrasFontesAnual: '',
        salarioContribuicaoOutrasFontesMensal: '', inssOutrasFontesAnual: '',
        carneLeaoRendimentosAnual: '', carneLeaoPagoAnual: '',
        rendimentosIsentosAnual: '', rendimentosExclusivosAnual: '', irExclusivoAnual: '',
        dividendosOutrasEmpresasAnual: '', irRetidoDividendosOutrasAnual: '',
        despesasMedicasAnual: '', instrucaoAnual: '', pgblAnual: '',
        opcaoDeclaracao: 'auto', outrasFontesInformadas: 'nao'
      },
      distribuicao: {
        politica: 'automatica', valorMensal: '', manualMes: ['', '', '', '', '', '', '', '', '', '', '', ''],
        realizadoMes: ['', '', '', '', '', '', '', '', '', '', '', ''],
        limitarRetencao: true, percentualReter: 0,
        lucrosAcumuladosAnteriores: '', saldoTransicao2025: ''
      },
      cenariosSalvos: []
    };
  }

  // Completa um estado carregado de arquivo com campos novos, sem perder dados.
  function mesclarComPadrao(estado) {
    var base = estadoVazio(estado && estado.analise && estado.analise.ano);
    function mesclar(alvo, origem) {
      if (origem === undefined || origem === null) return alvo;
      if (Array.isArray(alvo)) {
        if (!Array.isArray(origem)) return alvo;
        if (alvo.length && typeof alvo[0] === 'object' && alvo[0] !== null && !Array.isArray(alvo[0])) {
          return alvo.map(function (a, i) { return i < origem.length ? mesclar(a, origem[i]) : a; });
        }
        return origem.slice();
      }
      if (typeof alvo === 'object' && alvo !== null) {
        if (typeof origem !== 'object') return alvo;
        var r = {};
        Object.keys(alvo).forEach(function (k) { r[k] = mesclar(alvo[k], origem[k]); });
        Object.keys(origem).forEach(function (k) { if (!(k in r)) r[k] = origem[k]; });
        return r;
      }
      return origem;
    }
    var m = mesclar(base, estado || {});
    m.despesas = Array.isArray(estado && estado.despesas) ? estado.despesas : [];
    m.tributosPagos = Array.isArray(estado && estado.tributosPagos) ? estado.tributosPagos : [];
    m.folha.pessoas = Array.isArray(estado && estado.folha && estado.folha.pessoas) ? estado.folha.pessoas : [];
    m.cenariosSalvos = Array.isArray(estado && estado.cenariosSalvos) ? estado.cenariosSalvos : [];
    if (estado && estado.empresa && Array.isArray(estado.empresa.socios) && estado.empresa.socios.length) m.empresa.socios = estado.empresa.socios;
    return m;
  }

  // --------------------------------------------------------- tabelas e faixas

  function impostoTabela(base, faixas) {
    if (base <= 0) return 0;
    for (var i = 0; i < faixas.length; i++) {
      var f = faixas[i];
      if (f.ate === null || base <= f.ate) return Math.max(0, base * f.aliquota - f.deducao);
    }
    return 0;
  }

  function faixaTabela(base, faixas) {
    for (var i = 0; i < faixas.length; i++) {
      var f = faixas[i];
      if (f.ate === null || base <= f.ate) return i;
    }
    return faixas.length - 1;
  }

  function tabelaMensal(P, mes) {
    var t = P.irpf.mensal[0];
    P.irpf.mensal.forEach(function (x) { if (x.desdeMes <= mes) t = x; });
    return t;
  }

  function reducaoIr(rend, imposto, regra) {
    if (!regra || !regra.ativo || imposto <= 0) return 0;
    var red = 0;
    if (rend <= regra.limiteIsencao) red = regra.reducaoMaxima;
    else if (rend <= regra.limiteSuperior) red = regra.a - regra.b * rend;
    return Math.max(0, Math.min(imposto, red));
  }

  // IRRF mensal sobre rendimentos do trabalho (pró-labore).
  function calcularIrrfMensal(P, mes, rendimento, inss, dependentes, pensao) {
    var t = tabelaMensal(P, mes);
    var dedLegal = inss + dependentes * t.deducaoDependente + pensao;
    var usaSimplificado = t.descontoSimplificado > dedLegal;
    var deducao = usaSimplificado ? t.descontoSimplificado : dedLegal;
    var base = Math.max(0, rendimento - deducao);
    var imp = impostoTabela(base, t.faixas);
    var red = reducaoIr(rendimento, imp, P.irpf.reducaoMensal);
    var ir = r2(imp - red);
    var dispensado = ir > 0 && ir <= P.irpf.dispensaRetencaoAte;
    return {
      rendimento: rendimento, deducaoLegal: r2(dedLegal), descontoSimplificado: t.descontoSimplificado,
      usaSimplificado: usaSimplificado, deducao: r2(deducao), base: r2(base),
      faixa: faixaTabela(base, t.faixas) + 1, impostoTabela: r2(imp), reducao: r2(red),
      irrf: dispensado ? 0 : ir, dispensado: dispensado
    };
  }

  function calcularIrpfAnual(P, d) {
    var a = P.irpf.anual;
    var trib = d.tributaveis;
    var instrucao = Math.min(d.instrucao, a.limiteInstrucaoPorPessoa * (1 + d.dependentes));
    var pgbl = Math.min(d.pgbl, trib * a.limitePgblPercentual);
    var dedCompleta = d.inss + d.dependentes * a.deducaoDependente + d.pensao + d.medicas + instrucao + pgbl;
    var dedSimpl = Math.min(trib * a.descontoSimplificadoPercentual, a.descontoSimplificadoLimite);
    function apurar(ded, nome) {
      var base = Math.max(0, trib - ded);
      var imp = impostoTabela(base, a.faixas);
      var red = reducaoIr(trib, imp, P.irpf.reducaoAnual);
      return { opcao: nome, deducoes: r2(ded), base: r2(base), faixa: faixaTabela(base, a.faixas) + 1, impostoTabela: r2(imp), reducao: r2(red), devido: r2(imp - red) };
    }
    var completa = apurar(dedCompleta, 'completa');
    var simplificada = apurar(dedSimpl, 'simplificada');
    var escolhida;
    if (d.opcao === 'completa') escolhida = completa;
    else if (d.opcao === 'simplificada') escolhida = simplificada;
    else escolhida = completa.devido <= simplificada.devido ? completa : simplificada;
    var antecipado = r2(d.irrf + d.irOutrasFontes + d.carneLeaoPago);
    return {
      tributaveis: r2(trib), completa: completa, simplificada: simplificada, escolhida: escolhida,
      devido: escolhida.devido, antecipado: antecipado, saldo: r2(escolhida.devido - antecipado),
      detalheDeducoes: { inss: r2(d.inss), dependentes: r2(d.dependentes * a.deducaoDependente), pensao: r2(d.pensao), medicas: r2(d.medicas), instrucao: r2(instrucao), pgbl: r2(pgbl) }
    };
  }

  function calcularIrpfm(P, d) {
    var p = P.irpfm;
    var rend = d.tributaveis + d.isentos + d.exclusivos + d.dividendosPJ + d.dividendosOutras;
    var vazio = { ativo: !!(p && p.ativo), rendimentos: r2(rend), aliquota: 0, impostoMinimo: 0, deducoes: 0, adicionalAntesRedutor: 0, redutor: 0, adicional: 0, retencoes: r2(d.retencoes), saldo: r2(-d.retencoes), redutorAplicavel: false, aliqEfetivaPJ: null };
    if (!p || !p.ativo) { vazio.saldo = 0; vazio.retencoes = 0; return vazio; }
    if (rend <= p.limiteInferior) return vazio;
    var aliq = rend >= p.limiteSuperior ? p.aliquotaMaxima : Math.min(p.aliquotaMaxima, (rend / 60000 - 10) / 100);
    var im = r2(rend * aliq);
    var ded = r2(d.irpfDevido + d.irExclusivo);
    var antes = Math.max(0, r2(im - ded));
    var redutor = 0, aliqPJ = null, aplicavel = false;
    var divTotal = d.dividendosPJ + d.dividendosOutras;
    if (antes > 0 && d.dividendosPJ > 0 && divTotal > 0 && d.lucroContabilPJ > 0) {
      aliqPJ = d.irpjCsllPJ / d.lucroContabilPJ;
      var aliqIrpfm = antes / divTotal;
      var excesso = aliqPJ + aliqIrpfm - p.redutorLimitePJ;
      if (excesso > 0) {
        aplicavel = true;
        if (d.temDemonstracoes) redutor = r2(Math.min(antes * d.dividendosPJ / divTotal, d.dividendosPJ * excesso));
      }
    }
    var adicional = Math.max(0, r2(antes - redutor));
    return {
      ativo: true, rendimentos: r2(rend), aliquota: aliq, impostoMinimo: im, deducoes: ded,
      adicionalAntesRedutor: antes, redutor: redutor, redutorAplicavel: aplicavel, aliqEfetivaPJ: aliqPJ,
      adicional: adicional, retencoes: r2(d.retencoes), saldo: r2(adicional - d.retencoes)
    };
  }

  function aliquotaEfetivaSimples(anexo, rbt12) {
    var fx = anexo.faixas, base = Math.max(0, rbt12);
    var idx = -1;
    for (var i = 0; i < fx.length; i++) { if (base <= fx[i].ate) { idx = i; break; } }
    var excede = idx < 0;
    if (excede) idx = fx.length - 1;
    var f = fx[idx];
    var ef = base > 0 ? (base * f.aliquota - f.parcelaDeduzir) / base : fx[0].aliquota;
    return { faixa: idx + 1, nominal: f.aliquota, parcelaDeduzir: f.parcelaDeduzir, efetiva: Math.max(0, ef), excedeLimite: excede, reparticao: f.reparticao };
  }

  // Percentuais de cada tributo dentro do DAS, com o teto de ISS efetivo.
  function reparticaoAjustada(ef, rep, issMaximo, semIss) {
    var r = {};
    var chaves = ['IRPJ', 'CSLL', 'COFINS', 'PIS', 'CPP', 'ISS'];
    var issEf = ef * rep.ISS;
    if (semIss) {
      var outros = 1 - rep.ISS;
      chaves.forEach(function (c) { r[c] = c === 'ISS' ? 0 : (outros > 0 ? rep[c] / outros : 0); });
      return { fracoes: r, issLimitado: false, fatorDas: outros };
    }
    if (rep.ISS > 0 && issEf > issMaximo && ef > 0) {
      var resto = 1 - rep.ISS;
      chaves.forEach(function (c) {
        r[c] = c === 'ISS' ? issMaximo / ef : ((ef - issMaximo) * (rep[c] / resto)) / ef;
      });
      return { fracoes: r, issLimitado: true, fatorDas: 1 };
    }
    chaves.forEach(function (c) { r[c] = rep[c]; });
    return { fracoes: r, issLimitado: false, fatorDas: 1 };
  }

  // ---------------------------------------------------------- contexto (dados)

  function parseData(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (!m) return null;
    return { ano: +m[1], mes: +m[2], dia: m[3] ? +m[3] : 1 };
  }

  function valorDespesaMes(d, k) {
    var ini = limitar(Math.round(n0(d.mesInicial) || 1), 1, 12);
    var fim = limitar(Math.round(n0(d.mesFinal) || 12), 1, 12);
    if (k < ini || k > fim) return 0;
    var rec = d.recorrencia || 'mensal';
    var passo = k - ini;
    if (rec === 'unica' && k !== ini) return 0;
    if (rec === 'anual' && k !== ini) return 0;
    if (rec === 'trimestral' && passo % 3 !== 0) return 0;
    if (rec === 'semestral' && passo % 6 !== 0) return 0;
    var tot = Math.round(n0(d.totalParcelas)), atual = Math.round(n0(d.parcelaAtual) || 1);
    if (tot > 0) {
      var restantes = tot - atual + 1;
      if (restantes <= 0) return 0;
      var ocorrencia = rec === 'mensal' ? passo : (rec === 'trimestral' ? passo / 3 : (rec === 'semestral' ? passo / 6 : 0));
      if (ocorrencia >= restantes) return 0;
    }
    var v = d.tipoValor === 'variavel' && Array.isArray(d.valoresMensais) ? n0(d.valoresMensais[k - 1]) : n0(d.valor);
    var mesReaj = Math.round(n0(d.reajusteMes));
    if (mesReaj >= 1 && k >= mesReaj && n0(d.reajustePct)) v = v * (1 + n0(d.reajustePct) / 100);
    var mesCorte = Math.round(n0(d.corteMes));
    if (mesCorte >= 1 && k >= mesCorte) v = n0(d.corteValorNovo);
    return Math.max(0, v);
  }

  // Parcela empresarial de uma despesa (0..1), segundo natureza e uso pessoal.
  function fracaoEmpresarial(d, cat) {
    if (cat && cat.tipo === 'pessoal') return 0;
    if (d.natureza === 'pessoal') return 0;
    var f = 1;
    if (d.natureza === 'mista') f = limitar(n0(d.pctProfissional), 0, 100) / 100;
    if (cat && cat.tipo === 'transporte') {
      var usoPessoal = limitar(n0(d.usoPessoalPct), 0, 100) / 100;
      if (d.natureza !== 'mista') f = 1 - usoPessoal;
    }
    return f;
  }

  function folhaPessoaMes(p, k) {
    var ini = limitar(Math.round(n0(p.mesInicio) || 1), 1, 12);
    var fim = limitar(Math.round(n0(p.mesFim) || 12), 1, 12);
    var r = { remuneracao: 0, decimo: 0, ferias: 0 };
    if (k < ini || k > fim) return r;
    var sal = n0(p.salario);
    r.remuneracao = sal;
    if (p.tipo === 'clt') {
      var mesesNoAno = fim - ini + 1;
      if (p.decimoTerceiro !== false) {
        var dec = sal * mesesNoAno / 12;
        if (k === 11 && fim >= 12) r.decimo = dec / 2;
        if (k === 12) r.decimo = fim >= 12 ? dec / 2 : 0;
        if (k === fim && fim < 12) r.decimo = dec;
      }
      if (p.ferias !== false && k === limitar(Math.round(n0(p.mesFerias) || 7), 1, 12)) r.ferias = sal / 3;
    }
    return r;
  }

  function prepararContexto(estado, P, opcoes) {
    opcoes = opcoes || {};
    var e = estado;
    var ano = +e.analise.ano || P.ano;
    var k0 = limitar(Math.round(n0(e.analise.mesInicioPlanejamento) || 1), 1, 12);
    var avisos = [];
    var ctx = { ano: ano, P: P, k0: k0, avisos: avisos, estado: e };

    // Início de atividade
    var ab = parseData(e.empresa.dataAbertura);
    var tInicio = -Infinity;
    if (ab) {
      tInicio = (ab.ano - (ano - 1)) * 12 + ab.mes;
      if (tInicio < 0) tInicio = -Infinity;
    }
    ctx.dataAbertura = ab;
    ctx.tInicio = tInicio;
    ctx.empresaInexistente = isFinite(tInicio) && tInicio > 24;

    // Cenário de receita
    var cen = opcoes.cenarioReceita || e.analise.cenarioReceita || 'base';
    var fatorCen = 0;
    if (cen === 'conservador') fatorCen = n0(e.analise.fatorConservador) / 100;
    else if (cen === 'otimista') fatorCen = n0(e.analise.fatorOtimista) / 100;
    else if (cen === 'personalizado') fatorCen = n0(e.analise.fatorPersonalizado) / 100;
    var cresc = n0(e.analise.crescimentoAnual) / 100;
    var mult = opcoes.multiplicadorReceita || 1;
    var amplSazonal = opcoes.amplitudeSazonal === undefined ? 1 : opcoes.amplitudeSazonal;
    ctx.cenarioReceita = cen;

    var trat = {};
    TIPOS_RECEITA.forEach(function (t) {
      var x = (e.receitas.tratamento && e.receitas.tratamento[t.id]) || {};
      trat[t.id] = { simples: x.simples || t.simples, presumido: x.presumido || t.presumido };
    });
    ctx.tratamento = trat;

    var estimativa = n0(e.receitas.estimativa12m);
    var receitas = [];
    var totais = [];
    for (var k = 1; k <= 12; k++) {
      var m = e.receitas.meses[k - 1] || {};
      var grupos = {};
      var bruto = 0;
      TIPOS_RECEITA.forEach(function (t) { var v = Math.max(0, n0(m[t.id])); grupos[t.id] = v; bruto += v; });
      totais.push(bruto);
      receitas.push({ m: m, grupos: grupos, bruto: bruto });
    }
    // Projeção: estimativa anual preenche meses projetados vazios
    if (estimativa > 0) {
      for (k = k0; k <= 12; k++) {
        if (receitas[k - 1].bruto === 0) {
          receitas[k - 1].grupos.servicosMedicos = estimativa / 12;
          receitas[k - 1].bruto = estimativa / 12;
          receitas[k - 1].estimada = true;
        }
      }
    }
    var mediaProj = 0, nProj = 0;
    for (k = k0; k <= 12; k++) { mediaProj += receitas[k - 1].bruto; nProj++; }
    mediaProj = nProj ? mediaProj / nProj : 0;

    ctx.meses = [];
    for (k = 1; k <= 12; k++) {
      var R = receitas[k - 1];
      var mm = R.m;
      var projetado = k >= k0;
      var fator = 1;
      if (projetado) {
        fator = (1 + fatorCen) * Math.pow(1 + cresc, (k - k0 + 1) / 12) * mult;
      }
      var g = {}, brutoAjust = 0;
      Object.keys(R.grupos).forEach(function (id) {
        var v = R.grupos[id];
        if (projetado && amplSazonal !== 1 && R.bruto > 0 && mediaProj > 0) {
          var alvo = mediaProj + (R.bruto - mediaProj) * amplSazonal;
          v = v * Math.max(0, alvo) / R.bruto;
        }
        v = v * fator;
        g[id] = v; brutoAjust += v;
      });
      var deducoes = Math.max(0, n0(mm.cancelamentos)) + Math.max(0, n0(mm.descontos));
      if (projetado) deducoes *= fator;
      var rb = Math.max(0, brutoAjust - deducoes);
      var escala = brutoAjust > 0 ? rb / brutoAjust : 0;
      Object.keys(g).forEach(function (id) { g[id] = g[id] * escala; });
      var recebidaInf = num(mm.recebida);
      var recebida = recebidaInf === null ? rb : Math.max(0, recebidaInf * (projetado ? fator : 1));
      var t = 12 + k;
      var ativo = !isFinite(tInicio) || t >= tInicio;
      if (!ativo && rb > 0) avisos.push({ codigo: 'receita_antes_abertura', mes: k });
      ctx.meses.push({
        k: k, t: t, projetado: projetado, ativo: ativo, grupos: g, rb: rb,
        outras: Math.max(0, n0(mm.outrasReceitas)) * (projetado ? fator : 1),
        recebida: recebida, recebidaInformada: recebidaInf !== null,
        deducoes: deducoes, estimada: !!R.estimada, fatorCenario: fator
      });
    }

    // Base de reconhecimento (competência ou caixa)
    var caixa = e.analise.regimeReconhecimento === 'caixa';
    ctx.regimeCaixaSolicitado = caixa;
    ctx.regimeCaixa = caixa && P.simples.regimeCaixaPermitido;
    ctx.meses.forEach(function (mm2) {
      if (ctx.regimeCaixa) {
        var esc = mm2.rb > 0 ? mm2.recebida / mm2.rb : 0;
        mm2.base = mm2.recebida;
        mm2.gruposBase = {};
        Object.keys(mm2.grupos).forEach(function (id) { mm2.gruposBase[id] = mm2.grupos[id] * esc; });
      } else {
        mm2.base = mm2.rb;
        mm2.gruposBase = mm2.grupos;
      }
    });

    // Despesas
    var despMes = [];
    for (k = 1; k <= 12; k++) despMes.push({ operacional: 0, terceirizacaoClt: 0, ativo: 0, juros: 0, principal: 0, pessoal: 0, creditoBase: 0, semDocumento: 0, indedutivel: 0, depreciacao: 0, porGrupo: {} });
    (e.despesas || []).forEach(function (d) {
      var cat = CATEGORIA_POR_ID[d.categoria] || { tipo: 'operacional', credito: false, grupo: 'Outras' };
      var fr = fracaoEmpresarial(d, cat);
      var vida = Math.max(1, n0(d.vidaUtilAnos) || (cat.id && /veiculo/.test(cat.id) ? 5 : 10));
      for (var kk = 1; kk <= 12; kk++) {
        var v = valorDespesaMes(d, kk);
        if (!v) continue;
        var D = despMes[kk - 1];
        var pj = v * fr, pes = v - pj;
        D.pessoal += pes;
        if (pj <= 0) continue;
        if (cat.tipo === 'terceirizacao' && d.vinculo === 'clt') { D.terceirizacaoClt += pj; continue; }
        if (cat.tipo === 'ativo') {
          D.ativo += pj;
          for (var j = kk; j <= 12; j++) despMes[j - 1].depreciacao += pj / (vida * 12);
          if (cat.credito) for (j = kk; j <= 12; j++) despMes[j - 1].creditoBase += pj / (vida * 12);
          continue;
        }
        if (cat.tipo === 'principal') { D.principal += pj; continue; }
        if (cat.tipo === 'juros') { D.juros += pj; } else { D.operacional += pj; }
        D.porGrupo[cat.grupo] = (D.porGrupo[cat.grupo] || 0) + pj;
        var credito = d.geraCredito === undefined || d.geraCredito === '' ? cat.credito : (d.geraCredito === true || d.geraCredito === 'sim');
        if (credito) D.creditoBase += pj;
        if (d.documento !== 'sim') { D.semDocumento += pj; D.indedutivel += pj; }
        else if (d.tratamento === 'inaplicavel') D.indedutivel += pj;
      }
    });
    ctx.despesas = despMes;

    // Folha de terceiros (empregados, outros sócios, autônomos)
    var pessoas = (e.folha.pessoas || []);
    ctx.folha = [];
    for (k = 1; k <= 12; k++) {
      var f = { outrosSocios: 0, clt: 0, decimo: 0, ferias: 0, autonomos: 0 };
      pessoas.forEach(function (p) {
        var x = folhaPessoaMes(p, k);
        if (p.tipo === 'socio') f.outrosSocios += x.remuneracao;
        else if (p.tipo === 'autonomo') f.autonomos += x.remuneracao;
        else { f.clt += x.remuneracao; f.decimo += x.decimo; f.ferias += x.ferias; }
      });
      f.remuneracaoClt = f.clt + f.decimo + f.ferias;
      f.fgts = f.remuneracaoClt * P.previdencia.fgts;
      f.totalTerceiros = f.outrosSocios + f.autonomos + f.remuneracaoClt;
      ctx.folha.push(f);
    }

    // Pró-labore do médico: plano atual e meses realizados
    var plAtual = n0(e.folha.proLaboreAtual);
    ctx.proLaboreAtualInformado = num(e.folha.proLaboreAtual) !== null;
    ctx.proLaborePlanoAtual = [];
    ctx.proLaboreFixo = [];
    for (k = 1; k <= 12; k++) {
      var plan = num(e.folha.proLaboreMes[k - 1]);
      var pago = num(e.folha.pagoMes[k - 1]);
      var vPlan = plan === null ? plAtual : plan;
      var realizado = k < k0;
      var v2 = realizado && pago !== null ? pago : vPlan;
      if (!ctx.meses[k - 1].ativo) v2 = 0;
      ctx.proLaborePlanoAtual.push(Math.max(0, v2));
      ctx.proLaboreFixo.push(realizado ? Math.max(0, v2) : null);
    }

    // Histórico (13 meses: dez/ano−2 + jan..dez/ano−1)
    var hist = e.receitas.historico || [];
    var rbT = zeros(25), fsT = zeros(25), histFalta = [], histEstimado = [];
    var somaHist = 0, nHist = 0;
    for (var t = 0; t <= 12; t++) {
      var h = hist[t] || {};
      var rv = num(h.receita);
      if (rv !== null) { somaHist += rv; nHist++; }
    }
    var mediaHist = nHist ? somaHist / nHist : (soma(ctx.meses.map(function (x) { return x.rb; })) / 12);
    for (t = 0; t <= 12; t++) {
      var hh = hist[t] || {};
      var ativoT = !isFinite(tInicio) || t >= tInicio;
      if (!ativoT) continue;
      var rec = num(hh.receita), fol = num(hh.folha);
      var precisa = t >= 1 || P.simples.apuracao.defasagemMeses > 0;
      if (rec === null) {
        if (precisa) { histFalta.push({ t: t, campo: 'receita' }); histEstimado.push(t); }
        rec = mediaHist;
      }
      if (fol === null) {
        if (precisa) histFalta.push({ t: t, campo: 'folha' });
        fol = plAtual + (ctx.folha[0] ? ctx.folha[0].totalTerceiros : 0);
      }
      rbT[t] = rec;
      fsT[t] = fol + n0(hh.fgts) + n0(hh.cpp);
    }
    ctx.historicoFaltante = histFalta;
    ctx.historicoEstimadoMeses = histEstimado;
    ctx.mediaHistorico = mediaHist;
    for (k = 1; k <= 12; k++) {
      rbT[12 + k] = ctx.meses[k - 1].ativo ? ctx.meses[k - 1].base : 0;
      var fo = ctx.folha[k - 1];
      fsT[12 + k] = ctx.meses[k - 1].ativo ? (fo.totalTerceiros + fo.fgts) : 0;
    }
    ctx.rbT = rbT;
    ctx.fsFixoT = fsT;

    // Pessoa física
    var pf = e.pf;
    ctx.pf = {
      dependentes: Math.max(0, Math.round(n0(pf.dependentes))),
      pensaoMensal: n0(pf.pensaoMensal),
      outrasTributaveis: n0(pf.outrasRendasTributaveisAnual),
      irOutrasFontes: n0(pf.irRetidoOutrasFontesAnual),
      salContribOutras: n0(pf.salarioContribuicaoOutrasFontesMensal),
      inssOutrasAnual: n0(pf.inssOutrasFontesAnual),
      carneLeaoRend: n0(pf.carneLeaoRendimentosAnual),
      carneLeaoPago: n0(pf.carneLeaoPagoAnual),
      isentos: n0(pf.rendimentosIsentosAnual),
      exclusivos: n0(pf.rendimentosExclusivosAnual),
      irExclusivo: n0(pf.irExclusivoAnual),
      dividendosOutras: n0(pf.dividendosOutrasEmpresasAnual),
      irRetidoDividendosOutras: n0(pf.irRetidoDividendosOutrasAnual),
      medicas: n0(pf.despesasMedicasAnual),
      instrucao: n0(pf.instrucaoAnual),
      pgbl: n0(pf.pgblAnual),
      opcao: pf.opcaoDeclaracao || 'auto'
    };

    // Sócio analisado
    var socios = e.empresa.socios && e.empresa.socios.length ? e.empresa.socios : [{ participacao: 100, analisado: true }];
    var analisado = socios.filter(function (s) { return s.analisado; })[0] || socios[0];
    ctx.participacao = limitar(n0(analisado.participacao) || 100, 0, 100) / 100;
    ctx.socioExterior = socios.some(function (s) { return s.residenteExterior; });
    ctx.analisadoExterior = !!analisado.residenteExterior;

    // Distribuição
    var dist = e.distribuicao;
    ctx.dist = {
      politica: dist.politica || 'automatica',
      valorMensal: n0(dist.valorMensal),
      manual: (dist.manualMes || []).map(n0),
      realizado: (dist.realizadoMes || []).map(num),
      limitarRetencao: dist.limitarRetencao !== false,
      percentualReter: limitar(n0(dist.percentualReter), 0, 100) / 100,
      lucrosAnteriores: n0(dist.lucrosAcumuladosAnteriores),
      saldoTransicao: Math.max(0, n0(dist.saldoTransicao2025))
    };
    ctx.dist.lucrosAnteriores = Math.max(ctx.dist.lucrosAnteriores, ctx.dist.saldoTransicao);

    var emp = e.empresa;
    ctx.escrituracao = emp.contabilidadeRegular === 'sim';
    ctx.demonstracoes = emp.contabilidadeRegular === 'sim' && emp.temBalancetes === 'sim';
    ctx.iss = {
      aliquota: limitar(n0(emp.iss && emp.iss.aliquota) || 5, 0, 5) / 100,
      modoSimples: (emp.iss && emp.iss.modoSimples) || 'das',
      modoLP: (emp.iss && emp.iss.modoLP) || 'aliquota',
      fixoMensal: n0(emp.iss && emp.iss.valorFixoPorProfissional) * Math.max(1, n0(emp.iss && emp.iss.numProfissionais) || 1)
    };
    ctx.hospitalarOk = emp.requisitosHospitalares === 'sim';
    ctx.retencoesFederaisPct = limitar(n0(emp.retencoesFederaisPct), 0, 100) / 100;
    ctx.custosAdm = {
      simples: n0(emp.custosAdm && emp.custosAdm.simples),
      presumido: n0(emp.custosAdm && emp.custosAdm.presumido),
      real: n0(emp.custosAdm && emp.custosAdm.real)
    };
    ctx.rat = n0(emp.rat) / 100;
    ctx.fap = n0(emp.fap) || 1;
    ctx.terceiros = n0(emp.terceiros) / 100;
    ctx.prejuizoAnterior = n0(emp.prejuizoFiscalAnterior);
    ctx.caixaInicial = n0(e.analise.caixaInicialPJ);
    ctx.reserva = n0(e.analise.reservaCaixaMinima);
    ctx.receitaAnoAnterior = soma(rbT.slice(1, 13));
    ctx.regimeAtual = emp.regimeAtual || 'indefinido';
    return ctx;
  }

  // ----------------------------------------------------- RBT12, FS12, fator "r"

  function janelaApuracao(ctx, k) {
    var ap = ctx.P.simples.apuracao;
    var L = ap.defasagemMeses || 0;
    var t = 12 + k;
    var ts = ctx.tInicio;
    var ini = t - 12 - L, fim = t - 1 - L;
    if (isFinite(ts) && t < ts) return { tipo: 'inativa', t: t };
    if (!isFinite(ts) || ts <= ini) return { tipo: 'consolidada', ini: ini, fim: fim, mult: 1, t: t, L: L };
    if (ap.regraInicioAtividade === 'res190') {
      if (t - ts < 2) return { tipo: 'inicio_fixo', ini: ts, fim: t, mult: 12 / (t - ts + 1), t: t, L: L, rFixo: 0.28 };
      var n = fim - ts + 1;
      return { tipo: 'inicio', ini: ts, fim: fim, mult: 12 / n, n: n, t: t, L: L };
    }
    if (t === ts) return { tipo: 'primeiro_mes', ini: t, fim: t, mult: 12, t: t, L: L };
    var n2 = fim - ts + 1;
    return { tipo: 'inicio', ini: ts, fim: fim, mult: 12 / n2, n: n2, t: t, L: L };
  }

  // Último mês do ano (1..12) cujo pró-labore do médico entra na janela de k.
  function mesDependenciaFolha(ctx, k) {
    var j = janelaApuracao(ctx, k);
    if (j.tipo === 'inativa' || j.tipo === 'inicio_fixo') return null;
    var d = j.fim - 12;
    return d >= 1 ? d : 0;
  }

  // somaProLaboreAno = pró-labore do médico somado nos meses 1..mesDependencia.
  function apurarFatorR(ctx, k, somaProLaboreAno) {
    var j = janelaApuracao(ctx, k);
    if (j.tipo === 'inativa') return { janela: j, rbt12: 0, fs12: 0, r: 0, regra: 'Empresa ainda não aberta neste mês' };
    var rb = 0, fs = 0;
    for (var t = j.ini; t <= j.fim; t++) { rb += ctx.rbT[t] || 0; fs += ctx.fsFixoT[t] || 0; }
    var rbSomaReal = rb;
    var temAnoNaJanela = j.fim >= 13;
    if (temAnoNaJanela) fs += somaProLaboreAno;
    var rbt12 = rb * j.mult, fs12 = fs * j.mult;
    var r, regra;
    if (j.tipo === 'inicio_fixo') { r = j.rFixo; regra = 'Fator "r" fixado em 0,28 nos dois primeiros meses de atividade (Res. CGSN 190/2026)'; }
    else if (rbt12 <= 0) { r = fs12 > 0 ? 0.28 : 0; regra = fs12 > 0 ? 'Folha sem receita no período: r = 0,28 (Res. CGSN 140, art. 26, § 6º)' : 'Sem receita e sem folha no período: r = 0'; }
    else { r = fs12 / rbt12; regra = j.tipo === 'consolidada' ? 'FS12 ÷ RBT12' : (j.tipo === 'primeiro_mes' ? 'Mês de início: folha e receita do próprio mês (×12)' : 'Início de atividade: média dos ' + j.n + ' meses anteriores × 12 (folha e receita)'); }
    return { janela: j, rbt12: rbt12, fs12: fs12, rbSoma: rbSomaReal, r: r, regra: regra };
  }

  // ------------------------------------------------------- Simples Nacional

  function anexoDoGrupo(trat, r, limite, forcar) {
    if (trat === 'III' || trat === 'V' || trat === 'I') return trat;
    if (forcar) return forcar;
    return r >= limite - 1e-12 ? 'III' : 'V';
  }

  function dasMes(ctx, k, fr, forcarAnexo, detalhar) {
    var P = ctx.P, S = P.simples;
    var mm = ctx.meses[k - 1];
    var res = { total: 0, tributos: { IRPJ: 0, CSLL: 0, COFINS: 0, PIS: 0, CPP: 0, ISS: 0 }, issFora: 0, issFixo: 0, grupos: [], anexoFatorR: null, excedeLimite: false, excedeSublimite: false };
    if (!mm.ativo || mm.base <= 0) {
      res.anexoFatorR = fr.r >= S.limiteFatorR ? 'III' : 'V';
      if (ctx.iss.modoSimples === 'fixo_me' && mm.ativo && ctx.receitaAnoAnterior <= S.limiteIssFixoMe) res.issFixo = r2(ctx.iss.fixoMensal);
      return res;
    }
    var rbt12 = fr.rbt12;
    var j = fr.janela;
    var mesesAtiv = j.tipo === 'consolidada' ? 12 : Math.min(12, Math.round(12 / j.mult));
    var limiteAplicavel = j.tipo === 'consolidada' ? S.limiteAnual : S.limiteMensalInicioAtividade * 12;
    var sublimite = S.sublimiteIssIcms;
    res.excedeLimite = rbt12 > limiteAplicavel;
    res.excedeSublimite = rbt12 > sublimite;
    var issFixoMe = ctx.iss.modoSimples === 'fixo_me' && ctx.receitaAnoAnterior <= S.limiteIssFixoMe;
    var cents = 0;
    TIPOS_RECEITA.forEach(function (tp) {
      var v = mm.gruposBase[tp.id];
      if (!(v > 0)) return;
      var tr = ctx.tratamento[tp.id].simples;
      var anexoId = anexoDoGrupo(tr, fr.r, S.limiteFatorR, forcarAnexo);
      if (tr === 'fator_r' || tr === 'nao_segregada') res.anexoFatorR = anexoId;
      var anexo = S.anexos[anexoId];
      var al = aliquotaEfetivaSimples(anexo, rbt12);
      var semIss = res.excedeSublimite || (issFixoMe && anexoId !== 'I');
      var rep = reparticaoAjustada(al.efetiva, al.reparticao, S.issEfetivoMaximo, semIss);
      var aliqAplicada = al.efetiva * rep.fatorDas;
      var valor = r2(v * aliqAplicada);
      cents += Math.round(valor * 100);
      var trib = {};
      var acum = 0, chaves = ['IRPJ', 'CSLL', 'COFINS', 'PIS', 'CPP', 'ISS'];
      chaves.forEach(function (c, i) {
        var x = i === chaves.length - 1 ? r2(valor - acum) : r2(valor * rep.fracoes[c]);
        if (i < chaves.length - 1) acum = r2(acum + x);
        trib[c] = x;
        res.tributos[c] = r2(res.tributos[c] + x);
      });
      if (res.excedeSublimite && anexoId !== 'I') res.issFora = r2(res.issFora + v * ctx.iss.aliquota);
      res.grupos.push({
        tipo: tp.id, rotulo: tp.rotulo, tratamento: tr, anexo: anexoId, base: r2(v), faixa: al.faixa, nominal: al.nominal,
        parcelaDeduzir: al.parcelaDeduzir, efetiva: al.efetiva, aplicada: aliqAplicada, valor: valor,
        issLimitado: rep.issLimitado, semIss: semIss, tributos: detalhar ? trib : null
      });
    });
    res.total = cents / 100;
    if (issFixoMe) res.issFixo = r2(ctx.iss.fixoMensal);
    res.mesesAtividadeJanela = mesesAtiv;
    return res;
  }

  // ------------------------------------------------- Lucro Presumido e Real

  function presuncaoGrupo(ctx, trat) {
    var p = ctx.P.presumido.presuncao;
    if (trat === 'hospitalar') return ctx.hospitalarOk ? p.hospitalar : p.servicos;
    if (trat === 'comercio') return p.comercio;
    return p.servicos;
  }

  function cbsMes(ctx, regimeP, receitaServicos, creditoBase) {
    var c = regimeP.cbs;
    if (!c) return 0;
    var debito = receitaServicos * c.aliquotaReferencia * (1 - c.reducaoSaude);
    var credito = creditoBase * c.aliquotaCreditoInsumos;
    return Math.max(0, r2(debito - credito));
  }

  function issMunicipal(ctx, mm) {
    if (!mm.ativo) return 0;
    if (ctx.iss.modoLP === 'fixo_sup') return r2(ctx.iss.fixoMensal);
    var servicos = 0;
    TIPOS_RECEITA.forEach(function (tp) {
      if (ctx.tratamento[tp.id].presumido !== 'comercio') servicos += mm.gruposBase[tp.id] || 0;
    });
    return r2(servicos * ctx.iss.aliquota);
  }

  function encargosPatronais(ctx, k, proLabore) {
    var f = ctx.folha[k - 1], pv = ctx.P.previdencia;
    var ci = (proLabore + f.outrosSocios + f.autonomos) * pv.patronalProLabore;
    var emp = f.remuneracaoClt * (pv.patronalEmpregados + ctx.rat * ctx.fap + ctx.terceiros);
    return { contribuinteIndividual: r2(ci), empregados: r2(emp), total: r2(ci + emp) };
  }

  function apurarPresumido(ctx, proLabore, detalhar) {
    var P = ctx.P, LP = P.presumido;
    var meses = [];
    var acumuladoAno = 0, excedenteAplicado = 0;
    for (var q = 0; q < 4; q++) {
      var baseIrpjMes = [], baseCsllMes = [], receitaQ = 0;
      var rbQ = 0;
      for (var i = 0; i < 3; i++) rbQ += ctx.meses[q * 3 + i].base;
      acumuladoAno += rbQ;
      var excedenteTotal = LP.lc224.ativo ? Math.max(0, acumuladoAno - LP.lc224.limiteTrimestral * (q + 1)) : 0;
      var excedenteQ = Math.max(0, Math.min(rbQ, excedenteTotal - excedenteAplicado));
      excedenteAplicado += excedenteQ;
      var fracExc = rbQ > 0 ? excedenteQ / rbQ : 0;
      var mesesAtivos = 0;
      for (i = 0; i < 3; i++) {
        var k = q * 3 + i + 1, mm = ctx.meses[k - 1];
        if (mm.ativo) mesesAtivos++;
        var bI = 0, bC = 0;
        TIPOS_RECEITA.forEach(function (tp) {
          var v = mm.gruposBase[tp.id] || 0;
          if (!v) return;
          var pr = presuncaoGrupo(ctx, ctx.tratamento[tp.id].presumido);
          var acrI = k >= LP.lc224.mesInicioIrpj ? fracExc * LP.lc224.acrescimo : 0;
          var acrC = k >= LP.lc224.mesInicioCsll ? fracExc * LP.lc224.acrescimo : 0;
          bI += v * pr.irpj * (1 + acrI);
          bC += v * pr.csll * (1 + acrC);
        });
        bI += mm.outras; bC += mm.outras;
        baseIrpjMes.push(bI); baseCsllMes.push(bC);
        receitaQ += mm.base;
      }
      var baseI = soma(baseIrpjMes), baseC = soma(baseCsllMes);
      var limiteAdic = LP.adicionalLimiteMensal * mesesAtivos;
      var irpjQ = r2(baseI * LP.irpjAliquota + Math.max(0, baseI - limiteAdic) * LP.adicionalAliquota);
      var adicionalQ = r2(Math.max(0, baseI - limiteAdic) * LP.adicionalAliquota);
      var csllQ = r2(baseC * LP.csllAliquota);
      var aI = 0, aC = 0;
      for (i = 0; i < 3; i++) {
        k = q * 3 + i + 1; mm = ctx.meses[k - 1];
        var ultimo = i === 2;
        var irpj = ultimo ? r2(irpjQ - aI) : (baseI > 0 ? r2(irpjQ * baseIrpjMes[i] / baseI) : 0);
        var csll = ultimo ? r2(csllQ - aC) : (baseC > 0 ? r2(csllQ * baseCsllMes[i] / baseC) : 0);
        aI = r2(aI + irpj); aC = r2(aC + csll);
        var receitaOper = mm.base;
        var pis = r2(receitaOper * LP.pis), cofins = r2(receitaOper * LP.cofins);
        var cbs = cbsMes(ctx, LP, receitaOper, ctx.despesas[k - 1].creditoBase);
        var iss = issMunicipal(ctx, mm);
        var enc = mm.ativo ? encargosPatronais(ctx, k, proLabore[k - 1]) : { contribuinteIndividual: 0, empregados: 0, total: 0 };
        var retFed = r2(receitaOper * ctx.retencoesFederaisPct * (0.015 + 0.0465));
        meses.push({
          irpj: irpj, csll: csll, pis: pis, cofins: cofins, cbs: cbs, iss: iss, cpp: enc.total, cppDetalhe: enc,
          retencoesFederais: retFed,
          trimestre: q + 1, baseIrpj: r2(baseIrpjMes[i]), baseCsll: r2(baseCsllMes[i]),
          resumoTrimestre: ultimo ? { baseIrpj: r2(baseI), baseCsll: r2(baseC), irpj: irpjQ, adicional: adicionalQ, csll: csllQ, limiteAdicional: limiteAdic, excedenteLc224: r2(excedenteQ), receita: r2(receitaQ) } : null
        });
      }
    }
    return meses;
  }

  function apurarReal(ctx, proLabore, custoAdmMensal) {
    var P = ctx.P, LR = P.real;
    var meses = [];
    var prejuizo = ctx.prejuizoAnterior;
    for (var q = 0; q < 4; q++) {
      var lairQ = 0, adicoesQ = 0;
      var parciais = [];
      for (var i = 0; i < 3; i++) {
        var k = q * 3 + i + 1, mm = ctx.meses[k - 1], D = ctx.despesas[k - 1], F = ctx.folha[k - 1];
        var receita = mm.base, financeira = mm.outras;
        var pis = r2(receita * LR.pis), cofins = r2(receita * LR.cofins);
        var pisFin = r2(financeira * LR.pisReceitaFinanceira), cofFin = r2(financeira * LR.cofinsReceitaFinanceira);
        var credPis = r2(D.creditoBase * LR.pis), credCof = r2(D.creditoBase * LR.cofins);
        var pisLiq = Math.max(0, r2(pis + pisFin - credPis)), cofLiq = Math.max(0, r2(cofins + cofFin - credCof));
        var cbs = cbsMes(ctx, LR, receita, D.creditoBase);
        var iss = issMunicipal(ctx, mm);
        var enc = mm.ativo ? encargosPatronais(ctx, k, proLabore[k - 1]) : { contribuinteIndividual: 0, empregados: 0, total: 0 };
        var folhaTotal = proLabore[k - 1] + F.totalTerceiros + F.fgts;
        var despesas = D.operacional + D.juros + D.depreciacao + folhaTotal + enc.total + iss + pisLiq + cofLiq + cbs + custoAdmMensal;
        var lair = receita + financeira - despesas;
        lairQ += lair; adicoesQ += D.indedutivel;
        parciais.push({ pis: pisLiq, cofins: cofLiq, cbs: cbs, iss: iss, cpp: enc.total, cppDetalhe: enc, lair: lair, creditos: r2(credPis + credCof) });
      }
      var lucroAntes = lairQ + adicoesQ;
      var compensa = 0;
      if (lucroAntes > 0 && prejuizo > 0) { compensa = Math.min(prejuizo, lucroAntes * LR.limiteCompensacaoPrejuizo); prejuizo -= compensa; }
      if (lucroAntes < 0) prejuizo += -lucroAntes;
      var lucroReal = Math.max(0, lucroAntes - compensa);
      var mesesAtivos = 0;
      for (i = 0; i < 3; i++) if (ctx.meses[q * 3 + i].ativo) mesesAtivos++;
      var limiteAdic = LR.adicionalLimiteMensal * mesesAtivos;
      var irpjQ = r2(lucroReal * LR.irpjAliquota + Math.max(0, lucroReal - limiteAdic) * LR.adicionalAliquota);
      var csllQ = r2(lucroReal * LR.csllAliquota);
      var aI = 0, aC = 0;
      for (i = 0; i < 3; i++) {
        var ult = i === 2;
        var irpj = ult ? r2(irpjQ - aI) : r2(irpjQ / 3);
        var csll = ult ? r2(csllQ - aC) : r2(csllQ / 3);
        aI = r2(aI + irpj); aC = r2(aC + csll);
        var p = parciais[i];
        meses.push({
          irpj: irpj, csll: csll, pis: p.pis, cofins: p.cofins, cbs: p.cbs, iss: p.iss, cpp: p.cpp, cppDetalhe: p.cppDetalhe,
          retencoesFederais: r2(ctx.meses[q * 3 + i].base * ctx.retencoesFederaisPct * (0.015 + 0.0465)),
          trimestre: q + 1, creditosPisCofins: p.creditos,
          resumoTrimestre: ult ? { lair: r2(lairQ), adicoes: r2(adicoesQ), compensacao: r2(compensa), lucroReal: r2(lucroReal), irpj: irpjQ, csll: csllQ, limiteAdicional: limiteAdic, prejuizoAcumulado: r2(prejuizo) } : null
        });
      }
    }
    return meses;
  }

  // ------------------------------------------------------------- simulação

  function inssSocio(ctx, k, proLabore) {
    var pv = ctx.P.previdencia;
    var tetoDisp = Math.max(0, pv.teto - ctx.pf.salContribOutras);
    var base = Math.min(proLabore, tetoDisp);
    return { base: r2(base), valor: r2(base * pv.aliquotaContribuinteIndividual), tetoDisponivel: r2(tetoDisp), limitadoTeto: proLabore > tetoDisp };
  }

  /*
   * decisao = {
   *   regime: 'simples' | 'presumido' | 'real',
   *   proLabore: [12 valores],           // meses realizados são sobrepostos
   *   forcarAnexo: null | 'III' | 'V',   // curva hipotética (gráfico)
   *   detalhar: bool                     // gera memória de cálculo
   * }
   */
  function simular(ctx, decisao) {
    var P = ctx.P, regime = decisao.regime || 'simples', det = !!decisao.detalhar;
    var pl = [];
    for (var k = 1; k <= 12; k++) {
      var fixo = ctx.proLaboreFixo[k - 1];
      var v = fixo !== null ? fixo : Math.max(0, +decisao.proLabore[k - 1] || 0);
      if (!ctx.meses[k - 1].ativo) v = 0;
      pl.push(r2(v));
    }
    var custoAdmMensal = ctx.custosAdm[regime] || 0;
    var mesesLP = regime === 'presumido' ? apurarPresumido(ctx, pl, det) : null;
    var mesesLR = regime === 'real' ? apurarReal(ctx, pl, custoAdmMensal) : null;

    var meses = [];
    var acumPL = [0];
    for (k = 1; k <= 12; k++) acumPL.push(acumPL[k - 1] + pl[k - 1]);

    var lucroAcum = 0, distAcum = 0, limitePresumidoAcum = 0;
    var saldoTrans = ctx.dist.saldoTransicao;
    var dividendoMedicoTotal = 0, dividendoTransicaoTotal = 0, retencaoTotal = 0;
    var irpjCsllPJ = 0;
    var mesesIII = 0, mesesV = 0;
    var excessoDistribuicao = 0;
    var fluxo = [], distFixa = [];

    // 1ª passagem: tributos, folha, lucro e fluxo de caixa operacional (independem da distribuição)
    for (k = 1; k <= 12; k++) {
      var mm = ctx.meses[k - 1], D = ctx.despesas[k - 1], F = ctx.folha[k - 1];
      var o = { k: k, rotulo: rotuloMes(k, ctx.ano), realizado: k < ctx.k0, ativo: mm.ativo, rb: r2(mm.rb), base: r2(mm.base), outras: r2(mm.outras), recebida: r2(mm.recebida) };
      o.proLabore = pl[k - 1];

      // Fator "r" (calculado em todos os regimes para referência)
      var dep = mesDependenciaFolha(ctx, k);
      var somaPL = dep === null ? 0 : acumPL[dep];
      var fr = apurarFatorR(ctx, k, somaPL);
      o.rbt12 = r2(fr.rbt12); o.fs12 = r2(fr.fs12); o.fatorR = fr.r; o.regraFatorR = fr.regra; o.janela = fr.janela;
      o.dependenciaFolha = dep;

      var tribPJ = 0;
      o.das = 0; o.irpj = 0; o.csll = 0; o.pis = 0; o.cofins = 0; o.cbs = 0; o.iss = 0; o.cpp = 0; o.issFora = 0; o.retencoesFederais = 0;
      if (regime === 'simples') {
        var ds = dasMes(ctx, k, fr, decisao.forcarAnexo || null, det);
        o.das = ds.total; o.dasTributos = ds.tributos; o.dasGrupos = ds.grupos; o.anexo = ds.anexoFatorR;
        o.issFora = r2(ds.issFora + ds.issFixo);
        o.excedeLimite = ds.excedeLimite; o.excedeSublimite = ds.excedeSublimite;
        tribPJ = r2(o.das + o.issFora);
        irpjCsllPJ += ds.tributos.IRPJ + ds.tributos.CSLL;
        if (mm.ativo && mm.base > 0) { if (o.anexo === 'III') mesesIII++; else if (o.anexo === 'V') mesesV++; }
        var presumidoMes = 0;
        TIPOS_RECEITA.forEach(function (tp) {
          presumidoMes += (mm.gruposBase[tp.id] || 0) * presuncaoGrupo(ctx, ctx.tratamento[tp.id].presumido).irpj;
        });
        o.limitePresumidoMes = r2(presumidoMes - ds.tributos.IRPJ);
      } else {
        var x = (regime === 'presumido' ? mesesLP : mesesLR)[k - 1];
        o.irpj = x.irpj; o.csll = x.csll; o.pis = x.pis; o.cofins = x.cofins; o.cbs = x.cbs; o.iss = x.iss; o.cpp = x.cpp;
        o.cppDetalhe = x.cppDetalhe; o.retencoesFederais = x.retencoesFederais; o.trimestre = x.trimestre; o.resumoTrimestre = x.resumoTrimestre;
        o.baseIrpj = x.baseIrpj; o.creditosPisCofins = x.creditosPisCofins;
        tribPJ = r2(o.irpj + o.csll + o.pis + o.cofins + o.cbs + o.iss + o.cpp);
        irpjCsllPJ += o.irpj + o.csll;
        o.anexo = null;
        o.limitePresumidoMes = r2((x.baseIrpj || 0) - o.irpj - o.csll - o.pis - o.cofins - o.cbs);
      }
      o.tributosPJ = tribPJ;

      // Pró-labore: INSS e IRRF do médico
      var inss = mm.ativo && o.proLabore > 0 ? inssSocio(ctx, k, o.proLabore) : { base: 0, valor: 0, tetoDisponivel: 0, limitadoTeto: false };
      o.inss = inss.valor; o.inssDetalhe = inss;
      var ir = o.proLabore > 0 ? calcularIrrfMensal(P, k, o.proLabore, inss.valor, ctx.pf.dependentes, ctx.pf.pensaoMensal) : null;
      o.irrf = ir ? ir.irrf : 0; o.irrfDetalhe = ir;

      // Folha e encargos
      o.folhaTerceiros = r2(F.totalTerceiros);
      o.fgts = r2(F.fgts);
      o.custoAdm = mm.ativo ? r2(custoAdmMensal) : 0;
      o.despesasOperacionais = r2(D.operacional);
      o.despesasExcluidasClt = r2(D.terceirizacaoClt);
      o.juros = r2(D.juros); o.depreciacao = r2(D.depreciacao); o.ativoImobilizado = r2(D.ativo); o.principal = r2(D.principal);
      o.despesasPessoais = r2(D.pessoal);

      // Lucro contábil estimado do mês
      var folhaTotal = o.proLabore + F.totalTerceiros + F.fgts;
      o.lucroContabil = r2(mm.rb + mm.outras - D.operacional - D.juros - D.depreciacao - tribPJ - folhaTotal - o.custoAdm);

      // Fluxo de caixa operacional (tributos considerados pagos na competência)
      var saidas = D.operacional + D.juros + D.ativo + D.principal + tribPJ + folhaTotal + o.custoAdm;
      fluxo.push(mm.recebida + mm.outras - saidas);
      o.fluxoOperacional = r2(fluxo[k - 1]);

      // Distribuições não discricionárias (realizadas, manuais ou impostas pela decisão)
      var realizadoInf = k < ctx.k0 ? ctx.dist.realizado[k - 1] : null;
      var fixa = null;
      if (realizadoInf !== null && realizadoInf !== undefined) fixa = Math.max(0, realizadoInf);
      else if (decisao.distribuicao && decisao.distribuicao.length === 12) fixa = Math.max(0, +decisao.distribuicao[k - 1] || 0);
      else if (ctx.dist.politica === 'manual') fixa = Math.max(0, ctx.dist.manual[k - 1] || 0);
      distFixa.push(fixa);
      meses.push(o);
    }

    // Viabilidade: caixa sem distribuições discricionárias deve ficar acima da reserva
    var deficit = 0, minCaixaAntes = Infinity, cam = ctx.caixaInicial;
    for (k = 1; k <= 12; k++) {
      cam += fluxo[k - 1] - (distFixa[k - 1] || 0);
      if (k >= ctx.k0) minCaixaAntes = Math.min(minCaixaAntes, cam + (distFixa[k - 1] || 0));
      if (cam < ctx.reserva) deficit = Math.max(deficit, ctx.reserva - cam);
    }
    // Reserva dinâmica: o que os meses seguintes do ano ainda vão consumir
    var futMin = zeros(13);
    for (k = 11; k >= 0; k--) {
      // futMin[k] = mínimo (≤ 0) da soma acumulada dos fluxos após o mês k (índice 0-based)
      var acum = 0, minimo = 0;
      for (var j2 = k + 1; j2 < 12; j2++) { acum += fluxo[j2] - (distFixa[j2] || 0); minimo = Math.min(minimo, acum); }
      futMin[k] = minimo;
    }

    // 2ª passagem: lucro distribuível, distribuição e dividendos
    var caixa = ctx.caixaInicial;
    for (k = 1; k <= 12; k++) {
      o = meses[k - 1];
      lucroAcum += o.lucroContabil;
      var caixaAntes = r2(caixa + fluxo[k - 1]);
      o.caixaAntesDistribuicao = caixaAntes;

      limitePresumidoAcum += o.limitePresumidoMes;
      var disponivelContabil = ctx.dist.lucrosAnteriores + lucroAcum - distAcum;
      var disponivelPresumido = ctx.dist.lucrosAnteriores + limitePresumidoAcum - distAcum;
      var disponivel = ctx.escrituracao ? disponivelContabil : Math.min(disponivelPresumido, disponivelContabil);
      var reter = ctx.dist.percentualReter * Math.max(0, lucroAcum);
      disponivel = Math.max(0, disponivel - reter);
      o.lucroDistribuivel = r2(disponivel);

      var pol = ctx.dist.politica, dist;
      var reservaDinamica = ctx.reserva - futMin[k - 1];
      o.reservaCaixa = r2(reservaDinamica);
      if (distFixa[k - 1] !== null) dist = distFixa[k - 1];
      else {
        var desejado = 0;
        if (pol === 'automatica') desejado = disponivel;
        else if (pol === 'mensal') desejado = ctx.dist.valorMensal;
        else if (pol === 'trimestral') desejado = k % 3 === 0 ? disponivel : 0;
        else if (pol === 'anual') desejado = k === 12 ? disponivel : 0;
        dist = Math.min(Math.max(0, desejado), disponivel, Math.max(0, caixaAntes - reservaDinamica));
        if (pol === 'automatica' && P.dividendos.retencao.ativo && ctx.dist.limitarRetencao && ctx.participacao > 0) {
          dist = Math.min(dist, P.dividendos.retencao.limiteMensalPorFonte / ctx.participacao + saldoTrans);
        }
      }
      dist = r2(dist);
      if (dist > disponivel + 0.01) excessoDistribuicao = Math.max(excessoDistribuicao, r2(dist - disponivel));
      var daTransicao = P.dividendos.transicao.ativo ? Math.min(dist, saldoTrans) : 0;
      saldoTrans -= daTransicao;
      distAcum += dist;
      o.distribuicao = dist;
      o.distribuicaoTransicao = r2(daTransicao);
      var divMed = r2(dist * ctx.participacao);
      var divMedTrans = r2(daTransicao * ctx.participacao);
      var divMedNovo = r2(divMed - divMedTrans);
      var limRet = P.dividendos.retencao.limiteMensalPorFonte;
      var ret = 0;
      if (P.dividendos.retencao.ativo && (ctx.analisadoExterior ? divMed > 0 : divMedNovo > limRet)) ret = r2((ctx.analisadoExterior ? divMed : divMedNovo) * P.dividendos.retencao.aliquota);
      o.dividendoMedico = divMed; o.dividendoMedicoTransicao = divMedTrans; o.retencaoDividendos = ret;
      dividendoMedicoTotal += divMed; dividendoTransicaoTotal += divMedTrans; retencaoTotal += ret;
      caixa = r2(caixaAntes - dist);
      o.caixaFinal = caixa;
    }

    // ---------------- Pessoa física (anual)
    var A = {};
    function somaCampo(c) { return somaR2(meses.map(function (m) { return m[c] || 0; })); }
    ['rb', 'base', 'outras', 'das', 'issFora', 'irpj', 'csll', 'pis', 'cofins', 'cbs', 'iss', 'cpp', 'tributosPJ', 'proLabore', 'inss', 'irrf', 'fgts', 'folhaTerceiros', 'custoAdm', 'despesasOperacionais', 'juros', 'depreciacao', 'ativoImobilizado', 'principal', 'lucroContabil', 'distribuicao', 'dividendoMedico', 'retencaoDividendos', 'despesasPessoais', 'retencoesFederais'].forEach(function (c) { A[c] = somaCampo(c); });

    var pf = ctx.pf;
    var inssAnual = r2(A.inss + pf.inssOutrasAnual);
    var tribAnual = A.proLabore + pf.outrasTributaveis + pf.carneLeaoRend;
    var irpf = calcularIrpfAnual(P, {
      tributaveis: tribAnual, inss: inssAnual, dependentes: pf.dependentes, pensao: pf.pensaoMensal * 12,
      medicas: pf.medicas, instrucao: pf.instrucao, pgbl: pf.pgbl, opcao: pf.opcao,
      irrf: A.irrf, irOutrasFontes: pf.irOutrasFontes, carneLeaoPago: pf.carneLeaoPago
    });
    var excluiTrans = P.dividendos.transicao.ativo && P.dividendos.transicao.excluiBaseIrpfm;
    var divBaseIrpfm = excluiTrans ? r2(dividendoMedicoTotal - dividendoTransicaoTotal) : dividendoMedicoTotal;
    var irpfm = calcularIrpfm(P, {
      tributaveis: tribAnual, isentos: pf.isentos, exclusivos: pf.exclusivos,
      dividendosPJ: divBaseIrpfm, dividendosOutras: pf.dividendosOutras,
      irpfDevido: irpf.devido, irExclusivo: pf.irExclusivo,
      retencoes: A.retencaoDividendos + pf.irRetidoDividendosOutras,
      irpjCsllPJ: irpjCsllPJ, lucroContabilPJ: A.lucroContabil, temDemonstracoes: ctx.demonstracoes
    });

    A.irpf = irpf;
    A.irpfm = irpfm;
    A.irpfDevido = irpf.devido;
    A.irpfmAdicional = irpfm.adicional;
    A.tributosPF = r2(irpf.devido + irpfm.adicional);
    A.encargosPrevidenciarios = r2(A.inss + A.cpp);
    A.cargaTributaria = r2(A.tributosPJ + A.inss + A.tributosPF);
    A.custoTotal = r2(A.cargaTributaria + A.custoAdm);
    A.cargaEfetiva = A.rb > 0 ? A.cargaTributaria / A.rb : 0;
    A.irpjCsllPJ = r2(irpjCsllPJ);
    A.mesesAnexoIII = mesesIII; A.mesesAnexoV = mesesV;
    A.dividendoTransicao = r2(dividendoTransicaoTotal);
    A.rendaBrutaPF = r2(A.proLabore + A.dividendoMedico + pf.outrasTributaveis + pf.carneLeaoRend + pf.isentos + pf.exclusivos + pf.dividendosOutras);
    A.rendaLiquidaPF = r2(A.rendaBrutaPF - A.inss - pf.inssOutrasAnual - irpf.devido - irpfm.adicional - pf.irExclusivo);
    A.rendaLiquidaPJ = r2(A.proLabore - A.inss - irpf.devido - irpfm.adicional + A.dividendoMedico);
    A.caixaPessoal = r2(A.rendaLiquidaPF - A.despesasPessoais);
    A.caixaNoAnoPF = r2(A.proLabore - A.inss - A.irrf + A.dividendoMedico - A.retencaoDividendos);
    A.ajusteAnualTotal = r2(irpf.saldo + irpfm.saldo);
    A.lucroRetido = r2(A.lucroContabil - A.distribuicao);
    A.caixaFinalPJ = meses[11].caixaFinal;
    A.excessoDistribuicao = excessoDistribuicao;

    var res = {
      regime: regime, ano: ctx.ano, proLabore: pl, meses: meses, anual: A,
      viavel: deficit <= 0.5, deficitCaixa: r2(deficit), minCaixaAntes: minCaixaAntes === Infinity ? 0 : r2(minCaixaAntes),
      fluxoOperacional: fluxo.map(r2), distribuicaoFixa: distFixa,
      forcarAnexo: decisao.forcarAnexo || null
    };
    if (mesesLP) res.trimestres = mesesLP.filter(function (m) { return m.resumoTrimestre; }).map(function (m) { return m.resumoTrimestre; });
    if (mesesLR) res.trimestres = mesesLR.filter(function (m) { return m.resumoTrimestre; }).map(function (m) { return m.resumoTrimestre; });
    if (det) res.memoria = memoriaDeCalculo(ctx, res);
    return res;
  }

  // Fator "r" no início do mês seguinte ao horizonte (para evitar viés de fim de horizonte).
  function fatorRMesSeguinte(ctx, res) {
    var L = ctx.P.simples.apuracao.defasagemMeses || 0;
    var rb = 0, fs = 0;
    var tFim = 24 - L, tIni = tFim - 11;
    var ts = ctx.tInicio;
    var ini = isFinite(ts) ? Math.max(tIni, ts) : tIni;
    for (var t = ini; t <= tFim; t++) {
      rb += ctx.rbT[t] || 0; fs += ctx.fsFixoT[t] || 0;
      if (t >= 13) fs += res.proLabore[t - 13];
    }
    return rb > 0 ? fs / rb : 0;
  }

  // ------------------------------------------------------ memória de cálculo

  function memoriaDeCalculo(ctx, res) {
    var P = ctx.P, linhas = [];
    var ano = ctx.ano;
    var mem = { fatorR: [], das: [], inss: [], irrf: [], irpf: null, irpfm: null, trimestres: res.trimestres || null, distribuicao: [] };
    res.meses.forEach(function (o) {
      var j = o.janela;
      var comp = [];
      if (j && j.tipo !== 'inativa') {
        for (var t = j.ini; t <= j.fim; t++) {
          var plMed = t >= 13 ? res.proLabore[t - 13] : 0;
          var f = t >= 13 ? ctx.folha[t - 13] : null;
          comp.push({
            mes: rotuloT(t, ano), receita: r2(ctx.rbT[t] || 0),
            proLaboreMedico: r2(plMed),
            folhaTerceiros: f ? r2(f.totalTerceiros) : null, fgts: f ? r2(f.fgts) : null,
            folhaHistorico: t <= 12 ? r2(ctx.fsFixoT[t] || 0) : null,
            estimado: ctx.historicoEstimadoMeses.indexOf(t) >= 0
          });
        }
      }
      mem.fatorR.push({
        k: o.k, rotulo: o.rotulo, janela: j && j.tipo !== 'inativa' ? rotuloT(j.ini, ano) + ' a ' + rotuloT(j.fim, ano) : '—',
        tipo: j ? j.tipo : '', multiplicador: j && j.mult ? j.mult : 1, rbt12: o.rbt12, fs12: o.fs12, r: o.fatorR, regra: o.regraFatorR,
        anexo: o.anexo, componentes: comp,
        incluidos: 'Pró-labore (todos os sócios), salários, 13º, férias, autônomos, FGTS e CPP recolhida fora do DAS (histórico)',
        excluidos: 'Distribuição de lucros, aluguéis, serviços de terceiros pessoa jurídica, INSS retido do sócio (já contido no pró-labore bruto), CPP contida no DAS'
      });
      if (o.dasGrupos) mem.das.push({ k: o.k, rotulo: o.rotulo, rbt12: o.rbt12, grupos: o.dasGrupos, total: o.das, issFora: o.issFora });
      mem.inss.push({ k: o.k, rotulo: o.rotulo, proLabore: o.proLabore, base: o.inssDetalhe.base, teto: o.inssDetalhe.tetoDisponivel, aliquota: P.previdencia.aliquotaContribuinteIndividual, valor: o.inss, limitado: o.inssDetalhe.limitadoTeto });
      mem.irrf.push({ k: o.k, rotulo: o.rotulo, d: o.irrfDetalhe });
      mem.distribuicao.push({ k: o.k, rotulo: o.rotulo, lucroContabil: o.lucroContabil, disponivel: o.lucroDistribuivel, distribuicao: o.distribuicao, dividendoMedico: o.dividendoMedico, retencao: o.retencaoDividendos, caixaAntes: o.caixaAntesDistribuicao, caixaFinal: o.caixaFinal });
    });
    mem.irpf = res.anual.irpf;
    mem.irpfm = res.anual.irpfm;
    return mem;
  }

  // ------------------------------------------------------------ elegibilidade

  function avaliarElegibilidade(ctx) {
    var e = ctx.estado, emp = e.empresa, P = ctx.P;
    var anoEmCurso = ctx.k0 > 1;
    function item(status, motivos) { return { status: status, motivos: motivos }; }
    var ms = [], st = 'elegivel';
    var rbAnt = ctx.receitaAnoAnterior;
    var mesesAntAtivos = isFinite(ctx.tInicio) ? Math.max(0, 12 - Math.max(0, ctx.tInicio - 1)) : 12;
    var limiteAnt = isFinite(ctx.tInicio) && ctx.tInicio > 1 ? P.simples.limiteMensalInicioAtividade * Math.min(12, mesesAntAtivos) : P.simples.limiteAnual;
    if (rbAnt > limiteAnt) { st = 'inelegivel'; ms.push('Receita bruta do ano anterior (' + brl(rbAnt) + ') acima do limite de ' + brl(limiteAnt) + ' (LC 123, art. 3º).'); }
    if (emp.naturezaJuridica === 'sa' || emp.naturezaJuridica === 'cooperativa') { st = 'inelegivel'; ms.push('Natureza jurídica vedada ao Simples Nacional (sociedade por ações ou cooperativa).'); }
    if (emp.socioPessoaJuridica === 'sim') { st = 'inelegivel'; ms.push('Sócio pessoa jurídica: vedação do art. 3º, § 4º, da LC 123.'); }
    if (ctx.socioExterior) { st = 'inelegivel'; ms.push('Sócio domiciliado no exterior: vedação do art. 17, II, da LC 123.'); }
    if (emp.outrasEmpresasReceitaGlobalExcede === 'sim') { st = 'inelegivel'; ms.push('Participação em outras empresas com receita global acima do limite (art. 3º, § 4º, III e IV).'); }
    if (emp.debitosSemSuspensao === 'sim') { st = 'inelegivel'; ms.push('Débitos fiscais sem exigibilidade suspensa (art. 17, V). Pode ser regularizado antes da opção.'); }
    var indeterminados = [];
    if (emp.debitosSemSuspensao === 'nao_sei') indeterminados.push('situação de débitos fiscais');
    if (emp.participaOutrasEmpresas === 'sim' && emp.outrasEmpresasReceitaGlobalExcede === 'nao_sei') indeterminados.push('receita global das empresas em que os sócios participam');
    if (ctx.historicoFaltante.some(function (x) { return x.campo === 'receita'; })) indeterminados.push('receita de meses do histórico');
    if (st === 'elegivel' && indeterminados.length) { st = 'indeterminado'; ms.push('Faltam dados para confirmar: ' + indeterminados.join('; ') + '.'); }
    if (st !== 'inelegivel' && ctx.regimeAtual !== 'simples' && anoEmCurso) ms.push('A opção pelo Simples só vale a partir de janeiro do ano seguinte (opção até o último dia útil de janeiro), salvo empresa em início de atividade.');
    ms.push('Medicina, inclusive laboratorial, é atividade permitida (Anexo V ou III conforme o fator "r"). Confirme o CNAE com o contador.');
    var simples = item(st, ms);

    var mp = [], sp = 'elegivel';
    if (rbAnt > P.presumido.limiteReceitaAnual) { sp = 'inelegivel'; mp.push('Receita do ano anterior acima de R$ 78 milhões.'); }
    if (emp.obrigadaLucroReal === 'sim') { sp = 'inelegivel'; mp.push('Empresa informou obrigatoriedade de apuração pelo Lucro Real.'); }
    if (sp === 'elegivel' && ctx.regimeAtual === 'simples' && anoEmCurso) mp.push('Optante pelo Simples só migra no ano seguinte (ou por exclusão). Comparação informativa para o mesmo período.');
    if (emp.contabilidadeRegular !== 'sim') mp.push('Sem escrituração contábil, a distribuição isenta fica limitada ao lucro presumido menos tributos.');
    if (!ctx.hospitalarOk && hasReceitaHospitalar(ctx)) mp.push('Receitas marcadas como hospitalares/auxílio diagnóstico usam 32% porque os requisitos de equiparação não foram confirmados.');
    var presumido = item(sp, mp);

    var mr = [], sr = ctx.escrituracao ? 'elegivel' : 'estimativa_incompleta';
    mr.push('Disponível a qualquer empresa. Exige escrituração contábil completa (Lalur/ECF).');
    if (!ctx.escrituracao) mr.push('Sem contabilidade regular confirmada: resultado do Lucro Real é estimativa incompleta, sem ranking definitivo.');
    if (!(ctx.estado.despesas || []).length) { sr = 'estimativa_incompleta'; mr.push('Nenhuma despesa cadastrada: a base do Lucro Real não pode ser estimada com segurança.'); }
    if (ctx.regimeAtual !== 'real' && anoEmCurso) mr.push('Mudança de regime só no ano seguinte.');
    var real = item(sr, mr);
    return { simples: simples, presumido: presumido, real: real };
  }

  function hasReceitaHospitalar(ctx) {
    return ctx.meses.some(function (m) {
      return TIPOS_RECEITA.some(function (tp) { return ctx.tratamento[tp.id].presumido === 'hospitalar' && m.grupos[tp.id] > 0; });
    });
  }

  // --------------------------------------------------------------- alertas

  function gerarAlertas(ctx, resAtual, extra) {
    extra = extra || {};
    var e = ctx.estado, a = [];
    function add(nivel, codigo, titulo, detalhe, limita) { a.push({ nivel: nivel, codigo: codigo, titulo: titulo, detalhe: detalhe, limita: limita || '' }); }
    var P = ctx.P;
    var temFatorR = TIPOS_RECEITA.some(function (tp) { var tr = ctx.tratamento[tp.id].simples; return (tr === 'fator_r' || tr === 'nao_segregada') && ctx.meses.some(function (m) { return m.grupos[tp.id] > 0; }); });

    if (ctx.empresaInexistente) add('critico', 'empresa_inexistente', 'Data de abertura posterior ao ano analisado', 'A data de abertura informada é posterior a dezembro do ano analisado.', 'Nenhum cálculo é confiável até a data ser corrigida.');
    var rbTotal = soma(ctx.meses.map(function (m) { return m.rb; }));
    if (rbTotal <= 0) add('critico', 'sem_receita', 'Nenhuma receita informada', 'Preencha a aba Receitas (ou carregue o exemplo).', 'Sem receita, os tributos e o fator "r" ficam zerados.');

    if (resAtual && temFatorR) {
      var proximos = resAtual.meses.filter(function (m) { return m.ativo && m.rb > 0 && m.fatorR >= 0.25 && m.fatorR < 0.31; });
      if (proximos.length) add('atencao', 'fator_r_proximo', 'Fator "r" próximo de 28%', 'Meses entre 25% e 31%: ' + proximos.map(function (m) { return m.rotulo + ' (' + pct(m.fatorR, 1) + ')'; }).join(', ') + '. Pequenas variações de receita ou folha mudam o anexo.', 'A economia projetada depende de manter a folha acima do limite.');
    }
    if (ctx.historicoFaltante.length && temFatorR) {
      var mesesF = {};
      ctx.historicoFaltante.forEach(function (x) { mesesF[rotuloT(x.t, ctx.ano)] = true; });
      add('atencao', 'historico_incompleto', 'Fator "r" calculado com histórico incompleto', 'Meses sem receita ou folha informadas: ' + Object.keys(mesesF).join(', ') + '. Receita ausente foi estimada pela média; folha ausente, pelo pró-labore atual mais a folha cadastrada.', 'Anexo e alíquota dos primeiros meses são estimativas; veja a faixa de incerteza no gráfico.');
    }
    if (isFinite(ctx.tInicio) && ctx.tInicio >= 1) {
      add('info', 'inicio_atividade', 'Regras de início de atividade aplicadas', 'Abertura em ' + rotuloT(ctx.tInicio, ctx.ano) + '. A RBT12 é anualizada (média dos meses de atividade × 12) apenas para definir faixa e alíquota; não representa receita efetivamente recebida. Limites do Simples proporcionais aos meses de atividade no ano de início.', '');
    }
    if (ctx.regimeCaixaSolicitado && !ctx.regimeCaixa) add('atencao', 'regime_caixa', 'Regime de caixa não admitido no ano', 'Os parâmetros de ' + ctx.ano + ' não admitem o regime de caixa no Simples Nacional (Res. CGSN 190/2026). O cálculo usou competência.', '');
    if (ctx.regimeCaixa && ctx.meses.some(function (m) { return m.ativo && m.rb > 0 && !m.recebidaInformada; })) add('info', 'caixa_sem_recebida', 'Receita recebida não informada', 'No regime de caixa, meses sem "receita recebida" usam o faturamento como recebido.', '');
    TIPOS_RECEITA.forEach(function (tp) {
      if (ctx.tratamento[tp.id].simples === 'nao_segregada' && ctx.meses.some(function (m) { return m.grupos[tp.id] > 0; })) add('atencao', 'nao_segregada', 'Receita de atividade não médica sem segregação', '"' + tp.rotulo + '" foi tratada como medicina (fator "r"). Defina o anexo correto na aba Receitas.', 'O DAS dessa parcela pode estar errado.');
    });
    if (hasReceitaHospitalar(ctx)) {
      if (ctx.hospitalarOk) add('atencao', 'hospitalar', 'Equiparação hospitalar aplicada no Lucro Presumido', 'Presunção de 8% (IRPJ) e 12% (CSLL) aplicada às receitas marcadas como hospitalares/diagnóstico. Exige sociedade empresária, atendimento às normas da Anvisa e que o serviço se enquadre (Lei 9.249, art. 15, § 1º, III, "a").', 'Validar com o contador antes de usar a comparação de regimes.');
      else add('info', 'hospitalar_nao', 'Possível tratamento especial não aplicado', 'Há receitas hospitalares ou de diagnóstico. Sem confirmação dos requisitos, o Lucro Presumido usa 32%.', '');
    }
    if (resAtual && resAtual.anual.excessoDistribuicao > 0) add('critico', 'distribuicao_excesso', 'Distribuição de lucros superior ao lucro apurado', 'Em algum mês a distribuição informada excede o lucro distribuível estimado em até ' + brl(resAtual.anual.excessoDistribuicao) + '. O excesso pode ser tributado como rendimento.', 'Exposição potencial não incluída na carga tributária.');
    var temPLRealizado = ctx.proLaboreFixo.some(function (v) { return v > 0; });
    if (e.folha.evidenciaPagamento !== 'sim' && (temPLRealizado || n0(e.folha.proLaboreAtual) > 0)) add('critico', 'prolabore_sem_evidencia', 'Pró-labore sem evidência de pagamento', 'O pró-labore só entra no fator "r" se efetivamente pago e informado no eSocial/DCTFWeb. Registros retroativos ou valores não pagos não são aceitos.', 'Fator "r" dos meses realizados pode não se sustentar.');
    if (resAtual) {
      var abaixoMin = resAtual.meses.filter(function (m) { return m.proLabore > 0 && m.proLabore < P.previdencia.salarioMinimo; });
      if (abaixoMin.length) add('atencao', 'prolabore_minimo', 'Pró-labore abaixo do salário mínimo', 'Meses: ' + abaixoMin.map(function (m) { return m.rotulo; }).join(', ') + '. A contribuição abaixo do mínimo não conta para benefícios e pode exigir complementação.', '');
    }
    (e.despesas || []).forEach(function (d) {
      var cat = CATEGORIA_POR_ID[d.categoria];
      if (!cat) return;
      if (cat.tipo === 'pessoal' && d.natureza === 'empresarial') add('critico', 'pessoal_como_pj', 'Despesa pessoal classificada como empresarial', '"' + (d.nome || cat.rotulo) + '" está na categoria pessoal. O simulador a excluiu da empresa.', '');
      if (cat.tipo === 'transporte' && d.titularidade === 'pf' && d.natureza !== 'pessoal') add('atencao', 'veiculo_pf', 'Despesa de veículo em nome da pessoa física', '"' + (d.nome || cat.rotulo) + '": veículo de titularidade da PF lançado na empresa exige contrato e comprovação de uso profissional.', '');
      if (cat.tipo === 'transporte' && (d.usoPessoalPct === '' || d.usoPessoalPct === undefined) && d.natureza !== 'mista' && d.natureza !== 'pessoal') add('info', 'veiculo_uso', 'Uso pessoal do veículo não informado', '"' + (d.nome || cat.rotulo) + '": informe o percentual de uso pessoal. Sem essa informação, 100% foi tratado como profissional.', '');
      if (cat.tipo === 'terceirizacao' && d.vinculo === 'clt') add('atencao', 'clt_em_despesa', 'Empregado CLT lançado em despesas', '"' + (d.nome || cat.rotulo) + '" foi excluído do cálculo para evitar dupla contagem. Cadastre empregados CLT na aba Pró-labore e folha.', '');
      if (d.documento !== 'sim' && cat.tipo !== 'pessoal' && d.natureza !== 'pessoal') add('info', 'sem_documento', 'Despesa sem documento comprobatório', '"' + (d.nome || cat.rotulo) + '" entrou no fluxo de caixa, mas é indedutível no Lucro Real e frágil em fiscalização.', '');
    });
    (e.tributosPagos || []).forEach(function (p) {
      if (p.tributo === 'DARF' && !String(p.codigoReceita || '').trim()) add('atencao', 'darf_sem_codigo', 'DARF sem código de receita', 'Pagamento de ' + brl(n0(p.valor)) + ' (competência ' + (p.competencia || '?') + ') sem código. Não foi atribuído a nenhum tributo.', 'A conciliação ignora esse pagamento.');
    });
    if (extra.divergencias && extra.divergencias.length) add('atencao', 'divergencia', 'Divergência entre tributos informados e calculados', extra.divergencias.length + ' competência(s) com diferença acima de R$ 10 e 1%. Veja a aba Tributos atuais.', 'Os pagamentos informados não foram presumidos corretos.');
    if (e.empresa.contabilidadeRegular !== 'sim') add('atencao', 'sem_escrituracao', 'Escrituração contábil não confirmada', 'Sem escrituração, a distribuição isenta fica limitada ao lucro presumido menos tributos, e o redutor do IRPFM não pode ser usado.', 'Distribuições acima desse limite não são recomendadas.');
    if ((e.empresa.outrasFontesRemuneracao === 'sim' || e.folha.multiplasFontes === 'sim') && !n0(e.pf.outrasRendasTributaveisAnual) && !n0(e.pf.salarioContribuicaoOutrasFontesMensal)) add('atencao', 'outras_fontes', 'Outras fontes de renda não informadas', 'O perfil indica outras fontes de remuneração, mas a aba Pessoa física não traz valores. O IRPF anual e o teto do INSS podem estar subestimados.', 'Resultado da pessoa física incompleto.');
    if (resAtual) {
      var A = resAtual.anual;
      if (A.irpfm.ativo && A.irpfm.rendimentos > P.irpfm.limiteInferior) add('atencao', 'irpfm', 'Rendimentos sujeitos à tributação mínima (IRPFM)', 'Rendimentos anuais estimados de ' + brl(A.irpfm.rendimentos) + ' (acima de R$ 600 mil). Alíquota mínima de ' + pct(A.irpfm.aliquota) + '; adicional estimado de ' + brl(A.irpfm.adicional) + '.' + (A.irpfm.redutorAplicavel && !ctx.demonstracoes ? ' O redutor do art. 16-B seria aplicável, mas exige demonstrações financeiras.' : ''), 'Regra nova e com regulamentação em evolução.');
      if (A.retencaoDividendos > 0) add('info', 'retencao_dividendos', 'Retenção de 10% sobre dividendos', brl(A.retencaoDividendos) + ' retidos em meses com distribuição acima de R$ 50 mil. É antecipação do IRPFM e não custo adicional; o excedente volta no ajuste anual.', '');
      if (resAtual.meses.some(function (m) { return m.excedeLimite; })) add('critico', 'limite_simples', 'Receita acima do limite do Simples', 'A RBT12 supera o limite de R$ 4,8 milhões (ou o proporcional no início de atividade). Há risco de exclusão.', 'Resultado do Simples não confiável a partir desse ponto.');
      else if (resAtual.meses.some(function (m) { return m.excedeSublimite; })) add('atencao', 'sublimite', 'Receita acima do sublimite de R$ 3,6 milhões', 'O ISS passa a ser recolhido fora do DAS pela alíquota municipal.', '');
      if (!resAtual.viavel) add('critico', 'caixa_negativo', 'Caixa insuficiente', 'O caixa da empresa fica abaixo da reserva mínima em pelo menos um mês (déficit de ' + brl(resAtual.deficitCaixa) + ').', 'Planos de pró-labore que agravam o déficit são descartados pela otimização.');
    }
    if (ctx.socioExterior) add('atencao', 'nao_residente', 'Sócio residente no exterior', 'Dividendos a não residentes têm retenção de 10% sem limite mensal, e a empresa não pode optar pelo Simples.', '');
    if (ctx.iss.modoLP === 'fixo_sup') add('info', 'iss_fixo', 'ISS fixo de sociedade uniprofissional', 'O ISS fixo depende de lei municipal e de a sociedade ser uniprofissional e de responsabilidade pessoal. Não se aplica ao Simples, salvo o caso do art. 18, § 18.', '');
    if (ctx.iss.modoSimples === 'fixo_me' && ctx.receitaAnoAnterior > P.simples.limiteIssFixoMe) add('atencao', 'iss_fixo_me', 'ISS fixo indisponível no Simples', 'O ISS em valor fixo no Simples só vale para microempresa com receita até R$ 360 mil no ano anterior e se o município o instituiu. O cálculo usou o ISS dentro do DAS.', '');
    if (extra.dadosInsuficientesRegimes) add('atencao', 'regimes_incompletos', 'Dados insuficientes para comparar regimes', extra.dadosInsuficientesRegimes, 'A comparação entre regimes não produz ranking definitivo.');
    if (P.status === 'projetado') add('atencao', 'parametros_projetados', 'Parâmetros legais projetados', P.resumoStatus, 'Resultados de ' + ctx.ano + ' são simulações com premissas não oficiais.');
    var ordem = { critico: 0, atencao: 1, info: 2 };
    a.sort(function (x, y) { return ordem[x.nivel] - ordem[y.nivel]; });
    return a;
  }

  // ------------------------------------------------- conciliação com pagamentos

  function conciliarPagamentos(ctx, res) {
    var pg = ctx.estado.tributosPagos || [];
    var porComp = {};
    var naoAtribuidos = [];
    pg.forEach(function (p) {
      var k = Math.round(n0(p.competencia));
      var valor = n0(p.valor);
      if (!(k >= 1 && k <= 12) || !valor) return;
      var trib = p.tributo;
      if (trib === 'DARF') {
        var cod = String(p.codigoReceita || '').replace(/\D/g, '');
        var info = ctx.P && raiz.ParametrosLegais ? raiz.ParametrosLegais.codigosReceita[cod] : null;
        if (!info) { naoAtribuidos.push(p); return; }
        trib = info.tributo;
      }
      porComp[k] = porComp[k] || {};
      porComp[k][trib] = (porComp[k][trib] || 0) + valor;
    });
    var linhas = [], divergencias = [];
    res.meses.forEach(function (o) {
      var inf = porComp[o.k] || {};
      var calc = { DAS: o.das, INSS: o.inss, IRRF: o.irrf, ISS: o.issFora + o.iss, IRPJ: o.irpj, CSLL: o.csll, PIS: o.pis, COFINS: o.cofins, CPP: o.cpp, FGTS: o.fgts };
      Object.keys(inf).forEach(function (t) {
        var c = calc[t] !== undefined ? calc[t] : null;
        var dif = c === null ? null : r2(inf[t] - c);
        var diverge = dif !== null && Math.abs(dif) > 10 && Math.abs(dif) > 0.01 * Math.max(Math.abs(c), Math.abs(inf[t]));
        var l = { k: o.k, rotulo: o.rotulo, tributo: t, informado: r2(inf[t]), calculado: c, diferenca: dif, diverge: diverge };
        linhas.push(l);
        if (diverge) divergencias.push(l);
      });
    });
    return { linhas: linhas, divergencias: divergencias, naoAtribuidos: naoAtribuidos };
  }

  // ------------------------------------------------------- qualidade dos dados

  function qualidadeDados(ctx) {
    var e = ctx.estado, itens = [];
    function chk(ok, peso, texto, efeito) { itens.push({ ok: ok, peso: peso, texto: texto, efeito: efeito }); }
    var mesesComReceita = ctx.meses.filter(function (m) { return m.rb > 0; }).length;
    var mesesAtivos = ctx.meses.filter(function (m) { return m.ativo; }).length;
    chk(mesesComReceita >= mesesAtivos, 20, 'Receita dos 12 meses do ano analisado', 'Meses sem receita reduzem tributos e distorcem o fator "r".');
    var histOk = ctx.historicoFaltante.length === 0;
    chk(histOk, 20, 'Receita e folha dos 12 meses anteriores (RBT12/FS12)', 'Sem histórico, o anexo dos primeiros meses é estimado.');
    chk(ctx.proLaboreAtualInformado, 10, 'Pró-labore atual informado', 'Sem pró-labore atual não há cenário de referência.');
    chk((e.despesas || []).length > 0, 10, 'Despesas cadastradas', 'Sem despesas, lucro, caixa e Lucro Real ficam superestimados.');
    chk(e.empresa.contabilidadeRegular !== 'nao_sei', 10, 'Situação da contabilidade informada', 'Define o limite de distribuição isenta.');
    chk(e.empresa.debitosSemSuspensao !== 'nao_sei', 5, 'Situação de débitos fiscais informada', 'Necessária para confirmar elegibilidade ao Simples.');
    chk(e.pf.outrasFontesInformadas === 'sim' || e.empresa.outrasFontesRemuneracao === 'nao', 10, 'Outras rendas da pessoa física confirmadas', 'O IRPF anual pode estar incompleto.');
    chk((e.tributosPagos || []).length > 0, 5, 'Tributos pagos informados para conciliação', 'Sem conciliação, divergências não são detectadas.');
    chk(!!e.empresa.dataAbertura, 5, 'Data de abertura informada', 'Necessária para aplicar regras de início de atividade.');
    chk(e.folha.evidenciaPagamento === 'sim', 5, 'Pagamento do pró-labore comprovado', 'Sem comprovação, o fator "r" dos meses realizados é frágil.');
    var total = 0, obtido = 0;
    itens.forEach(function (i) { total += i.peso; if (i.ok) obtido += i.peso; });
    var nota = Math.round(100 * obtido / total);
    return { nota: nota, nivel: nota >= 80 ? 'alta' : (nota >= 50 ? 'média' : 'baixa'), itens: itens };
  }

  raiz.MotorTributario = {
    versao: '1.0.0',
    MESES: MESES, MESES_LONGOS: MESES_LONGOS,
    TIPOS_RECEITA: TIPOS_RECEITA, CAMPOS_MES_RECEITA: CAMPOS_MES_RECEITA,
    CATEGORIAS_DESPESA: CATEGORIAS_DESPESA, CATEGORIA_POR_ID: CATEGORIA_POR_ID,
    r2: r2, num: num, n0: n0, soma: soma, brl: brl, pct: pct, rotuloMes: rotuloMes, rotuloT: rotuloT,
    estadoVazio: estadoVazio, mesclarComPadrao: mesclarComPadrao,
    impostoTabela: impostoTabela, calcularIrrfMensal: calcularIrrfMensal, calcularIrpfAnual: calcularIrpfAnual,
    calcularIrpfm: calcularIrpfm, aliquotaEfetivaSimples: aliquotaEfetivaSimples, reparticaoAjustada: reparticaoAjustada,
    prepararContexto: prepararContexto, janelaApuracao: janelaApuracao, apurarFatorR: apurarFatorR,
    mesDependenciaFolha: mesDependenciaFolha, dasMes: dasMes, simular: simular, fatorRMesSeguinte: fatorRMesSeguinte,
    valorDespesaMes: valorDespesaMes, inssSocio: inssSocio,
    avaliarElegibilidade: avaliarElegibilidade, gerarAlertas: gerarAlertas, conciliarPagamentos: conciliarPagamentos,
    qualidadeDados: qualidadeDados
  };
})(typeof window !== 'undefined' ? window : globalThis);
