#!/usr/bin/env node
/*
 * Gera docs/RELATORIO-EXEMPLO.md e docs/exemplo-resultados.csv a partir dos
 * dados fictícios de demonstração, usando o mesmo motor da aplicação.
 *   node scripts/relatorio-exemplo.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
for (const f of ['parametros', 'motor', 'otimizador', 'exemplo', 'exportacao']) require(path.join(raiz, 'src', f + '.js'));
const M = globalThis.MotorTributario, O = globalThis.Otimizador, X = globalThis.Exportacao;
const brl = M.brl, pct = (v, c) => M.pct(v, c);
const pctR = (v) => (Math.floor(v * 10000 + 1e-7) / 100).toFixed(2).replace('.', ',') + '%';

const e = globalThis.DadosExemplo.criar();
const a = O.executar(e);
const at = a.atual.anual, rc = a.recomendado.anual;
const L = [];
const t = (cab, linhas) => { L.push('| ' + cab.join(' | ') + ' |'); L.push('|' + cab.map((c, i) => (i === 0 ? '---' : '---:')).join('|') + '|'); linhas.forEach((l) => L.push('| ' + l.join(' | ') + ' |')); L.push(''); };

L.push('# Relatório comparativo — exemplo fictício');
L.push('');
L.push('> **Dados fictícios.** A empresa "Clínica Demonstração Ltda.", a médica e todos os valores foram inventados para demonstrar o simulador. Gerado por `scripts/relatorio-exemplo.js` com o mesmo motor da aplicação (parâmetros legais de ' + a.ano + ', ' + ({ conferido_secundaria: 'conferidos em fontes secundárias', projetado: 'projetados', transcrito: 'transcritos' }[a.parametros.status] || a.parametros.status) + '). Economia projetada, não garantida; validar com contador.');
L.push('');
L.push('## Dados do exemplo');
L.push('');
L.push('- Sociedade limitada aberta em mar/2023, uma sócia (100%), Simples Nacional, atividade médica (fator "r"), ISS de 5% no DAS.');
L.push('- Receita 2026 (consultas, plantões e procedimentos): ' + brl(at.rb) + ', com sazonalidade (menor em jan, jul e dez). Receita 2025: ' + brl(M.soma(a.ctx.rbT.slice(1, 13))) + '.');
L.push('- Pró-labore atual de R$ 3.000/mês; uma secretária CLT (R$ 2.300); folha de 2025 ≈ 12% da receita (Anexo V).');
L.push('- Despesas operacionais de ' + brl(at.despesasOperacionais) + ', compra de ultrassom de R$ 30.000 em fevereiro, empréstimo até agosto; caixa inicial R$ 35.000, reserva mínima R$ 10.000.');
L.push('- Pessoa física: 2 dependentes, despesas médicas de R$ 18.000 e instrução de R$ 14.000 no ano; lucros acumulados de R$ 80.000 (R$ 60.000 apurados até 2025 com distribuição aprovada).');
L.push('');
L.push('## A. Diagnóstico atual');
L.push('');
L.push('- Regime: Simples Nacional, ' + at.mesesAnexoV + ' meses no Anexo V (fator "r" entre ' + pctR(Math.min(...a.atual.meses.map((m) => m.fatorR))) + ' e ' + pctR(Math.max(...a.atual.meses.map((m) => m.fatorR))) + ').');
L.push('- DAS ' + brl(at.das) + ' · INSS ' + brl(at.inss) + ' · IRPF devido ' + brl(at.irpfDevido) + ' · carga total ' + brl(at.cargaTributaria) + ' (' + pct(at.cargaEfetiva, 1) + ' da receita).');
L.push('- Renda líquida da médica: ' + brl(at.rendaLiquidaPF) + ' no ano. Qualidade dos dados: ' + a.qualidade.nota + '/100.');
L.push('');
L.push('## B. Comparação de cenários (valores anuais, mesmas premissas)');
L.push('');
t(['Cenário', 'Pró-labore médio', 'DAS', 'INSS', 'IRPF + IRPFM', 'Outros tributos', 'Custo adm.', 'Custo total', 'Renda líquida', 'Dif. mensal', 'Dif. anual', 'Meses Anexo III'],
  a.cenarios.map((c) => ['**' + c.nome + '**<br>' + c.regra, brl(c.proLaboreMedio), brl(c.das), brl(c.inss), brl(c.irpf + c.irpfm), brl(c.outros), brl(c.custoAdm), '**' + brl(c.custoTotal) + '**', brl(c.rendaLiquida), c.difMensal === undefined ? '—' : brl(c.difMensal), c.difAnual === undefined ? '—' : brl(c.difAnual), c.regime === 'simples' ? c.mesesIII + '/12' : '—']));
L.push('## C. Plano de pró-labore recomendado');
L.push('');
t(['Mês', 'Pró-labore atual', 'Pró-labore sugerido', 'Fator "r"', 'Anexo', 'DAS', 'INSS', 'Caixa final'],
  a.recomendado.meses.map((m, i) => [m.rotulo, brl(a.atual.proLabore[i]), brl(m.proLabore), pctR(m.fatorR), m.anexo || '—', brl(m.das), brl(m.inss), brl(m.caixaFinal)]));
L.push('Plano ' + (a.tipoPlano === 'variavel' ? 'mensal variável' : a.tipoPlano) + ': pró-labore mais alto de janeiro a junho eleva a folha dos últimos 12 meses e leva junho a dezembro ao Anexo III; depois o pró-labore volta ao mínimo sem perder o anexo, porque a janela de 12 meses ainda contém os meses altos. A restrição de fim de horizonte garante fator "r" ≥ 28% também em janeiro do ano seguinte, e a restrição de caixa impede pagar pró-labore que a empresa não tem.');
L.push('');
const q = a.equilibrio;
L.push('## D. Pontos de equilíbrio');
L.push('');
L.push('- **Aumento uniforme de pró-labore:** ' + (q.aumentoProLabore.para ? 'a partir de ' + brl(q.aumentoProLabore.para) : 'nenhum valor uniforme acima do atual reduz o custo no ano') + '.');
if (q.fatorR) L.push('- **Custo de atingir o fator "r" com pró-labore uniforme:** ' + brl(q.fatorR.proLaboreAlvo) + '/mês leva ' + q.fatorR.mesesIII + ' mês ao Anexo III; DAS cai ' + brl(q.fatorR.economiaDas) + ', INSS + IRPF sobem ' + brl(q.fatorR.custoAdicionalPessoal) + ' (saldo ' + brl(q.fatorR.saldo) + ').');
if (q.fatorRPlanoRecomendado) L.push('- **Economia de DAS × custos adicionais no plano recomendado:** DAS ' + brl(q.fatorRPlanoRecomendado.economiaDas) + ' menor; INSS + IRPF ' + brl(q.fatorRPlanoRecomendado.custoAdicionalPessoal) + ' maiores; saldo ' + brl(q.fatorRPlanoRecomendado.saldo) + '.');
L.push('- **Otimizar mês a mês × ano inteiro:** míope ' + brl(q.miope.custo) + ' contra ' + brl(q.miope.otimo) + ' (diferença ' + brl(q.miope.diferenca) + ').');
q.regimes.forEach((r) => L.push('- **' + O.nomeRegime(r.regime) + ':** ' + (r.faturamentoAnual ? 'passa a valer a pena perto de ' + brl(r.faturamentoAnual) + '/ano.' : 'sem cruzamento entre ' + brl(r.faixaTestada[0]) + ' e ' + brl(r.faixaTestada[1]) + ' de receita anual.')));
L.push('');
L.push('## E. Sensibilidade (plano recomendado mantido fixo)');
L.push('');
t(['Variável', 'Variação 1', 'Δ custo', 'Variação 2', 'Δ custo'], a.sensibilidade.itens.map((i) => [i.nome, i.rotuloBaixo, brl(i.baixo), i.rotuloAlto, brl(i.alto)]));
const s = a.anoSeguinte;
L.push('## F. Efeito no ano seguinte (' + s.ano + ', parâmetros ' + s.parametrosStatus + ')');
L.push('');
t(['Partindo de', 'Custo com pró-labore de dez mantido', 'Meses III', 'Melhor uniforme', 'Custo', 'Meses III'], [['Plano atual', s.atual], ['Plano recomendado', s.recomendado]].map(([n, x]) => [n, brl(x.custo), String(x.mesesIII), brl(x.otimoUniforme.proLabore), brl(x.otimoUniforme.custo), String(x.otimoUniforme.mesesIII)]));
if (s.recomendado.otimoUniforme.mesesIII < 6) L.push('Leitura: a estratégia concentrada no início do ano cria um benefício que se esgota quando os meses altos saem da janela de 12 meses. Para manter o Anexo III de forma permanente, a folha anual precisa ficar perto de 28% da receita; com esta receita, isso custa mais em INSS e IRPF do que economiza em DAS, e o melhor pró-labore uniforme em ' + s.ano + ' deixa só ' + s.recomendado.otimoUniforme.mesesIII + ' mês(es) no Anexo III. A análise deve ser refeita a cada ano.');
else L.push('Leitura: a folha formada no ano analisado sustenta o Anexo III em ' + s.recomendado.otimoUniforme.mesesIII + ' meses de ' + s.ano + ' com o melhor pró-labore uniforme.');
L.push('');
L.push('## G. Recomendação final');
L.push('');
L.push('**Melhor alternativa encontrada:** permanecer no ' + O.nomeRegime(a.regimeRecomendado) + ' e adotar o plano mensal de pró-labore da seção C. Custo total projetado de ' + brl(rc.custoTotal) + ' contra ' + brl(at.custoTotal) + ' no plano atual: **economia projetada de ' + brl(a.economia) + ' em ' + a.ano + '**, com renda líquida pessoal ' + brl(rc.rendaLiquidaPF - at.rendaLiquidaPF) + ' maior.');
L.push('');
L.push(a.otimalidade.join(' '));
L.push('');
L.push('**Pontos que exigem validação profissional antes de agir:**');
L.push('');
['Pró-labore variável deliberado em ata, efetivamente pago todo mês e transmitido no eSocial/DCTFWeb; o fator "r" só considera valores pagos.',
  'Composição da folha do fator "r" (pró-labore, salários, 13º, férias, FGTS) e a regra de caixa adotada pelo contador.',
  'Fator "r" entre 28% e 31% em vários meses: pequenas quedas de folha ou aumentos de receita devolvem o mês ao Anexo V.',
  'Conciliação: o DAS informado de janeiro diverge do calculado e há um DARF sem código de receita.',
  'Lucros apurados até 2025 tratados como isentos de retenção e fora do IRPFM (regra de transição da Lei 15.270/2025, sujeita a interpretação).',
  'Parâmetros legais conferidos apenas em fontes secundárias; conferir no Portal do Simples Nacional e no site da Receita Federal.'].forEach((x) => L.push('- ' + x));
L.push('');
L.push('**Alertas emitidos pelo simulador:** ' + a.alertas.map((x) => x.titulo).join('; ') + '.');
L.push('');
fs.mkdirSync(path.join(raiz, 'docs'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'docs', 'RELATORIO-EXEMPLO.md'), L.join('\n'));
fs.writeFileSync(path.join(raiz, 'docs', 'exemplo-resultados.csv'), X.csv(a));
console.log('Gerados docs/RELATORIO-EXEMPLO.md e docs/exemplo-resultados.csv (economia ' + brl(a.economia) + ')');
