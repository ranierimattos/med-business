/*
 * DADOS DE DEMONSTRAÇÃO — FICTÍCIOS
 * Empresa, pessoas e valores inventados para mostrar o funcionamento do
 * simulador. Não correspondem a nenhum contribuinte real.
 */
(function (raiz) {
  'use strict';

  function criarExemplo() {
    var M = raiz.MotorTributario;
    var e = M.estadoVazio(2026);
    e.meta.exemplo = true;
    e.analise.mesInicioPlanejamento = 1;
    e.analise.caixaInicialPJ = '35000';
    e.analise.reservaCaixaMinima = '10000';
    e.analise.incrementoProLabore = 250;

    e.empresa.nome = 'EXEMPLO FICTÍCIO — Clínica Demonstração Ltda.';
    e.empresa.municipio = 'Cidade Exemplo';
    e.empresa.uf = 'SP';
    e.empresa.dataAbertura = '2023-03-01';
    e.empresa.atividadePrincipal = 'Atividade médica ambulatorial restrita a consultas';
    e.empresa.cnaePrincipal = '8630-5/03';
    e.empresa.cnaesSecundarios = '8630-5/02';
    e.empresa.naturezaJuridica = 'ltda';
    e.empresa.socios = [{ nome: 'Dra. Exemplo (fictícia)', participacao: 100, analisado: true, residenteExterior: false }];
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

    var cons = [18000, 22000, 26000, 25000, 26000, 24000, 19000, 26000, 27000, 27000, 26000, 20000];
    var plan = [14000, 14000, 15000, 15000, 16000, 16000, 15000, 16000, 16000, 17000, 17000, 15000];
    var proc = [6000, 8000, 9000, 9000, 10000, 9000, 7000, 10000, 10000, 11000, 10000, 7000];
    var canc = [0, 500, 0, 0, 800, 0, 0, 0, 500, 0, 0, 0];
    for (var i = 0; i < 12; i++) {
      var m = e.receitas.meses[i];
      m.consultas = String(cons[i]);
      m.plantoes = String(plan[i]);
      m.procedimentos = String(proc[i]);
      m.cancelamentos = canc[i] ? String(canc[i]) : '';
    }
    var hr = [37000, 36000, 41000, 46000, 45000, 47000, 45000, 38000, 47000, 48000, 49000, 47000, 39000];
    for (i = 0; i < 13; i++) {
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

  raiz.DadosExemplo = { criar: criarExemplo };
})(typeof window !== 'undefined' ? window : globalThis);
