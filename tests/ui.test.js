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

test('interface: arquivo único funciona offline, gráfico = motor, salvar/carregar, exportar, limpar', { skip: !chromium || !fs.existsSync(ARQ) ? 'playwright ou dist ausente' : false, timeout: 120000 }, async () => {
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const pagina = await contexto.newPage();
  const erros = [], rede = [];
  pagina.on('pageerror', (e) => erros.push(e.message));
  pagina.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  pagina.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) rede.push(u); });
  try {
    await pagina.goto(URL);
    await pagina.waitForFunction(() => window.SimuladorUI && window.SimuladorUI.analise(), null, { timeout: 30000 });

    // 1. Economia exibida = economia calculada pelo motor
    const kpi = await pagina.$eval('.kpi.heroi .valor', (el) => el.textContent);
    const econ = await pagina.evaluate(() => window.MotorTributario.brl(window.SimuladorUI.analise().economia));
    assert.equal(kpi, econ);

    // 2. Pontos do gráfico de otimização = simulação completa do motor
    await pagina.click('#aba-cenarios');
    await pagina.waitForSelector('#grafico-otim svg');
    const conferencia = await pagina.evaluate(() => {
      const M = window.MotorTributario, O = window.Otimizador;
      const pts = JSON.parse(document.getElementById('grafico-otim').getAttribute('data-pontos'));
      const est = window.SimuladorUI.estado();
      const P = window.SimuladorUI.parametros().anos[est.analise.ano];
      const ctx = M.prepararContexto(est, P);
      const idx = [0, Math.floor(pts.length / 3), Math.floor(pts.length / 2), pts.length - 1];
      return idx.map((i) => {
        const r = M.simular(ctx, { regime: 'simples', proLabore: O.planoUniforme(ctx, pts[i][0]) });
        return [pts[i][1], r.anual.custoTotal];
      });
    });
    conferencia.forEach(([grafico, motor]) => assert.equal(grafico, motor));
    // marcador do menor custo coincide com o mínimo da curva viável
    const marcador = await pagina.$eval('[data-ponto="minimo"]', (el) => +el.getAttribute('data-y'));
    const minimo = await pagina.evaluate(() => { const a = window.SimuladorUI.analise(); return a.regimes[a.regimeRecomendado].melhorUniforme.custo; });
    assert.equal(marcador, minimo);

    // 3. Relatório usa os mesmos números
    await pagina.click('#aba-relatorio');
    const textoRel = await pagina.$eval('.relatorio', (el) => el.innerText);
    const custoRec = await pagina.evaluate(() => window.MotorTributario.brl(window.SimuladorUI.analise().recomendado.anual.custoTotal));
    assert.ok(textoRel.includes(custoRec), 'custo total recomendado aparece no relatório');

    // 4. Edição marca a análise como desatualizada e atualiza derivados
    await pagina.click('#aba-receitas');
    const campo = '#f-receitas-meses-0-consultas';
    await pagina.fill(campo, '30.000,00');
    await pagina.dispatchEvent(campo, 'change');
    await pagina.waitForTimeout(400);
    assert.equal(await pagina.evaluate(() => window.SimuladorUI.estado().receitas.meses[0].consultas), '30.000,00');
    assert.ok((await pagina.textContent('#identificacao')).includes('desatualizada'));

    // 5. Salvar e recarregar mantém os dados
    await pagina.click('button[data-acao="salvar"]');
    await pagina.reload();
    await pagina.waitForFunction(() => window.SimuladorUI && window.SimuladorUI.estado());
    assert.equal(await pagina.evaluate(() => window.MotorTributario.num(window.SimuladorUI.estado().receitas.meses[0].consultas)), 30000);

    // 6. Exportar CSV (download real) com totais do motor
    await pagina.evaluate(() => window.SimuladorUI.executarAnalise());
    await pagina.waitForFunction(() => window.SimuladorUI.analise(), null, { timeout: 30000 });
    await pagina.waitForTimeout(300);
    const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.click('.topo button[data-acao="exportar-csv"]')]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    const linha = csv.split('\r\n').find((l) => l.startsWith('Carga tributária total;'));
    const esperado = await pagina.evaluate(() => window.SimuladorUI.analise().atual.anual.cargaTributaria.toFixed(2).replace('.', ','));
    assert.equal(linha.split(';')[1], esperado);

    // 7. Imprimir chama a impressão do navegador
    await pagina.evaluate(() => { window.__imprimiu = false; window.print = () => { window.__imprimiu = true; }; });
    await pagina.click('.topo button[data-acao="imprimir"]');
    await pagina.waitForTimeout(300);
    assert.equal(await pagina.evaluate(() => window.__imprimiu), true);

    // 8. Limpar exige confirmação
    await pagina.click('details.menu summary');
    await pagina.click('button[data-acao="limpar"]');
    await pagina.click('[data-modal="nao"]');
    assert.equal(await pagina.evaluate(() => window.SimuladorUI.estado().meta.exemplo), true);
    await pagina.click('details.menu summary');
    await pagina.click('button[data-acao="limpar"]');
    await pagina.click('[data-modal="sim"]');
    assert.equal(await pagina.evaluate(() => window.SimuladorUI.estado().despesas.length), 0);

    // 9. Celular: sem rolagem horizontal
    await pagina.setViewportSize({ width: 390, height: 840 });
    for (const aba of ['painel', 'receitas', 'despesas', 'folha', 'cenarios', 'parametros']) {
      await pagina.click('#aba-' + aba);
      await pagina.waitForTimeout(150);
      const larg = await pagina.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(larg <= 390, `aba ${aba} com largura ${larg}`);
    }

    assert.deepEqual(erros, [], 'sem erros de JavaScript');
    assert.deepEqual(rede, [], 'nenhuma requisição de rede');
  } finally {
    await navegador.close();
  }
});
