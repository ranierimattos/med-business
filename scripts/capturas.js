#!/usr/bin/env node
/*
 * Gera imagens de documentação a partir do arquivo único (requer Playwright).
 *   node scripts/build.js && node scripts/capturas.js
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const raiz = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(raiz, 'dist', 'simulador-tributario-medico-pj.html'));
  await p.click('[data-acao="inicio-exemplo"]');
  await p.waitForFunction(() => window.SimuladorUI && window.SimuladorUI.analise(), null, { timeout: 30000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(raiz, 'docs', 'painel-geral.png'), clip: { x: 0, y: 0, width: 1280, height: 900 } });
  await p.click('[data-sub="cenarios"]');
  await p.waitForSelector('#grafico-otim svg');
  const bloco = await p.$('#grafico-otim');
  const sec = await bloco.evaluateHandle((el) => el.closest('section'));
  await sec.asElement().screenshot({ path: path.join(raiz, 'docs', 'grafico-otimizacao.png') });
  await p.click('.topo a[data-area="dados"]');
  await p.waitForSelector('.etapa-botao');
  await p.click('.etapa-botao[data-etapa="2"]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(raiz, 'docs', 'dados-etapas.png'), clip: { x: 0, y: 0, width: 1280, height: 900 } });
  await b.close();
  console.log('Capturas geradas em docs/');
})();
