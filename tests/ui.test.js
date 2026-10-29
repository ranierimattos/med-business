/*
 * Teste de interface (Playwright + Chromium) sobre o arquivo único gerado.
 * Executar: node scripts/build.js && node --test tests/ui.test.js
 * Requer o pacote "playwright" com Chromium disponível.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }

const ARQ = path.join(__dirname, '..', 'dist', 'simulador-tributario-medico-pj.html');
const URL = 'file://' + ARQ;
const ARQ_HOSPEDADO = path.join(__dirname, '..', 'dist', 'artefato', 'simulador-tributario-medico-pj.html');
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function abrirMenu(pagina) {
  if (!(await pagina.$eval('#menu-arquivo', (d) => d.open))) await pagina.click('#menu-arquivo summary');
}
// espera uma análise diferente da guardada em window.__analiseAnterior e o fim do indicador de cálculo
async function esperarAnaliseNova(pagina) {
  await pagina.waitForFunction(() => { const a = window.SimuladorUI.analise(); return a && a !== window.__analiseAnterior && !document.querySelector('#identificacao').textContent.includes('Recalculando'); }, null, { timeout: 30000 });
}

test('interface: arquivo único offline, resultado = motor, dados com recálculo, arquivo, celular', { skip: !chromium || !fs.existsSync(ARQ) ? 'playwright ou dist ausente' : false, timeout: 180000 }, async () => {
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const pagina = await contexto.newPage();
  const erros = [], rede = [];
  pagina.on('pageerror', (e) => erros.push(e.message));
  pagina.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  pagina.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) rede.push(u); });
  try {
    await pagina.goto(URL);

    // 1. Primeira abertura: escolha do exemplo (três exemplos + início rápido); o exemplo padrão já fica carregado por trás
    await pagina.waitForSelector('#fundo-modal:not([hidden]) .opcao-exemplo');
    assert.deepEqual(await pagina.$$eval('#modal [data-modal]', (b) => b.map((x) => x.getAttribute('data-modal'))), ['ex:clinica', 'ex:neurologia', 'ex:anestesia', 'inicio', 'nao']);
    assert.equal(await pagina.textContent('#marca-nome'), 'Clínica Demonstração', 'o exemplo preenche a marca vazia');
    await pagina.click('[data-modal="inicio"]');
    await pagina.waitForSelector('#inicio:not([hidden]) #q-receita');
    await pagina.click('[data-exemplo="neurologia"]');
    assert.equal(await pagina.$eval('#inicio', (el) => el.hidden), true);
    await pagina.waitForFunction(() => window.SimuladorUI.estado().meta.exemploId === 'neurologia');
    assert.equal(await pagina.textContent('#marca-nome'), 'Clínica Sinapse Neurologia', 'marca de exemplo trocada pela do novo exemplo');
    assert.match(await pagina.textContent('#rodape-marca'), /Ijuí\/RS[\s\S]*\(55\) 3332-4180/);
    await abrirMenu(pagina);
    await pagina.click('#menu-arquivo button[data-acao="exemplo"]');
    await pagina.click('[data-modal="ex:clinica"]');
    await pagina.waitForFunction(() => window.SimuladorUI.estado().meta.exemploId === 'clinica');
    await pagina.waitForFunction(() => window.SimuladorUI && window.SimuladorUI.analise(), null, { timeout: 30000 });
    await pagina.waitForSelector('#economia-projetada');

    // 2. Economia exibida no herói = economia calculada pelo motor
    const heroi = await pagina.$eval('#economia-projetada', (el) => el.textContent);
    const econ = await pagina.evaluate(() => window.MotorTributario.brl(window.SimuladorUI.analise().economia));
    assert.equal(heroi, econ);

    // 2b. Sem avisos de "exemplo fictício"; crédito no rodapé; marca com logotipo no topo e no rodapé
    assert.equal(await pagina.evaluate(() => /fictíci/i.test(document.body.innerText)), false, 'sem avisos de exemplo fictício');
    assert.match(await pagina.textContent('#credito'), /^ML Soluções · Desenvolvido por Mattos-Lage Soluções Agênticas - Nexus 2/);
    assert.equal(await pagina.textContent('#marca-nome'), 'Clínica Demonstração');
    assert.ok(await pagina.$('#marca-logo svg'), 'sem logotipo, aparece o ícone padrão');
    await pagina.click('#marca-logo');
    await pagina.waitForSelector('#gaveta:not([hidden]) #marca-campo-nome');
    assert.equal(await pagina.inputValue('#marca-campo-site'), 'www.clinicademonstracao.med.br');
    await pagina.click('[data-acao="marca-soltar-exemplo"]');
    assert.equal(await pagina.textContent('#marca-nome'), 'Simulador Tributário Médico PJ', 'sem nome, o topo mostra o produto');
    assert.equal(await pagina.inputValue('#marca-campo-site'), '');
    await pagina.fill('#marca-campo-nome', 'Clínica Santa Luzia');
    await pagina.fill('#marca-campo-telefone', '(11) 3000-0000');
    await pagina.setInputFiles('#arquivo-logo', { name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await pagina.waitForSelector('#marca-logo.com-logo img');
    await pagina.keyboard.press('Escape');
    assert.equal(await pagina.textContent('#marca-nome'), 'Clínica Santa Luzia');
    assert.match(await pagina.textContent('#rodape-marca'), /Clínica Santa Luzia[\s\S]*\(11\) 3000-0000/);

    // 3. Pontos dos gráficos de custo (Resumo e Cenários) = simulação completa do motor
    async function conferirCurva(sel) {
      return pagina.evaluate((s) => {
        const M = window.MotorTributario, O = window.Otimizador;
        const pts = JSON.parse(document.querySelector(s).getAttribute('data-pontos'));
        const est = window.SimuladorUI.estado();
        const P = window.SimuladorUI.parametros().anos[est.analise.ano];
        const ctx = M.prepararContexto(est, P);
        return [0, Math.floor(pts.length / 3), Math.floor(pts.length / 2), pts.length - 1].map((i) => [pts[i][1], M.simular(ctx, { regime: 'simples', proLabore: O.planoUniforme(ctx, pts[i][0]) }).anual.custoTotal]);
      }, sel);
    }
    (await conferirCurva('#grafico-custo')).forEach(([g, m]) => assert.equal(g, m));
    const pontoRec = await pagina.$eval('#grafico-custo [data-ponto="recomendado"]', (el) => +el.getAttribute('data-y'));
    assert.equal(pontoRec, await pagina.evaluate(() => window.SimuladorUI.analise().recomendado.anual.custoTotal));
    await pagina.click('[data-sub="cenarios"]');
    await pagina.waitForSelector('#grafico-otim svg');
    (await conferirCurva('#grafico-otim')).forEach(([g, m]) => assert.equal(g, m));
    const marcador = await pagina.$eval('#grafico-otim [data-ponto="minimo"]', (el) => +el.getAttribute('data-y'));
    const minimo = await pagina.evaluate(() => { const a = window.SimuladorUI.analise(); return a.regimes[a.regimeRecomendado].melhorUniforme.custo; });
    assert.equal(marcador, minimo);

    // 4. Sub-seções do resultado
    await pagina.click('[data-sub="sensibilidade"]');
    await pagina.waitForSelector('#grafico-tornado svg');
    await pagina.click('[data-sub="memoria"]');
    const memoria = await pagina.$eval('.memoria-cartao .destaque', (el) => el.textContent);
    assert.match(memoria, /r = .*→ Anexo/);
    assert.equal(await pagina.evaluate(() => location.hash), '#resultado/memoria');

    // 5. Relatório (botão "Gerar relatório") usa os mesmos números
    await pagina.click('.topo a[data-area="relatorio"]');
    await pagina.waitForSelector('.relatorio');
    const textoRel = await pagina.$eval('.relatorio', (el) => el.innerText);
    const custoRec = await pagina.evaluate(() => window.MotorTributario.brl(window.SimuladorUI.analise().recomendado.anual.custoTotal));
    assert.ok(textoRel.includes(custoRec), 'custo total recomendado aparece no relatório');
    assert.ok(textoRel.includes('Clínica Santa Luzia') && textoRel.includes('(11) 3000-0000'), 'marca e contato no cabeçalho do relatório');
    assert.ok(await pagina.$('.rel-cabecalho .rel-logo img'), 'logotipo no cabeçalho do relatório');
    assert.match(textoRel, /ML Soluções · Desenvolvido por Mattos-Lage/);

    // 5b. Relatório em folhas A4: na impressão só ele aparece, e o resumo cabe na 1ª página
    assert.equal(await pagina.$$eval('.relatorio .folha', (f) => f.length), 3);
    await pagina.emulateMedia({ media: 'print' });
    const impresso = await pagina.evaluate(() => [getComputedStyle(document.querySelector('#area-relatorio')).display, getComputedStyle(document.querySelector('.topo')).display, document.querySelector('.rel-grafico .legenda .chave').getBoundingClientRect().width]);
    assert.deepEqual(impresso.slice(0, 2), ['block', 'none']);
    assert.ok(impresso[2] > 0, 'legenda do gráfico visível na impressão');
    await pagina.emulateMedia({ media: null });
    const pdf = await pagina.pdf({ preferCSSPageSize: true });
    const paginasPdf = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.equal(paginasPdf, 4, 'exemplo: resumo (1 página), plano mês a mês (1), cenários e plano de ação (2)');

    // 6. Alerta leva à etapa de origem nos Dados
    await pagina.click('.topo a[data-area="resultado"]');
    await pagina.click('[data-sub="resumo"]');

    // 6b. Ctrl+P fora do relatório também imprime o relatório; o título vira o nome sugerido do PDF
    const tituloPagina = await pagina.title();
    await pagina.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    assert.ok(await pagina.$('#area-relatorio .relatorio .folha'));
    assert.match(await pagina.title(), /^Relatório tributário \d{4} - /);
    await pagina.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.equal(await pagina.title(), tituloPagina);
    assert.equal(await pagina.$('#area-relatorio .relatorio'), null);

    await pagina.click('[data-alerta="darf_sem_codigo"]');
    assert.equal(await pagina.evaluate(() => location.hash), '#dados/5');
    assert.equal(await pagina.textContent('#etapa-titulo'), '5. Pagamentos');

    // 7. Edição em Dados: estado atualizado, resultado marcado como desatualizado, recálculo automático e efeito no painel
    await pagina.click('.etapa-botao[data-etapa="2"]');
    const campo = '#f-receitas-meses-0-consultas';
    await pagina.evaluate(() => { window.__analiseAnterior = window.SimuladorUI.analise(); });
    const custoAntes = await pagina.evaluate(() => window.SimuladorUI.analise().atual.anual.custoTotal);
    await pagina.fill(campo, '30.000,00');
    await pagina.dispatchEvent(campo, 'change');
    await pagina.waitForTimeout(400);
    assert.equal(await pagina.evaluate(() => window.SimuladorUI.estado().receitas.meses[0].consultas), '30.000,00');
    assert.ok((await pagina.textContent('#identificacao')).includes('desatualizado'));
    await esperarAnaliseNova(pagina);
    const custoDepois = await pagina.evaluate(() => window.SimuladorUI.analise().atual.anual.custoTotal);
    assert.ok(custoDepois > custoAntes, 'receita maior aumenta o custo do plano atual');
    await pagina.waitForSelector('.efeito-ultima');
    const efeito = await pagina.$eval('.efeito-ultima', (el) => el.innerText);
    const delta = await pagina.evaluate(([a, d]) => { const v = d - a; return (v > 0 ? '+' : '') + window.MotorTributario.brl(v).replace(/,\d{2}$/, ''); }, [custoAntes, custoDepois]);
    assert.ok(efeito.includes(delta), 'efeito da última alteração = diferença do motor (' + delta + ')');
    assert.equal(await pagina.$eval('[data-rb="1"]', (el) => el.textContent), 'R$ 50.000');

    // 8. Modo Essencial × Completo
    const colunasE = await pagina.$$eval('.tabela-receitas thead th', (t) => t.length);
    await pagina.click('[data-modo="completo"]');
    const colunasC = await pagina.$$eval('.tabela-receitas thead th', (t) => t.length);
    assert.ok(colunasC > colunasE, 'modo Completo mostra mais colunas');
    await pagina.click('[data-modo="essencial"]');

    // 9. Salvar e recarregar mantém os dados (e não reabre o início rápido)
    await abrirMenu(pagina);
    await pagina.click('#menu-arquivo button[data-acao="salvar"]');
    await pagina.reload();
    await pagina.waitForFunction(() => window.SimuladorUI && window.SimuladorUI.estado());
    assert.equal(await pagina.evaluate(() => window.MotorTributario.num(window.SimuladorUI.estado().receitas.meses[0].consultas)), 30000);
    assert.equal(await pagina.$eval('#inicio', (el) => el.hidden), true);
    assert.equal(await pagina.textContent('#marca-nome'), 'Clínica Santa Luzia', 'marca salva neste navegador');

    // 10. Exportar CSV (download real) com totais do motor
    await pagina.evaluate(() => window.SimuladorUI.executarAnalise());
    await pagina.waitForFunction(() => window.SimuladorUI.analise() && !document.querySelector('#identificacao').textContent.includes('Recalculando'), null, { timeout: 30000 });
    await abrirMenu(pagina);
    const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.click('#menu-arquivo button[data-acao="exportar-csv"]')]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    const linha = csv.split('\r\n').find((l) => l.startsWith('Carga tributária total;'));
    const esperado = await pagina.evaluate(() => window.SimuladorUI.analise().atual.anual.cargaTributaria.toFixed(2).replace('.', ','));
    assert.equal(linha.split(';')[1], esperado);

    // 11. Imprimir chama a impressão do navegador
    await pagina.evaluate(() => { window.__imprimiu = false; window.print = () => { window.__imprimiu = true; }; });
    await abrirMenu(pagina);
    await pagina.click('#menu-arquivo button[data-acao="imprimir"]');
    await pagina.waitForTimeout(300);
    assert.equal(await pagina.evaluate(() => window.__imprimiu), true);

    // 12. Tabelas legais abrem em painel lateral e fecham com Esc
    await pagina.click('.topo .btn-icone[data-acao="tabelas"]');
    await pagina.waitForSelector('#gaveta:not([hidden]) #json-param');
    await pagina.keyboard.press('Escape');
    assert.equal(await pagina.$eval('#gaveta', (el) => el.hidden), true);

    // 13. Limpar exige confirmação
    await abrirMenu(pagina);
    await pagina.click('#menu-arquivo button[data-acao="limpar"]');
    await pagina.click('[data-modal="nao"]');
    assert.equal(await pagina.evaluate(() => window.SimuladorUI.estado().meta.exemplo), true);
    await abrirMenu(pagina);
    await pagina.click('#menu-arquivo button[data-acao="limpar"]');
    await pagina.click('[data-modal="sim"]');
    assert.equal(await pagina.evaluate(() => window.SimuladorUI.estado().despesas.length), 0);
    assert.equal(await pagina.textContent('#marca-nome'), 'Clínica Santa Luzia', 'limpar dados mantém a marca');

    // 13b. Menu Arquivo: escolher outro exemplo (neurologista em Ijuí)
    await abrirMenu(pagina);
    await pagina.click('#menu-arquivo button[data-acao="exemplo"]');
    assert.equal(await pagina.$$eval('.opcao-exemplo', (b) => b.length), 3);
    await pagina.evaluate(() => { window.__analiseAnterior = window.SimuladorUI.analise(); });
    await pagina.click('[data-modal="ex:neurologia"]');
    await esperarAnaliseNova(pagina);
    assert.equal(await pagina.evaluate(() => window.SimuladorUI.estado().empresa.nome), 'Clínica Sinapse Neurologia Ltda.');
    assert.equal(await pagina.textContent('#marca-nome'), 'Clínica Santa Luzia', 'o exemplo não substitui a marca do usuário');
    assert.equal(await pagina.evaluate(() => location.hash), '#resultado');

    // 14. Início rápido: 4 respostas geram um cadastro e uma análise
    await abrirMenu(pagina);
    await pagina.click('#menu-arquivo button[data-acao="inicio-rapido"]');
    await pagina.fill('#q-receita', '40.000,00');
    await pagina.fill('#q-pl', '2.000,00');
    await pagina.fill('#q-folha', '');
    await pagina.selectOption('#q-regime', 'simples');
    await pagina.waitForSelector('.previa-valor');
    await pagina.evaluate(() => { window.__analiseAnterior = window.SimuladorUI.analise(); });
    await pagina.click('[data-acao="inicio-ver"]');
    await esperarAnaliseNova(pagina);
    const est = await pagina.evaluate(() => { const e = window.SimuladorUI.estado(); return [e.receitas.meses[5].consultas, e.folha.proLaboreAtual, e.folha.pessoas.length]; });
    assert.deepEqual(est, ['40000', '2000', 0]);
    assert.equal(await pagina.evaluate(() => location.hash), '#resultado');

    // 15. Celular: sem rolagem horizontal em nenhuma tela
    await pagina.setViewportSize({ width: 390, height: 840 });
    async function largura(rotulo) {
      await pagina.waitForTimeout(150);
      const l = await pagina.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(l <= 390, rotulo + ' com largura ' + l);
    }
    await pagina.click('.nav-inferior a[data-area="resultado"]');
    for (const s of ['resumo', 'cenarios', 'sensibilidade', 'memoria']) { await pagina.click('[data-sub="' + s + '"]'); await largura('resultado/' + s); }
    await pagina.click('.nav-inferior a[data-area="dados"]');
    for (const m of ['essencial', 'completo']) {
      await pagina.click('[data-modo="' + m + '"]');
      for (let e = 1; e <= 5; e++) { await pagina.click('.etapa-botao[data-etapa="' + e + '"]'); await largura('dados/' + e + ' (' + m + ')'); }
    }
    await pagina.click('.nav-inferior a[data-area="relatorio"]');
    await largura('relatório');
    await abrirMenu(pagina);
    await pagina.click('#menu-arquivo button[data-acao="tabelas"]');
    await largura('tabelas legais');
    await pagina.keyboard.press('Escape');
    await abrirMenu(pagina);
    await pagina.click('#menu-arquivo button[data-acao="marca"]');
    await pagina.waitForSelector('#gaveta:not([hidden]) #marca-campo-nome');
    await largura('marca e contato');

    // 16. Variante hospedada: a impressão é bloqueada pelo quadro, então nenhuma opção de imprimir aparece
    await pagina.setViewportSize({ width: 1280, height: 900 });
    await pagina.goto('file://' + ARQ_HOSPEDADO + '#relatorio');
    await pagina.waitForSelector('.relatorio');
    await abrirMenu(pagina);
    assert.equal(await pagina.isVisible('#menu-arquivo [data-acao="imprimir"]'), false, 'menu sem "Imprimir relatório"');
    assert.equal(await pagina.$('#area-relatorio [data-acao="imprimir"]'), null, 'relatório sem botão de imprimir');

    assert.deepEqual(erros, [], 'sem erros de JavaScript');
    assert.deepEqual(rede, [], 'nenhuma requisição de rede');
  } finally {
    await navegador.close();
  }
});
