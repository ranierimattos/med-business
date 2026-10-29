/*
 * Testes automatizados do motor tributário e do otimizador.
 * Executar: node --test tests/
 * Os valores esperados foram calculados à mão a partir das tabelas legais
 * embarcadas (LC 123/2006, Lei 15.270/2025, tabelas IRPF 2026, teto INSS 2026).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

for (const f of ['parametros', 'motor', 'otimizador', 'exemplo', 'exportacao']) {
  require(path.join(__dirname, '..', 'src', f + '.js'));
}
const M = globalThis.MotorTributario;
const O = globalThis.Otimizador;
const PL = globalThis.ParametrosLegais;
const E = globalThis.Exportacao;
const P26 = PL.anos[2026];
const P25 = PL.anos[2025];
const P27 = PL.anos[2027];

function quase(real, esperado, tol, msg) {
  assert.ok(Math.abs(real - esperado) <= (tol === undefined ? 0.005 : tol), (msg || '') + ` esperado ${esperado}, obtido ${real}`);
}

// Estado mínimo: empresa consolidada, receita mensal fixa de consultas, histórico completo.
function estadoBase(opts) {
  opts = opts || {};
  const e = M.estadoVazio(opts.ano || 2026);
  e.empresa.dataAbertura = opts.abertura || '2020-01-01';
  e.empresa.contabilidadeRegular = 'sim';
  e.empresa.temBalancetes = 'sim';
  e.empresa.debitosSemSuspensao = 'nao';
  e.empresa.custosAdm = { simples: 0, presumido: 0, real: 0 };
  const rec = opts.receita === undefined ? 30000 : opts.receita;
  for (let i = 0; i < 12; i++) e.receitas.meses[i].consultas = String(Array.isArray(rec) ? rec[i] : rec);
  const hr = opts.historicoReceita === undefined ? 30000 : opts.historicoReceita;
  const hf = opts.historicoFolha === undefined ? 3000 : opts.historicoFolha;
  for (let i = 0; i < 13; i++) e.receitas.historico[i] = { receita: String(hr), folha: String(hf), fgts: '', cpp: '' };
  e.folha.proLaboreAtual = String(opts.proLabore === undefined ? 3000 : opts.proLabore);
  e.analise.caixaInicialPJ = String(opts.caixa === undefined ? 100000 : opts.caixa);
  e.analise.reservaCaixaMinima = '0';
  return e;
}

// ------------------------------------------------------------ precisão monetária

test('arredondamento monetário meio para cima e sem erro de ponto flutuante', () => {
  assert.equal(M.r2(1.005), 1.01);
  assert.equal(M.r2(0.1 + 0.2), 0.3);
  assert.equal(M.r2(2.675), 2.68);
  assert.equal(M.r2(-1.005), -1.01);
  assert.equal(M.r2(1234.5649999), 1234.56);
  assert.equal(M.num('1.234,56'), 1234.56);
  assert.equal(M.num('R$ 10'), 10);
  assert.equal(M.num(''), null);
  assert.equal(M.num('10.000'), 10000, 'ponto como separador de milhar');
  assert.equal(M.num('1.234.567'), 1234567);
  assert.equal(M.num('2.5'), 2.5);
  assert.equal(M.num('0.275'), 0.275);
  assert.equal(M.brl(1234567.891), 'R$ 1.234.567,89');
});

// ------------------------------------------------------------ Simples Nacional

test('alíquota efetiva: fórmula oficial e faixas do Anexo III', () => {
  const III = P26.simples.anexos.III;
  let a = M.aliquotaEfetivaSimples(III, 150000);
  assert.equal(a.faixa, 1); quase(a.efetiva, 0.06, 1e-12);
  a = M.aliquotaEfetivaSimples(III, 300000);
  assert.equal(a.faixa, 2); quase(a.efetiva, (300000 * 0.112 - 9360) / 300000, 1e-12); quase(a.efetiva, 0.0808, 1e-12);
  // continuidade na fronteira entre faixas
  const f1 = M.aliquotaEfetivaSimples(III, 180000), f2 = M.aliquotaEfetivaSimples(III, 180000.01);
  assert.equal(f1.faixa, 1); assert.equal(f2.faixa, 2); quase(f1.efetiva, f2.efetiva, 1e-6);
  a = M.aliquotaEfetivaSimples(III, 4800000.01);
  assert.equal(a.excedeLimite, true);
});

test('alíquota efetiva: Anexo V faixa 3 (RBT12 de R$ 528 mil = 17,625%)', () => {
  const a = M.aliquotaEfetivaSimples(P26.simples.anexos.V, 528000);
  assert.equal(a.faixa, 3);
  quase(a.efetiva, 0.17625, 1e-12);
});

test('repartições somam 100% e ISS limitado a 5% na 5ª faixa do Anexo III', () => {
  ['I', 'III', 'V'].forEach((an) => P26.simples.anexos[an].faixas.forEach((f) => {
    const s = Object.values(f.reparticao).reduce((x, y) => x + y, 0);
    quase(s, 1, 1e-9, `anexo ${an}`);
  }));
  const III = P26.simples.anexos.III;
  const al = M.aliquotaEfetivaSimples(III, 3600000);
  quase(al.efetiva, 0.1751, 1e-12);
  const rep = M.reparticaoAjustada(al.efetiva, al.reparticao, 0.05, false);
  assert.equal(rep.issLimitado, true);
  quase(rep.fracoes.ISS * al.efetiva, 0.05, 1e-12);
  quase(Object.values(rep.fracoes).reduce((x, y) => x + y, 0), 1, 1e-12);
  quase(rep.fracoes.IRPJ * al.efetiva, (0.1751 - 0.05) * (0.04 / 0.665), 1e-12);
});

test('DAS mensal: receita × alíquota efetiva, arredondado ao centavo, com repartição fechando', () => {
  const e = estadoBase({ receita: 44000, historicoReceita: 44000, historicoFolha: 5000 });
  const ctx = M.prepararContexto(e, P26);
  const r = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(3000) });
  const jan = r.meses[0];
  assert.equal(jan.rbt12, 528000);
  assert.equal(jan.anexo, 'V');
  assert.equal(jan.das, M.r2(44000 * 0.17625));
  const soma = Object.values(jan.dasTributos).reduce((x, y) => x + y, 0);
  quase(soma, jan.das, 0.001);
});

// ------------------------------------------------------------ Fator R

test('fator "r" consolidado = FS12 / RBT12 da janela de 12 meses anteriores', () => {
  const e = estadoBase({ receita: 30000, historicoReceita: 30000, historicoFolha: 8000, proLabore: 8000 });
  const ctx = M.prepararContexto(e, P26);
  const fr = M.apurarFatorR(ctx, 1, 0);
  assert.equal(fr.janela.tipo, 'consolidada');
  assert.equal(fr.rbt12, 360000);
  assert.equal(fr.fs12, 96000);
  quase(fr.r, 96000 / 360000, 1e-12);
  // fevereiro: sai jan do ano anterior, entra jan do ano analisado
  const r = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(10000) });
  assert.equal(r.meses[1].fs12, 96000 - 8000 + 10000);
  quase(r.meses[1].fatorR, 98000 / 360000, 1e-12);
});

test('fator "r" exatamente 28% leva ao Anexo III; abaixo, Anexo V', () => {
  const e = estadoBase({ receita: 30000, historicoReceita: 30000, historicoFolha: 8400 });
  const ctx = M.prepararContexto(e, P26);
  const r = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(8400) });
  quase(r.meses[0].fatorR, 0.28, 1e-12);
  assert.equal(r.meses[0].anexo, 'III');
  const e2 = estadoBase({ receita: 30000, historicoReceita: 30000, historicoFolha: 8399 });
  const r2 = M.simular(M.prepararContexto(e2, P26), { regime: 'simples', proLabore: Array(12).fill(8399) });
  assert.equal(r2.meses[0].anexo, 'V');
});

test('mudança de anexo depende do histórico: aumento em janeiro só afeta fevereiro em diante', () => {
  const e = estadoBase({ receita: 30000, historicoReceita: 30000, historicoFolha: 3000, proLabore: 3000 });
  const ctx = M.prepararContexto(e, P26);
  const plano = Array(12).fill(3000); plano[0] = 70000;
  const r = M.simular(ctx, { regime: 'simples', proLabore: plano });
  assert.equal(r.meses[0].anexo, 'V', 'janeiro usa só o histórico');
  assert.equal(r.meses[1].fs12, 36000 - 3000 + 70000);
  assert.equal(r.meses[1].anexo, 'III');
  assert.equal(M.mesDependenciaFolha(ctx, 1), 0);
  assert.equal(M.mesDependenciaFolha(ctx, 2), 1);
});

test('distribuição de lucros não entra na folha do fator "r"', () => {
  const e = estadoBase({ receita: 30000, historicoReceita: 30000, historicoFolha: 3000 });
  const ctx = M.prepararContexto(e, P26);
  const a = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(3000), distribuicao: Array(12).fill(0) });
  const b = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(3000), distribuicao: Array(12).fill(20000) });
  assert.deepEqual(a.meses.map((m) => m.fs12), b.meses.map((m) => m.fs12));
  assert.deepEqual(a.meses.map((m) => m.das), b.meses.map((m) => m.das));
});

test('início de atividade (Res. CGSN 140): 1º mês × 12; meses seguintes pela média dos anteriores', () => {
  const rec = [0, 0, 20000, 30000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000];
  const e = estadoBase({ abertura: '2026-03-10', receita: rec });
  const ctx = M.prepararContexto(e, P26);
  const r = M.simular(ctx, { regime: 'simples', proLabore: [0, 0, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000] });
  assert.equal(r.meses[0].ativo, false);
  assert.equal(r.meses[0].das, 0);
  assert.equal(r.meses[2].janela.tipo, 'primeiro_mes');
  assert.equal(r.meses[2].rbt12, 240000, 'mar: 20.000 × 12');
  quase(r.meses[2].fatorR, 6000 / 20000, 1e-12);
  assert.equal(r.meses[3].rbt12, 240000, 'abr: média(20.000) × 12');
  assert.equal(r.meses[4].rbt12, 300000, 'mai: média(20.000; 30.000) × 12');
  quase(r.meses[4].fatorR, 12000 / 50000, 1e-12);
  // a anualização não altera a receita efetiva
  assert.equal(r.anual.rb, rec.reduce((x, y) => x + y, 0));
});

test('início de atividade (Res. CGSN 190, 2027): fator "r" = 0,28 nos dois primeiros meses e defasagem de um mês', () => {
  const e = estadoBase({ ano: 2027, abertura: '2027-03-01', receita: [0, 0, 20000, 30000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000] });
  const ctx = M.prepararContexto(e, P27);
  const r = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(2000) });
  quase(r.meses[2].fatorR, 0.28, 1e-12); assert.equal(r.meses[2].anexo, 'III');
  quase(r.meses[3].fatorR, 0.28, 1e-12);
  // maio (3º mês): janela vai até março (mês anterior ao anterior)
  assert.equal(r.meses[4].janela.fim, 12 + 3);
  assert.equal(r.meses[4].rbt12, 240000);
  // empresa consolidada em 2027: janela de jan/27 = dez/25 a nov/26
  const e2 = estadoBase({ ano: 2027 });
  const j = M.janelaApuracao(M.prepararContexto(e2, P27), 1);
  assert.equal(j.ini, 0); assert.equal(j.fim, 11);
});

// ------------------------------------------------------------ INSS e IRPF

test('INSS do sócio: 11% limitado ao teto, considerando outras fontes', () => {
  const ctx = M.prepararContexto(estadoBase(), P26);
  assert.equal(M.inssSocio(ctx, 1, 5000).valor, 550);
  assert.equal(M.inssSocio(ctx, 1, 10000).valor, 932.31);
  const e = estadoBase(); e.pf.salarioContribuicaoOutrasFontesMensal = '5000';
  assert.equal(M.inssSocio(M.prepararContexto(e, P26), 1, 10000).valor, 382.31);
});

test('IRRF mensal 2026 com redução da Lei 15.270', () => {
  let r = M.calcularIrrfMensal(P26, 1, 5000, 550, 0, 0);
  assert.equal(r.usaSimplificado, true);
  assert.equal(r.impostoTabela, 312.89);
  assert.equal(r.reducao, 312.89);
  assert.equal(r.irrf, 0);
  r = M.calcularIrrfMensal(P26, 1, 7000, 770, 0, 0);
  assert.equal(r.base, 6230);
  assert.equal(r.impostoTabela, 804.52);
  assert.equal(r.reducao, 46.61);
  assert.equal(r.irrf, 757.92);
  r = M.calcularIrrfMensal(P26, 1, 10000, 932.31, 0, 0);
  assert.equal(r.irrf, 1584.88);
  r = M.calcularIrrfMensal(P26, 1, 10000, 932.31, 2, 0);
  assert.equal(r.base, 8688.51);
  assert.equal(r.irrf, 1480.61);
});

test('IRRF 2025 usa a tabela vigente em cada mês (mudança em maio)', () => {
  const abr = M.calcularIrrfMensal(P25, 4, 3000, 0, 0, 0);
  const mai = M.calcularIrrfMensal(P25, 5, 3000, 0, 0, 0);
  // abril: base 3000 − 564,80 = 2435,20 → 7,5% − 169,44 = 13,20
  assert.equal(abr.irrf, 13.2);
  // maio: base 3000 − 607,20 = 2392,80 → isento
  assert.equal(mai.irrf, 0);
});

test('IRRF de até R$ 10,00 não é retido', () => {
  const r = M.calcularIrrfMensal(P25, 1, 2400, 0, 0, 0);
  // base 2400 − 564,80 = 1835,20 → isento; usar valor acima: 2950 − 564,80 = 2385,20 → 9,45
  const r2 = M.calcularIrrfMensal(P25, 1, 2950, 0, 0, 0);
  assert.equal(r.irrf, 0);
  assert.equal(r2.impostoTabela, 9.45);
  assert.equal(r2.irrf, 0);
  assert.equal(r2.dispensado, true);
});

test('IRPF anual 2026: escolha entre completa e simplificada e redução anual', () => {
  let r = M.calcularIrpfAnual(P26, { tributaveis: 120000, inss: 11187.72, dependentes: 0, pensao: 0, medicas: 0, instrucao: 0, pgbl: 0, opcao: 'auto', irrf: 0, irOutrasFontes: 0, carneLeaoPago: 0 });
  assert.equal(r.simplificada.base, 102360);
  assert.equal(r.simplificada.devido, 17244.34);
  assert.equal(r.completa.devido, 19018.72);
  assert.equal(r.escolhida.opcao, 'simplificada');
  r = M.calcularIrpfAnual(P26, { tributaveis: 60000, inss: 0, dependentes: 0, pensao: 0, medicas: 0, instrucao: 0, pgbl: 0, opcao: 'simplificada', irrf: 0, irOutrasFontes: 0, carneLeaoPago: 0 });
  assert.equal(r.escolhida.impostoTabela, 2694.15);
  assert.equal(r.devido, 0);
  r = M.calcularIrpfAnual(P26, { tributaveis: 70000, inss: 0, dependentes: 0, pensao: 0, medicas: 0, instrucao: 0, pgbl: 0, opcao: 'simplificada', irrf: 0, irOutrasFontes: 0, carneLeaoPago: 0 });
  assert.equal(r.escolhida.impostoTabela, 4495.34);
  assert.equal(r.escolhida.reducao, 1739.48);
  assert.equal(r.devido, 2755.86);
});

test('imposto anual não é a tabela mensal × 12 e restituição não é economia', () => {
  const e = estadoBase({ proLabore: 10000 });
  e.pf.dependentes = 2; e.pf.despesasMedicasAnual = '30000';
  const r = M.simular(M.prepararContexto(e, P26), { regime: 'simples', proLabore: Array(12).fill(10000) });
  const A = r.anual;
  assert.ok(A.irrf > A.irpfDevido, 'IRRF antecipado maior que o devido');
  assert.ok(A.irpf.saldo < 0, 'há restituição');
  // carga usa o imposto devido, nunca o retido
  quase(A.cargaTributaria, A.tributosPJ + A.inss + A.irpfDevido + A.irpfmAdicional, 0.001);
  assert.notEqual(A.irpfDevido, M.r2(A.irrf));
});

test('IRPFM: alíquota linear entre R$ 600 mil e R$ 1,2 milhão e dedução do IRPF devido', () => {
  const base = { isentos: 0, exclusivos: 0, dividendosOutras: 0, irExclusivo: 0, retencoes: 0, irpjCsllPJ: 0, lucroContabilPJ: 0, temDemonstracoes: false };
  let r = M.calcularIrpfm(P26, Object.assign({}, base, { tributaveis: 100000, dividendosPJ: 500000, irpfDevido: 17000 }));
  assert.equal(r.aliquota, 0); assert.equal(r.adicional, 0);
  r = M.calcularIrpfm(P26, Object.assign({}, base, { tributaveis: 100000, dividendosPJ: 800000, irpfDevido: 17000 }));
  quase(r.aliquota, 0.05, 1e-12);
  assert.equal(r.impostoMinimo, 45000);
  assert.equal(r.adicional, 28000);
  r = M.calcularIrpfm(P26, Object.assign({}, base, { tributaveis: 100000, dividendosPJ: 1400000, irpfDevido: 17000, retencoes: 50000 }));
  quase(r.aliquota, 0.10, 1e-12);
  assert.equal(r.impostoMinimo, 150000);
  assert.equal(r.adicional, 133000);
  assert.equal(r.saldo, 83000, 'retenção é antecipação, abatida no saldo');
  assert.equal(M.calcularIrpfm(P25, Object.assign({}, base, { tributaveis: 100000, dividendosPJ: 1400000, irpfDevido: 0 })).adicional, 0, 'sem IRPFM em 2025');
});

// ------------------------------------------------------------ dividendos

test('retenção de 10% sobre dividendos acima de R$ 50 mil no mês, sobre o total; lucros de transição isentos', () => {
  const e = estadoBase({ receita: 200000, historicoReceita: 200000, historicoFolha: 60000, proLabore: 60000 });
  e.distribuicao.lucrosAcumuladosAnteriores = '1000000';
  const ctx = M.prepararContexto(e, P26);
  const dist = Array(12).fill(0); dist[0] = 60000; dist[1] = 50000;
  const r = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(60000), distribuicao: dist });
  assert.equal(r.meses[0].retencaoDividendos, 6000);
  assert.equal(r.meses[1].retencaoDividendos, 0);
  // retenção não entra na carga tributária
  quase(r.anual.cargaTributaria, r.anual.tributosPJ + r.anual.inss + r.anual.irpfDevido + r.anual.irpfmAdicional, 0.001);
  e.distribuicao.saldoTransicao2025 = '60000';
  const r2 = M.simular(M.prepararContexto(e, P26), { regime: 'simples', proLabore: Array(12).fill(60000), distribuicao: dist });
  assert.equal(r2.meses[0].retencaoDividendos, 0);
  assert.equal(r2.anual.dividendoTransicao, 60000);
});

test('distribuição automática respeita lucro distribuível, caixa e limite de R$ 50 mil', () => {
  const e = estadoBase({ receita: 150000, historicoReceita: 150000, historicoFolha: 45000, proLabore: 45000 });
  e.distribuicao.politica = 'automatica';
  const r = M.simular(M.prepararContexto(e, P26), { regime: 'simples', proLabore: Array(12).fill(45000) });
  r.meses.forEach((m) => {
    assert.ok(m.dividendoMedico <= 50000 + 0.01, 'limite mensal');
    assert.ok(m.distribuicao <= m.lucroDistribuivel + 0.01, 'não excede o lucro distribuível');
    assert.ok(m.caixaFinal >= -0.01, 'caixa não negativo');
  });
  assert.equal(r.anual.retencaoDividendos, 0);
  assert.equal(r.anual.excessoDistribuicao, 0);
});

test('sem escrituração, o limite isento é o lucro presumido menos o IRPJ do DAS', () => {
  const e = estadoBase({ receita: 30000, historicoReceita: 30000, historicoFolha: 3000 });
  e.empresa.contabilidadeRegular = 'nao';
  const r = M.simular(M.prepararContexto(e, P26), { regime: 'simples', proLabore: Array(12).fill(3000) });
  const jan = r.meses[0];
  assert.equal(jan.limitePresumidoMes, M.r2(30000 * 0.32 - jan.dasTributos.IRPJ));
  assert.ok(jan.lucroDistribuivel <= jan.limitePresumidoMes + 0.01);
});

// ------------------------------------------------------------ fluxo de caixa e dupla contagem

test('fluxo de caixa: caixa final = inicial + fluxos operacionais − distribuições', () => {
  const e = globalThis.DadosExemplo.criar();
  const ctx = M.prepararContexto(e, P26);
  const r = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(5000) });
  const somaFluxo = r.meses.reduce((s, m) => s + m.fluxoOperacional, 0);
  quase(r.anual.caixaFinalPJ, ctx.caixaInicial + somaFluxo - r.anual.distribuicao, 0.05);
  // lucro contábil = receitas − despesas − depreciação − tributos − folha − custos adm
  const m = r.meses[1];
  quase(m.lucroContabil, m.rb + m.outras - m.despesasOperacionais - m.juros - m.depreciacao - m.tributosPJ - m.proLabore - m.folhaTerceiros - m.fgts - m.custoAdm, 0.01);
});

test('sem dupla contagem: carga = tributos PJ + INSS + IRPF devido + IRPFM; IRRF e retenções fora', () => {
  const e = globalThis.DadosExemplo.criar();
  const ctx = M.prepararContexto(e, P26);
  ['simples', 'presumido', 'real'].forEach((rg) => {
    const r = M.simular(ctx, { regime: rg, proLabore: Array(12).fill(8000) });
    const A = r.anual;
    quase(A.cargaTributaria, A.tributosPJ + A.inss + A.irpfDevido + A.irpfmAdicional, 0.01, rg);
    const somaPJ = A.das + A.issFora + A.irpj + A.csll + A.pis + A.cofins + A.cbs + A.iss + A.cpp;
    quase(A.tributosPJ, somaPJ, 0.05, rg);
    assert.equal(A.rb, 576200, 'mesma receita em todos os regimes');
  });
});

test('despesa de empregado CLT lançada em Despesas é excluída (evita dupla contagem com a folha)', () => {
  const e = estadoBase();
  e.despesas = [{ id: 'x', categoria: 'secretaria', nome: 'Secretária', valor: '2500', vinculo: 'clt', natureza: 'empresarial', documento: 'sim', mesInicial: 1, mesFinal: 12, recorrencia: 'mensal' }];
  const r = M.simular(M.prepararContexto(e, P26), { regime: 'simples', proLabore: Array(12).fill(3000) });
  assert.equal(r.anual.despesasOperacionais, 0);
  assert.equal(r.meses[0].despesasExcluidasClt, 2500);
});

test('despesas pessoais e parcela pessoal de despesa mista não entram na PJ', () => {
  const e = estadoBase();
  e.despesas = [
    { id: 'a', categoria: 'moradia', nome: 'Moradia', valor: '5000', natureza: 'empresarial', documento: 'sim' },
    { id: 'b', categoria: 'combustivel', nome: 'Combustível', valor: '1000', natureza: 'empresarial', usoPessoalPct: '40', documento: 'sim' },
    { id: 'c', categoria: 'internet', nome: 'Internet', valor: '300', natureza: 'mista', pctProfissional: '50', documento: 'sim' }
  ];
  const r = M.simular(M.prepararContexto(e, P26), { regime: 'simples', proLabore: Array(12).fill(3000) });
  assert.equal(r.meses[0].despesasOperacionais, 600 + 150);
  assert.equal(r.meses[0].despesasPessoais, 5000 + 400 + 150);
});

test('despesas: recorrência, parcelas, reajuste e corte planejado', () => {
  const d = { valor: '1000', mesInicial: 2, mesFinal: 12, recorrencia: 'mensal', totalParcelas: '10', parcelaAtual: '8' };
  assert.deepEqual([1, 2, 3, 4, 5].map((k) => M.valorDespesaMes(d, k)), [0, 1000, 1000, 1000, 0]);
  const t = { valor: '900', mesInicial: 1, recorrencia: 'trimestral' };
  assert.deepEqual([1, 2, 3, 4].map((k) => M.valorDespesaMes(t, k)), [900, 0, 0, 900]);
  const r = { valor: '1000', reajusteMes: 7, reajustePct: '10', corteMes: 11, corteValorNovo: '0' };
  assert.equal(M.valorDespesaMes(r, 6), 1000);
  quase(M.valorDespesaMes(r, 7), 1100, 1e-9);
  assert.equal(M.valorDespesaMes(r, 11), 0);
});

test('receita variável: DAS acompanha cada mês e cenários alteram só meses projetados', () => {
  const rec = [10000, 20000, 30000, 40000, 50000, 60000, 10000, 20000, 30000, 40000, 50000, 60000];
  const e = estadoBase({ receita: rec });
  e.analise.mesInicioPlanejamento = 7;
  e.folha.pagoMes = ['3000', '3000', '3000', '3000', '3000', '3000', '', '', '', '', '', ''];
  const base = M.simular(M.prepararContexto(e, P26), { regime: 'simples', proLabore: Array(12).fill(3000) });
  base.meses.forEach((m, i) => assert.equal(m.rb, rec[i]));
  const cons = M.simular(M.prepararContexto(e, P26, { cenarioReceita: 'conservador' }), { regime: 'simples', proLabore: Array(12).fill(3000) });
  for (let i = 0; i < 6; i++) assert.equal(cons.meses[i].rb, rec[i], 'realizado intacto');
  for (let i = 6; i < 12; i++) quase(cons.meses[i].rb, rec[i] * 0.85, 0.01, 'projetado −15%');
});

// ------------------------------------------------------------ Lucro Presumido e Real

test('Lucro Presumido: presunção 32%, adicional trimestral e PIS/Cofins cumulativos', () => {
  const e = estadoBase({ receita: 100000, historicoReceita: 100000, proLabore: 0 });
  e.folha.proLaboreAtual = '0';
  e.empresa.iss.aliquota = 2;
  const r = M.simular(M.prepararContexto(e, P26), { regime: 'presumido', proLabore: Array(12).fill(0) });
  const t1 = r.trimestres[0];
  assert.equal(t1.baseIrpj, 96000);
  assert.equal(t1.irpj, 14400 + 3600);
  assert.equal(t1.csll, 8640);
  assert.equal(r.meses[0].pis, 650);
  assert.equal(r.meses[0].cofins, 3000);
  assert.equal(r.meses[0].iss, 2000);
  quase(r.meses[0].irpj + r.meses[1].irpj + r.meses[2].irpj, 18000, 0.001);
});

test('Lucro Presumido: equiparação hospitalar só com requisitos confirmados; CPP de 20% sobre pró-labore', () => {
  const e = estadoBase({ receita: 0 });
  for (let i = 0; i < 12; i++) { e.receitas.meses[i].consultas = ''; e.receitas.meses[i].exames = '100000'; }
  let r = M.simular(M.prepararContexto(e, P26), { regime: 'presumido', proLabore: Array(12).fill(5000) });
  assert.equal(r.trimestres[0].baseIrpj, 96000, 'sem requisitos: 32%');
  e.empresa.requisitosHospitalares = 'sim';
  r = M.simular(M.prepararContexto(e, P26), { regime: 'presumido', proLabore: Array(12).fill(5000) });
  assert.equal(r.trimestres[0].baseIrpj, 24000, 'com requisitos: 8%');
  assert.equal(r.trimestres[0].baseCsll, 36000, 'CSLL: 12%');
  assert.equal(r.meses[0].cpp, 1000);
});

test('LC 224/2025: acréscimo de 10% na presunção sobre a receita acima de R$ 1,25 milhão por trimestre', () => {
  const e = estadoBase({ receita: 500000, historicoReceita: 300000 });
  const r = M.simular(M.prepararContexto(e, P26), { regime: 'presumido', proLabore: Array(12).fill(3000) });
  // T1: receita 1,5 mi; excedente 250 mil; base IRPJ = 1,5 mi × 32% + 250 mil × 32% × 10%
  assert.equal(r.trimestres[0].excedenteLc224, 250000);
  quase(r.trimestres[0].baseIrpj, 480000 + 8000, 0.01);
  // CSLL só a partir de abril/2026
  quase(r.trimestres[0].baseCsll, 480000, 0.01);
  quase(r.trimestres[1].baseCsll, 488000, 0.01);
});

test('Lucro Real: tributa o lucro e compensa prejuízo limitado a 30%', () => {
  const e = estadoBase({ receita: 50000 });
  e.empresa.prejuizoFiscalAnterior = '1000000';
  const r = M.simular(M.prepararContexto(e, P26), { regime: 'real', proLabore: Array(12).fill(3000) });
  const t = r.trimestres[0];
  quase(t.compensacao, (t.lair + t.adicoes) * 0.30, 0.01);
  quase(t.lucroReal, (t.lair + t.adicoes) * 0.70, 0.01);
});

// ------------------------------------------------------------ elegibilidade e alertas

test('elegibilidade: sócio pessoa jurídica ou no exterior impede o Simples; receita acima do limite também', () => {
  let e = estadoBase(); e.empresa.socioPessoaJuridica = 'sim';
  assert.equal(M.avaliarElegibilidade(M.prepararContexto(e, P26)).simples.status, 'inelegivel');
  e = estadoBase(); e.empresa.socios[0].residenteExterior = true;
  assert.equal(M.avaliarElegibilidade(M.prepararContexto(e, P26)).simples.status, 'inelegivel');
  e = estadoBase({ historicoReceita: 450000 });
  assert.equal(M.avaliarElegibilidade(M.prepararContexto(e, P26)).simples.status, 'inelegivel');
  e = estadoBase(); e.empresa.contabilidadeRegular = 'nao';
  assert.equal(M.avaliarElegibilidade(M.prepararContexto(e, P26)).real.status, 'estimativa_incompleta');
});

test('alertas: DARF sem código, fator "r" próximo de 28% e histórico incompleto', () => {
  const e = estadoBase({ historicoFolha: 8000, proLabore: 8000 });
  e.receitas.historico[5].receita = '';
  e.tributosPagos = [{ tributo: 'DARF', valor: '100', competencia: 1, codigoReceita: '' }];
  const ctx = M.prepararContexto(e, P26);
  const r = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(8000) });
  const cod = M.gerarAlertas(ctx, r).map((a) => a.codigo);
  assert.ok(cod.includes('darf_sem_codigo'));
  assert.ok(cod.includes('fator_r_proximo'));
  assert.ok(cod.includes('historico_incompleto'));
  const conc = M.conciliarPagamentos(ctx, r);
  assert.equal(conc.naoAtribuidos.length, 1, 'DARF sem código não é atribuído a tributo');
});

test('conciliação: DARF 2089 é atribuído ao IRPJ e divergências são apontadas', () => {
  const e = estadoBase();
  e.tributosPagos = [{ tributo: 'DARF', valor: '999', competencia: 1, codigoReceita: '2089' }, { tributo: 'DAS', valor: '1', competencia: 1 }];
  const ctx = M.prepararContexto(e, P26);
  const r = M.simular(ctx, { regime: 'simples', proLabore: Array(12).fill(3000) });
  const c = M.conciliarPagamentos(ctx, r);
  assert.ok(c.linhas.some((l) => l.tributo === 'IRPJ' && l.informado === 999));
  assert.ok(c.divergencias.some((l) => l.tributo === 'DAS'));
});

// ------------------------------------------------------------ otimização

test('otimizador: plano mensal ≤ melhor uniforme e igual à força bruta num espaço pequeno', () => {
  const e = estadoBase({ receita: 40000, historicoReceita: 40000, historicoFolha: 9000, proLabore: 9000, caixa: 300000 });
  e.analise.mesInicioPlanejamento = 10;
  e.folha.pagoMes = Array(12).fill('9000').map((v, i) => (i < 9 ? v : ''));
  e.analise.proLaboreMinimo = '6000'; e.analise.proLaboreMaximo = '16000'; e.analise.incrementoProLabore = 2500;
  e.analise.fimHorizonte = 'ignorar';
  const ctx = M.prepararContexto(e, P26);
  const G = O.grade(ctx, e);
  assert.deepEqual(G.valores, [6000, 8500, 11000, 13500, 16000]);
  const o = O.otimizarRegime(ctx, G, 'simples', { variacao: 'livre', fimHorizonte: 'ignorar' });
  let melhor = Infinity;
  for (const a of G.valores) for (const b of G.valores) for (const c of G.valores) {
    const plano = Array(12).fill(9000); plano[9] = a; plano[10] = b; plano[11] = c;
    const r = M.simular(ctx, { regime: 'simples', proLabore: plano });
    if (r.deficitCaixa <= o.deficitBase + 1) melhor = Math.min(melhor, r.anual.custoTotal);
  }
  assert.ok(o.melhorVariavel.custo <= o.melhorUniforme.custo + 0.005);
  quase(o.melhorVariavel.custo, melhor, 0.01, 'ótimo da força bruta');
});

test('otimizador: resultado recomendado vem da simulação completa e respeita o caixa; míope ≥ anual', () => {
  const e = globalThis.DadosExemplo.criar();
  const a = O.executar(e);
  const ctx = M.prepararContexto(e, P26);
  const r = M.simular(ctx, { regime: a.regimeRecomendado, proLabore: a.recomendado.proLabore });
  assert.equal(r.anual.custoTotal, a.recomendado.anual.custoTotal);
  assert.ok(a.recomendado.deficitCaixa <= a.regimes[a.regimeRecomendado].deficitBase + 1);
  assert.ok(a.miope.res.anual.custoTotal >= a.recomendado.anual.custoTotal - 0.005);
  assert.ok(a.recomendado.anual.custoTotal <= a.atual.anual.custoTotal + 0.005);
  // os pontos da curva são exatamente os resultados do motor
  const p = a.regimes.simples.curva[10];
  assert.equal(p.custo, M.simular(ctx, { regime: 'simples', proLabore: O.planoUniforme(ctx, p.P) }).anual.custoTotal);
  // fim do horizonte sustentado
  assert.ok(O.sustentaFimHorizonte(ctx, a.recomendado));
});

test('otimizador não recomenda regime inelegível', () => {
  const e = globalThis.DadosExemplo.criar();
  e.empresa.socioPessoaJuridica = 'sim';
  const a = O.executar(e, { rapido: true });
  assert.notEqual(a.regimeRecomendado, 'simples');
});

test('otimizador pode concluir que não há vantagem relevante', () => {
  const e = estadoBase({ receita: 30000, historicoReceita: 30000, historicoFolha: 1621, proLabore: 1621 });
  const a = O.executar(e, { rapido: true });
  assert.equal(a.semVantagemRelevante, true);
  assert.equal(a.planoAcao[0].titulo, 'Manter a estrutura atual');
});

test('exemplos: neurologia em Ijuí (Simples, Anexo V → III) e anestesia em Porto Alegre (Presumido, reduzir o pró-labore)', () => {
  assert.deepEqual(globalThis.DadosExemplo.lista.map((x) => x.id), ['clinica', 'neurologia', 'anestesia']);
  assert.equal(globalThis.DadosExemplo.criar('inexistente').meta.exemploId, 'clinica');
  const neuro = globalThis.DadosExemplo.criar('neurologia');
  assert.equal(neuro.empresa.municipio, 'Ijuí');
  const n = O.executar(neuro, { rapido: true });
  assert.equal(n.regimeRecomendado, 'simples');
  assert.ok(n.economia > 1200, 'fator "r": vale subir o pró-labore');
  assert.ok(n.recomendado.anual.custoTotal < n.atual.anual.custoTotal);
  const anest = globalThis.DadosExemplo.criar('anestesia');
  const a = O.executar(anest, { rapido: true });
  assert.equal(a.regimeRecomendado, 'presumido');
  assert.ok(a.economia > 1200, 'pró-labore de R$ 8.000 no Presumido custa mais que o mínimo');
  assert.ok(a.recomendado.anual.custoTotal < a.atual.anual.custoTotal);
});

// ------------------------------------------------------------ exportação

test('exportação CSV: separador ";", vírgula decimal e totais iguais aos do motor', () => {
  const a = O.executar(globalThis.DadosExemplo.criar(), { rapido: true });
  const csv = E.csv(a);
  assert.ok(csv.startsWith('﻿'));
  const linhaCarga = csv.split('\r\n').find((l) => l.startsWith('Carga tributária total;'));
  const campos = linhaCarga.split(';');
  assert.equal(campos[1], a.atual.anual.cargaTributaria.toFixed(2).replace('.', ','));
  assert.equal(campos[2], a.recomendado.anual.cargaTributaria.toFixed(2).replace('.', ','));
  assert.equal(E.numeroCsv(1234.5), '1234,50');
  assert.ok(csv.includes('CURVA DE OTIMIZAÇÃO'));
});

test('estado salvo é recarregado sem perda (mesclagem com campos novos)', () => {
  const e = globalThis.DadosExemplo.criar();
  const json = JSON.parse(JSON.stringify(e));
  delete json.analise.materialidade;
  const m = M.mesclarComPadrao(json);
  assert.equal(m.analise.materialidade, 1200);
  assert.deepEqual(m.despesas, e.despesas);
  assert.deepEqual(m.receitas.meses, e.receitas.meses);
  assert.equal(m.empresa.socios[0].nome, e.empresa.socios[0].nome);
});

test('recomendação nunca é mais cara que manter o plano atual', () => {
  const e = M.estadoVazio(2026);
  const a = O.executar(e, { rapido: true });
  assert.ok(a.economia >= 0);
  assert.ok(a.recomendado.anual.custoTotal <= a.atual.anual.custoTotal + 0.005);
});
