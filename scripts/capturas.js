#!/usr/bin/env node
/*
 * Gera imagens de documentação e o PDF do relatório a partir do arquivo único (requer Playwright).
 *   node scripts/build.js && node scripts/capturas.js
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const raiz = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  // marca de demonstração, sem logotipo (aparece o ícone padrão)
  await p.addInitScript(() => localStorage.setItem('simulador-tributario-medico-pj:marca:v1', JSON.stringify({
    nome: 'Clínica Demonstração', registro: 'CRM-SP 000000', endereco: 'Av. Exemplo, 1000 – São Paulo/SP',
    telefone: '(11) 0000-0000', email: 'contato@clinica.example', site: 'clinica.example', logo: ''
  })));
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
  // PDF do relatório, igual ao "Salvar como PDF" do Chrome (A4, margens e rodapé definidos no CSS)
  await p.click('.topo a[data-area="relatorio"]');
  await p.waitForSelector('#rel-grafico-tributos svg');
  await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await p.pdf({ path: path.join(raiz, 'docs', 'relatorio-exemplo.pdf'), preferCSSPageSize: true });
  await b.close();
  console.log('Capturas e relatorio-exemplo.pdf gerados em docs/');
})();
