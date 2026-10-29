/*
 * DADOS DE DEMONSTRAÇÃO — FICTÍCIOS
 * Empresas, pessoas e valores inventados para mostrar o funcionamento do
 * simulador. Não correspondem a nenhum contribuinte real. As alíquotas de ISS
 * municipais são ilustrativas.
 *
 * Exemplos:
 *   clinica     Clínica Demonstração: consultas, plantões e procedimentos (padrão)
 *   neurologia  Neurologista com clínica própria em Ijuí (RS): consultas e
 *               eletroencefalograma, particular e Unimed, atendimento hospitalar eventual
 *   anestesia   Anestesiologista em Porto Alegre (RS) no Lucro Presumido, sem
 *               funcionários, com vínculo CLT em hospital
 */
(function (raiz) {
  'use strict';

  function desp(id, cat, nome, valor, extra) {
    var d = {
      id: id, categoria: cat, nome: nome, valor: String(valor), mesInicial: 1, mesFinal: 12, recorrencia: 'mensal',
      tipoValor: 'fixo', valoresMensais: [], reajustePct: '', reajusteMes: '', parcelaAtual: '', totalParcelas: '',
      natureza: 'empresarial', pctProfissional: '', documento: 'sim', tratamento: 'confirmado', ajustavel: false,
      corteMes: '', corteValorNovo: '', observacoes: '', titularidade: '', usoPessoalPct: '', vinculo: '', vidaUtilAnos: ''
    };
    Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
    return d;
  }

  // Preenche as receitas mês a mês: campos = { consultas: [12 valores], ... }
  function receitasMensais(e, campos) {
    for (var i = 0; i < 12; i++) {
      var m = e.receitas.meses[i];
      Object.keys(campos).forEach(function (c) { m[c] = campos[c][i] ? String(campos[c][i]) : ''; });
    }
  }

  // Histórico de dez/ano−2 a dez/ano−1 (13 meses). A folha soma pró-labore e
  // salários, com 1/3 de férias em julho e 13º em novembro e dezembro; FGTS só sobre salários.
  function historico(e, receitas, proLabore, salarios) {
    for (var i = 0; i < 13; i++) {
      var mes = i === 0 ? 12 : i, extra = 0;
      if (salarios && mes === 7) extra = salarios / 3;
      if (salarios && (mes === 11 || mes === 12)) extra = salarios / 2;
      var fol = proLabore + salarios + extra, fg = (salarios + extra) * 0.08;
      e.receitas.historico[i] = { receita: String(receitas[i]), folha: String(Math.round(fol * 100) / 100), fgts: fg ? String(Math.round(fg * 100) / 100) : '', cpp: '' };
    }
  }

  function criarClinica() {
    var M = raiz.MotorTributario;
    var e = M.estadoVazio(2026);
    e.meta.exemplo = true;
    e.meta.exemploId = 'clinica';
    e.analise.mesInicioPlanejamento = 1;
    e.analise.caixaInicialPJ = '35000';
    e.analise.reservaCaixaMinima = '10000';
    e.analise.incrementoProLabore = 250;

    e.empresa.nome = 'Clínica Demonstração Ltda.';
    e.empresa.municipio = 'Cidade Exemplo';
    e.empresa.uf = 'SP';
    e.empresa.dataAbertura = '2023-03-01';
    e.empresa.atividadePrincipal = 'Atividade médica ambulatorial restrita a consultas';
    e.empresa.cnaePrincipal = '8630-5/03';
    e.empresa.cnaesSecundarios = '8630-5/02';
    e.empresa.naturezaJuridica = 'ltda';
    e.empresa.socios = [{ nome: 'Dra. Exemplo', participacao: 100, analisado: true, residenteExterior: false }];
    e.empresa.temEmpregados = 'sim';
    e.empresa.regimeAtual = 'simples';
    e.empresa.regimeAnoAnterior = 'simples';
    e.empresa.contabilidadeRegular = 'sim';
    e.empresa.temBalancetes = 'sim';
    e.empresa.distribuicaoFormalApurada = 'sim';
    e.empresa.debitosSemSuspensao = 'nao';
    e.empresa.outrasEmpresasReceitaGlobalExcede = 'nao';
    e.empresa.requisitosHospitalares = 'nao';
    e.empresa.iss.aliquota = 5;
    e.empresa.custosAdm = { simples: 0, presumido: 250, real: 1200 };

    receitasMensais(e, {
      consultas: [18000, 22000, 26000, 25000, 26000, 24000, 19000, 26000, 27000, 27000, 26000, 20000],
      plantoes: [14000, 14000, 15000, 15000, 16000, 16000, 15000, 16000, 16000, 17000, 17000, 15000],
      procedimentos: [6000, 8000, 9000, 9000, 10000, 9000, 7000, 10000, 10000, 11000, 10000, 7000],
      cancelamentos: [0, 500, 0, 0, 800, 0, 0, 0, 500, 0, 0, 0]
    });
    var hr = [37000, 36000, 41000, 46000, 45000, 47000, 45000, 38000, 47000, 48000, 49000, 47000, 39000];
    for (var i = 0; i < 13; i++) {
      var sec = 2200, fol = 3000 + sec, fg = sec * 0.08;
      var mes = i === 0 ? 12 : i;
      if (mes === 7) { fol += sec / 3; fg += sec / 3 * 0.08; }
      if (mes === 11 || mes === 12) { fol += sec / 2; fg += sec / 2 * 0.08; }
      e.receitas.historico[i] = { receita: String(hr[i]), folha: String(Math.round(fol * 100) / 100), fgts: String(Math.round(fg * 100) / 100), cpp: '' };
    }

    e.folha.proLaboreAtual = '3000';
    e.folha.evidenciaPagamento = 'sim';
    e.folha.inicioProLabore = '2023-03-01';
    e.folha.pessoas = [
      { id: 'p1', nome: 'Secretária (CLT)', tipo: 'clt', salario: '2300', mesInicio: 1, mesFim: 12, decimoTerceiro: true, ferias: true, mesFerias: 7 }
    ];

    e.despesas = [
      desp('d1', 'aluguel_consultorio', 'Aluguel do consultório', 4500, { reajusteMes: 7, reajustePct: '4' }),
      desp('d2', 'condominio', 'Condomínio', 800),
      desp('d3', 'energia', 'Energia elétrica', 450),
      desp('d4', 'internet', 'Internet e telefone', 260),
      desp('d5', 'contabilidade', 'Escritório de contabilidade', 900),
      desp('d6', 'prontuario', 'Prontuário eletrônico', 350),
      desp('d7', 'insumos', 'Materiais médicos', 1200),
      desp('d8', 'taxas_cartao', 'Taxas de cartão (média)', 600, { tipoValor: 'variavel', valoresMensais: ['480', '560', '640', '620', '660', '620', '520', '660', '670', '700', '670', '530'] }),
      desp('d9', 'seguro_rc', 'Seguro de responsabilidade civil', 2160, { recorrencia: 'anual', mesInicial: 3 }),
      desp('d10', 'anuidades', 'Anuidade CRM e sociedade de especialidade', 1400, { recorrencia: 'anual', mesInicial: 3 }),
      desp('d11', 'congressos', 'Congresso da especialidade', 6000, { recorrencia: 'unica', mesInicial: 5, tratamento: 'nao_confirmado' }),
      desp('d12', 'combustivel', 'Combustível (deslocamento a hospitais)', 800, { titularidade: 'pj', usoPessoalPct: '40', tratamento: 'nao_confirmado' }),
      desp('d13', 'equipamentos_medicos', 'Ultrassom portátil', 30000, { recorrencia: 'unica', mesInicial: 2, vidaUtilAnos: '10' }),
      desp('d14', 'juros', 'Juros de capital de giro', 180, { mesFinal: 8 }),
      desp('d15', 'amortizacao_principal', 'Principal do empréstimo', 1500, { mesFinal: 8 }),
      desp('d16', 'moradia', 'Moradia (pessoal)', 7000, { natureza: 'pessoal' }),
      desp('d17', 'plano_saude', 'Plano de saúde familiar (pessoal)', 1500, { natureza: 'pessoal' }),
      desp('d18', 'alimentacao', 'Alimentação (pessoal)', 2500, { natureza: 'pessoal' })
    ];

    e.tributosPagos = [
      { id: 't1', tributo: 'DAS', valor: '6020.00', competencia: 1, dataPagamento: '2026-02-20', codigoReceita: '', orgao: 'Receita Federal (Simples Nacional)', natureza: 'pago', confirmado: 'sim' },
      { id: 't2', tributo: 'INSS', valor: '330.00', competencia: 1, dataPagamento: '2026-02-20', codigoReceita: '', orgao: 'Receita Federal (DCTFWeb)', natureza: 'retido', confirmado: 'sim' },
      { id: 't3', tributo: 'DARF', valor: '412.00', competencia: 1, dataPagamento: '2026-02-20', codigoReceita: '', orgao: 'Receita Federal', natureza: 'pago', confirmado: 'nao' }
    ];

    e.pf.dependentes = 2;
    e.pf.despesasMedicasAnual = '18000';
    e.pf.instrucaoAnual = '14000';
    e.pf.outrasFontesInformadas = 'sim';
    e.pf.rendimentosExclusivosAnual = '6000';
    e.pf.irExclusivoAnual = '900';

    e.distribuicao.politica = 'automatica';
    e.distribuicao.limitarRetencao = true;
    e.distribuicao.lucrosAcumuladosAnteriores = '80000';
    e.distribuicao.saldoTransicao2025 = '60000';
    return e;
  }

  // Neurologista com clínica própria em Ijuí (RS). Consulta particular de
  // R$ 600; credenciado só à Unimed (consulta R$ 160). Faz eletroencefalograma
  // (particular R$ 380, Unimed R$ 120) e atende pareceres e internações Unimed no
  // hospital, eventualmente. O atendimento SUS no hospital é voluntário: não gera receita.
  function criarNeurologia() {
    var M = raiz.MotorTributario;
    var e = M.estadoVazio(2026);
    e.meta.exemplo = true;
    e.meta.exemploId = 'neurologia';
    e.analise.mesInicioPlanejamento = 1;
    e.analise.caixaInicialPJ = '90000';
    e.analise.reservaCaixaMinima = '25000';
    e.analise.incrementoProLabore = 250;

    e.empresa.nome = 'Clínica Sinapse Neurologia Ltda.';
    e.empresa.municipio = 'Ijuí';
    e.empresa.uf = 'RS';
    e.empresa.dataAbertura = '2014-08-01';
    e.empresa.atividadePrincipal = 'Atividade médica ambulatorial com recursos para exames complementares (neurologia e eletroencefalograma)';
    e.empresa.cnaePrincipal = '8630-5/02';
    e.empresa.cnaesSecundarios = '8630-5/03';
    e.empresa.naturezaJuridica = 'slu';
    e.empresa.socios = [{ nome: 'Dr. Henrique Valentini', participacao: 100, analisado: true, residenteExterior: false }];
    e.empresa.temEmpregados = 'sim';
    e.empresa.regimeAtual = 'simples';
    e.empresa.regimeAnoAnterior = 'simples';
    e.empresa.contabilidadeRegular = 'sim';
    e.empresa.temBalancetes = 'sim';
    e.empresa.distribuicaoFormalApurada = 'sim';
    e.empresa.debitosSemSuspensao = 'nao';
    e.empresa.outrasEmpresasReceitaGlobalExcede = 'nao';
    e.empresa.requisitosHospitalares = 'nao';
    e.empresa.iss.aliquota = 3;
    // Unimed (pessoa jurídica) paga cerca de 35% da receita: retenções no Presumido/Real
    e.empresa.retencoesFederaisPct = 35;
    e.empresa.custosAdm = { simples: 0, presumido: 300, real: 1500 };

    // consultas: ~70 particulares (R$ 600) e ~110 Unimed (R$ 160) por mês, menos em janeiro e dezembro
    // exames: ~25 EEG particulares (R$ 380) e ~50 pela Unimed (R$ 120)
    // outras atividades médicas: pareceres e internações Unimed no hospital
    receitasMensais(e, {
      consultas: [44800, 53600, 59600, 60200, 61400, 60800, 63000, 61600, 60200, 61400, 59000, 47800],
      exames: [11400, 13800, 15500, 15900, 16200, 16600, 17800, 16200, 15500, 15900, 15100, 12100],
      outrasMedicas: [2400, 3200, 4000, 3600, 4800, 5600, 6400, 5200, 4000, 3600, 3200, 2800],
      cancelamentos: [0, 600, 0, 450, 0, 0, 900, 0, 0, 500, 0, 0]
    });
    historico(e, [62000, 58000, 67000, 73000, 74000, 76000, 77000, 80000, 77000, 75000, 76000, 73000, 60000], 8000, 8000);

    e.folha.proLaboreAtual = '8000';
    e.folha.evidenciaPagamento = 'sim';
    e.folha.inicioProLabore = '2014-08-01';
    e.folha.pessoas = [
      { id: 'p1', nome: 'Recepcionista (CLT)', tipo: 'clt', salario: '2400', mesInicio: 1, mesFim: 12, decimoTerceiro: true, ferias: true, mesFerias: 1 },
      { id: 'p2', nome: 'Secretária e faturamento Unimed (CLT)', tipo: 'clt', salario: '2600', mesInicio: 1, mesFim: 12, decimoTerceiro: true, ferias: true, mesFerias: 7 },
      { id: 'p3', nome: 'Técnica em eletroencefalografia (CLT)', tipo: 'clt', salario: '3200', mesInicio: 1, mesFim: 12, decimoTerceiro: true, ferias: true, mesFerias: 12 }
    ];

    e.despesas = [
      desp('d1', 'aluguel_consultorio', 'Aluguel da clínica', 6500, { reajusteMes: 8, reajustePct: '4.5' }),
      desp('d2', 'energia', 'Energia elétrica', 900),
      desp('d3', 'agua', 'Água', 160),
      desp('d4', 'internet', 'Internet', 280),
      desp('d5', 'telefone', 'Telefone e WhatsApp da clínica', 220),
      desp('d6', 'contabilidade', 'Escritório de contabilidade', 1400),
      desp('d7', 'prontuario', 'Prontuário eletrônico', 450),
      desp('d8', 'software_medico', 'Software de laudos de EEG', 380),
      desp('d9', 'insumos', 'Eletrodos, pasta condutora e materiais', 1300),
      desp('d10', 'manutencao_equipamentos', 'Manutenção e calibração dos eletroencefalógrafos', 4200, { recorrencia: 'anual', mesInicial: 4 }),
      desp('d11', 'taxas_cartao', 'Taxas de cartão (consultas particulares)', 1100, { tipoValor: 'variavel', valoresMensais: ['860', '1030', '1150', '1160', '1180', '1170', '1240', '1190', '1160', '1180', '1130', '920'] }),
      desp('d12', 'seguro_rc', 'Seguro de responsabilidade civil', 3600, { recorrencia: 'anual', mesInicial: 3 }),
      desp('d13', 'anuidades', 'Anuidade CRM-RS e Academia Brasileira de Neurologia', 1900, { recorrencia: 'anual', mesInicial: 3 }),
      desp('d14', 'congressos', 'Congresso Brasileiro de Neurologia', 9000, { recorrencia: 'unica', mesInicial: 9, tratamento: 'nao_confirmado' }),
      desp('d15', 'combustivel', 'Combustível (hospital e viagens a Porto Alegre)', 700, { titularidade: 'pj', usoPessoalPct: '30', tratamento: 'nao_confirmado' }),
      desp('d16', 'equipamentos_medicos', 'Eletroencefalógrafo digital com vídeo-EEG', 68000, { recorrencia: 'unica', mesInicial: 4, vidaUtilAnos: '10' }),
      desp('d17', 'moradia', 'Moradia (pessoal)', 6000, { natureza: 'pessoal' }),
      desp('d18', 'plano_saude', 'Plano de saúde familiar (pessoal)', 2200, { natureza: 'pessoal' }),
      desp('d19', 'alimentacao', 'Alimentação (pessoal)', 3000, { natureza: 'pessoal' }),
      desp('d20', 'lazer', 'Lazer e viagens (pessoal)', 2000, { natureza: 'pessoal' })
    ];

    e.pf.dependentes = 2;
    e.pf.despesasMedicasAnual = '15000';
    e.pf.instrucaoAnual = '22000';
    e.pf.outrasFontesInformadas = 'sim';
    e.pf.rendimentosExclusivosAnual = '12000';
    e.pf.irExclusivoAnual = '1800';

    e.distribuicao.politica = 'automatica';
    e.distribuicao.limitarRetencao = true;
    e.distribuicao.lucrosAcumuladosAnteriores = '150000';
    e.distribuicao.saldoTransicao2025 = '120000';
    return e;
  }

  // Anestesiologista em Porto Alegre (RS): anestesias pagas pelos hospitais e
  // plantões de UTI, sem consultório nem funcionários. Está no Lucro Presumido
  // com pró-labore de R$ 8.000 e tem vínculo CLT num hospital, que já alcança o
  // teto do INSS.
  function criarAnestesia() {
    var M = raiz.MotorTributario;
    var e = M.estadoVazio(2026);
    e.meta.exemplo = true;
    e.meta.exemploId = 'anestesia';
    e.analise.mesInicioPlanejamento = 1;
    e.analise.caixaInicialPJ = '40000';
    e.analise.reservaCaixaMinima = '15000';
    e.analise.incrementoProLabore = 250;

    e.empresa.nome = 'Morfeu Anestesiologia Ltda.';
    e.empresa.municipio = 'Porto Alegre';
    e.empresa.uf = 'RS';
    e.empresa.dataAbertura = '2019-02-01';
    e.empresa.atividadePrincipal = 'Anestesiologia em ambiente hospitalar e plantões de terapia intensiva';
    e.empresa.cnaePrincipal = '8630-5/01';
    e.empresa.cnaesSecundarios = '8630-5/99';
    e.empresa.naturezaJuridica = 'slu';
    e.empresa.socios = [{ nome: 'Dra. Helena Albuquerque', participacao: 100, analisado: true, residenteExterior: false }];
    e.empresa.temEmpregados = 'nao';
    e.empresa.outrasFontesRemuneracao = 'sim';
    e.empresa.regimeAtual = 'presumido';
    e.empresa.regimeAnoAnterior = 'presumido';
    e.empresa.contabilidadeRegular = 'sim';
    e.empresa.temBalancetes = 'sim';
    e.empresa.distribuicaoFormalApurada = 'sim';
    e.empresa.debitosSemSuspensao = 'nao';
    e.empresa.outrasEmpresasReceitaGlobalExcede = 'nao';
    e.empresa.requisitosHospitalares = 'nao';
    e.empresa.iss.aliquota = 3;
    // toda a receita vem de hospitais (pessoas jurídicas): IRRF e CSRF retidos no Presumido/Real
    e.empresa.retencoesFederaisPct = 100;
    e.empresa.custosAdm = { simples: 0, presumido: 0, real: 900 };

    receitasMensais(e, {
      procedimentos: [38000, 46000, 54000, 55000, 56000, 54000, 50000, 56000, 57000, 58000, 55000, 42000],
      plantoes: [18000, 15000, 15000, 16500, 16500, 15000, 18000, 16500, 15000, 16500, 15000, 19500],
      cancelamentos: [0, 0, 800, 0, 0, 1200, 0, 0, 0, 900, 0, 0]
    });
    historico(e, [60000, 52000, 58000, 64000, 66000, 69000, 66000, 67000, 70000, 70000, 71000, 68000, 58000], 8000, 0);

    e.folha.proLaboreAtual = '8000';
    e.folha.evidenciaPagamento = 'sim';
    e.folha.inicioProLabore = '2019-02-01';
    e.folha.multiplasFontes = 'sim';

    e.despesas = [
      desp('d1', 'contabilidade', 'Escritório de contabilidade', 950),
      desp('d2', 'telefone', 'Telefone profissional', 150),
      desp('d3', 'tarifas_bancarias', 'Tarifas bancárias', 90),
      desp('d4', 'estacionamento', 'Estacionamento nos hospitais', 380, { usoPessoalPct: '0' }),
      desp('d5', 'combustivel', 'Combustível (entre hospitais)', 650, { titularidade: 'pj', usoPessoalPct: '40', tratamento: 'nao_confirmado' }),
      desp('d6', 'seguro_rc', 'Seguro de responsabilidade civil', 5800, { recorrencia: 'anual', mesInicial: 4 }),
      desp('d7', 'anuidades', 'Anuidade CRM-RS e Sociedade Brasileira de Anestesiologia', 1700, { recorrencia: 'anual', mesInicial: 3 }),
      desp('d8', 'especializacao', 'Curso de ultrassom para bloqueios anestésicos', 1250, { mesInicial: 3, mesFinal: 8 }),
      desp('d9', 'congressos', 'Congresso Brasileiro de Anestesiologia', 7500, { recorrencia: 'unica', mesInicial: 11, tratamento: 'nao_confirmado' }),
      desp('d10', 'equipamentos_medicos', 'Ultrassom portátil para bloqueios', 42000, { recorrencia: 'unica', mesInicial: 6, vidaUtilAnos: '10' }),
      desp('d11', 'moradia', 'Moradia (pessoal)', 8000, { natureza: 'pessoal' }),
      desp('d12', 'plano_saude', 'Plano de saúde (pessoal)', 1600, { natureza: 'pessoal' }),
      desp('d13', 'alimentacao', 'Alimentação (pessoal)', 2800, { natureza: 'pessoal' })
    ];

    e.tributosPagos = [];

    // vínculo CLT num hospital: R$ 9.500/mês, com 13º e 1/3 de férias
    e.pf.dependentes = 1;
    e.pf.outrasRendasTributaveisAnual = '126667';
    e.pf.irRetidoOutrasFontesAnual = '18600';
    e.pf.salarioContribuicaoOutrasFontesMensal = '8475.55';
    e.pf.inssOutrasFontesAnual = '12845';
    e.pf.despesasMedicasAnual = '9000';
    e.pf.instrucaoAnual = '12000';
    e.pf.outrasFontesInformadas = 'sim';
    e.pf.rendimentosExclusivosAnual = '20000';
    e.pf.irExclusivoAnual = '3000';

    e.distribuicao.politica = 'automatica';
    e.distribuicao.limitarRetencao = true;
    e.distribuicao.lucrosAcumuladosAnteriores = '220000';
    e.distribuicao.saldoTransicao2025 = '200000';
    return e;
  }

  var EXEMPLOS = [
    { id: 'clinica', titulo: 'Clínica Demonstração', resumo: 'Consultas, plantões e procedimentos; Simples Nacional, uma secretária.', criar: criarClinica },
    { id: 'neurologia', titulo: 'Clínica Sinapse Neurologia · Ijuí (RS)', resumo: 'Dr. Henrique Valentini, neurologista: consultas (particular R$ 600 e Unimed) e eletroencefalograma; atende no hospital eventualmente e no SUS como voluntário.', criar: criarNeurologia },
    { id: 'anestesia', titulo: 'Morfeu Anestesiologia · Porto Alegre (RS)', resumo: 'Dra. Helena Albuquerque, anestesiologista: anestesias e plantões de UTI, Lucro Presumido com pró-labore de R$ 8.000, sem funcionários e com vínculo CLT em hospital.', criar: criarAnestesia }
  ];

  function criar(id) {
    var ex = EXEMPLOS.filter(function (x) { return x.id === id; })[0] || EXEMPLOS[0];
    return ex.criar();
  }

  raiz.DadosExemplo = {
    criar: criar,
    lista: EXEMPLOS.map(function (x) { return { id: x.id, titulo: x.titulo, resumo: x.resumo }; })
  };
})(typeof window !== 'undefined' ? window : globalThis);
