#!/usr/bin/env node
/*
 * Gera o arquivo único em dist/ a partir dos módulos de src/.
 *   node scripts/build.js
 * Saídas:
 *   dist/simulador-tributario-medico-pj.html   aplicação completa, offline
 *   dist/artefato/simulador-tributario-medico-pj.html   variante para publicação
 *     como página hospedada (sem doctype/head próprios, sem impressão nem
 *     download direto; exporta copiando para a área de transferência)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(raiz, 'src', f), 'utf8');

const MODULOS = [
  ['parametros-legais', 'parametros.js'],
  ['motor-tributario', 'motor.js'],
  ['otimizador', 'otimizador.js'],
  ['exportacao', 'exportacao.js'],
  ['dados-exemplo', 'exemplo.js'],
  ['graficos', 'graficos.js'],
  ['interface', 'ui.js']
];

function montar(artefato) {
  let html = src('template.html');
  const css = src('estilos.css') + `
details.menu { position: relative; }
details.menu > summary { list-style: none; }
details.menu > summary::-webkit-details-marker { display: none; }
details.menu .menu-lista { position: absolute; right: 0; top: calc(100% + 4px); z-index: 25; background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--raio-sm); box-shadow: var(--shadow); padding: 6px; display: grid; gap: 2px; min-width: 220px; }
details.menu .menu-lista .btn { justify-content: flex-start; width: 100%; }
`;
  html = html.replace('/*ESTILOS*/', () => css);
  let scripts = '';
  if (artefato) scripts += '<script>window.__MODO_ARTEFATO__ = true;</script>\n';
  for (const [id, arq] of MODULOS) {
    const codigo = src(arq).replace(/<\/script/gi, '<\\/script');
    scripts += `<script id="${id}">\n${codigo}\n</script>\n`;
  }
  html = html.replace('<!--SCRIPTS-->', () => scripts);
  if (!artefato) {
    const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    html = html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  } else {
    html = html.replace('<!--CSP-->\n', '')
      .replace(/<!DOCTYPE html>\n/i, '')
      .replace(/<html[^>]*>\n/i, '')
      .replace('<head>\n', '')
      .replace('<meta charset="utf-8">\n', '')
      .replace(/<meta name="viewport"[^>]*>\n/, '')
      .replace('</head>\n', '')
      .replace('<body>\n', '')
      .replace('</body>\n', '')
      .replace('</html>\n', '');
  }
  return html;
}

fs.mkdirSync(path.join(raiz, 'dist', 'artefato'), { recursive: true });
const saida = path.join(raiz, 'dist', 'simulador-tributario-medico-pj.html');
fs.writeFileSync(saida, montar(false));
fs.writeFileSync(path.join(raiz, 'dist', 'artefato', 'simulador-tributario-medico-pj.html'), montar(true));
const kb = (fs.statSync(saida).size / 1024).toFixed(0);
console.log(`Gerado ${path.relative(raiz, saida)} (${kb} KB)`);
