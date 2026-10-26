/*
 * GRÁFICOS EM SVG (sem bibliotecas externas)
 * Recebem dados já calculados pelo motor; não fazem cálculo tributário.
 * Cada gráfico tem um único eixo Y. Medidas de escalas diferentes viram
 * gráficos separados (pequenos múltiplos).
 */
(function (raiz) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function f1(v) { return Math.round(v * 10) / 10; }

  function ticksBonitos(min, max, n) {
    if (!isFinite(min) || !isFinite(max)) return [0, 1];
    if (max === min) { max = min + 1; }
    var bruto = (max - min) / Math.max(1, n);
    var mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var passos = [1, 2, 2.5, 5, 10];
    var passo = mag;
    for (var i = 0; i < passos.length; i++) { if (passos[i] * mag >= bruto) { passo = passos[i] * mag; break; } }
    var ini = Math.floor(min / passo) * passo, fim = Math.ceil(max / passo) * passo;
    var t = [];
    for (var v = ini; v <= fim + passo / 2; v += passo) t.push(Math.round(v * 1e6) / 1e6);
    return t;
  }

  function compacto(v) {
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' mi';
    if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.', ',') + ' mil';
    return s + Math.round(a);
  }

  function caminho(pts, sx, sy) {
    var d = '';
    pts.forEach(function (p, i) {
      if (p.y === null || p.y === undefined || !isFinite(p.y)) return;
      d += (d === '' ? 'M' : 'L') + f1(sx(p.x)) + ' ' + f1(sy(p.y));
    });
    return d;
  }

  function dicaEl(cont) {
    var d = cont.querySelector('.dica');
    if (!d) { d = document.createElement('div'); d.className = 'dica'; d.hidden = true; cont.appendChild(d); }
    return d;
  }

  function posicionarDica(cont, dica, px, py) {
    var w = cont.clientWidth;
    dica.hidden = false;
    var dw = dica.offsetWidth, dh = dica.offsetHeight;
    var left = px + 14;
    if (left + dw > w) left = Math.max(0, px - dw - 14);
    var top = Math.max(0, py - dh / 2);
    dica.style.left = left + 'px';
    dica.style.top = top + 'px';
  }

  /*
   * Gráfico de linhas com eixo X numérico.
   * cfg: { largura, altura, x:{min,max,formato,rotulo,ticks}, y:{formato,rotulo,min,max},
   *        series:[{id,nome,cor,pontos,tracejado,visivel,largura}], areas:[{cor,superior,inferior,opacidade}],
   *        referenciasH:[{y,rotulo}], marcadoresV:[{x,rotulo,cor}], pontos:[{x,y,rotulo,cor}], xs:[...], dica:fn(i) }
   */
  function larguraDe(cont, padrao) {
    var w = cont && cont.clientWidth ? Math.round(cont.clientWidth) : 0;
    return w >= 260 ? w : padrao;
  }

  function linhas(cont, cfg) {
    var W = cfg.largura || larguraDe(cont, 760), H = cfg.altura || 320;
    var m = Object.assign({ t: 18, r: 28, b: 46, l: 70 }, cfg.margem || {});
    var series = (cfg.series || []).filter(function (s) { return s.visivel !== false; });
    var areas = (cfg.areas || []).filter(function (a) { return a.visivel !== false; });
    var xs = [], ys = [];
    series.forEach(function (s) { s.pontos.forEach(function (p) { if (isFinite(p.y)) { xs.push(p.x); ys.push(p.y); } }); });
    areas.forEach(function (a) { a.superior.concat(a.inferior).forEach(function (p) { if (isFinite(p.y)) ys.push(p.y); }); });
    (cfg.referenciasH || []).forEach(function (r) { ys.push(r.y); });
    (cfg.pontos || []).forEach(function (p) { if (isFinite(p.y)) ys.push(p.y); });
    var xmin = cfg.x.min !== undefined ? cfg.x.min : Math.min.apply(null, xs);
    var xmax = cfg.x.max !== undefined ? cfg.x.max : Math.max.apply(null, xs);
    var ymin = cfg.y.min !== undefined ? cfg.y.min : Math.min.apply(null, ys);
    var ymax = cfg.y.max !== undefined ? cfg.y.max : Math.max.apply(null, ys);
    if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
    var pad = (ymax - ymin) * 0.06 || Math.abs(ymax) * 0.1 || 1;
    var yt = ticksBonitos(cfg.y.min !== undefined ? ymin : ymin - pad, ymax + pad, cfg.y.nTicks || 5);
    ymin = yt[0]; ymax = yt[yt.length - 1];
    if (xmax === xmin) xmax = xmin + 1;
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var rotulosNoGrafico = W >= 560;
    function sx(x) { return m.l + (x - xmin) / (xmax - xmin) * pw; }
    function sy(y) { return m.t + ph - (y - ymin) / (ymax - ymin) * ph; }
    var fy = cfg.y.formato || compacto, fx = cfg.x.formato || compacto;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(cfg.titulo || '') + '" xmlns="http://www.w3.org/2000/svg">';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--chart-surface)" rx="6"/>';
    yt.forEach(function (t) {
      s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + f1(sy(t)) + '" y2="' + f1(sy(t)) + '" stroke="var(--grid)" stroke-width="1"/>';
      s += '<text x="' + (m.l - 8) + '" y="' + f1(sy(t) + 4) + '" text-anchor="end">' + esc(fy(t)) + '</text>';
    });
    var xt = cfg.x.ticks || ticksBonitos(xmin, xmax, cfg.x.nTicks || 6).filter(function (t) { return t >= xmin - 1e-9 && t <= xmax + 1e-9; });
    xt.forEach(function (t) {
      s += '<text x="' + f1(sx(t)) + '" y="' + (H - m.b + 16) + '" text-anchor="middle">' + esc(fx(t)) + '</text>';
    });
    s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + (m.t + ph) + '" y2="' + (m.t + ph) + '" stroke="var(--axis)" stroke-width="1"/>';
    if (cfg.x.rotulo) s += '<text class="rot-eixo" x="' + (m.l + pw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(cfg.x.rotulo) + '</text>';
    if (cfg.y.rotulo) s += '<text class="rot-eixo" x="' + m.l + '" y="' + (m.t - 6) + '" text-anchor="start">' + esc(cfg.y.rotulo) + '</text>';
    areas.forEach(function (a) {
      var sup = a.superior.filter(function (p) { return isFinite(p.y); }), inf = a.inferior.filter(function (p) { return isFinite(p.y); });
      if (!sup.length) return;
      var d = 'M' + sup.map(function (p) { return f1(sx(p.x)) + ' ' + f1(sy(p.y)); }).join('L') + 'L' + inf.slice().reverse().map(function (p) { return f1(sx(p.x)) + ' ' + f1(sy(p.y)); }).join('L') + 'Z';
      s += '<path d="' + d + '" fill="' + a.cor + '" fill-opacity="' + (a.opacidade || 0.12) + '" stroke="none"' + (a.id ? ' data-area="' + esc(a.id) + '"' : '') + '/>';
    });
    (cfg.referenciasH || []).forEach(function (r) {
      s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + f1(sy(r.y)) + '" y2="' + f1(sy(r.y)) + '" stroke="var(--ink-2)" stroke-width="1" stroke-dasharray="4 3"/>';
      s += '<text class="rot-marca" x="' + (m.l + 4) + '" y="' + f1(sy(r.y) - 5) + '" text-anchor="start">' + esc(r.rotulo) + '</text>';
    });
    (cfg.marcadoresV || []).forEach(function (mv, i) {
      if (mv.x < xmin || mv.x > xmax) return;
      var x = f1(sx(mv.x));
      s += '<line x1="' + x + '" x2="' + x + '" y1="' + m.t + '" y2="' + (m.t + ph) + '" stroke="' + (mv.cor || 'var(--ink-2)') + '" stroke-width="1" stroke-dasharray="3 3"/>';
      var anchor = sx(mv.x) > m.l + pw * 0.7 ? 'end' : 'start';
      if (rotulosNoGrafico) s += '<text class="rot-marca" x="' + (anchor === 'end' ? x - 4 : x + 4) + '" y="' + (m.t + 12 + (i % 3) * 14) + '" text-anchor="' + anchor + '">' + esc(mv.rotulo) + '</text>';
    });
    series.forEach(function (se) {
      s += '<path d="' + caminho(se.pontos, sx, sy) + '" fill="none" stroke="' + se.cor + '" stroke-width="' + (se.largura || 2) + '" stroke-linejoin="round" stroke-linecap="round"' + (se.tracejado ? ' stroke-dasharray="6 4"' : '') + ' data-serie="' + esc(se.id) + '"/>';
      if (se.marcadores) se.pontos.forEach(function (p) {
        if (!isFinite(p.y)) return;
        s += '<circle cx="' + f1(sx(p.x)) + '" cy="' + f1(sy(p.y)) + '" r="4" fill="' + (p.cor || se.cor) + '" stroke="var(--chart-surface)" stroke-width="2"/>';
      });
    });
    (cfg.pontos || []).forEach(function (p) {
      if (!isFinite(p.y) || p.x < xmin || p.x > xmax) return;
      var cx = f1(sx(p.x)), cy = f1(sy(p.y));
      if (p.forma === 'losango') s += '<path d="M' + cx + ' ' + (cy - 7) + 'L' + (cx + 7) + ' ' + cy + 'L' + cx + ' ' + (cy + 7) + 'L' + (cx - 7) + ' ' + cy + 'Z" fill="' + p.cor + '" stroke="var(--chart-surface)" stroke-width="2" data-ponto="' + esc(p.id || '') + '" data-x="' + p.x + '" data-y="' + p.y + '"/>';
      else s += '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="' + p.cor + '" stroke="var(--chart-surface)" stroke-width="2" data-ponto="' + esc(p.id || '') + '" data-x="' + p.x + '" data-y="' + p.y + '"/>';
      if (p.rotulo && rotulosNoGrafico) {
        var anc = sx(p.x) > m.l + pw * 0.75 ? 'end' : 'start';
        s += '<text class="rot-dado" x="' + (anc === 'end' ? cx - 10 : cx + 10) + '" y="' + (cy + (p.deslocY || -10)) + '" text-anchor="' + anc + '">' + esc(p.rotulo) + '</text>';
      }
    });
    s += '<line class="mira" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ph) + '" stroke="var(--ink-2)" stroke-width="1" visibility="hidden"/>';
    s += '<g class="marcas-hover"></g>';
    s += '<rect class="alvo" x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '" fill="transparent"/>';
    s += '</svg>';
    cont.innerHTML = s;
    var svg = cont.querySelector('svg');
    var dica = dicaEl(cont);
    var alvos = cfg.xs || (series[0] ? series[0].pontos.map(function (p) { return p.x; }) : []);
    if (!cfg.dica || !alvos.length) return;
    var mira = svg.querySelector('.mira'), g = svg.querySelector('.marcas-hover'), alvo = svg.querySelector('.alvo');
    function mover(ev) {
      var r = svg.getBoundingClientRect();
      var cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      var vx = cx / r.width * W;
      var xv = xmin + (vx - m.l) / pw * (xmax - xmin);
      var idx = 0, best = Infinity;
      alvos.forEach(function (x, i) { var d = Math.abs(x - xv); if (d < best) { best = d; idx = i; } });
      var X = sx(alvos[idx]);
      mira.setAttribute('x1', X); mira.setAttribute('x2', X); mira.setAttribute('visibility', 'visible');
      var marcas = '';
      series.forEach(function (se) {
        var p = se.pontos.filter(function (q) { return q.x === alvos[idx]; })[0];
        if (p && isFinite(p.y)) marcas += '<circle cx="' + f1(X) + '" cy="' + f1(sy(p.y)) + '" r="4" fill="' + se.cor + '" stroke="var(--chart-surface)" stroke-width="2"/>';
      });
      g.innerHTML = marcas;
      dica.innerHTML = cfg.dica(idx);
      posicionarDica(cont, dica, X / W * r.width, (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top);
    }
    function sair() { mira.setAttribute('visibility', 'hidden'); g.innerHTML = ''; dica.hidden = true; }
    alvo.addEventListener('mousemove', mover);
    alvo.addEventListener('touchstart', mover, { passive: true });
    alvo.addEventListener('touchmove', mover, { passive: true });
    alvo.addEventListener('mouseleave', sair);
  }

  /*
   * Barras mensais (agrupadas ou empilhadas) com linhas opcionais, um eixo Y.
   * cfg: { categorias, series:[{nome,cor,valores,tipo:'barra'|'linha',pilha}], y:{formato,rotulo}, dica:fn(i) }
   */
  function barras(cont, cfg) {
    var W = cfg.largura || larguraDe(cont, 760), H = cfg.altura || 280;
    var m = Object.assign({ t: 20, r: 16, b: 34, l: 64 }, cfg.margem || {});
    var cats = cfg.categorias, n = cats.length;
    var barrasS = cfg.series.filter(function (s) { return s.tipo !== 'linha' && s.visivel !== false; });
    var linhasS = cfg.series.filter(function (s) { return s.tipo === 'linha' && s.visivel !== false; });
    var pilhas = {};
    barrasS.forEach(function (s) { var k = s.pilha || s.nome; (pilhas[k] = pilhas[k] || []).push(s); });
    var grupos = Object.keys(pilhas);
    var ymax = 0, ymin = 0;
    for (var i = 0; i < n; i++) {
      grupos.forEach(function (gk) {
        var pos = 0, neg = 0;
        pilhas[gk].forEach(function (s) { var v = s.valores[i] || 0; if (v >= 0) pos += v; else neg += v; });
        ymax = Math.max(ymax, pos); ymin = Math.min(ymin, neg);
      });
      linhasS.forEach(function (s) { var v = s.valores[i]; if (isFinite(v)) { ymax = Math.max(ymax, v); ymin = Math.min(ymin, v); } });
    }
    var yt = ticksBonitos(ymin, ymax * 1.05 || 1, 5);
    ymin = yt[0]; ymax = yt[yt.length - 1];
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var banda = pw / n;
    function sy(y) { return m.t + ph - (y - ymin) / (ymax - ymin) * ph; }
    var fy = cfg.y.formato || compacto;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(cfg.titulo || '') + '" xmlns="http://www.w3.org/2000/svg">';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--chart-surface)" rx="6"/>';
    yt.forEach(function (t) {
      s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + f1(sy(t)) + '" y2="' + f1(sy(t)) + '" stroke="var(--grid)" stroke-width="1"/>';
      s += '<text x="' + (m.l - 8) + '" y="' + f1(sy(t) + 4) + '" text-anchor="end">' + esc(fy(t)) + '</text>';
    });
    if (cfg.y.rotulo) s += '<text class="rot-eixo" x="' + m.l + '" y="' + (m.t - 7) + '" text-anchor="start">' + esc(cfg.y.rotulo) + '</text>';
    var bw = Math.min(24, (banda * 0.72) / Math.max(1, grupos.length));
    for (i = 0; i < n; i++) {
      var cx = m.l + banda * i + banda / 2;
      s += '<text x="' + f1(cx) + '" y="' + (H - m.b + 15) + '" text-anchor="middle">' + esc(cats[i]) + '</text>';
      grupos.forEach(function (gk, gi) {
        var x0 = cx - (grupos.length * bw + (grupos.length - 1) * 2) / 2 + gi * (bw + 2);
        var base = 0;
        pilhas[gk].forEach(function (se, si) {
          var v = se.valores[i] || 0;
          if (v <= 0) return;
          var y1 = sy(base + v), y0 = sy(base);
          var h = Math.max(0, y0 - y1 - (si > 0 ? 2 : 0));
          var topo = si === pilhas[gk].length - 1 || pilhas[gk].slice(si + 1).every(function (q) { return !(q.valores[i] > 0); });
          if (topo && h > 4) {
            var r = 3;
            s += '<path d="M' + f1(x0) + ' ' + f1(y1 + h) + 'V' + f1(y1 + r) + 'Q' + f1(x0) + ' ' + f1(y1) + ' ' + f1(x0 + r) + ' ' + f1(y1) + 'H' + f1(x0 + bw - r) + 'Q' + f1(x0 + bw) + ' ' + f1(y1) + ' ' + f1(x0 + bw) + ' ' + f1(y1 + r) + 'V' + f1(y1 + h) + 'Z" fill="' + se.cor + '"/>';
          } else {
            s += '<rect x="' + f1(x0) + '" y="' + f1(y1) + '" width="' + f1(bw) + '" height="' + f1(h) + '" fill="' + se.cor + '"/>';
          }
          base += v;
        });
      });
    }
    s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + f1(sy(0)) + '" y2="' + f1(sy(0)) + '" stroke="var(--axis)" stroke-width="1"/>';
    linhasS.forEach(function (se) {
      var d = '';
      se.valores.forEach(function (v, j) { if (!isFinite(v)) return; d += (d ? 'L' : 'M') + f1(m.l + banda * j + banda / 2) + ' ' + f1(sy(v)); });
      s += '<path d="' + d + '" fill="none" stroke="' + se.cor + '" stroke-width="2" stroke-linejoin="round"' + (se.tracejado ? ' stroke-dasharray="6 4"' : '') + '/>';
      se.valores.forEach(function (v, j) { if (!isFinite(v)) return; s += '<circle cx="' + f1(m.l + banda * j + banda / 2) + '" cy="' + f1(sy(v)) + '" r="3.5" fill="' + se.cor + '" stroke="var(--chart-surface)" stroke-width="2"/>'; });
    });
    s += '<rect class="faixa-hover" x="0" y="' + m.t + '" width="0" height="' + ph + '" fill="var(--ink)" fill-opacity="0.05" visibility="hidden"/>';
    for (i = 0; i < n; i++) s += '<rect class="alvo" data-i="' + i + '" x="' + f1(m.l + banda * i) + '" y="' + m.t + '" width="' + f1(banda) + '" height="' + ph + '" fill="transparent"/>';
    s += '</svg>';
    cont.innerHTML = s;
    if (!cfg.dica) return;
    var svg = cont.querySelector('svg'), dica = dicaEl(cont), faixa = svg.querySelector('.faixa-hover');
    svg.querySelectorAll('.alvo').forEach(function (a) {
      function mostrar(ev) {
        var j = +a.getAttribute('data-i');
        faixa.setAttribute('x', m.l + banda * j); faixa.setAttribute('width', banda); faixa.setAttribute('visibility', 'visible');
        dica.innerHTML = cfg.dica(j);
        var r = svg.getBoundingClientRect();
        posicionarDica(cont, dica, (m.l + banda * j + banda / 2) / W * r.width, (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top);
      }
      a.addEventListener('mousemove', mostrar);
      a.addEventListener('touchstart', mostrar, { passive: true });
      a.addEventListener('mouseleave', function () { dica.hidden = true; faixa.setAttribute('visibility', 'hidden'); });
    });
  }

  // Tornado: variação do custo em relação à base (negativo = custo menor).
  function tornado(cont, cfg) {
    var itens = cfg.itens;
    var W = cfg.largura || larguraDe(cont, 760), lh = 40;
    var estreito = W < 560;
    var m = { t: 28, r: estreito ? 64 : 190, b: 16, l: estreito ? 120 : 220 };
    var H = m.t + m.b + itens.length * lh;
    var maxAbs = 1;
    itens.forEach(function (it) { maxAbs = Math.max(maxAbs, Math.abs(it.baixo), Math.abs(it.alto)); });
    var pw = W - m.l - m.r;
    function sx(v) { return m.l + pw / 2 + v / maxAbs * (pw / 2); }
    var fmt = cfg.formato || compacto;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sensibilidade" xmlns="http://www.w3.org/2000/svg">';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--chart-surface)" rx="6"/>';
    s += '<text class="rot-eixo" x="' + (m.l + pw / 2) + '" y="16" text-anchor="middle">Δ custo total anual (azul = menor, vermelho = maior)</text>';
    s += '<line x1="' + f1(sx(0)) + '" x2="' + f1(sx(0)) + '" y1="' + (m.t - 4) + '" y2="' + (H - m.b + 4) + '" stroke="var(--axis)" stroke-width="1"/>';
    var maxRot = estreito ? 16 : 30;
    itens.forEach(function (it, i) {
      var y = m.t + i * lh + 4, h = (lh - 10) / 2;
      var nome = it.nome.length > maxRot ? it.nome.slice(0, maxRot - 1) + '…' : it.nome;
      s += '<text x="' + (m.l - 8) + '" y="' + (y + h + 4) + '" text-anchor="end" style="fill:var(--ink-2)"><title>' + esc(it.nome) + '</title>' + esc(nome) + '</text>';
      [['baixo', it.baixo, it.rotuloBaixo, 0], ['alto', it.alto, it.rotuloAlto, 1]].forEach(function (b) {
        var v = b[1], yb = y + b[3] * (h + 2);
        if (!v) return;
        var x0 = Math.min(sx(0), sx(v)), w = Math.max(1, Math.abs(sx(v) - sx(0)));
        var cor = v > 0 ? 'var(--series-8)' : 'var(--series-1)';
        s += '<rect x="' + f1(x0) + '" y="' + f1(yb) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="' + cor + '" rx="2"><title>' + esc(it.nome + ' (' + b[2] + '): ' + (v > 0 ? '+' : '') + fmt(v)) + '</title></rect>';
        var rot = (estreito ? '' : b[2] + ': ') + (v > 0 ? '+' : '') + fmt(v);
        var tx = v > 0 ? sx(v) + 4 : sx(v) - 4, anc = v > 0 ? 'start' : 'end';
        s += '<text x="' + f1(tx) + '" y="' + f1(yb + h - 2) + '" text-anchor="' + anc + '" style="fill:var(--ink-2);font-size:10px">' + esc(rot) + '</text>';
      });
    });
    s += '</svg>';
    cont.innerHTML = s;
  }

  raiz.Graficos = { linhas: linhas, barras: barras, tornado: tornado, ticksBonitos: ticksBonitos, compacto: compacto, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
