/*
 * INTERFACE
 * Lê e grava o estado, desenha as abas e chama o motor/otimizador.
 * Nenhum cálculo tributário é feito aqui: todos os números exibidos vêm de
 * MotorTributario.simular() ou de Otimizador.executar().
 */
(function () {
  'use strict';
  var M = window.MotorTributario, O = window.Otimizador, G = window.Graficos, X = window.Exportacao;
  var PL_PADRAO = window.ParametrosLegais;
  var CHAVE = 'simulador-tributario-medico-pj:estado:v1';
  var CHAVE_PARAM = 'simulador-tributario-medico-pj:parametros:v1';
  var CHAVE_UI = 'simulador-tributario-medico-pj:ui:v1';
  var MODO_ARTEFATO = !!window.__MODO_ARTEFATO__;
  var esc = G.esc, brl = M.brl, num = M.num, n0 = M.n0;

  var ABAS = [
    ['painel', 'Painel geral'], ['perfil', 'Perfil da empresa'], ['receitas', 'Receitas'], ['despesas', 'Despesas'],
    ['tributos', 'Tributos atuais'], ['folha', 'Pró-labore e folha'], ['pf', 'Pessoa física'], ['distribuicao', 'Distribuição de lucros'],
    ['cenarios', 'Cenários e otimização'], ['relatorio', 'Relatório final'], ['parametros', 'Parâmetros legais e fontes']
  ];
  var UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  var SNN = [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei']];
  var SN = [['sim', 'Sim'], ['nao', 'Não']];

  var PL = clonarParametros();
  var estado = null;
  var analise = null, analiseDesatualizada = false;
  var versao = 0, cacheSim = { v: -1, res: null, ctx: null };
  var ui = { aba: 'painel', unidade: 'anual', curvas: { real: true, pjpf: true, v: true, iii: true, presumido: true, lreal: false, banda: true }, comparar: true, anoParametros: null };

  // ------------------------------------------------------------ armazenamento

  function lerLocal(chave) { try { var v = window.localStorage.getItem(chave); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function gravarLocal(chave, valor) { try { window.localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch (e) { return false; } }
  function removerLocal(chave) { try { window.localStorage.removeItem(chave); } catch (e) { /* sem armazenamento */ } }

  function clonarParametros() {
    var p = JSON.parse(JSON.stringify(PL_PADRAO, function (k, v) { return typeof v === 'function' ? undefined : v; }));
    p.anos = {};
    Object.keys(PL_PADRAO.anos).forEach(function (a) { p.anos[a] = JSON.parse(JSON.stringify(PL_PADRAO.anos[a])); });
    var custom = lerLocal(CHAVE_PARAM);
    if (custom && custom.anos) Object.keys(custom.anos).forEach(function (a) { p.anos[a] = custom.anos[a]; p.anos[a].personalizado = true; });
    p.codigosReceita = PL_PADRAO.codigosReceita;
    p.fontes = PL_PADRAO.fontes;
    return p;
  }

  var timerSalvar = null;
  function salvarAuto() {
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () { salvar(true); }, 700);
  }
  function salvar(silencioso) {
    estado.meta.salvoEm = new Date().toISOString();
    var ok = gravarLocal(CHAVE, estado);
    atualizarStatus(ok ? 'Salvo neste navegador às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Não foi possível salvar no navegador (armazenamento bloqueado). Use "Exportar backup".');
    if (!silencioso) notificar(ok ? 'Dados salvos neste navegador.' : 'O navegador bloqueou o armazenamento local. Exporte um backup .json.');
  }
  function carregar() {
    var s = lerLocal(CHAVE);
    if (!s) { notificar('Nenhum dado salvo neste navegador.'); return; }
    definirEstado(M.mesclarComPadrao(s));
    notificar('Dados carregados.');
  }

  function definirEstado(e) {
    estado = e;
    analise = null; analiseDesatualizada = false;
    versao++;
    renderizarTudo();
  }

  // ------------------------------------------------------------ caminhos no estado

  function obter(obj, caminho) {
    return caminho.split('.').reduce(function (o, k) { return o === undefined || o === null ? undefined : o[k]; }, obj);
  }
  function definir(obj, caminho, valor) {
    var partes = caminho.split('.');
    var o = obj;
    for (var i = 0; i < partes.length - 1; i++) {
      if (o[partes[i]] === undefined || o[partes[i]] === null) o[partes[i]] = /^\d+$/.test(partes[i + 1]) ? [] : {};
      o = o[partes[i]];
    }
    o[partes[partes.length - 1]] = valor;
  }

  // ------------------------------------------------------------ simulação do plano atual

  function parametrosAno() { return PL.anos[estado.analise.ano] || PL.anos[PL.anoPadrao]; }
  function simAtual() {
    if (cacheSim.v === versao) return cacheSim;
    var P = parametrosAno();
    var ctx = M.prepararContexto(estado, P);
    var eleg = M.avaliarElegibilidade(ctx);
    var reg = ctx.regimeAtual;
    if (['simples', 'presumido', 'real'].indexOf(reg) < 0) reg = eleg.simples.status !== 'inelegivel' ? 'simples' : 'presumido';
    var res = M.simular(ctx, { regime: reg, proLabore: ctx.proLaborePlanoAtual, detalhar: true });
    var conc = M.conciliarPagamentos(ctx, res);
    cacheSim = { v: versao, ctx: ctx, res: res, eleg: eleg, regime: reg, conc: conc, alertas: M.gerarAlertas(ctx, res, { divergencias: conc.divergencias }), qualidade: M.qualidadeDados(ctx) };
    return cacheSim;
  }

  // IRPF + IRPFM anual distribuído pelos meses na proporção do pró-labore (apenas para visualização mensal)
  function irpfMensalProjetado(res) {
    var tot = res.anual.irpfDevido + res.anual.irpfmAdicional;
    var somaPL = res.proLabore.reduce(function (a, b) { return a + b; }, 0);
    var div = res.anual.dividendoMedico;
    return res.meses.map(function (m) {
      if (somaPL > 0) return M.r2(tot * m.proLabore / somaPL);
      return div > 0 ? M.r2(tot * m.dividendoMedico / div) : M.r2(tot / 12);
    });
  }

  // ------------------------------------------------------------ formatação

  function pct(v, c) { return M.pct(v, c); }
  function pctR(v) { return isFinite(v) ? (Math.floor(v * 10000 + 1e-7) / 100).toFixed(2).replace('.', ',') + '%' : '—'; }
  function brl0(v) { var s = brl(v); return s.replace(/,\d{2}$/, ''); }
  function fmtInput(v) {
    var n = num(v);
    if (n === null) return '';
    var neg = n < 0, p = Math.abs(n).toFixed(2).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + p[0] + ',' + p[1];
  }
  function sinal(v) { return (v > 0 ? '+' : '') + brl(v); }
  function classeSinal(v, invertido) { if (Math.abs(v) < 0.005) return ''; return (v > 0) !== !!invertido ? 'negativo' : 'positivo'; }
  function nomeRegime(r) { return O.nomeRegime(r); }
  function mesLongo(k) { return M.MESES_LONGOS[k - 1]; }

  // ------------------------------------------------------------ controles

  function idDe(caminho) { return 'f-' + caminho.replace(/\./g, '-'); }
  function inp(caminho, op) {
    op = op || {};
    var v = obter(estado, caminho);
    var tipo = op.tipo || 'moeda';
    var val = v === undefined || v === null ? '' : v;
    if (tipo === 'moeda' && val !== '') val = fmtInput(val);
    var attrs = ' id="' + idDe(caminho) + '" data-bind="' + caminho + '" data-tipo="' + tipo + '"';
    if (tipo === 'data') return '<input type="date"' + attrs + ' value="' + esc(val) + '"' + (op.dis ? ' disabled' : '') + '>';
    var cls = tipo === 'texto' ? '' : ' class="num"';
    var im = tipo === 'texto' ? '' : ' inputmode="decimal"';
    return '<input type="text"' + attrs + cls + im + ' value="' + esc(val) + '" placeholder="' + esc(op.ph || (tipo === 'moeda' ? '0,00' : '')) + '"' + (op.dis ? ' disabled' : '') + (op.aria ? ' aria-label="' + esc(op.aria) + '"' : '') + ' autocomplete="off">';
  }
  function sel(caminho, opcoes, op) {
    op = op || {};
    var v = String(obter(estado, caminho));
    var h = '<select id="' + idDe(caminho) + '" data-bind="' + caminho + '"' + (op.conv ? ' data-conv="' + op.conv + '"' : '') + (op.aria ? ' aria-label="' + esc(op.aria) + '"' : '') + (op.dis ? ' disabled' : '') + '>';
    opcoes.forEach(function (o) {
      if (o.grupo) {
        h += '<optgroup label="' + esc(o.grupo) + '">' + o.itens.map(function (it) { return '<option value="' + esc(it[0]) + '"' + (String(it[0]) === v ? ' selected' : '') + '>' + esc(it[1]) + '</option>'; }).join('') + '</optgroup>';
      } else h += '<option value="' + esc(o[0]) + '"' + (String(o[0]) === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    });
    return h + '</select>';
  }
  function chk(caminho, rotulo) {
    var v = !!obter(estado, caminho);
    return '<label class="check"><input type="checkbox" id="' + idDe(caminho) + '" data-bind="' + caminho + '" data-tipo="bool"' + (v ? ' checked' : '') + '> ' + esc(rotulo) + '</label>';
  }
  function campo(rotulo, controle, ajuda, cls) {
    var m = controle.match(/id="([^"]+)"/);
    return '<div class="campo' + (cls ? ' ' + cls : '') + '"><label' + (m ? ' for="' + m[1] + '"' : '') + '>' + esc(rotulo) + '</label>' + controle + (ajuda ? '<span class="ajuda">' + ajuda + '</span>' : '') + '</div>';
  }
  function bloco(titulo, conteudo, sub, extra) {
    return '<section class="bloco"' + (extra || '') + '><header><h3>' + esc(titulo) + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</header>' + conteudo + '</section>';
  }
  function tabela(cab, linhas, op) {
    op = op || {};
    var h = '<div class="tabela-rolagem"' + (op.maxH ? ' style="max-height:' + op.maxH + 'px"' : '') + '><table class="' + (op.cls || '') + '"' + (op.id ? ' id="' + op.id + '"' : '') + '><thead><tr>';
    cab.forEach(function (c) { var t = typeof c === 'string' ? { t: c } : c; h += '<th' + (t.num ? ' class="num"' : '') + (t.title ? ' title="' + esc(t.title) + '"' : '') + '>' + esc(t.t) + '</th>'; });
    h += '</tr></thead><tbody>' + linhas.join('') + '</tbody>';
    if (op.rodape) h += '<tfoot>' + op.rodape + '</tfoot>';
    return h + '</table></div>';
  }
  function td(v, cls) { return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</td>'; }
  function tdn(v, cls) { return '<td class="num' + (cls ? ' ' + cls : '') + '">' + v + '</td>'; }
  function selo(texto, tipo) { return '<span class="selo selo-' + (tipo || 'neutro') + '">' + esc(texto) + '</span>'; }
  function anexoTag(a) { return a ? '<span class="anexo ' + a + '">' + a + '</span>' : '—'; }
  function mesesOp() { var a = []; for (var k = 1; k <= 12; k++) a.push([k, M.MESES[k - 1]]); return a; }

  function statusSelo(st) {
    return { elegivel: selo('Elegível', 'ok'), inelegivel: selo('Inelegível', 'crit'), indeterminado: selo('Validar elegibilidade', 'alerta'), estimativa_incompleta: selo('Estimativa incompleta', 'alerta') }[st] || selo(st);
  }

  // ------------------------------------------------------------ estrutura

  function renderizarAbas() {
    var nav = document.getElementById('abas');
    nav.innerHTML = ABAS.map(function (a, i) {
      return '<button class="aba" role="tab" id="aba-' + a[0] + '" aria-controls="painel-' + a[0] + '" aria-selected="' + (ui.aba === a[0]) + '" data-aba="' + a[0] + '"><span class="n">' + (i + 1) + '</span>' + esc(a[1]) + '</button>';
    }).join('');
    document.querySelectorAll('.painel').forEach(function (p) { p.hidden = p.id !== 'painel-' + ui.aba; });
  }

  function irPara(aba) {
    ui.aba = aba;
    gravarLocal(CHAVE_UI, { aba: aba });
    renderizarAbas();
    renderizarAba(aba);
    var b = document.getElementById('aba-' + aba);
    if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    window.scrollTo(0, 0);
  }

  var RENDER = {};
  function renderizarAba(aba) {
    var el = document.getElementById('painel-' + aba);
    if (!el || !RENDER[aba]) return;
    try { el.innerHTML = RENDER[aba](); } catch (e) { el.innerHTML = '<div class="aviso critico">Erro ao exibir esta aba: ' + esc(e.message) + '. Os dados não foram perdidos.</div>'; if (window.console) console.error(e); }
    if (POS[aba]) { try { POS[aba](el); } catch (e2) { if (window.console) console.error(e2); } }
  }
  function renderizarTudo() {
    renderizarAbas();
    renderizarAba(ui.aba);
    atualizarCabecalho();
  }

  function atualizarCabecalho() {
    var e = estado;
    var t = document.getElementById('identificacao');
    var partes = [];
    if (e.meta.exemplo) partes.push(selo('Dados fictícios de exemplo', 'exemplo'));
    if (analise && analiseDesatualizada) partes.push(selo('Análise desatualizada', 'alerta'));
    else if (analise) partes.push(selo('Análise atualizada', 'ok'));
    t.innerHTML = partes.join(' ');
  }
  function atualizarStatus(msg) { var s = document.getElementById('status-dados'); if (s) s.textContent = msg; }

  var timerDerivados = null;
  function aoAlterar() {
    versao++;
    if (analise) analiseDesatualizada = true;
    if (estado.meta.exemplo) estado.meta.editado = true;
    salvarAuto();
    clearTimeout(timerDerivados);
    timerDerivados = setTimeout(function () {
      atualizarCabecalho();
      var el = document.getElementById('painel-' + ui.aba);
      if (!el) return;
      el.querySelectorAll('[data-derivado]').forEach(function (d) {
        var f = DERIVADOS[d.getAttribute('data-derivado')];
        if (f) { try { d.innerHTML = f(); } catch (err) { d.innerHTML = '<div class="aviso critico">' + esc(err.message) + '</div>'; } }
      });
      if (POS_DERIVADOS[ui.aba]) POS_DERIVADOS[ui.aba](el);
    }, 250);
  }
  var DERIVADOS = {}, POS = {}, POS_DERIVADOS = {};
  function derivado(nome, f) { DERIVADOS[nome] = f; return '<div data-derivado="' + nome + '">' + f() + '</div>'; }

  // ------------------------------------------------------------ painel geral

  function kpi(rotulo, valor, detalhe, cls) {
    return '<div class="kpi' + (cls ? ' ' + cls : '') + '"><span class="rotulo">' + esc(rotulo) + '</span><span class="valor">' + valor + '</span>' + (detalhe ? '<span class="detalhe">' + detalhe + '</span>' : '') + '</div>';
  }

  function reguaFatorR(res, titulo) {
    var h = '<div class="grid-regua"><div class="rotulo" style="margin-bottom:6px">' + esc(titulo) + '</div><div class="regua">';
    res.meses.forEach(function (m) {
      var semRec = !m.ativo || m.rb <= 0;
      var cls = semRec || !m.anexo ? 'sem' : m.anexo;
      h += '<div class="regua-mes ' + cls + '" title="' + esc(m.rotulo + ': FS12 ' + brl(m.fs12) + ' ÷ RBT12 ' + brl(m.rbt12)) + '"><span class="m">' + m.rotulo + '</span><span class="r">' + (m.ativo ? pctR(m.fatorR) : '—') + '</span><span class="a">' + (semRec ? 'sem receita' : (m.anexo ? 'Anexo ' + m.anexo : nomeRegime(res.regime).replace('Lucro ', 'L. '))) + '</span></div>';
    });
    return h + '</div></div>';
  }

  RENDER.painel = function () {
    var S = simAtual(), res = S.res, A = res.anual, e = estado;
    var nome = e.empresa.nome || 'Empresa sem identificação';
    var h = '<div class="cabecalho-painel"><div><h2>' + esc(nome) + '</h2><p>Ano analisado: ' + e.analise.ano + ' · Regime de referência: ' + nomeRegime(S.regime) + ' · Planejamento a partir de ' + mesLongo(S.ctx.k0) + '</p></div>' +
      '<div class="linha-acoes nao-imprimir"><button class="btn btn-primario" data-acao="analisar">Executar análise</button></div></div>';
    if (e.meta.exemplo) h += '<div class="aviso atencao"><strong>Exemplo fictício.</strong> Empresa, pessoas e valores foram inventados para demonstrar o simulador. Substitua pelos seus dados ou use "Limpar dados".</div>';
    var rb = A.rb;
    var econ = analise ? analise.economia : null;
    h += '<div class="kpis">';
    h += kpi('Economia potencial anual', analise ? brl(econ) : '—', analise ? (analise.semVantagemRelevante ? 'Abaixo da materialidade de ' + brl(analise.materialidade) : 'Cenário recomendado vs. atual' + (analiseDesatualizada ? ' (desatualizada)' : '')) : 'Execute a análise para calcular', 'heroi');
    h += kpi('Faturamento anual', brl0(rb), 'Média mensal ' + brl0(rb / 12));
    h += kpi('Carga tributária efetiva', pct(A.cargaEfetiva, 1), brl0(A.cargaTributaria) + ' no ano');
    h += kpi('Tributos da empresa', brl0(A.tributosPJ), res.regime === 'simples' ? 'DAS ' + brl0(A.das) : 'IRPJ, CSLL, PIS, Cofins, ISS e CPP');
    h += kpi('Despesas operacionais', brl0(A.despesasOperacionais), 'Investimentos: ' + brl0(A.ativoImobilizado));
    h += kpi('Pró-labore', brl0(A.proLabore), 'INSS ' + brl0(A.inss));
    h += kpi('IRPF devido', brl0(A.irpfDevido), A.irpfmAdicional ? 'IRPFM adicional ' + brl0(A.irpfmAdicional) : 'Ajuste: ' + (A.irpf.saldo >= 0 ? 'pagar ' : 'restituir ') + brl0(Math.abs(A.irpf.saldo)));
    h += kpi('Distribuição de lucros', brl0(A.dividendoMedico), A.retencaoDividendos ? 'Retenção ' + brl0(A.retencaoDividendos) : 'Sem retenção na fonte');
    h += kpi('Lucro contábil estimado', brl0(A.lucroContabil), 'Retido: ' + brl0(A.lucroRetido));
    h += kpi('Caixa final da empresa', brl0(A.caixaFinalPJ), res.viavel ? 'Acima da reserva' : 'Déficit de ' + brl0(res.deficitCaixa));
    h += kpi('Renda líquida pessoal', brl0(A.rendaLiquidaPF), 'Após INSS, IRPF e IRPFM');
    h += '</div>';
    h += '<section class="bloco"><header><h3>Fator "r" e anexo por mês</h3><p>FS12 ÷ RBT12 de cada competência, com a regra real (inclui histórico e início de atividade). O pró-labore de um mês só altera o fator dos meses seguintes.</p></header>' + reguaFatorR(res, 'Plano atual — ' + nomeRegime(res.regime));
    if (analise && analise.recomendado.regime === 'simples') h += reguaFatorR(analise.recomendado, 'Plano recomendado');
    h += '</section>';
    h += '<section class="bloco"><header><h3>Visão dos 12 meses</h3><p>Valores mensais calculados pelo motor. O IRPF mensal é o imposto anual devido distribuído na proporção do pró-labore (o IRRF retido é antecipação).</p></header>';
    if (analise) h += '<label class="check nao-imprimir"><input type="checkbox" id="ui-comparar"' + (ui.comparar ? ' checked' : '') + '> Comparar com o cenário recomendado</label>';
    h += '<div class="multiplos" id="graficos-anuais"></div></section>';
    var al = analise ? analise.alertas : S.alertas;
    h += '<div class="grade-2">' + bloco('Alertas e pontos de revisão', listaAlertas(al.slice(0, 6)) + (al.length > 6 ? '<button class="btn btn-texto" data-ir="cenarios">Ver todos os ' + al.length + ' alertas</button>' : ''), 'Não impedem a simulação, mas limitam as conclusões que dependem dos dados ausentes.') +
      bloco('Qualidade dos dados', qualidadeHtml(S.qualidade)) + '</div>';
    return h;
  };
  POS.painel = function () { desenharGraficosAnuais(); };

  function qualidadeHtml(q) {
    var h = '<div style="display:flex;gap:10px;align-items:center"><strong style="font-size:1.4rem">' + q.nota + '/100</strong>' + selo('Qualidade ' + q.nivel, q.nivel === 'alta' ? 'ok' : (q.nivel === 'média' ? 'alerta' : 'crit')) + '</div><div class="medidor"><span style="width:' + q.nota + '%"></span></div><ul class="small" style="margin:0;padding-left:1.1em;display:grid;gap:3px">';
    q.itens.forEach(function (i) { h += '<li>' + (i.ok ? '✓ ' : '✗ ') + esc(i.texto) + (i.ok ? '' : ' <span class="muted">— ' + esc(i.efeito) + '</span>') + '</li>'; });
    return h + '</ul>';
  }

  function listaAlertas(al) {
    if (!al.length) return '<div class="aviso ok">Nenhum alerta para os dados atuais.</div>';
    var ic = { critico: '!', atencao: '!', info: 'i' }, nome = { critico: 'Crítico', atencao: 'Atenção', info: 'Informação' };
    return '<div class="alertas">' + al.map(function (a) {
      return '<div class="alerta ' + a.nivel + '"><span class="ic" aria-hidden="true">' + ic[a.nivel] + '</span><strong>' + nome[a.nivel] + ': ' + esc(a.titulo) + '</strong><p>' + esc(a.detalhe) + '</p>' + (a.limita ? '<span class="lim">Limita: ' + esc(a.limita) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function desenharGraficosAnuais() {
    var cont = document.getElementById('graficos-anuais');
    if (!cont) return;
    var S = simAtual(), a = S.res;
    var r = analise && ui.comparar ? analise.recomendado : null;
    var cats = a.meses.map(function (m) { return M.MESES[m.k - 1]; });
    var irA = irpfMensalProjetado(a), irR = r ? irpfMensalProjetado(r) : null;
    var cargaA = a.meses.map(function (m, i) { return M.r2(m.tributosPJ + m.inss + irA[i]); });
    var cargaR = r ? r.meses.map(function (m, i) { return M.r2(m.tributosPJ + m.inss + irR[i]); }) : null;
    cont.innerHTML = ['g-fat', 'g-trib', 'g-carga', 'g-pl', 'g-fr', 'g-caixa'].map(function (id) { return '<div class="grafico-cartao"><h4 id="t-' + id + '"></h4><div class="legenda" id="l-' + id + '"></div><div class="grafico" id="' + id + '"></div></div>'; }).join('');
    function titulo(id, t, leg) {
      document.getElementById('t-' + id).textContent = t;
      document.getElementById('l-' + id).innerHTML = leg.map(function (l) { return '<span class="item-leg"><span class="chave' + (l.area ? ' area' : '') + (l.tracejado ? ' tracejada' : '') + '" style="' + (l.area ? 'background:' : 'border-color:') + l.cor + '"></span>' + esc(l.nome) + '</span>'; }).join('');
    }
    function dicaMes(i, linhas) {
      return '<div class="t">' + esc(a.meses[i].rotulo) + '</div>' + linhas.map(function (l) { return '<div class="l"><span class="k"><i style="background:' + l[2] + '"></i>' + esc(l[0]) + '</span><span class="v">' + l[1] + '</span></div>'; }).join('');
    }
    titulo('g-fat', 'Faturamento e carga tributária total (R$/mês)', [{ nome: 'Faturamento', cor: 'var(--series-1)', area: true }, { nome: 'Carga tributária — atual', cor: 'var(--series-2)' }].concat(r ? [{ nome: 'Carga tributária — recomendado', cor: 'var(--series-3)', tracejado: true }] : []));
    G.barras(document.getElementById('g-fat'), {
      categorias: cats, y: { formato: G.compacto },
      series: [{ nome: 'Faturamento', cor: 'var(--series-1)', valores: a.meses.map(function (m) { return m.rb; }) }, { nome: 'Carga atual', cor: 'var(--series-2)', tipo: 'linha', valores: cargaA }].concat(r ? [{ nome: 'Carga recomendada', cor: 'var(--series-3)', tipo: 'linha', tracejado: true, valores: cargaR }] : []),
      dica: function (i) { return dicaMes(i, [['Faturamento', brl(a.meses[i].rb), 'var(--series-1)'], ['Carga atual', brl(cargaA[i]), 'var(--series-2)']].concat(r ? [['Carga recomendada', brl(cargaR[i]), 'var(--series-3)']] : [])); }
    });
    titulo('g-trib', 'Tributos por categoria — plano atual (R$/mês)', [{ nome: a.regime === 'simples' ? 'DAS e ISS fora' : 'Tributos da PJ', cor: 'var(--series-1)', area: true }, { nome: 'INSS do sócio', cor: 'var(--series-4)', area: true }, { nome: 'IRPF + IRPFM projetado', cor: 'var(--series-7)', area: true }]);
    G.barras(document.getElementById('g-trib'), {
      categorias: cats, y: { formato: G.compacto },
      series: [
        { nome: 'PJ', cor: 'var(--series-1)', valores: a.meses.map(function (m) { return m.tributosPJ; }), pilha: 't' },
        { nome: 'INSS', cor: 'var(--series-4)', valores: a.meses.map(function (m) { return m.inss; }), pilha: 't' },
        { nome: 'IRPF', cor: 'var(--series-7)', valores: irA, pilha: 't' }
      ],
      dica: function (i) { var m = a.meses[i]; return dicaMes(i, [[a.regime === 'simples' ? 'DAS' : 'Tributos PJ', brl(m.tributosPJ), 'var(--series-1)'], ['INSS', brl(m.inss), 'var(--series-4)'], ['IRPF + IRPFM projetado', brl(irA[i]), 'var(--series-7)'], ['IRRF retido (antecipação)', brl(m.irrf), 'transparent']]); }
    });
    titulo('g-carga', 'Carga tributária acumulada no ano (R$)', [{ nome: 'Atual', cor: 'var(--series-2)' }].concat(r ? [{ nome: 'Recomendado', cor: 'var(--series-3)', tracejado: true }] : []));
    function acum(v) { var s = 0; return v.map(function (x) { s += x; return M.r2(s); }); }
    var acA = acum(cargaA), acR = r ? acum(cargaR) : null;
    G.linhas(document.getElementById('g-carga'), {
      altura: 260, margem: { l: 64, b: 34 }, x: { min: 1, max: 12, ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], formato: function (k) { return M.MESES[k - 1]; } }, y: { min: 0, formato: G.compacto },
      series: [{ id: 'a', nome: 'Atual', cor: 'var(--series-2)', pontos: acA.map(function (v, i) { return { x: i + 1, y: v }; }), marcadores: true }].concat(r ? [{ id: 'r', nome: 'Recomendado', cor: 'var(--series-3)', tracejado: true, pontos: acR.map(function (v, i) { return { x: i + 1, y: v }; }), marcadores: true }] : []),
      xs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      dica: function (i) { return dicaMes(i, [['Atual', brl(acA[i]), 'var(--series-2)']].concat(r ? [['Recomendado', brl(acR[i]), 'var(--series-3)']] : [])); }
    });
    titulo('g-pl', 'Pró-labore e distribuição de lucros (R$/mês)', [{ nome: 'Pró-labore — atual', cor: 'var(--series-1)', area: true }, { nome: 'Distribuição — atual', cor: 'var(--series-4)', area: true }].concat(r ? [{ nome: 'Pró-labore — recomendado', cor: 'var(--series-3)' }] : []));
    G.barras(document.getElementById('g-pl'), {
      categorias: cats, y: { formato: G.compacto },
      series: [{ nome: 'PL', cor: 'var(--series-1)', valores: a.proLabore }, { nome: 'Dist', cor: 'var(--series-4)', valores: a.meses.map(function (m) { return m.dividendoMedico; }) }].concat(r ? [{ nome: 'PL rec', cor: 'var(--series-3)', tipo: 'linha', valores: r.proLabore }] : []),
      dica: function (i) { return dicaMes(i, [['Pró-labore atual', brl(a.proLabore[i]), 'var(--series-1)'], ['Distribuição atual', brl(a.meses[i].dividendoMedico), 'var(--series-4)']].concat(r ? [['Pró-labore recomendado', brl(r.proLabore[i]), 'var(--series-3)'], ['Distribuição recomendada', brl(r.meses[i].dividendoMedico), 'transparent']] : [])); }
    });
    titulo('g-fr', 'Fator "r" mensal (%)', [{ nome: 'Atual', cor: 'var(--series-1)' }].concat(r ? [{ nome: 'Recomendado', cor: 'var(--series-3)', tracejado: true }] : []));
    G.linhas(document.getElementById('g-fr'), {
      altura: 260, margem: { l: 56, b: 34 }, x: { min: 1, max: 12, ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], formato: function (k) { return M.MESES[k - 1]; } },
      y: { min: 0, formato: function (v) { return Math.round(v * 100) + '%'; } },
      referenciasH: [{ y: 0.28, rotulo: '28%: Anexo III' }],
      series: [{ id: 'a', nome: 'Atual', cor: 'var(--series-1)', marcadores: true, pontos: a.meses.map(function (m) { return { x: m.k, y: m.ativo ? m.fatorR : NaN }; }) }].concat(r ? [{ id: 'r', nome: 'Recomendado', cor: 'var(--series-3)', tracejado: true, marcadores: true, pontos: r.meses.map(function (m) { return { x: m.k, y: m.ativo ? m.fatorR : NaN }; }) }] : []),
      xs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      dica: function (i) { var m = a.meses[i]; return dicaMes(i, [['Atual', pctR(m.fatorR) + ' · ' + (m.anexo ? 'Anexo ' + m.anexo : '—'), 'var(--series-1)']].concat(r ? [['Recomendado', pctR(r.meses[i].fatorR) + ' · ' + (r.meses[i].anexo ? 'Anexo ' + r.meses[i].anexo : '—'), 'var(--series-3)']] : [])); }
    });
    titulo('g-caixa', 'Caixa da empresa ao fim do mês (R$)', [{ nome: 'Atual', cor: 'var(--series-1)' }].concat(r ? [{ nome: 'Recomendado', cor: 'var(--series-3)', tracejado: true }] : []));
    G.linhas(document.getElementById('g-caixa'), {
      altura: 260, margem: { l: 64, b: 34 }, x: { min: 1, max: 12, ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], formato: function (k) { return M.MESES[k - 1]; } }, y: { formato: G.compacto },
      series: [{ id: 'a', nome: 'Atual', cor: 'var(--series-1)', marcadores: true, pontos: a.meses.map(function (m) { return { x: m.k, y: m.caixaFinal }; }) }].concat(r ? [{ id: 'r', nome: 'Recomendado', cor: 'var(--series-3)', tracejado: true, marcadores: true, pontos: r.meses.map(function (m) { return { x: m.k, y: m.caixaFinal }; }) }] : []),
      referenciasH: S.ctx.reserva > 0 ? [{ y: S.ctx.reserva, rotulo: 'Reserva mínima' }] : [],
      xs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      dica: function (i) { return dicaMes(i, [['Atual', brl(a.meses[i].caixaFinal), 'var(--series-1)'], ['Distribuído no mês', brl(a.meses[i].distribuicao), 'transparent']].concat(r ? [['Recomendado', brl(r.meses[i].caixaFinal), 'var(--series-3)']] : [])); }
    });
  }

  // ------------------------------------------------------------ perfil

  RENDER.perfil = function () {
    var e = estado;
    var anos = Object.keys(PL.anos).map(function (a) { return [a, PL.anos[a].rotulo || a]; });
    var h = '<div class="cabecalho-painel"><div><h2>Perfil da empresa</h2><p>Dados que definem os regimes disponíveis, as regras de início de atividade e o período da análise. CPF, CNPJ e nomes são opcionais.</p></div></div>';
    h += bloco('Período da análise', '<div class="campos">' +
      campo('Ano-calendário analisado', sel('analise.ano', anos, { conv: 'int' }), 'Define as tabelas legais usadas.') +
      campo('Planejamento a partir de', sel('analise.mesInicioPlanejamento', mesesOp(), { conv: 'int' }), 'Meses anteriores são tratados como realizados e não são otimizados.') +
      campo('Caixa da empresa no início do ano', inp('analise.caixaInicialPJ')) +
      campo('Reserva mínima de caixa', inp('analise.reservaCaixaMinima'), 'A otimização descarta planos que deixam o caixa abaixo deste valor.') +
      campo('Reconhecimento da receita', sel('analise.regimeReconhecimento', [['competencia', 'Competência (faturamento)'], ['caixa', 'Caixa (recebimento)']]), 'Regime de caixa no Simples: não admitido a partir de 2027.') +
      '</div>');
    h += bloco('Identificação e estrutura', '<div class="campos">' +
      campo('Nome ou identificação', inp('empresa.nome', { tipo: 'texto', ph: 'Opcional' })) +
      campo('CNPJ', inp('empresa.cnpj', { tipo: 'texto', ph: 'Opcional' }), 'Não é usado no cálculo.') +
      campo('Município', inp('empresa.municipio', { tipo: 'texto' })) +
      campo('UF', sel('empresa.uf', [['', '—']].concat(UFS.map(function (u) { return [u, u]; })))) +
      campo('Data de abertura (CNPJ)', inp('empresa.dataAbertura', { tipo: 'data' }), 'Necessária para as regras de início de atividade.') +
      campo('Atividade principal', inp('empresa.atividadePrincipal', { tipo: 'texto' })) +
      campo('CNAE principal', inp('empresa.cnaePrincipal', { tipo: 'texto', ph: '8630-5/03' })) +
      campo('CNAEs secundários', inp('empresa.cnaesSecundarios', { tipo: 'texto' })) +
      campo('Natureza jurídica', sel('empresa.naturezaJuridica', [['ltda', 'Sociedade limitada (Ltda.)'], ['slu', 'Sociedade limitada unipessoal (SLU)'], ['simples', 'Sociedade simples'], ['simples_pura', 'Sociedade simples uniprofissional'], ['ei', 'Empresário individual'], ['sa', 'Sociedade anônima'], ['cooperativa', 'Cooperativa'], ['outra', 'Outra']])) +
      campo('Existem empregados?', sel('empresa.temEmpregados', SN), 'Cadastre-os na aba Pró-labore e folha.') +
      campo('Sócios têm outras fontes de remuneração?', sel('empresa.outrasFontesRemuneracao', SN)) +
      campo('Sócios participam de outras empresas?', sel('empresa.participaOutrasEmpresas', SN)) +
      '</div>');
    h += bloco('Sócios', sociosHtml(), 'Marque o médico analisado. A distribuição de lucros é rateada pela participação.');
    h += bloco('Regime tributário e contabilidade', '<div class="campos">' +
      campo('Regime atual', sel('empresa.regimeAtual', [['simples', 'Simples Nacional'], ['presumido', 'Lucro Presumido'], ['real', 'Lucro Real'], ['indefinido', 'Ainda não definido']])) +
      campo('Regime no ano anterior', sel('empresa.regimeAnoAnterior', [['simples', 'Simples Nacional'], ['presumido', 'Lucro Presumido'], ['real', 'Lucro Real'], ['indefinido', 'Não havia empresa']])) +
      campo('Contabilidade regular (escrituração)?', sel('empresa.contabilidadeRegular', SNN)) +
      campo('Balancetes e demonstrações contábeis?', sel('empresa.temBalancetes', SNN)) +
      campo('Distribuição de lucros formalmente apurada?', sel('empresa.distribuicaoFormalApurada', SNN)) +
      campo('Prejuízo fiscal acumulado (Lucro Real)', inp('empresa.prejuizoFiscalAnterior')) +
      '</div>');
    h += bloco('Elegibilidade ao Simples Nacional', '<div class="campos">' +
      campo('Algum sócio é pessoa jurídica?', sel('empresa.socioPessoaJuridica', SN)) +
      campo('Débitos fiscais sem exigibilidade suspensa?', sel('empresa.debitosSemSuspensao', SNN)) +
      campo('Receita global das empresas dos sócios excede R$ 4,8 mi?', sel('empresa.outrasEmpresasReceitaGlobalExcede', SNN), 'Art. 3º, § 4º, III e IV da LC 123.') +
      campo('Obrigada ao Lucro Real?', sel('empresa.obrigadaLucroReal', SN)) +
      '</div>' + derivado('elegibilidade', elegibilidadeHtml), 'O simulador só avalia regimes legalmente disponíveis. Quando não for possível confirmar, a elegibilidade fica marcada para validação.');
    h += bloco('ISS, retenções e encargos', '<div class="campos">' +
      campo('Alíquota de ISS do município (%)', inp('empresa.iss.aliquota', { tipo: 'numero', ph: '2 a 5' }), 'Usada no Presumido/Real e no Simples acima do sublimite.') +
      campo('ISS no Simples', sel('empresa.iss.modoSimples', [['das', 'Dentro do DAS (padrão)'], ['fixo_me', 'Valor fixo municipal (ME até R$ 360 mil)']])) +
      campo('ISS no Presumido/Real', sel('empresa.iss.modoLP', [['aliquota', 'Alíquota sobre a receita'], ['fixo_sup', 'Fixo por profissional (sociedade uniprofissional)']])) +
      campo('ISS fixo mensal por profissional', inp('empresa.iss.valorFixoPorProfissional')) +
      campo('Profissionais habilitados', inp('empresa.iss.numProfissionais', { tipo: 'numero' })) +
      campo('Requisitos de equiparação hospitalar', sel('empresa.requisitosHospitalares', SNN), 'Sociedade empresária, normas da Anvisa e serviço enquadrável. Só então aplica 8%/12% no Presumido.') +
      campo('Receita com retenção federal (Presumido/Real, %)', inp('empresa.retencoesFederaisPct', { tipo: 'numero' }), 'IRRF 1,5% e CSRF 4,65% retidos por tomadores PJ: antecipações, não custo.') +
      campo('RAT (%)', inp('empresa.rat', { tipo: 'numero' })) +
      campo('FAP', inp('empresa.fap', { tipo: 'numero' })) +
      campo('Terceiros (%)', inp('empresa.terceiros', { tipo: 'numero' })) +
      '</div>');
    h += bloco('Custos administrativos incrementais (R$/mês)', '<div class="campos">' +
      campo('Simples Nacional', inp('empresa.custosAdm.simples')) +
      campo('Lucro Presumido', inp('empresa.custosAdm.presumido')) +
      campo('Lucro Real', inp('empresa.custosAdm.real')) +
      '</div>', 'Diferença de honorários contábeis e obrigações acessórias em relação ao regime atual. Os valores-padrão são estimativas: substitua pelo orçamento do seu contador.');
    h += derivado('inicio', inicioAtividadeHtml);
    return h;
  };

  function sociosHtml() {
    var linhas = estado.empresa.socios.map(function (s, i) {
      return '<tr>' + td(inp('empresa.socios.' + i + '.nome', { tipo: 'texto', aria: 'Nome do sócio' })) +
        td(inp('empresa.socios.' + i + '.participacao', { tipo: 'numero', aria: 'Participação %' })) +
        td('<label class="check"><input type="radio" name="analisado" data-socio-analisado="' + i + '"' + (s.analisado ? ' checked' : '') + '> analisado</label>') +
        td(chk('empresa.socios.' + i + '.residenteExterior', 'reside no exterior')) +
        td(estado.empresa.socios.length > 1 ? '<button class="btn btn-mini btn-perigo" data-remover-socio="' + i + '">Remover</button>' : '', 'acao') + '</tr>';
    });
    var soma = estado.empresa.socios.reduce(function (a, s) { return a + n0(s.participacao); }, 0);
    return tabela(['Nome', 'Participação (%)', 'Médico analisado', 'Residência', ''], linhas) +
      '<div class="linha-acoes"><button class="btn btn-mini" data-acao="adicionar-socio">Adicionar sócio</button>' + (Math.abs(soma - 100) > 0.01 ? '<span class="selo selo-alerta">Participações somam ' + soma.toFixed(2).replace('.', ',') + '%</span>' : '') + '</div>';
  }

  function elegibilidadeHtml() {
    var S = simAtual();
    return '<div class="grade-3">' + ['simples', 'presumido', 'real'].map(function (r) {
      var el = S.eleg[r];
      return '<div class="item"><div class="item-topo"><span class="titulo-item">' + nomeRegime(r) + '</span>' + statusSelo(el.status) + '</div><ul class="small" style="margin:0;padding-left:1.1em">' + el.motivos.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div>';
  }

  function inicioAtividadeHtml() {
    var S = simAtual(), ctx = S.ctx;
    if (!isFinite(ctx.tInicio) || ctx.tInicio < 1) return '';
    var ano = estado.analise.ano;
    var tIni = ctx.tInicio;
    var meses = 0, semFat = 0;
    for (var t = tIni; t <= 24; t++) { meses++; if ((ctx.rbT[t] || 0) <= 0) semFat++; }
    var h = '<div class="campos">' +
      campo('Data do primeiro faturamento', inp('receitas.primeiroFaturamento', { tipo: 'data' })) +
      campo('Estimativa de faturamento dos próximos 12 meses', inp('receitas.estimativa12m'), 'Preenche meses projetados vazios (1/12 por mês).') + '</div>';
    h += '<p class="small">Abertura em <strong>' + M.rotuloT(tIni, ano) + '</strong> · ' + meses + ' meses de atividade até dez/' + String(ano).slice(2) + ' · ' + semFat + ' mês(es) sem faturamento. A RBT12 é anualizada (média dos meses de atividade × 12) só para definir faixa e alíquota; não representa receita recebida.</p>';
    return bloco('Início recente de atividade', h, 'Regras específicas de início de atividade aplicadas (Res. CGSN 140, art. 22; a partir de 2027, Res. CGSN 190).');
  }

  // ------------------------------------------------------------ receitas

  RENDER.receitas = function () {
    var e = estado, k0 = n0(e.analise.mesInicioPlanejamento) || 1;
    var modo = e.receitas.modoPreenchimento;
    var h = '<div class="cabecalho-painel"><div><h2>Receitas</h2><p>Meses antes de ' + mesLongo(k0) + ' são realizados; os demais, projeção. Cenários aplicam percentuais apenas sobre a projeção, sem alterar os valores digitados nem o histórico.</p></div></div>';
    h += bloco('Forma de preenchimento', '<div class="linha-acoes" role="radiogroup">' + [['fixa', 'Receita fixa mensal'], ['variavel', 'Receita variável por mês'], ['cenarios', 'Cenários conservador, base e otimista']].map(function (o) {
      return '<label class="check"><input type="radio" name="modo-receita" data-bind="receitas.modoPreenchimento" data-tipo="radio" value="' + o[0] + '"' + (modo === o[0] ? ' checked' : '') + '> ' + o[1] + '</label>';
    }).join('') + '</div>' + (modo === 'fixa' ? receitaFixaHtml() : '') + (modo === 'cenarios' || modo === 'fixa' || modo === 'variavel' ? cenariosReceitaHtml(modo) : ''));
    h += bloco('Tratamento tributário de cada tipo de receita', tratamentoHtml(), 'Atividades diferentes são calculadas separadamente. Não presuma que toda receita médica tem o mesmo tratamento.');
    h += bloco('Receitas mensais do ano analisado', receitaMensalHtml(), 'Valores em R$. "Receita bruta" = soma dos tipos − cancelamentos − descontos incondicionais. "Outras receitas" = financeiras/não operacionais (fora da receita bruta do Simples).');
    h += bloco('Adicionar receita a um mês', '<div class="campos">' +
      '<div class="campo"><label for="add-rec-mes">Mês</label><select id="add-rec-mes">' + mesesOp().map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="campo"><label for="add-rec-tipo">Tipo</label><select id="add-rec-tipo">' + M.TIPOS_RECEITA.map(function (t) { return '<option value="' + t.id + '">' + esc(t.rotulo) + '</option>'; }).join('') + '<option value="outrasReceitas">Outras receitas (financeiras)</option></select></div>' +
      '<div class="campo"><label for="add-rec-valor">Valor (R$)</label><input type="text" id="add-rec-valor" class="num" inputmode="decimal" placeholder="0,00"></div>' +
      '<div class="campo" style="align-self:end"><button class="btn" data-acao="adicionar-receita">Adicionar receita</button></div></div>', 'Soma o valor ao mês e tipo escolhidos.');
    h += bloco('Histórico dos 12 meses anteriores (base da RBT12 e da FS12)', historicoHtml(), 'Necessário para o fator "r" e a faixa dos primeiros meses. Folha = pró-labore de todos os sócios + salários + 13º + férias efetivamente pagos. CPP recolhida fora do DAS (se houver) entra na FS12.');
    h += derivado('estat-receita', estatisticasReceitaHtml);
    return h;
  };

  function receitaFixaHtml() {
    var mix = estado.receitas.fixa.mix || {};
    var h = '<div class="campos">' + campo('Receita mensal total', inp('receitas.fixa.total')) + '</div><div class="campos">';
    M.TIPOS_RECEITA.forEach(function (t) { h += campo(t.rotulo + ' (%)', inp('receitas.fixa.mix.' + t.id, { tipo: 'numero', ph: '0' })); });
    var soma = M.TIPOS_RECEITA.reduce(function (a, t) { return a + n0(mix[t.id]); }, 0);
    h += '</div><div class="linha-acoes"><button class="btn" data-acao="aplicar-fixa">Aplicar aos meses projetados</button><span class="small muted">Composição soma ' + soma.toFixed(1).replace('.', ',') + '%. Meses realizados não são alterados.</span></div>';
    return h;
  }

  function cenariosReceitaHtml(modo) {
    return '<div class="campos">' +
      campo('Cenário usado na análise', sel('analise.cenarioReceita', [['base', 'Base (valores digitados)'], ['conservador', 'Conservador'], ['otimista', 'Otimista'], ['personalizado', 'Personalizado']])) +
      campo('Conservador (% sobre a projeção)', inp('analise.fatorConservador', { tipo: 'numero' })) +
      campo('Otimista (% sobre a projeção)', inp('analise.fatorOtimista', { tipo: 'numero' })) +
      campo('Personalizado (%)', inp('analise.fatorPersonalizado', { tipo: 'numero' })) +
      campo('Crescimento anual (%)', inp('analise.crescimentoAnual', { tipo: 'numero' }), 'Aplicado de forma composta aos meses projetados.') +
      '</div>';
  }

  function tratamentoHtml() {
    var T = PL.tratamentos || PL_PADRAO.tratamentos;
    var opS = Object.keys(T.simples).map(function (k) { return [k, T.simples[k]]; });
    var opP = Object.keys(T.presumido).map(function (k) { return [k, T.presumido[k]]; });
    var linhas = M.TIPOS_RECEITA.map(function (t) {
      return '<tr>' + td(esc(t.rotulo)) + td(sel('receitas.tratamento.' + t.id + '.simples', opS, { aria: 'Simples: ' + t.rotulo })) + td(sel('receitas.tratamento.' + t.id + '.presumido', opP, { aria: 'Presumido: ' + t.rotulo })) + '</tr>';
    });
    return tabela(['Tipo de receita', 'Simples Nacional', 'Lucro Presumido'], linhas);
  }

  function receitaMensalHtml() {
    var e = estado, k0 = n0(e.analise.mesInicioPlanejamento) || 1;
    var campos = M.TIPOS_RECEITA.map(function (t) { return [t.id, t.rotulo.replace(' (sem detalhamento)', '')]; }).concat([['cancelamentos', 'Canceladas/estornadas'], ['descontos', 'Descontos incondicionais'], ['outrasReceitas', 'Outras receitas'], ['recebida', 'Recebida no mês'], ['aReceber', 'Faturada, não recebida']]);
    var linhas = [];
    for (var k = 1; k <= 12; k++) {
      var l = '<tr class="' + (k < k0 ? 'realizado' : '') + '"><td class="nowrap"><strong>' + M.MESES[k - 1] + '/' + String(e.analise.ano).slice(2) + '</strong><br><span class="xs muted">' + (k < k0 ? 'realizado' : 'projeção') + '</span></td>';
      campos.forEach(function (c) { l += td(inp('receitas.meses.' + (k - 1) + '.' + c[0], { aria: c[1] + ' de ' + M.MESES[k - 1] })); });
      l += '<td class="num" data-rb="' + k + '">' + brl(rbMes(k)) + '</td>';
      l += '<td class="acao">' + (k < 12 ? '<button class="btn btn-mini" data-duplicar-mes="' + k + '" title="Copiar para o mês seguinte">Duplicar ↓</button> <button class="btn btn-mini" data-copiar-seguintes="' + k + '" title="Copiar para todos os meses seguintes">Até dez</button>' : '') + '</td></tr>';
      linhas.push(l);
    }
    return tabela([{ t: 'Mês' }].concat(campos.map(function (c) { return { t: c[1] }; })).concat([{ t: 'Receita bruta', num: true }, { t: '' }]), linhas, { cls: 'tabela-compacta' });
  }
  function rbMes(k) {
    var m = estado.receitas.meses[k - 1];
    var b = M.TIPOS_RECEITA.reduce(function (a, t) { return a + Math.max(0, n0(m[t.id])); }, 0);
    return Math.max(0, b - n0(m.cancelamentos) - n0(m.descontos));
  }

  function historicoHtml() {
    var ano = estado.analise.ano;
    var linhas = [];
    for (var t = 0; t <= 12; t++) {
      linhas.push('<tr>' + td('<strong>' + M.rotuloT(t, ano) + '</strong>' + (t === 0 ? '<br><span class="xs muted">só regras de 2027+</span>' : '')) +
        td(inp('receitas.historico.' + t + '.receita', { aria: 'Receita ' + M.rotuloT(t, ano) })) + td(inp('receitas.historico.' + t + '.folha', { aria: 'Folha ' + M.rotuloT(t, ano) })) +
        td(inp('receitas.historico.' + t + '.fgts', { aria: 'FGTS ' + M.rotuloT(t, ano) })) + td(inp('receitas.historico.' + t + '.cpp', { aria: 'CPP ' + M.rotuloT(t, ano) })) + '</tr>');
    }
    return tabela(['Mês', 'Receita bruta', 'Folha (pró-labore + salários)', 'FGTS', 'CPP fora do DAS'], linhas, { cls: 'tabela-compacta' });
  }

  function estatisticasReceitaHtml() {
    var S = simAtual(), ctx = S.ctx, res = S.res;
    var rbs = res.meses.map(function (m) { return m.rb; });
    var acum = 0;
    var mesesAtivos = res.meses.filter(function (m) { return m.ativo; });
    var media = mesesAtivos.length ? mesesAtivos.reduce(function (a, m) { return a + m.rb; }, 0) / mesesAtivos.length : 0;
    var dp = Math.sqrt(mesesAtivos.reduce(function (a, m) { return a + Math.pow(m.rb - media, 2); }, 0) / Math.max(1, mesesAtivos.length));
    var imax = rbs.indexOf(Math.max.apply(null, rbs)), imin = 0, vmin = Infinity;
    mesesAtivos.forEach(function (m) { if (m.rb < vmin) { vmin = m.rb; imin = m.k - 1; } });
    var ult12 = M.soma(ctx.rbT.slice(1, 13));
    var anoTot = M.soma(rbs);
    var cresc = ult12 > 0 ? anoTot / ult12 - 1 : null;
    var linhas = res.meses.map(function (m, i) {
      acum += m.rb;
      var ant = i > 0 ? res.meses[i - 1].rb : (ctx.rbT[12] || 0);
      return '<tr class="' + (m.realizado ? 'realizado' : '') + '">' + td(m.rotulo) + tdn(brl(m.rb)) + tdn(brl(acum)) + tdn(brl(m.rbt12)) + td(m.janela && m.janela.tipo !== 'consolidada' ? '<span class="selo selo-info">anualizada</span>' : '') + tdn(ant > 0 ? pct(m.rb / ant - 1, 1) : '—') + tdn(m.realizado ? '—' : pct((ctx.meses[i].fatorCenario || 1) - 1, 1)) + '</tr>';
    });
    var h = '<div class="kpis">' + kpi('Receita do ano', brl0(anoTot), 'Cenário: ' + ctx.cenarioReceita) + kpi('Receita dos 12 meses anteriores', brl0(ult12), 'Histórico informado') + kpi('Média mensal', brl0(media), 'Desvio padrão ' + brl0(dp)) +
      kpi('Crescimento sobre o ano anterior', cresc === null ? '—' : pct(cresc, 1), '') + kpi('Maior mês', res.meses[imax].rotulo, brl0(rbs[imax])) + kpi('Menor mês', res.meses[imin].rotulo, brl0(vmin === Infinity ? 0 : vmin)) +
      kpi('Variação sazonal', media > 0 ? pct(dp / media, 1) : '—', 'Coeficiente de variação') + '</div>';
    h += tabela(['Mês', { t: 'Receita bruta', num: true }, { t: 'Acumulada no ano', num: true }, { t: 'RBT12 (faixa)', num: true }, '', { t: 'Var. mensal', num: true }, { t: 'Ajuste do cenário', num: true }], linhas, { cls: 'tabela-compacta' });
    return bloco('Resumo e projeção dos 12 meses', h, 'A RBT12 anualizada (início de atividade) define faixa e alíquota; não é receita efetivamente recebida.');
  }

  // ------------------------------------------------------------ despesas

  function categoriasOp() {
    return M.CATEGORIAS_DESPESA.map(function (g) { return { grupo: g.grupo, itens: g.itens.map(function (it) { return [it[0], it[1]]; }) }; });
  }

  RENDER.despesas = function () {
    var h = '<div class="cabecalho-painel"><div><h2>Despesas</h2><p>Despesas pessoais ficam separadas das empresariais. No Simples e no Presumido, despesas não reduzem tributos: afetam lucro, caixa e distribuição. No Lucro Real, só as dedutíveis e documentadas reduzem IRPJ e CSLL.</p></div></div>';
    h += bloco('Adicionar despesa', '<div class="linha-acoes"><select id="nova-despesa-cat" aria-label="Categoria da nova despesa">' + categoriasOp().map(function (g) { return '<optgroup label="' + esc(g.grupo) + '">' + g.itens.map(function (it) { return '<option value="' + it[0] + '">' + esc(it[1]) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select><button class="btn btn-primario" data-acao="adicionar-despesa">Adicionar despesa</button></div>');
    var lista = estado.despesas.map(function (d, i) { return despesaHtml(d, i); }).join('');
    h += bloco('Despesas cadastradas (' + estado.despesas.length + ')', lista ? '<div class="lista-itens">' + lista + '</div>' : '<div class="aviso">Nenhuma despesa cadastrada. Sem despesas, lucro e caixa ficam superestimados e o Lucro Real não pode ser estimado.</div>');
    h += derivado('resumo-despesas', resumoDespesasHtml);
    return h;
  };

  function despesaHtml(d, i) {
    var cat = M.CATEGORIA_POR_ID[d.categoria] || {};
    var p = 'despesas.' + i + '.';
    var tipo = cat.tipo;
    var h = '<article class="item"><div class="item-topo"><span class="titulo-item">' + esc(d.nome || cat.rotulo || 'Despesa') + ' <span class="muted xs">' + esc(cat.grupo || '') + '</span></span><span class="linha-acoes">' +
      (d.natureza === 'pessoal' || tipo === 'pessoal' ? selo('Pessoal', 'info') : (d.natureza === 'mista' ? selo('Mista', 'alerta') : selo('Empresarial', 'neutro'))) +
      (tipo === 'ativo' ? selo('Ativo: deprecia', 'neutro') : '') + (tipo === 'principal' ? selo('Principal: só caixa', 'neutro') : '') + (tipo === 'juros' ? selo('Despesa financeira', 'neutro') : '') +
      (d.documento !== 'sim' && tipo !== 'pessoal' ? selo('Sem documento', 'alerta') : '') +
      (d.tratamento === 'nao_confirmado' && tipo !== 'pessoal' && d.natureza !== 'pessoal' ? selo('Tratamento não confirmado', 'neutro') : '') +
      '<button class="btn btn-mini" data-duplicar-despesa="' + i + '">Duplicar</button><button class="btn btn-mini btn-perigo" data-remover-despesa="' + i + '">Remover</button></span></div>';
    h += '<div class="campos">' +
      campo('Nome', inp(p + 'nome', { tipo: 'texto' })) +
      campo('Categoria', sel(p + 'categoria', categoriasOp())) +
      campo(d.tipoValor === 'variavel' ? 'Valor (variável — veja abaixo)' : 'Valor mensal (R$)', inp(p + 'valor', { dis: d.tipoValor === 'variavel' })) +
      campo('Recorrência', sel(p + 'recorrencia', [['mensal', 'Mensal'], ['unica', 'Única'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral'], ['anual', 'Anual']])) +
      campo('Natureza', sel(p + 'natureza', [['empresarial', 'Empresarial'], ['pessoal', 'Pessoal'], ['mista', 'Mista']])) +
      (d.natureza === 'mista' ? campo('Uso profissional (%)', inp(p + 'pctProfissional', { tipo: 'numero' })) : '') +
      (tipo === 'transporte' ? campo('Titularidade do veículo', sel(p + 'titularidade', [['', '—'], ['pj', 'Empresa'], ['leasing_pj', 'Leasing da empresa'], ['pf', 'Pessoa física'], ['terceiros', 'Terceiros/aplicativo']])) + campo('Uso pessoal (%)', inp(p + 'usoPessoalPct', { tipo: 'numero' }), 'Parcela pessoal sai da empresa.') : '') +
      (tipo === 'terceirizacao' ? campo('Vínculo', sel(p + 'vinculo', [['', 'Terceirizado (PJ/serviço)'], ['clt', 'Empregado CLT']]), 'CLT deve ser cadastrado na folha; aqui é ignorado.') : '') +
      '</div>';
    if (d.tipoValor === 'variavel') {
      h += '<div class="campos">';
      for (var k = 1; k <= 12; k++) h += campo(M.MESES[k - 1], inp(p + 'valoresMensais.' + (k - 1)));
      h += '</div>';
    }
    h += '<details><summary>Mais campos: período, documento, tratamento, parcelas, reajuste, corte</summary><div class="campos">' +
      campo('Mês inicial', sel(p + 'mesInicial', mesesOp(), { conv: 'int' })) +
      campo('Mês final', sel(p + 'mesFinal', mesesOp(), { conv: 'int' })) +
      campo('Valor', sel(p + 'tipoValor', [['fixo', 'Fixo'], ['variavel', 'Variável por mês']])) +
      campo('Documento comprobatório', sel(p + 'documento', [['sim', 'Disponível'], ['parcial', 'Parcial'], ['nao', 'Não disponível']])) +
      campo('Tratamento tributário', sel(p + 'tratamento', [['confirmado', 'Confirmado'], ['nao_confirmado', 'Não confirmado'], ['inaplicavel', 'Inaplicável']])) +
      (tipo === 'ativo' ? campo('Vida útil (anos)', inp(p + 'vidaUtilAnos', { tipo: 'numero', ph: '10' }), 'Depreciação linear no lucro contábil.') : '') +
      campo('Parcela atual', inp(p + 'parcelaAtual', { tipo: 'numero' })) + campo('Total de parcelas', inp(p + 'totalParcelas', { tipo: 'numero' })) +
      campo('Reajuste (%)', inp(p + 'reajustePct', { tipo: 'numero' })) + campo('Reajuste a partir do mês', sel(p + 'reajusteMes', [['', '—']].concat(mesesOp()), { conv: 'int' })) +
      campo('Corte planejado a partir do mês', sel(p + 'corteMes', [['', '—']].concat(mesesOp()), { conv: 'int' })) + campo('Novo valor após o corte', inp(p + 'corteValorNovo')) +
      campo('Gera crédito de PIS/Cofins (Lucro Real)?', sel(p + 'geraCredito', [['', 'Padrão da categoria'], ['sim', 'Sim'], ['nao', 'Não']])) +
      campo('Despesa ajustável?', sel(p + 'ajustavel', [['false', 'Não'], ['true', 'Sim, é modificável']])) +
      campo('Observações', inp(p + 'observacoes', { tipo: 'texto' }), '', 'largo') + '</div></details>';
    return h + '</article>';
  }

  function resumoDespesasHtml() {
    var S = simAtual(), ctx = S.ctx;
    var grupos = {}, totPJ = 0, totPes = 0, capex = 0, princ = 0, juros = 0, deprec = 0;
    ctx.despesas.forEach(function (D) {
      Object.keys(D.porGrupo).forEach(function (g) { grupos[g] = (grupos[g] || 0) + D.porGrupo[g]; });
      totPJ += D.operacional; totPes += D.pessoal; capex += D.ativo; princ += D.principal; juros += D.juros; deprec += D.depreciacao;
    });
    var linhas = Object.keys(grupos).map(function (g) { return '<tr>' + td(esc(g)) + tdn(brl(grupos[g])) + '</tr>'; });
    linhas.push('<tr>' + td('Aquisição de ativos (caixa; deprecia no resultado)') + tdn(brl(capex)) + '</tr>');
    linhas.push('<tr>' + td('Amortização de principal (só caixa)') + tdn(brl(princ)) + '</tr>');
    linhas.push('<tr>' + td('Depreciação estimada no ano') + tdn(brl(deprec)) + '</tr>');
    linhas.push('<tr>' + td('Despesas pessoais (fora da empresa)') + tdn(brl(totPes)) + '</tr>');
    var h = tabela(['Grupo', { t: 'Total anual', num: true }], linhas);
    // Efeito dos cortes planejados: financeiro × tributário
    var temCorte = estado.despesas.some(function (d) { return n0(d.corteMes) >= 1; });
    if (temCorte) {
      var semCorte = JSON.parse(JSON.stringify(estado));
      semCorte.despesas.forEach(function (d) { d.corteMes = ''; });
      var c2 = M.prepararContexto(semCorte, parametrosAno());
      var r2 = M.simular(c2, { regime: S.regime, proLabore: c2.proLaborePlanoAtual });
      var fin = M.r2((r2.anual.despesasOperacionais + r2.anual.juros + r2.anual.ativoImobilizado + r2.anual.principal) - (S.res.anual.despesasOperacionais + S.res.anual.juros + S.res.anual.ativoImobilizado + S.res.anual.principal));
      var trib = M.r2(r2.anual.custoTotal - S.res.anual.custoTotal);
      h += '<div class="aviso"><strong>Cortes planejados:</strong> efeito financeiro de ' + brl(fin) + ' no ano; efeito tributário de ' + brl(trib) + ' (' + nomeRegime(S.regime) + '). ' + (Math.abs(trib) < 0.01 ? 'Neste regime, cortar despesa não reduz tributo.' : '') + '</div>';
    }
    var ajust = estado.despesas.filter(function (d) { return String(d.ajustavel) === 'true'; });
    if (ajust.length) {
      var semAj = JSON.parse(JSON.stringify(estado));
      semAj.despesas = semAj.despesas.filter(function (d) { return String(d.ajustavel) !== 'true'; });
      var linhasAj = ['simples', 'presumido', 'real'].map(function (rg) {
        var cA = M.prepararContexto(estado, parametrosAno()), cB = M.prepararContexto(semAj, parametrosAno());
        var rA = M.simular(cA, { regime: rg, proLabore: cA.proLaborePlanoAtual }), rB = M.simular(cB, { regime: rg, proLabore: cB.proLaborePlanoAtual });
        var finA = rA.anual.despesasOperacionais + rA.anual.juros + rA.anual.ativoImobilizado + rA.anual.principal;
        var finB = rB.anual.despesasOperacionais + rB.anual.juros + rB.anual.ativoImobilizado + rB.anual.principal;
        return '<tr>' + td(nomeRegime(rg)) + tdn(brl(finA - finB)) + tdn(sinal(rB.anual.custoTotal - rA.anual.custoTotal), classeSinal(rB.anual.custoTotal - rA.anual.custoTotal)) + '</tr>';
      });
      h += '<p class="small"><strong>Se as ' + ajust.length + ' despesa(s) marcadas como ajustáveis fossem eliminadas:</strong></p>' + tabela(['Regime', { t: 'Efeito financeiro (gasto evitado)', num: true }, { t: 'Efeito tributário (Δ custo total)', num: true }], linhasAj, { cls: 'tabela-compacta' }) + '<p class="xs muted">No Lucro Real, cortar despesa dedutível aumenta o IRPJ/CSLL; no Simples e no Presumido, o tributo não muda. Despesas não são variáveis de decisão da otimização tributária.</p>';
    }
    return bloco('Resumo das despesas', h, 'Diferencia despesa operacional, juros, principal da dívida e aquisição de ativos. Efeito financeiro e efeito tributário aparecem separados.');
  }

  // ------------------------------------------------------------ tributos atuais

  RENDER.tributos = function () {
    var h = '<div class="cabecalho-painel"><div><h2>Tributos e obrigações atuais</h2><p>Pagamentos informados são comparados com os valores calculados para o plano atual. Um DARF só é atribuído a um tributo quando o código de receita é reconhecido.</p></div></div>';
    var codigos = PL_PADRAO.codigosReceita;
    var linhas = estado.tributosPagos.map(function (p, i) {
      var pre = 'tributosPagos.' + i + '.';
      var cod = String(p.codigoReceita || '').replace(/\D/g, '');
      var desc = p.tributo === 'DARF' ? (codigos[cod] ? codigos[cod].descricao : (cod ? 'Código não reconhecido' : 'Informe o código')) : '';
      return '<tr>' + td(sel(pre + 'tributo', [['DAS', 'DAS'], ['INSS', 'INSS descontado do pró-labore'], ['CPP', 'Contribuição patronal'], ['FGTS', 'FGTS'], ['IRRF', 'IRRF sobre pró-labore'], ['DARF', 'DARF'], ['ISS', 'ISS fora do DAS'], ['RETENCAO', 'Retenção sofrida'], ['OUTRO', 'Outro']], { aria: 'Tributo' })) +
        td(inp(pre + 'valor', { aria: 'Valor' })) + td(sel(pre + 'competencia', mesesOp(), { conv: 'int', aria: 'Competência' })) + td(inp(pre + 'dataPagamento', { tipo: 'data' })) +
        td(inp(pre + 'codigoReceita', { tipo: 'texto', aria: 'Código de receita', ph: p.tributo === 'DARF' ? 'obrigatório' : '' }) + (desc ? '<div class="xs muted">' + esc(desc) + '</div>' : '')) +
        td(inp(pre + 'orgao', { tipo: 'texto', aria: 'Órgão' })) + td(sel(pre + 'natureza', [['pago', 'Pagamento'], ['retido', 'Retenção'], ['provisionado', 'Provisão']], { aria: 'Natureza' })) +
        td(sel(pre + 'confirmado', [['sim', 'Confirmado'], ['nao', 'Não confirmado']], { aria: 'Situação' })) + td('<button class="btn btn-mini btn-perigo" data-remover-tributo="' + i + '">Remover</button>', 'acao') + '</tr>';
    });
    h += bloco('Pagamentos, retenções e provisões', (linhas.length ? tabela(['Tributo', 'Valor', 'Competência', 'Pagamento', 'Código de receita', 'Órgão', 'Natureza', 'Situação', ''], linhas, { cls: 'tabela-compacta' }) : '<div class="aviso">Nenhum pagamento informado.</div>') + '<div class="linha-acoes"><button class="btn" data-acao="adicionar-tributo">Adicionar pagamento</button></div>');
    h += derivado('conciliacao', conciliacaoHtml);
    return h;
  };

  function conciliacaoHtml() {
    var S = simAtual(), c = S.conc;
    var linhas = c.linhas.map(function (l) {
      return '<tr>' + td(l.rotulo) + td(l.tributo) + tdn(brl(l.informado)) + tdn(l.calculado === null ? '—' : brl(l.calculado)) + tdn(l.diferenca === null ? '—' : sinal(l.diferenca), l.diverge ? 'negativo' : '') + td(l.diverge ? selo('Divergente', 'alerta') : (l.calculado === null ? selo('Sem cálculo', 'neutro') : selo('Confere', 'ok'))) + '</tr>';
    });
    var h = linhas.length ? tabela(['Competência', 'Tributo', { t: 'Informado', num: true }, { t: 'Calculado', num: true }, { t: 'Diferença', num: true }, 'Situação'], linhas) : '<p class="muted small">Sem pagamentos com competência e valor para conciliar.</p>';
    if (c.naoAtribuidos.length) h += '<div class="aviso atencao">' + c.naoAtribuidos.length + ' DARF(s) sem código reconhecido não foram atribuídos a nenhum tributo.</div>';
    return bloco('Conciliação: informado × calculado (plano atual)', h, 'Divergência = diferença acima de R$ 10 e de 1%. O simulador não presume que os pagamentos informados estejam corretos.');
  }

  // ------------------------------------------------------------ pró-labore e folha

  RENDER.folha = function () {
    var e = estado, k0 = n0(e.analise.mesInicioPlanejamento) || 1;
    var h = '<div class="cabecalho-painel"><div><h2>Pró-labore e folha de pagamento</h2><p>Aumentar o pró-labore afeta ao mesmo tempo o caixa da empresa, o INSS, o IRPF e o fator "r" dos meses seguintes. Somente valores efetivamente pagos e informados no eSocial entram no fator "r".</p></div></div>';
    h += bloco('Pró-labore do médico analisado', '<div class="campos">' +
      campo('Pró-labore bruto mensal atual', inp('folha.proLaboreAtual')) +
      campo('Início do pró-labore', inp('folha.inicioProLabore', { tipo: 'data' })) +
      campo('Pagamento comprovado (recibos/extratos)?', sel('folha.evidenciaPagamento', [['sim', 'Sim'], ['parcial', 'Parcialmente'], ['nao', 'Não']])) +
      campo('Há múltiplas fontes pagadoras?', sel('folha.multiplasFontes', SN)) + '</div>' + derivado('folha-mensal', folhaMensalHtml));
    h += bloco('Empregados, outros sócios e autônomos', pessoasHtml(), 'Salários, 13º (nov/dez), férias (1/3) e FGTS entram na folha do fator "r". No Presumido e no Real, há CPP de 20% + RAT + terceiros.');
    h += bloco('Parâmetros da busca de pró-labore', '<div class="campos">' +
      campo('Incremento da busca', sel('analise.incrementoProLabore', [['100', 'R$ 100'], ['250', 'R$ 250'], ['500', 'R$ 500'], ['1000', 'R$ 1.000']].concat(['100', '250', '500', '1000'].indexOf(String(e.analise.incrementoProLabore)) < 0 ? [[String(e.analise.incrementoProLabore), brl(n0(e.analise.incrementoProLabore))]] : []))) +
      campo('Outro incremento (R$)', '<input type="text" id="incremento-livre" class="num" inputmode="decimal" placeholder="ex.: 750">', 'Substitui a opção acima ao sair do campo.') +
      campo('Pró-labore mínimo operacional', inp('analise.proLaboreMinimo', { ph: 'salário mínimo' })) +
      campo('Pró-labore máximo', inp('analise.proLaboreMaximo', { ph: 'automático' }), 'Também limitado pelo caixa disponível.') +
      campo('Variação entre meses', sel('analise.variacaoProLabore', [['livre', 'Livre (plano mensal)'], ['uniforme', 'Somente valor uniforme']])) +
      campo('Fim do horizonte', sel('analise.fimHorizonte', [['sustentar', 'Sustentar o Anexo III no mês seguinte'], ['ignorar', 'Ignorar efeitos após dezembro']])) +
      campo('Materialidade (R$/ano)', inp('analise.materialidade'), 'Economias menores não justificam mudança.') +
      '</div><p class="small muted">Diferenças que o modelo respeita: pró-labore declarado ≠ efetivamente pago; base previdenciária limitada ao teto; folha do fator "r" inclui salários e FGTS; distribuição de lucros nunca entra na folha.</p>');
    return h;
  };

  function folhaMensalHtml() {
    var S = simAtual(), res = S.res, e = estado, k0 = S.ctx.k0;
    var linhas = res.meses.map(function (m, i) {
      var realizado = i + 1 < k0;
      return '<tr class="' + (realizado ? 'realizado' : '') + '">' + td('<strong>' + m.rotulo + '</strong><br><span class="xs muted">' + (realizado ? 'realizado' : 'plano') + '</span>') +
        td(inp('folha.proLaboreMes.' + i, { ph: fmtInput(e.folha.proLaboreAtual) || '0,00', aria: 'Pró-labore planejado ' + m.rotulo })) +
        td(inp('folha.pagoMes.' + i, { dis: !realizado, ph: realizado ? '' : '—', aria: 'Pago ' + m.rotulo })) +
        td(inp('folha.inssDescontadoMes.' + i, { aria: 'INSS descontado ' + m.rotulo })) + td(inp('folha.irrfDescontadoMes.' + i, { aria: 'IRRF descontado ' + m.rotulo })) +
        tdn(brl(m.proLabore)) + tdn(brl(m.inss)) + tdn(brl(m.irrf)) + tdn(brl(m.folhaTerceiros + m.fgts)) + tdn(pctR(m.fatorR)) + td(anexoTag(m.anexo)) + '</tr>';
    });
    var tot = res.anual;
    return tabela(['Mês', 'Pró-labore planejado', 'Efetivamente pago', 'INSS descontado (informado)', 'IRRF descontado (informado)', { t: 'Pró-labore considerado', num: true }, { t: 'INSS calculado', num: true }, { t: 'IRRF calculado', num: true }, { t: 'Folha de terceiros + FGTS', num: true }, { t: 'Fator "r"', num: true }, 'Anexo'], linhas, {
      cls: 'tabela-compacta', rodape: '<tr><td colspan="5">Total do ano</td>' + tdn(brl(tot.proLabore)) + tdn(brl(tot.inss)) + tdn(brl(tot.irrf)) + tdn(brl(tot.folhaTerceiros + tot.fgts)) + '<td colspan="2"></td></tr>'
    });
  }

  function pessoasHtml() {
    var linhas = estado.folha.pessoas.map(function (p, i) {
      var pre = 'folha.pessoas.' + i + '.';
      return '<tr>' + td(inp(pre + 'nome', { tipo: 'texto', aria: 'Nome' })) + td(sel(pre + 'tipo', [['clt', 'Empregado CLT'], ['socio', 'Outro sócio (pró-labore)'], ['autonomo', 'Autônomo (RPA)']], { aria: 'Tipo' })) +
        td(inp(pre + 'salario', { aria: 'Remuneração mensal' })) + td(sel(pre + 'mesInicio', mesesOp(), { conv: 'int', aria: 'Início' })) + td(sel(pre + 'mesFim', mesesOp(), { conv: 'int', aria: 'Fim' })) +
        td(p.tipo === 'clt' ? chk(pre + 'decimoTerceiro', '13º') : '—') + td(p.tipo === 'clt' ? chk(pre + 'ferias', 'férias') : '—') + td(p.tipo === 'clt' ? sel(pre + 'mesFerias', mesesOp(), { conv: 'int', aria: 'Mês das férias' }) : '—') +
        td('<button class="btn btn-mini btn-perigo" data-remover-pessoa="' + i + '">Remover</button>', 'acao') + '</tr>';
    });
    return (linhas.length ? tabela(['Nome', 'Tipo', 'Remuneração mensal', 'Início', 'Fim', '13º', 'Férias', 'Mês das férias', ''], linhas, { cls: 'tabela-compacta' }) : '<p class="muted small">Nenhuma pessoa cadastrada.</p>') + '<div class="linha-acoes"><button class="btn" data-acao="adicionar-pessoa">Adicionar pessoa</button></div>';
  }

  // ------------------------------------------------------------ pessoa física

  RENDER.pf = function () {
    var h = '<div class="cabecalho-painel"><div><h2>Pessoa física</h2><p>Módulo separado dos tributos da empresa. IRRF e carnê-leão são antecipações; o imposto efetivo é o devido no ajuste anual. Restituição não é economia tributária.</p></div></div>';
    h += bloco('Família e deduções', '<div class="campos">' +
      campo('Dependentes', inp('pf.dependentes', { tipo: 'numero' })) +
      campo('Pensão alimentícia judicial (R$/mês)', inp('pf.pensaoMensal')) +
      campo('Despesas médicas dedutíveis (ano)', inp('pf.despesasMedicasAnual'), 'Inclui plano de saúde do titular e dependentes.') +
      campo('Despesas com instrução (ano)', inp('pf.instrucaoAnual'), 'Limite por pessoa aplicado automaticamente.') +
      campo('Previdência privada PGBL (ano)', inp('pf.pgblAnual'), 'Limitada a 12% dos rendimentos tributáveis.') +
      campo('Opção de declaração', sel('pf.opcaoDeclaracao', [['auto', 'A mais vantajosa'], ['completa', 'Completa'], ['simplificada', 'Simplificada']])) + '</div>');
    h += bloco('Outras rendas e retenções', '<div class="campos">' +
      campo('Outros rendimentos tributáveis (ano)', inp('pf.outrasRendasTributaveisAnual'), 'Salário CLT, aluguéis etc.') +
      campo('IR retido nessas fontes (ano)', inp('pf.irRetidoOutrasFontesAnual')) +
      campo('Salário de contribuição já usado em outras fontes (R$/mês)', inp('pf.salarioContribuicaoOutrasFontesMensal'), 'Reduz o teto disponível do INSS do pró-labore.') +
      campo('INSS descontado em outras fontes (ano)', inp('pf.inssOutrasFontesAnual')) +
      campo('Rendimentos de carnê-leão (ano)', inp('pf.carneLeaoRendimentosAnual')) +
      campo('Carnê-leão pago (ano)', inp('pf.carneLeaoPagoAnual')) +
      campo('Rendimentos isentos (ano)', inp('pf.rendimentosIsentosAnual'), 'Exclua poupança e indenizações (fora da base do IRPFM).') +
      campo('Rendimentos de tributação exclusiva (ano)', inp('pf.rendimentosExclusivosAnual')) +
      campo('IR exclusivo/definitivo pago (ano)', inp('pf.irExclusivoAnual')) +
      campo('Dividendos de outras empresas (ano)', inp('pf.dividendosOutrasEmpresasAnual')) +
      campo('IR retido sobre esses dividendos (ano)', inp('pf.irRetidoDividendosOutrasAnual')) +
      campo('Todas as rendas pessoais foram informadas?', sel('pf.outrasFontesInformadas', SN)) + '</div>');
    h += derivado('irpf', irpfHtml);
    return h;
  };

  function irpfHtml() {
    var S = simAtual(), A = S.res.anual, I = A.irpf, F = A.irpfm;
    function col(o) { return [brl(o.deducoes), brl(o.base), o.faixa, brl(o.impostoTabela), brl(o.reducao), brl(o.devido)]; }
    var c = col(I.completa), s = col(I.simplificada);
    var rot = ['Deduções', 'Base de cálculo', 'Faixa', 'Imposto pela tabela anual', 'Redução (Lei 15.270)', 'Imposto devido'];
    var linhas = rot.map(function (r, i) { return '<tr>' + td(r) + tdn(c[i], I.escolhida.opcao === 'completa' ? 'positivo' : '') + tdn(s[i], I.escolhida.opcao === 'simplificada' ? 'positivo' : '') + '</tr>'; });
    var h = '<p class="small">Rendimentos tributáveis no ano: <strong>' + brl(I.tributaveis) + '</strong>. Opção ' + (estado.pf.opcaoDeclaracao === 'auto' ? 'mais vantajosa: ' : 'escolhida: ') + '<strong>' + I.escolhida.opcao + '</strong>.</p>';
    h += tabela(['', { t: 'Completa', num: true }, { t: 'Simplificada', num: true }], linhas);
    h += '<div class="kpis">' + kpi('IRPF anual devido', brl(I.devido), 'Imposto efetivo do ano') + kpi('Antecipado (IRRF + outras fontes)', brl(I.antecipado), 'Pagamentos do mesmo imposto') + kpi(I.saldo >= 0 ? 'Saldo a pagar no ajuste' : 'Restituição estimada', brl(Math.abs(I.saldo)), 'Diferença entre antecipado e devido') + '</div>';
    var hm = '';
    if (F.ativo) {
      hm = '<dl class="small lista-def">' +
        '<dt>Rendimentos totais (base)</dt><dd>' + brl(F.rendimentos) + '</dd><dt>Alíquota mínima</dt><dd>' + pct(F.aliquota) + '</dd><dt>Imposto mínimo</dt><dd>' + brl(F.impostoMinimo) + '</dd>' +
        '<dt>(−) IRPF devido e IR exclusivo</dt><dd>' + brl(F.deducoes) + '</dd><dt>(−) Redutor art. 16-B</dt><dd>' + brl(F.redutor) + (F.redutorAplicavel && !S.ctx.demonstracoes ? ' (aplicável, mas exige demonstrações financeiras)' : '') + '</dd><dt>IRPFM adicional devido</dt><dd><strong>' + brl(F.adicional) + '</strong></dd>' +
        '<dt>Retenções sobre dividendos (antecipação)</dt><dd>' + brl(F.retencoes) + '</dd><dt>Saldo do IRPFM</dt><dd>' + brl(F.saldo) + '</dd></dl>';
      if (F.rendimentos <= parametrosAno().irpfm.limiteInferior) hm += '<p class="small muted">Rendimentos abaixo de R$ 600 mil: sem tributação mínima.</p>';
    } else hm = '<p class="small muted">Sem tributação mínima (IRPFM) no ano de ' + estado.analise.ano + '.</p>';
    var irr = S.res.meses.map(function (m) { var d = m.irrfDetalhe; return '<tr>' + td(m.rotulo) + tdn(brl(m.proLabore)) + tdn(brl(m.inss)) + tdn(d ? (d.usaSimplificado ? 'simplificado ' : 'legais ') + brl(d.deducao) : '—') + tdn(d ? brl(d.base) : '—') + tdn(d ? brl(d.impostoTabela) : '—') + tdn(d ? brl(d.reducao) : '—') + tdn(brl(m.irrf)) + '</tr>'; });
    return '<div class="grade-2">' + bloco('IRPF anual estimado (plano atual)', h) + bloco('Tributação mínima de altas rendas (IRPFM)', hm, 'Lei 15.270/2025. Regulamentação em evolução: resultado condicionado à validação.') + '</div>' +
      bloco('IRRF mensal sobre o pró-labore', tabela(['Mês', { t: 'Pró-labore', num: true }, { t: 'INSS', num: true }, { t: 'Dedução usada', num: true }, { t: 'Base', num: true }, { t: 'Imposto pela tabela', num: true }, { t: 'Redução', num: true }, { t: 'IRRF', num: true }], irr, { cls: 'tabela-compacta' }), 'A fonte pagadora usa a dedução mais vantajosa: deduções legais (INSS, dependentes, pensão) ou desconto simplificado mensal. IRRF até R$ 10 não é retido.');
  }

  // ------------------------------------------------------------ distribuição

  RENDER.distribuicao = function () {
    var e = estado, k0 = n0(e.analise.mesInicioPlanejamento) || 1;
    var pol = e.distribuicao.politica;
    var h = '<div class="cabecalho-painel"><div><h2>Distribuição de lucros e dividendos</h2><p>O saldo bancário não é lucro distribuível, e distribuição não é automaticamente isenta. A partir de 2026, pagamentos acima de R$ 50 mil por mês da mesma empresa sofrem retenção de 10%, e o IRPFM alcança rendimentos anuais acima de R$ 600 mil.</p></div></div>';
    h += bloco('Política de distribuição', '<div class="campos">' +
      campo('Periodicidade', sel('distribuicao.politica', [['automatica', 'Automática (todo lucro disponível, mês a mês)'], ['mensal', 'Valor fixo mensal'], ['trimestral', 'Trimestral'], ['anual', 'Anual (dezembro)'], ['manual', 'Manual por mês']])) +
      (pol === 'mensal' ? campo('Valor mensal', inp('distribuicao.valorMensal')) : '') +
      campo('Reter do lucro do ano (%)', inp('distribuicao.percentualReter', { tipo: 'numero' })) +
      campo('Lucros acumulados de anos anteriores', inp('distribuicao.lucrosAcumuladosAnteriores'), 'Somente lucros apurados e não distribuídos.') +
      campo('Saldo de lucros até 2025 com distribuição aprovada até 31/12/2025', inp('distribuicao.saldoTransicao2025'), 'Sem retenção e fora da base do IRPFM se pagos em 2026–2028 conforme o ato (interpretação: validar).') +
      '<div class="campo" style="align-self:end">' + chk('distribuicao.limitarRetencao', 'Limitar a R$ 50 mil/mês por sócio (evita retenção)') + '</div></div>');
    var mesesInp = '';
    if (pol === 'manual' || k0 > 1) {
      var linhas = [];
      for (var k = 1; k <= 12; k++) {
        linhas.push('<tr class="' + (k < k0 ? 'realizado' : '') + '">' + td(M.MESES[k - 1]) + td(k < k0 ? inp('distribuicao.realizadoMes.' + (k - 1), { aria: 'Distribuição realizada ' + M.MESES[k - 1] }) : '—') + td(pol === 'manual' ? inp('distribuicao.manualMes.' + (k - 1), { aria: 'Distribuição planejada ' + M.MESES[k - 1] }) : '—') + '</tr>');
      }
      mesesInp = bloco('Valores por mês', tabela(['Mês', 'Distribuição realizada (meses passados)', 'Distribuição planejada (manual)'], linhas, { cls: 'tabela-compacta' }));
    }
    h += mesesInp + derivado('dist-prev', distribuicaoPrevHtml);
    return h;
  };

  function distribuicaoPrevHtml() {
    var S = simAtual(), res = S.res, A = res.anual;
    var linhas = res.meses.map(function (m) { return '<tr>' + td(m.rotulo) + tdn(brl(m.lucroContabil)) + tdn(brl(m.lucroDistribuivel)) + tdn(brl(m.caixaAntesDistribuicao)) + tdn(brl(m.reservaCaixa)) + tdn(brl(m.distribuicao)) + tdn(brl(m.dividendoMedico)) + tdn(brl(m.retencaoDividendos)) + tdn(brl(m.caixaFinal)) + '</tr>'; });
    var h = tabela(['Mês', { t: 'Lucro contábil', num: true }, { t: 'Lucro distribuível', num: true }, { t: 'Caixa antes', num: true }, { t: 'Reserva necessária', num: true }, { t: 'Distribuição total', num: true }, { t: 'Dividendo do médico', num: true }, { t: 'Retenção 10%', num: true }, { t: 'Caixa final', num: true }], linhas, {
      cls: 'tabela-compacta', rodape: '<tr><td>Ano</td>' + tdn(brl(A.lucroContabil)) + '<td></td><td></td><td></td>' + tdn(brl(A.distribuicao)) + tdn(brl(A.dividendoMedico)) + tdn(brl(A.retencaoDividendos)) + tdn(brl(A.caixaFinalPJ)) + '</tr>'
    });
    var msgs = [];
    msgs.push(S.ctx.escrituracao ? 'Com escrituração: limite = lucros anteriores + lucro contábil acumulado − distribuições.' : 'Sem escrituração: limite = lucro presumido (presunção × receita) − tributos, e nunca acima do lucro estimado.');
    msgs.push('A reserva necessária cobre a reserva mínima e as saídas programadas do restante do ano (pró-labore, investimentos, amortizações).');
    if (A.excessoDistribuicao > 0) msgs.push('Atenção: há distribuição acima do lucro distribuível (' + brl(A.excessoDistribuicao) + ').');
    return bloco('Prévia mês a mês (plano atual)', h + '<ul class="small" style="margin:0;padding-left:1.1em">' + msgs.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>');
  }

  // ------------------------------------------------------------ cenários e otimização

  RENDER.cenarios = function () {
    var h = '<div class="cabecalho-painel"><div><h2>Cenários e otimização</h2><p>Busca o menor custo total em 12 meses (tributos da empresa + INSS + IRPF + IRPFM + custos administrativos), entre os regimes legalmente disponíveis, sem lançamentos fictícios e respeitando o caixa.</p></div>' +
      '<div class="linha-acoes nao-imprimir"><button class="btn btn-primario" data-acao="analisar">' + (analise ? 'Executar novamente' : 'Executar análise') + '</button>' + (analise ? '<button class="btn" data-acao="salvar-cenario">Salvar cenário para comparar</button>' : '') + '</div></div>';
    if (!analise) {
      h += '<div class="aviso">A análise ainda não foi executada. Ela calcula as curvas de custo, o plano de pró-labore recomendado, a comparação de regimes, a sensibilidade e os pontos de equilíbrio.</div>';
      h += comparacaoSalvosHtml();
      return h;
    }
    var a = analise;
    if (analiseDesatualizada) h += '<div class="aviso atencao">Os dados mudaram depois da última análise. Execute novamente para atualizar.</div>';
    h += conclusaoHtml(a);
    h += '<section class="bloco"><header><h3>Custo tributário total × pró-labore mensal</h3><p>Eixo X: pró-labore mensal uniforme nos meses planejados. Eixo Y: custo total ' + (ui.unidade === 'anual' ? 'anual (R$/ano)' : 'médio mensal (R$/mês)') + '. Cada ponto é uma simulação completa do motor.</p></header>' +
      '<div class="linha-acoes nao-imprimir"><label class="check"><input type="radio" name="unidade" value="anual" data-ui-unidade' + (ui.unidade === 'anual' ? ' checked' : '') + '> Anual</label><label class="check"><input type="radio" name="unidade" value="mensal" data-ui-unidade' + (ui.unidade === 'mensal' ? ' checked' : '') + '> Mensal médio</label></div>' +
      '<div class="legenda nao-imprimir" id="legenda-otim"></div><div class="grafico" id="grafico-otim"></div><div id="notas-otim" class="small muted"></div></section>';
    h += planoRecomendadoHtml(a);
    h += bloco('Comparação de cenários (mesmas premissas)', comparacaoHtml(a), 'Diferenças em relação ao cenário atual: valores negativos significam custo menor.');
    if (a.cenariosReceita) h += bloco('Cenários de receita: conservador, base e otimista', cenariosReceitaTabela(a), 'Melhor pró-labore uniforme de cada regime em cada cenário de receita.');
    if (a.equilibrio) h += bloco('Pontos de equilíbrio', equilibrioHtml(a));
    if (a.sensibilidade) h += '<section class="bloco"><header><h3>Análise de sensibilidade</h3><p>' + esc(a.sensibilidade.metodo) + ' Ordenado do maior para o menor impacto.</p></header><div class="grafico" id="grafico-tornado"></div>' + sensibilidadeTabela(a) + '</section>';
    if (a.anoSeguinte) h += bloco('Efeito no ano seguinte (estimativa)', anoSeguinteHtml(a));
    h += bloco('Memória de cálculo do cenário recomendado', memoriaHtml(a.recomendado), 'Fórmulas, parâmetros e valores considerados e excluídos em cada competência.');
    h += bloco('Todos os alertas', listaAlertas(a.alertas));
    h += comparacaoSalvosHtml();
    return h;
  };
  POS.cenarios = function () { desenharOtimizacao(); desenharTornado(); };

  function conclusaoHtml(a) {
    var rec = a.recomendado.anual, atu = a.atual.anual;
    var tipo = a.semVantagemRelevante ? 'atencao' : 'ok';
    var t = a.semVantagemRelevante ?
      'Não há vantagem relevante em mudar: a melhor alternativa encontrada economiza ' + brl(Math.max(0, a.economia)) + ' no ano, abaixo da materialidade de ' + brl(a.materialidade) + '.' :
      'Melhor alternativa encontrada: ' + nomeRegime(a.regimeRecomendado) + ' com pró-labore ' + (a.tipoPlano === 'variavel' ? 'mensal variável' : (a.tipoPlano === 'atual' ? 'do plano atual' : 'uniforme de ' + brl(a.recomendado.proLabore[11]))) + '. Custo total de ' + brl(rec.custoTotal) + ' contra ' + brl(atu.custoTotal) + ' no plano atual: economia projetada de ' + brl(a.economia) + ' no ano.';
    if (a.qualidade.nivel === 'baixa') { tipo = 'atencao'; t += ' Qualidade dos dados baixa: trate como hipótese, não como recomendação.'; }
    return '<div class="aviso ' + tipo + '"><strong>' + esc(t) + '</strong><br><span class="small">' + a.otimalidade.map(esc).join(' ') + ' Tempo de cálculo: ' + a.tempoMs + ' ms, ' + a.avaliacoes + ' simulações.</span></div>';
  }

  function planoRecomendadoHtml(a) {
    var r = a.recomendado, at = a.atual;
    var linhas = r.meses.map(function (m, i) {
      return '<tr class="' + (m.realizado ? 'realizado' : '') + '">' + td(m.rotulo) + tdn(brl(at.proLabore[i])) + tdn(brl(m.proLabore)) + tdn(pctR(m.fatorR)) + td(anexoTag(m.anexo)) + tdn(brl(m.tributosPJ)) + tdn(brl(m.inss)) + tdn(brl(m.irrf)) + tdn(brl(m.dividendoMedico)) + tdn(brl(m.caixaFinal)) + '</tr>';
    });
    var A = r.anual;
    var h = tabela(['Mês', { t: 'Pró-labore atual', num: true }, { t: 'Pró-labore sugerido', num: true }, { t: 'Fator "r"', num: true }, 'Anexo', { t: a.regimeRecomendado === 'simples' ? 'DAS' : 'Tributos PJ', num: true }, { t: 'INSS', num: true }, { t: 'IRRF (antecipação)', num: true }, { t: 'Dividendo', num: true }, { t: 'Caixa final', num: true }], linhas, {
      cls: 'tabela-compacta', rodape: '<tr><td>Ano</td>' + tdn(brl(a.atual.anual.proLabore)) + tdn(brl(A.proLabore)) + '<td></td><td></td>' + tdn(brl(A.tributosPJ)) + tdn(brl(A.inss)) + tdn(brl(A.irrf)) + tdn(brl(A.dividendoMedico)) + tdn(brl(A.caixaFinalPJ)) + '</tr>'
    });
    if (a.tipoPlano === 'variavel') h += '<div class="aviso atencao small">Plano com pró-labore variável entre meses: exige deliberação dos sócios (ata ou alteração contratual), pagamento efetivo em cada mês e transmissão do eSocial/DCTFWeb. Variações sem motivação econômica podem ser questionadas.</div>';
    return bloco('Plano de pró-labore recomendado', h, 'Regime: ' + nomeRegime(a.regimeRecomendado) + '. Meses realizados não são alterados.');
  }

  function comparacaoHtml(a) {
    var linhas = a.cenarios.map(function (c, i) {
      var ehRec = c.nome === 'Cenário otimizado';
      return '<tr class="' + (ehRec ? 'destaque' : '') + '"><td style="min-width:200px"><strong>' + esc(c.nome) + '</strong><br><span class="xs muted">' + esc(c.regra) + '</span></td>' + tdn(brl(c.proLaboreMedio)) + tdn(brl(c.das)) + tdn(brl(c.inss)) + tdn(brl(c.irpf + c.irpfm)) + tdn(brl(c.outros)) + tdn(brl(c.custoAdm)) + tdn('<strong>' + brl(c.custoTotal) + '</strong>') + tdn(brl(c.rendaLiquida)) +
        tdn(c.difMensal === undefined ? '—' : sinal(c.difMensal), c.difMensal === undefined ? '' : classeSinal(c.difMensal)) + tdn(c.difAnual === undefined ? '—' : sinal(c.difAnual), c.difAnual === undefined ? '' : classeSinal(c.difAnual)) + tdn(c.regime === 'simples' ? c.mesesIII + '/' + (c.mesesIII + c.mesesV) : '—') + td(c.viavel ? '' : selo('Caixa insuficiente', 'crit')) + '</tr>';
    });
    return tabela(['Cenário', { t: 'Pró-labore médio', num: true }, { t: 'DAS', num: true }, { t: 'INSS', num: true }, { t: 'IRPF + IRPFM', num: true }, { t: 'Outros tributos', num: true }, { t: 'Custo adm.', num: true }, { t: 'Custo total', num: true }, { t: 'Renda líquida', num: true }, { t: 'Dif. mensal', num: true }, { t: 'Dif. anual', num: true }, { t: 'Meses III', num: true }, ''], linhas, { cls: 'tabela-compacta' });
  }

  function cenariosReceitaTabela(a) {
    var linhas = a.cenariosReceita.map(function (c) {
      var r = c.regimes;
      return '<tr>' + td(c.cenario) + tdn(brl(r.simples.receita)) + ['simples', 'presumido', 'real'].map(function (g) { return tdn(brl(r[g].custo) + '<br><span class="xs muted">PL ' + brl0(r[g].proLabore) + (g === 'simples' ? ' · ' + r[g].mesesIII + ' meses III' : '') + '</span>'); }).join('') + '</tr>';
    });
    return tabela(['Cenário', { t: 'Receita anual', num: true }, { t: 'Simples', num: true }, { t: 'Presumido', num: true }, { t: 'Real (estimativa)', num: true }], linhas);
  }

  function equilibrioHtml(a) {
    var q = a.equilibrio, itens = [];
    var ap = q.aumentoProLabore;
    itens.push(['Aumento de pró-labore para gerar economia líquida', ap.para ? 'Pró-labore uniforme de ' + brl(ap.para) + ' (+' + brl(ap.aumento) + '/mês sobre o atual de ' + brl(ap.de) + ') já reduz o custo em ' + brl(ap.economia) + '/ano.' : 'Nenhum pró-labore uniforme acima do atual (' + brl(ap.de) + ') reduz o custo no horizonte.' + (a.tipoPlano === 'variavel' ? ' A economia só aparece com o plano mensal (concentrando pró-labore nos primeiros meses).' : '')]);
    if (q.fatorR) itens.push(['Custo incremental de atingir o fator "r" (pró-labore uniforme)', 'Com ' + brl(q.fatorR.proLaboreAlvo) + '/mês, ' + q.fatorR.mesesIII + ' mês(es) no Anexo III: DAS cai ' + brl(q.fatorR.economiaDas) + ', INSS + IRPF sobem ' + brl(q.fatorR.custoAdicionalPessoal) + '. Saldo: ' + sinal(q.fatorR.saldo) + (q.fatorR.compensa ? ' (compensa).' : ' (não compensa no ano).')]);
    else itens.push(['Custo incremental de atingir o fator "r"', 'Nenhum pró-labore uniforme da grade leva algum mês ao Anexo III.']);
    if (q.fatorRPlanoRecomendado) itens.push(['Economia de DAS × custos adicionais (plano recomendado vs. pró-labore mínimo)', 'DAS menor em ' + brl(q.fatorRPlanoRecomendado.economiaDas) + '; INSS + IRPF maiores em ' + brl(q.fatorRPlanoRecomendado.custoAdicionalPessoal) + '. Saldo: ' + sinal(q.fatorRPlanoRecomendado.saldo) + ' (' + q.fatorRPlanoRecomendado.mesesIII + ' meses no Anexo III).']);
    itens.push(['Otimizar mês a mês × ano inteiro', 'A otimização míope (cada mês minimiza só o próprio custo) custa ' + brl(q.miope.custo) + '; a anual, ' + brl(q.miope.otimo) + '. Diferença: ' + brl(q.miope.diferenca) + '. O pró-labore de hoje só reduz o DAS dos meses seguintes.']);
    q.regimes.forEach(function (r) {
      itens.push(['Faturamento em que o ' + nomeRegime(r.regime) + ' passaria a valer a pena', r.faturamentoAnual ? 'Cerca de ' + brl0(r.faturamentoAnual) + '/ano (' + pct(r.multiplicador - 1, 0) + ' em relação à receita projetada).' : 'Sem cruzamento entre ' + brl0(r.faixaTestada[0]) + ' e ' + brl0(r.faixaTestada[1]) + ' de receita anual. Na receita atual, a diferença é de ' + brl(r.vantagemNaBase) + ' a favor do ' + nomeRegime(a.regimeRecomendado) + ' (pró-labore uniforme).']);
    });
    return '<div class="grade-2">' + itens.map(function (i) { return '<div class="item"><span class="titulo-item">' + esc(i[0]) + '</span><p class="small">' + esc(i[1]) + '</p></div>'; }).join('') + '</div>';
  }

  function sensibilidadeTabela(a) {
    var linhas = a.sensibilidade.itens.map(function (i) { return '<tr>' + td(esc(i.nome)) + td(esc(i.rotuloBaixo)) + tdn(sinal(i.baixo), classeSinal(i.baixo)) + td(esc(i.rotuloAlto)) + tdn(sinal(i.alto), classeSinal(i.alto)) + '</tr>'; });
    return tabela(['Variável', 'Variação 1', { t: 'Δ custo', num: true }, 'Variação 2', { t: 'Δ custo', num: true }], linhas, { cls: 'tabela-compacta' });
  }

  function anoSeguinteHtml(a) {
    var s = a.anoSeguinte;
    var linhas = [['Plano atual', s.atual], ['Plano recomendado', s.recomendado]].map(function (x) {
      return '<tr>' + td(x[0]) + tdn(brl(x[1].proLabore)) + tdn(brl(x[1].custo)) + tdn(String(x[1].mesesIII)) + tdn(brl(x[1].otimoUniforme.proLabore)) + tdn(brl(x[1].otimoUniforme.custo)) + tdn(String(x[1].otimoUniforme.mesesIII)) + '</tr>';
    });
    return tabela(['Partindo de', { t: 'Pró-labore de dez mantido', num: true }, { t: 'Custo ' + s.ano, num: true }, { t: 'Meses III', num: true }, { t: 'Melhor uniforme ' + s.ano, num: true }, { t: 'Custo', num: true }, { t: 'Meses III', num: true }], linhas) + '<p class="small muted">' + esc(s.premissas) + '</p>';
  }

  function memoriaHtml(res) {
    var mem = res.memoria;
    if (!mem) return '';
    var h = '';
    var fr = mem.fatorR.map(function (f) {
      var comp = f.componentes.map(function (c) { return '<tr>' + td(c.mes + (c.estimado ? ' <span class="selo selo-alerta">estimado</span>' : '')) + tdn(brl(c.receita)) + tdn(c.folhaHistorico !== null ? brl(c.folhaHistorico) : brl(c.proLaboreMedico + c.folhaTerceiros + c.fgts)) + tdn(c.folhaHistorico !== null ? '—' : brl(c.proLaboreMedico)) + tdn(c.folhaHistorico !== null ? '—' : brl(c.folhaTerceiros + c.fgts)) + '</tr>'; }).join('');
      return '<details class="memoria"><summary>' + f.rotulo + ': r = ' + pctR(f.r) + ' → ' + (f.anexo ? 'Anexo ' + f.anexo : '—') + '</summary><div class="conteudo"><div class="formula">Janela: ' + esc(f.janela) + (f.multiplicador !== 1 ? ' · multiplicador de anualização ' + f.multiplicador.toFixed(4).replace('.', ',') : '') + '\nRegra: ' + esc(f.regra) + '\nFS12 = ' + brl(f.fs12) + '   RBT12 = ' + brl(f.rbt12) + '   r = ' + pctR(f.r) + (f.r >= 0.28 ? ' ≥ 28% → Anexo III' : ' < 28% → Anexo V') + '</div>' +
        (comp ? tabela(['Mês', { t: 'Receita', num: true }, { t: 'Folha total', num: true }, { t: 'Pró-labore do médico', num: true }, { t: 'Terceiros + FGTS', num: true }], [comp], { cls: 'tabela-compacta' }) : '') +
        '<p class="xs"><strong>Considerados:</strong> ' + esc(f.incluidos) + '.<br><strong>Excluídos:</strong> ' + esc(f.excluidos) + '.</p></div></details>';
    }).join('');
    if (res.regime === 'simples') {
      var das = mem.das.map(function (d) {
        return d.grupos.map(function (g) { return '<tr>' + td(d.rotulo) + td(esc(g.rotulo)) + td(anexoTag(g.anexo)) + tdn(String(g.faixa)) + tdn(brl(d.rbt12)) + tdn(pct(g.nominal)) + tdn(brl(g.parcelaDeduzir)) + tdn(pct(g.efetiva, 4)) + tdn(brl(g.base)) + tdn(brl(g.valor)) + td(g.issLimitado ? 'ISS limitado a 5%' : (g.semIss ? 'ISS fora do DAS' : '')) + '</tr>'; }).join('');
      });
      h += '<details class="memoria"><summary>DAS por competência e atividade</summary><div class="conteudo"><div class="formula">Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12 · DAS = receita da atividade × alíquota efetiva (arredondado ao centavo)</div>' + tabela(['Mês', 'Atividade', 'Anexo', { t: 'Faixa', num: true }, { t: 'RBT12', num: true }, { t: 'Nominal', num: true }, { t: 'Parcela a deduzir', num: true }, { t: 'Efetiva', num: true }, { t: 'Receita', num: true }, { t: 'DAS', num: true }, ''], das, { cls: 'tabela-compacta' }) + '</div></details>';
    }
    h += '<details class="memoria"><summary>Fator "r" por competência (numerador, denominador, valores considerados e excluídos)</summary><div class="conteudo">' + fr + '</div></details>';
    if (res.trimestres) {
      var tr = res.trimestres.map(function (t, i) { return '<tr>' + td((i + 1) + 'º trimestre') + Object.keys(t).map(function (k) { return tdn(typeof t[k] === 'number' ? brl(t[k]) : esc(t[k])); }).join('') + '</tr>'; });
      var cab = ['Trimestre'].concat(Object.keys(res.trimestres[0]).map(function (k) { return { t: { baseIrpj: 'Base IRPJ', baseCsll: 'Base CSLL', irpj: 'IRPJ (com adicional)', adicional: 'Adicional', csll: 'CSLL', limiteAdicional: 'Limite do adicional', excedenteLc224: 'Excedente LC 224', receita: 'Receita', lair: 'LAIR', adicoes: 'Adições', compensacao: 'Compensação', lucroReal: 'Lucro real', prejuizoAcumulado: 'Prejuízo acumulado' }[k] || k, num: true }; }));
      h += '<details class="memoria"><summary>Apuração trimestral de IRPJ e CSLL</summary><div class="conteudo"><div class="formula">' + (res.regime === 'presumido' ? 'Base = receita × presunção (32% serviços; 8%/12% hospitalar com requisitos) + outras receitas; IRPJ = 15% × base + 10% × (base − R$ 20.000 × meses); CSLL = 9% × base' : 'Lucro real = LAIR + adições − compensação (até 30%); IRPJ = 15% + adicional de 10% acima de R$ 60.000/trimestre; CSLL = 9%') + '</div>' + tabela(cab, tr, { cls: 'tabela-compacta' }) + '</div></details>';
    }
    var ip = mem.irpf;
    h += '<details class="memoria"><summary>IRPF anual e IRPFM</summary><div class="conteudo"><div class="formula">Completa: base = tributáveis − (INSS + dependentes + pensão + médicas + instrução + PGBL) · Simplificada: base = tributáveis − min(20% × tributáveis; limite)\nImposto = tabela anual − redução (Lei 15.270) · Opção usada: ' + ip.escolhida.opcao + ' · Devido = ' + brl(ip.devido) + ' · Antecipado = ' + brl(ip.antecipado) + ' · Saldo = ' + brl(ip.saldo) + '\nIRPFM: rendimentos ' + brl(mem.irpfm.rendimentos) + ' × alíquota ' + pct(mem.irpfm.aliquota) + ' = ' + brl(mem.irpfm.impostoMinimo) + ' − deduções ' + brl(mem.irpfm.deducoes) + ' − redutor ' + brl(mem.irpfm.redutor) + ' = adicional ' + brl(mem.irpfm.adicional) + '</div></div></details>';
    return h;
  }

  function desenharOtimizacao() {
    var cont = document.getElementById('grafico-otim');
    if (!cont || !analise) return;
    var a = analise, div = ui.unidade === 'anual' ? 1 : 12;
    var cS = a.regimes.simples.curva, cP = a.regimes.presumido.curva, cR = a.regimes.real.curva;
    function pts(c, campo) { return c.map(function (p) { return { x: p.P, y: M.r2((campo ? p[campo] : p.custo) / div) }; }); }
    var temFR = a.curvaV.length > 0;
    var regAtual = a.regimeReferencia;
    var series = [
      { id: 'real', nome: 'Simples — regra real do fator "r"' + (regAtual === 'simples' ? ' (regime atual)' : ''), cor: 'var(--series-1)', pontos: pts(cS), largura: 2.5, visivel: ui.curvas.real },
      { id: 'v', nome: 'Simples — permanência no Anexo V', cor: 'var(--series-2)', pontos: temFR ? pts(a.curvaV) : [], tracejado: true, visivel: ui.curvas.v && temFR },
      { id: 'iii', nome: 'Simples — Anexo III (hipotético)', cor: 'var(--series-3)', pontos: temFR ? pts(a.curvaIII) : [], tracejado: true, visivel: ui.curvas.iii && temFR },
      { id: 'presumido', nome: 'Lucro Presumido' + (regAtual === 'presumido' ? ' (regime atual)' : ''), cor: 'var(--series-7)', pontos: pts(cP), visivel: ui.curvas.presumido },
      { id: 'lreal', nome: 'Lucro Real (estimativa)' + (regAtual === 'real' ? ' (regime atual)' : ''), cor: 'var(--series-5)', pontos: pts(cR), visivel: ui.curvas.lreal }
    ];
    var areas = [];
    if (ui.curvas.banda) areas.push({ id: 'banda', cor: 'var(--series-1)', opacidade: 0.10, superior: a.banda.map(function (b) { return { x: b.P, y: b.max / div }; }), inferior: a.banda.map(function (b) { return { x: b.P, y: b.min / div }; }) });
    if (ui.curvas.pjpf && ui.curvas.real) {
      areas.push({ id: 'pj', cor: 'var(--series-4)', opacidade: 0.10, superior: pts(cS, 'pj'), inferior: cS.map(function (p) { return { x: p.P, y: 0 }; }) });
      areas.push({ id: 'pf', cor: 'var(--series-7)', opacidade: 0.10, superior: pts(cS), inferior: pts(cS, 'pj') });
    }
    var lim = a.limitesAnexo;
    var marc = [];
    if (lim.primeiro !== null) marc.push({ x: lim.primeiro, rotulo: '1º mês no Anexo III a partir de ' + brl0(lim.primeiro) + (lim.primeiroMes ? ' (' + lim.primeiroMes + ')' : '') });
    if (lim.todos !== null) marc.push({ x: lim.todos, rotulo: 'Todos os meses no Anexo III a partir de ' + brl0(lim.todos) });
    var recRegime = a.regimeRecomendado;
    var curvaRec = recRegime === 'simples' ? cS : (recRegime === 'presumido' ? cP : cR);
    var melhorU = a.regimes[recRegime].melhorUniforme;
    var medAtual = a.atual.proLabore.slice(a.ctx.k0 - 1).reduce(function (s, v) { return s + v; }, 0) / Math.max(1, 13 - a.ctx.k0);
    var pontos = [
      { id: 'minimo', x: melhorU.P, y: melhorU.custo / div, cor: 'var(--series-6)', rotulo: 'Menor custo uniforme: ' + brl0(melhorU.custo / div), forma: 'losango', deslocY: 18 },
      { id: 'atual', x: M.r2(medAtual), y: a.atual.anual.custoTotal / div, cor: 'var(--series-8)', rotulo: 'Plano atual: ' + brl0(a.atual.anual.custoTotal / div) }
    ];
    if (a.tipoPlano === 'variavel') {
      var medRec = a.recomendado.proLabore.slice(a.ctx.k0 - 1).reduce(function (s, v) { return s + v; }, 0) / Math.max(1, 13 - a.ctx.k0);
      pontos.push({ id: 'recomendado', x: M.r2(medRec), y: a.recomendado.anual.custoTotal / div, cor: 'var(--series-6)', rotulo: 'Plano mensal recomendado (média): ' + brl0(a.recomendado.anual.custoTotal / div), deslocY: 18 });
    }
    var leg = document.getElementById('legenda-otim');
    var itensLeg = [['real', 'var(--series-1)', series[0].nome, false], ['v', 'var(--series-2)', series[1].nome, true], ['iii', 'var(--series-3)', series[2].nome, true], ['presumido', 'var(--series-7)', series[3].nome, false], ['lreal', 'var(--series-5)', series[4].nome, false]].filter(function (x) { return temFR || (x[0] !== 'v' && x[0] !== 'iii'); });
    leg.innerHTML = itensLeg.map(function (x) { return '<label><input type="checkbox" data-curva="' + x[0] + '"' + (ui.curvas[x[0]] ? ' checked' : '') + '><span class="chave' + (x[3] ? ' tracejada' : '') + '" style="border-color:' + x[1] + '"></span>' + esc(x[2]) + '</label>'; }).join('') +
      '<label><input type="checkbox" data-curva="pjpf"' + (ui.curvas.pjpf ? ' checked' : '') + '><span class="chave area" style="background:color-mix(in srgb, var(--series-4) 35%, transparent)"></span>Parcela PJ</label><span class="item-leg"><span class="chave area" style="background:color-mix(in srgb, var(--series-7) 25%, transparent)"></span>Parcela PF</span>' +
      '<label><input type="checkbox" data-curva="banda"' + (ui.curvas.banda ? ' checked' : '') + '><span class="chave area" style="background:color-mix(in srgb, var(--series-1) 20%, transparent)"></span>Faixa de incerteza</label>' +
      '<span class="item-leg"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--series-8)"/></svg>Plano atual</span><span class="item-leg"><svg width="12" height="12" aria-hidden="true"><path d="M6 0L12 6L6 12L0 6Z" fill="var(--series-6)"/></svg>Menor custo uniforme</span>' + (a.tipoPlano === 'variavel' ? '<span class="item-leg"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--series-6)"/></svg>Plano mensal recomendado</span>' : '');
    G.linhas(cont, {
      titulo: 'Custo tributário total por pró-labore mensal', altura: 380, margem: { l: 76, b: 48, t: 22 },
      x: { formato: function (v) { return G.compacto(v); }, rotulo: 'Pró-labore mensal (R$)' },
      y: { min: 0, formato: G.compacto, rotulo: ui.unidade === 'anual' ? 'Custo total (R$/ano)' : 'Custo total (R$/mês, média)' },
      series: series, areas: areas, marcadoresV: marc, pontos: pontos, xs: cS.map(function (p) { return p.P; }),
      dica: function (i) {
        var p = cS[i];
        var l = '<div class="t">Pró-labore ' + brl(p.P) + '/mês</div>';
        function lin(n, v, c) { return '<div class="l"><span class="k"><i style="background:' + c + '"></i>' + esc(n) + '</span><span class="v">' + v + '</span></div>'; }
        l += lin('Simples (regra real)', brl(p.custo / div), 'var(--series-1)');
        l += lin('— parcela PJ', brl(p.pj / div), 'var(--series-4)');
        l += lin('— parcela PF (INSS + IR)', brl(p.pf / div), 'var(--series-7)');
        if (temFR) { l += lin('Anexo V forçado', brl(a.curvaV[i].custo / div), 'var(--series-2)'); l += lin('Anexo III hipotético', brl(a.curvaIII[i].custo / div), 'var(--series-3)'); }
        l += lin('Lucro Presumido', brl(cP[i].custo / div), 'var(--series-7)');
        if (ui.curvas.lreal) l += lin('Lucro Real', brl(cR[i].custo / div), 'var(--series-5)');
        l += lin('Meses no Anexo III', p.mesesIII + '/' + (p.mesesIII + p.mesesV), 'transparent');
        if (ui.curvas.banda) l += lin('Faixa de incerteza', brl0(a.banda[i].min / div) + ' a ' + brl0(a.banda[i].max / div), 'transparent');
        if (!p.viavel) l += '<div class="l"><span class="k">Caixa insuficiente neste ponto</span></div>';
        return l;
      }
    });
    cont.setAttribute('data-pontos', JSON.stringify(cS.map(function (p) { return [p.P, p.custo]; })));
    var notas = document.getElementById('notas-otim');
    var marcasTxt = marc.map(function (x) { return x.rotulo; }).concat(pontos.map(function (x) { return x.rotulo + ' (pró-labore ' + brl0(x.x) + ')'; }));
    notas.innerHTML = '<p>' + esc(marcasTxt.join(' · ')) + '</p>Mudança de anexo calculada pela regra real do fator "r" (histórico + plano), não em ponto arbitrário. Faixa de incerteza: envoltória dos cenários ' + esc(a.variantesBanda.join(', ')) + '. ' + (a.historicoIncompleto ? 'Histórico incompleto: a faixa inclui hipóteses para a folha ausente. ' : '') + 'Plano atual marcado no pró-labore médio dos meses planejados.';
  }

  function desenharTornado() {
    var c = document.getElementById('grafico-tornado');
    if (!c || !analise || !analise.sensibilidade) return;
    G.tornado(c, { itens: analise.sensibilidade.itens.filter(function (i) { return i.impacto > 0.005; }), formato: function (v) { return brl0(v); } });
    if (!c.innerHTML || !analise.sensibilidade.itens.some(function (i) { return i.impacto > 0.005; })) c.innerHTML = '<p class="muted small">Nenhuma variável alterou o custo.</p>';
  }

  function comparacaoSalvosHtml() {
    var lista = estado.cenariosSalvos || [];
    if (!lista.length) return bloco('Cenários salvos', '<p class="small muted">Salve análises com nomes diferentes (por exemplo, antes e depois de mudar a receita) para compará-las aqui.</p>');
    var linhas = lista.map(function (c, i) {
      return '<tr>' + td('<strong>' + esc(c.nome) + '</strong><br><span class="xs muted">' + esc(c.data) + ' · ' + c.ano + '</span>') + td(nomeRegime(c.regime)) + tdn(brl(c.proLaboreMedio)) + tdn(brl(c.das)) + tdn(brl(c.inss)) + tdn(brl(c.irpf)) + tdn(brl(c.outros)) + tdn(brl(c.custoTotal)) + tdn(brl(c.rendaLiquida)) + tdn(brl(c.receita)) + td('<button class="btn btn-mini btn-perigo" data-remover-cenario="' + i + '">Remover</button>', 'acao') + '</tr>';
    });
    return bloco('Cenários salvos', tabela(['Nome', 'Regime', { t: 'Pró-labore médio', num: true }, { t: 'DAS', num: true }, { t: 'INSS', num: true }, { t: 'IRPF + IRPFM', num: true }, { t: 'Outros', num: true }, { t: 'Custo total', num: true }, { t: 'Renda líquida', num: true }, { t: 'Receita', num: true }, ''], linhas, { cls: 'tabela-compacta' }));
  }

  // ------------------------------------------------------------ relatório

  RENDER.relatorio = function () {
    var h = '<div class="cabecalho-painel nao-imprimir"><div><h2>Relatório final</h2><p>Texto para quem não tem formação contábil. Use "Imprimir" para gerar PDF pelo navegador.</p></div><div class="linha-acoes">' +
      (MODO_ARTEFATO ? '' : '<button class="btn" data-acao="imprimir">Imprimir relatório</button>') + '<button class="btn" data-acao="exportar-csv">' + (MODO_ARTEFATO ? 'Copiar CSV' : 'Exportar CSV') + '</button><button class="btn btn-primario" data-acao="analisar">' + (analise ? 'Atualizar análise' : 'Executar análise') + '</button></div></div>';
    if (!analise) return h + '<div class="aviso">Execute a análise para gerar o relatório.</div>';
    var a = analise, at = a.atual.anual, rc = a.recomendado.anual, e = estado;
    var P = a.parametros;
    h += '<article class="relatorio">';
    h += '<header><h2>Relatório de otimização tributária — ' + esc(e.empresa.nome || 'empresa não identificada') + '</h2><p class="muted small">Ano-calendário ' + a.ano + ' · Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' · Parâmetros legais de ' + P.ano + ' ' + esc(rotuloStatus(P.status)) + (e.meta.exemplo ? ' · DADOS FICTÍCIOS DE EXEMPLO' : '') + '</p></header>';
    if (analiseDesatualizada) h += '<div class="aviso atencao nao-imprimir">Os dados mudaram depois desta análise.</div>';
    h += '<p class="lead">' + esc(a.semVantagemRelevante ? 'Com os dados informados, não há vantagem relevante em mudar regime ou pró-labore: a melhor alternativa economiza ' + brl(Math.max(0, a.economia)) + ' no ano.' : 'A melhor alternativa encontrada reduz o custo tributário total em ' + brl(a.economia) + ' no ano (' + pct(a.economia / Math.max(1, at.custoTotal), 1) + '), mantendo as mesmas receitas e despesas.') + ' Economia projetada, não garantida.</p>';
    // A
    h += '<section><h3>A. Diagnóstico atual</h3><dl>' +
      '<dt>Regime</dt><dd>' + nomeRegime(a.regimeReferencia) + '</dd>' +
      (a.regimeReferencia === 'simples' ? '<dt>Anexo</dt><dd>' + at.mesesAnexoIII + ' mês(es) no Anexo III e ' + at.mesesAnexoV + ' no Anexo V</dd>' : '') +
      '<dt>Faturamento</dt><dd>' + brl(at.rb) + ' no ano (média ' + brl(at.rb / 12) + '/mês)</dd>' +
      '<dt>Despesas operacionais</dt><dd>' + brl(at.despesasOperacionais) + ' + investimentos ' + brl(at.ativoImobilizado) + '</dd>' +
      '<dt>Pró-labore</dt><dd>' + brl(at.proLabore) + ' no ano</dd>' +
      '<dt>Fator "r"</dt><dd>de ' + pctR(Math.min.apply(null, a.atual.meses.map(function (m) { return m.fatorR; }))) + ' a ' + pctR(Math.max.apply(null, a.atual.meses.map(function (m) { return m.fatorR; }))) + '</dd>' +
      '<dt>Tributos</dt><dd>Empresa ' + brl(at.tributosPJ) + ' · INSS ' + brl(at.inss) + ' · IRPF ' + brl(at.irpfDevido) + (at.irpfmAdicional ? ' · IRPFM ' + brl(at.irpfmAdicional) : '') + ' · total ' + brl(at.cargaTributaria) + ' (' + brl(at.cargaTributaria / 12) + '/mês; ' + pct(at.cargaEfetiva, 1) + ' da receita)</dd>' +
      '<dt>Renda líquida estimada</dt><dd>' + brl(at.rendaLiquidaPF) + ' no ano</dd>' +
      '<dt>Qualidade dos dados</dt><dd>' + a.qualidade.nota + '/100 (' + a.qualidade.nivel + ')</dd></dl></section>';
    // B
    var plano = a.recomendado.proLabore.map(function (v, i) { return M.MESES[i] + ' ' + brl0(v); }).join(' · ');
    var dividendos = a.recomendado.anual.dividendoMedico;
    h += '<section><h3>B. Melhor cenário identificado</h3><dl>' +
      '<dt>Regime recomendado</dt><dd>' + nomeRegime(a.regimeRecomendado) + (a.qualidade.nivel === 'baixa' ? ' (indicativo: dados insuficientes)' : '') + '</dd>' +
      '<dt>Pró-labore sugerido</dt><dd>' + (a.tipoPlano === 'uniforme' ? brl(a.recomendado.proLabore[11]) + ' por mês' : (a.tipoPlano === 'atual' ? 'manter o plano atual: ' : 'variável: ') + esc(plano)) + '</dd>' +
      (a.regimeRecomendado === 'simples' ? '<dt>Anexo esperado</dt><dd>' + rc.mesesAnexoIII + ' mês(es) no Anexo III, ' + rc.mesesAnexoV + ' no Anexo V</dd><dt>Fator "r" projetado</dt><dd>' + a.recomendado.meses.map(function (m) { return m.rotulo + ' ' + pctR(m.fatorR); }).join(' · ') + '</dd>' : '') +
      '<dt>Distribuição de lucros</dt><dd>' + brl(dividendos) + ' ao médico no ano' + (rc.retencaoDividendos ? ' (retenção de ' + brl(rc.retencaoDividendos) + ', recuperável no ajuste)' : '') + '</dd>' +
      '<dt>Tributos por categoria</dt><dd>' + (a.regimeRecomendado === 'simples' ? 'DAS ' + brl(rc.das) : 'IRPJ ' + brl(rc.irpj) + ' · CSLL ' + brl(rc.csll) + ' · PIS/Cofins/CBS ' + brl(rc.pis + rc.cofins + rc.cbs) + ' · ISS ' + brl(rc.iss) + ' · CPP ' + brl(rc.cpp)) + ' · INSS ' + brl(rc.inss) + ' · IRPF ' + brl(rc.irpfDevido) + (rc.irpfmAdicional ? ' · IRPFM ' + brl(rc.irpfmAdicional) : '') + '</dd>' +
      '<dt>Custo total anual</dt><dd><strong>' + brl(rc.custoTotal) + '</strong> (tributos ' + brl(rc.cargaTributaria) + ' + custos administrativos ' + brl(rc.custoAdm) + ')</dd>' +
      '<dt>Renda líquida pessoal</dt><dd>' + brl(rc.rendaLiquidaPF) + ' (' + sinal(rc.rendaLiquidaPF - at.rendaLiquidaPF) + ')</dd>' +
      '<dt>Caixa na empresa</dt><dd>' + brl(rc.caixaFinalPJ) + ' ao fim do ano; lucro retido ' + brl(rc.lucroRetido) + '</dd></dl></section>';
    // C
    h += '<section><h3>C. Comparação financeira</h3>' + comparacaoHtml(a) + '</section>';
    // D
    h += '<section><h3>D. Plano de ação</h3><ol class="plano">' + a.planoAcao.map(function (p) {
      var cl = p.classificacao === 'calculada' ? 'calculada' : (p.classificacao === 'estimada' ? 'estimada' : 'hipotese');
      return '<li><strong>' + esc(p.titulo) + '</strong> <span class="classif ' + cl + '">' + esc(p.classificacao === 'calculada' ? 'Economia calculada' : (p.classificacao === 'estimada' ? 'Economia estimada' : 'Hipótese não validada')) + '</span><dl>' +
        '<dt>O que alterar</dt><dd>' + esc(p.oque) + '</dd><dt>Por quê</dt><dd>' + esc(p.porque) + '</dd><dt>Economia estimada</dt><dd>' + brl(p.economia) + '/ano</dd><dt>Custo adicional</dt><dd>' + (p.custoAdicional === null ? 'a orçar' : brl(p.custoAdicional) + '/ano') + '</dd>' +
        '<dt>Quando faz efeito</dt><dd>' + esc(p.quando) + '</dd><dt>Documentos</dt><dd>' + esc(p.documentos) + '</dd><dt>Validar com o contador</dt><dd>' + esc(p.validacao) + '</dd><dt>Riscos</dt><dd>' + esc(p.riscos) + '</dd>' +
        '<dt>Dados a confirmar</dt><dd>' + (p.pendencias && p.pendencias.length ? esc(p.pendencias.join('; ')) : 'Nenhum') + '</dd></dl></li>';
    }).join('') + '</ol></section>';
    // E
    var lim = [];
    lim.push('Parâmetros legais de ' + P.ano + ': ' + P.resumoStatus);
    lim.push('Premissas: tributos pagos na competência; pró-labore pago no próprio mês; folha do fator "r" pelo regime de caixa; DAS calculado com a alíquota efetiva sem arredondamento intermediário; IRPF mensal do gráfico é o imposto anual distribuído pelo pró-labore.');
    lim.push('Distribuição isenta limitada ao lucro contábil (com escrituração) ou ao lucro presumido menos tributos (sem escrituração).');
    lim.push('IRPFM e redutor do art. 16-B modelados de forma simplificada; regulamentação em evolução.');
    lim.push('Lucro Real e CBS (2027) são estimativas; créditos de PIS/Cofins dependem do conceito de insumo.');
    a.qualidade.itens.filter(function (i) { return !i.ok; }).forEach(function (i) { lim.push('Dado ausente: ' + i.texto + ' — ' + i.efeito); });
    a.alertas.filter(function (x) { return x.nivel !== 'info'; }).forEach(function (x) { lim.push('Revisão profissional: ' + x.titulo + '. ' + x.detalhe); });
    h += '<section><h3>E. Limitações e validações necessárias</h3><ul class="small" style="margin:0;padding-left:1.1em;display:grid;gap:4px">' + lim.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul><p class="small muted">Este relatório apoia a decisão e não substitui a revisão do contador ou de profissional tributário habilitado.</p></section>';
    h += '</article>';
    return h;
  };

  // ------------------------------------------------------------ parâmetros

  RENDER.parametros = function () {
    var anoSel = ui.anoParametros || estado.analise.ano;
    var P = PL.anos[anoSel];
    var h = '<div class="cabecalho-painel"><div><h2>Parâmetros legais e fontes</h2><p>' + esc(PL_PADRAO.aviso) + ' Nenhum parâmetro foi verificado diretamente na fonte oficial nesta versão: as páginas do governo não estavam acessíveis no ambiente de desenvolvimento.</p></div></div>';
    h += '<div class="linha-acoes"><label class="rotulo" for="ui-ano-param">Ano</label><select id="ui-ano-param" style="width:auto">' + Object.keys(PL.anos).map(function (a) { return '<option value="' + a + '"' + (String(a) === String(anoSel) ? ' selected' : '') + '>' + esc(PL.anos[a].rotulo || a) + (PL.anos[a].personalizado ? ' (personalizado)' : '') + '</option>'; }).join('') + '</select></div>';
    h += '<div class="aviso ' + (P.status === 'projetado' ? 'atencao' : '') + '"><strong>Parâmetros ' + esc(rotuloStatus(P.status)) + '.</strong> ' + esc(P.resumoStatus) + '</div>';
    var S = P.simples;
    ['III', 'V', 'I'].forEach(function (an) {
      var A = S.anexos[an];
      var linhas = A.faixas.map(function (f, i) { var r = f.reparticao; return '<tr>' + tdn(String(i + 1)) + tdn('até ' + brl0(f.ate)) + tdn(pct(f.aliquota)) + tdn(brl(f.parcelaDeduzir)) + ['IRPJ', 'CSLL', 'COFINS', 'PIS', 'CPP', 'ISS'].map(function (k) { return tdn(pct(r[k])); }).join('') + '</tr>'; });
      h += bloco('Simples Nacional — ' + A.nome, '<p class="small">' + esc(A.descricao) + '</p>' + tabela([{ t: 'Faixa', num: true }, { t: 'RBT12', num: true }, { t: 'Alíquota nominal', num: true }, { t: 'Parcela a deduzir', num: true }, { t: 'IRPJ', num: true }, { t: 'CSLL', num: true }, { t: 'Cofins', num: true }, { t: 'PIS', num: true }, { t: 'CPP', num: true }, { t: an === 'I' ? 'ICMS' : 'ISS', num: true }], linhas, { cls: 'tabela-compacta' }) + fonteHtml(A.status, A.fontes, A.observacao));
    });
    h += bloco('Simples Nacional — limites e regras de apuração', '<dl class="small lista-def"><dt>Limite anual</dt><dd>' + brl(S.limiteAnual) + ' (início de atividade: ' + brl(S.limiteMensalInicioAtividade) + ' × meses)</dd><dt>Sublimite ISS/ICMS</dt><dd>' + brl(S.sublimiteIssIcms) + '</dd><dt>Limite do fator "r"</dt><dd>' + pct(S.limiteFatorR, 0) + '</dd><dt>ISS efetivo máximo</dt><dd>' + pct(S.issEfetivoMaximo, 0) + '</dd><dt>Regime de caixa</dt><dd>' + (S.regimeCaixaPermitido ? 'admitido' : 'não admitido') + '</dd><dt>RBT12 / FS12</dt><dd>' + esc(S.apuracao.descricao) + '</dd><dt>Folha do fator "r"</dt><dd>' + esc(S.folhaFatorR.descricao) + '</dd></dl>' + fonteHtml(S.apuracao.status, S.apuracao.fontes.concat(S.fontes), ''));
    var LP = P.presumido;
    h += bloco('Lucro Presumido', '<dl class="small lista-def">' + Object.keys(LP.presuncao).map(function (k) { return '<dt>' + esc(LP.presuncao[k].rotulo) + '</dt><dd>IRPJ ' + pct(LP.presuncao[k].irpj, 0) + ' · CSLL ' + pct(LP.presuncao[k].csll, 0) + '</dd>'; }).join('') +
      '<dt>IRPJ</dt><dd>' + pct(LP.irpjAliquota, 0) + ' + adicional ' + pct(LP.adicionalAliquota, 0) + ' acima de ' + brl(LP.adicionalLimiteMensal) + '/mês</dd><dt>CSLL</dt><dd>' + pct(LP.csllAliquota, 0) + '</dd><dt>PIS / Cofins</dt><dd>' + pct(LP.pis) + ' / ' + pct(LP.cofins) + '</dd>' + (LP.cbs ? '<dt>CBS (estimativa)</dt><dd>' + pct(LP.cbs.aliquotaReferencia, 1) + ' × (1 − ' + pct(LP.cbs.reducaoSaude, 0) + ') — ' + esc(LP.cbs.observacao) + '</dd>' : '') +
      '<dt>LC 224/2025</dt><dd>' + (LP.lc224.ativo ? esc(LP.lc224.observacao) : 'não aplicável') + '</dd></dl>' + fonteHtml(LP.status, LP.fontes, ''));
    var R = P.real;
    h += bloco('Lucro Real (estimativa)', '<p class="small">IRPJ ' + pct(R.irpjAliquota, 0) + ' + adicional ' + pct(R.adicionalAliquota, 0) + '; CSLL ' + pct(R.csllAliquota, 0) + '; PIS ' + pct(R.pis) + ' e Cofins ' + pct(R.cofins) + ' não cumulativos (receitas financeiras ' + pct(R.pisReceitaFinanceira) + ' / ' + pct(R.cofinsReceitaFinanceira) + '); compensação de prejuízo até ' + pct(R.limiteCompensacaoPrejuizo, 0) + ' do lucro.</p>' + fonteHtml(R.status, R.fontes, ''));
    var I = P.irpf;
    var tm = I.mensal.map(function (t) { return '<p class="small"><strong>Tabela mensal a partir de ' + M.MESES[t.desdeMes - 1] + ':</strong> desconto simplificado ' + brl(t.descontoSimplificado) + '; dependente ' + brl(t.deducaoDependente) + '</p>' + tabela([{ t: 'Base até', num: true }, { t: 'Alíquota', num: true }, { t: 'Parcela a deduzir', num: true }], t.faixas.map(function (f) { return '<tr>' + tdn(f.ate === null ? 'acima' : brl(f.ate)) + tdn(pct(f.aliquota, 1)) + tdn(brl(f.deducao)) + '</tr>'; }), { cls: 'tabela-compacta' }); }).join('');
    var ta = tabela([{ t: 'Base anual até', num: true }, { t: 'Alíquota', num: true }, { t: 'Parcela a deduzir', num: true }], I.anual.faixas.map(function (f) { return '<tr>' + tdn(f.ate === null ? 'acima' : brl(f.ate)) + tdn(pct(f.aliquota, 1)) + tdn(brl(f.deducao)) + '</tr>'; }), { cls: 'tabela-compacta' });
    var red = I.reducaoMensal.ativo ? '<p class="small">Redução mensal: até ' + brl(I.reducaoMensal.limiteIsencao) + ' → até ' + brl(I.reducaoMensal.reducaoMaxima) + '; até ' + brl(I.reducaoMensal.limiteSuperior) + ' → ' + brl(I.reducaoMensal.a) + ' − ' + String(I.reducaoMensal.b).replace('.', ',') + ' × rendimento. Redução anual: até ' + brl(I.reducaoAnual.limiteIsencao) + ' → até ' + brl(I.reducaoAnual.reducaoMaxima) + '; até ' + brl(I.reducaoAnual.limiteSuperior) + ' → ' + brl(I.reducaoAnual.a) + ' − ' + String(I.reducaoAnual.b).replace('.', ',') + ' × rendimento.</p>' : '<p class="small">Sem redução da Lei 15.270 neste ano.</p>';
    h += bloco('IRPF', '<div class="grade-2"><div>' + tm + '</div><div><p class="small"><strong>Tabela anual:</strong> desconto simplificado ' + pct(I.anual.descontoSimplificadoPercentual, 0) + ' limitado a ' + brl(I.anual.descontoSimplificadoLimite) + '; dependente ' + brl(I.anual.deducaoDependente) + '; instrução ' + brl(I.anual.limiteInstrucaoPorPessoa) + '/pessoa.</p>' + ta + '</div></div>' + red + fonteHtml(I.status, I.fontes, I.observacao));
    var Pv = P.previdencia;
    h += bloco('Previdência', '<p class="small">Salário mínimo ' + brl(Pv.salarioMinimo) + ' · teto ' + brl(Pv.teto) + ' · contribuinte individual ' + pct(Pv.aliquotaContribuinteIndividual, 0) + ' · patronal ' + pct(Pv.patronalProLabore, 0) + ' · FGTS ' + pct(Pv.fgts, 0) + '. ' + esc(Pv.observacao || '') + '</p>' + fonteHtml(Pv.status, Pv.fontes, ''));
    var D = P.dividendos, F = P.irpfm;
    h += bloco('Lucros, dividendos e IRPFM', '<p class="small">' + (D.retencao.ativo ? 'Retenção de ' + pct(D.retencao.aliquota, 0) + ' sobre o total pago no mês quando superior a ' + brl(D.retencao.limiteMensalPorFonte) + ' por fonte e beneficiário residente. ' : 'Sem retenção na fonte neste ano. ') + esc(D.transicao.ativo ? D.transicao.descricao : '') + ' ' + esc(D.limiteSemEscrituracao) + '</p><p class="small">' + (F.ativo ? esc(F.observacao) : 'Sem IRPFM neste ano.') + '</p>' + fonteHtml(D.status, D.fontes.concat(F.fontes), ''));
    h += bloco('Reforma tributária do consumo', '<p class="small">' + esc(P.reformaConsumo.descricao) + '</p>' + fonteHtml(P.reformaConsumo.status, P.reformaConsumo.fontes || [], ''));
    var fontes = PL_PADRAO.fontes;
    h += bloco('Fontes', '<ul class="small" style="margin:0;padding-left:1.1em;display:grid;gap:4px">' + Object.keys(fontes).map(function (k) { var f = fontes[k]; return '<li><strong>' + esc(f.titulo) + '</strong><br><span class="mono xs">' + esc(f.url) + '</span> · consulta em ' + esc(f.consulta) + '</li>'; }).join('') + '</ul>');
    h += bloco('Atualizar parâmetros', '<p class="small">Edite o JSON do ano selecionado e aplique. Os parâmetros personalizados ficam neste navegador, marcados como "personalizado", e podem ser restaurados. Para um novo ano, crie a partir do ano selecionado e ajuste valores, fontes e status.</p><textarea id="json-param" spellcheck="false" aria-label="Parâmetros em JSON">' + esc(JSON.stringify(P, null, 2)) + '</textarea><div class="linha-acoes"><button class="btn" data-acao="aplicar-param">Aplicar parâmetros</button><button class="btn" data-acao="novo-ano">Criar ano ' + (+anoSel + 1) + ' a partir deste</button><button class="btn btn-perigo" data-acao="restaurar-param">Restaurar padrão</button>' + (MODO_ARTEFATO ? '' : '<button class="btn" data-acao="exportar-param">Exportar parâmetros (.json)</button>') + '</div><div id="erro-param"></div>');
    return h;
  };

  function rotuloStatus(st) {
    return { conferido_secundaria: 'conferidos em fontes secundárias', transcrito: 'transcritos, sem conferência online', derivado: 'derivados', projetado: 'projetados, não oficiais', interpretacao: 'com interpretação', personalizado: 'personalizados pelo usuário' }[st] || st;
  }
  function fonteHtml(status, ids, obs) {
    var fontes = PL_PADRAO.fontes;
    var nomes = { conferido_secundaria: 'Conferido em fonte secundária', transcrito: 'Transcrito (sem conferência online)', derivado: 'Derivado', projetado: 'Projetado (não oficial)', interpretacao: 'Interpretação', personalizado: 'Personalizado' };
    var tipo = status === 'projetado' || status === 'interpretacao' ? 'alerta' : (status === 'conferido_secundaria' ? 'info' : 'neutro');
    return '<p class="xs muted">' + selo(nomes[status] || status, tipo) + ' ' + (ids || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (id) { return fontes[id] ? esc(fontes[id].titulo.split(' (')[0]) : esc(id); }).join(' · ') + (obs ? '<br>' + esc(obs) : '') + '</p>';
  }

  // ------------------------------------------------------------ ações

  function executarAnalise() {
    var ov = document.getElementById('calculando');
    ov.hidden = false;
    setTimeout(function () {
      try {
        analise = O.executar(estado, { parametros: PL });
        analiseDesatualizada = false;
        notificar('Análise concluída em ' + analise.tempoMs + ' ms.');
      } catch (e) {
        if (window.console) console.error(e);
        notificar('Erro na análise: ' + e.message);
      }
      ov.hidden = true;
      renderizarAba(ui.aba);
      atualizarCabecalho();
    }, 30);
  }

  function baixar(nome, conteudo, tipo) {
    var blob = new Blob([conteudo], { type: tipo });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function copiar(texto, rotulo) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () { notificar(rotulo + ' copiado.'); }, function () { mostrarTexto(texto); });
    } else mostrarTexto(texto);
  }
  function mostrarTexto(texto) {
    abrirModal('Copie o conteúdo', '<textarea readonly style="min-height:240px">' + esc(texto) + '</textarea>', [['Fechar', 'fechar']]);
    var t = document.querySelector('#modal textarea'); if (t) t.select();
  }
  function exportarCSV() {
    if (!analise) { notificar('Execute a análise antes de exportar.'); return; }
    var csv = X.csv(analise);
    if (MODO_ARTEFATO) copiar(csv, 'CSV');
    else baixar('simulacao-tributaria-' + analise.ano + '.csv', csv, 'text/csv;charset=utf-8');
  }
  function exportarBackup() {
    var json = JSON.stringify(estado, null, 2);
    if (MODO_ARTEFATO) copiar(json, 'Backup');
    else baixar('backup-simulador-' + new Date().toISOString().slice(0, 10) + '.json', json, 'application/json');
  }
  function importarBackup(arquivo) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var obj = JSON.parse(r.result);
        if (!obj || typeof obj !== 'object' || !obj.analise || !obj.receitas) throw new Error('arquivo não parece um backup deste simulador');
        definirEstado(M.mesclarComPadrao(obj));
        salvar(true);
        notificar('Backup importado.');
      } catch (e) { notificar('Não foi possível importar: ' + e.message + '.'); }
    };
    r.readAsText(arquivo);
  }
  function imprimir() {
    if (!analise) { notificar('Execute a análise antes de imprimir.'); return; }
    if (ui.aba !== 'relatorio') irPara('relatorio');
    var p = document.getElementById('painel-relatorio');
    p.classList.add('imprimir');
    setTimeout(function () { window.print(); setTimeout(function () { p.classList.remove('imprimir'); }, 500); }, 60);
  }

  function abrirModal(titulo, corpo, botoes, aoEscolher) {
    var f = document.getElementById('fundo-modal'), m = document.getElementById('modal');
    m.innerHTML = '<h3 id="modal-titulo">' + esc(titulo) + '</h3><div>' + corpo + '</div><div class="linha-acoes" style="justify-content:flex-end">' + botoes.map(function (b) { return '<button class="btn' + (b[2] ? ' ' + b[2] : '') + '" data-modal="' + b[1] + '">' + esc(b[0]) + '</button>'; }).join('') + '</div>';
    f.hidden = false;
    var primeiro = m.querySelector('button'); if (primeiro) primeiro.focus();
    m.onclick = function (ev) {
      var b = ev.target.closest('[data-modal]');
      if (!b) return;
      f.hidden = true;
      if (aoEscolher) aoEscolher(b.getAttribute('data-modal'));
    };
  }

  var timerNotif = null;
  function notificar(msg) {
    var n = document.getElementById('notificacao');
    n.textContent = msg; n.hidden = false;
    clearTimeout(timerNotif);
    timerNotif = setTimeout(function () { n.hidden = true; }, 3500);
  }

  function novoId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var ACOES = {
    analisar: executarAnalise,
    salvar: function () { salvar(false); },
    carregar: carregar,
    'exportar-csv': exportarCSV,
    'exportar-backup': exportarBackup,
    'importar-backup': function () { document.getElementById('arquivo-backup').click(); },
    imprimir: imprimir,
    exemplo: function () {
      abrirModal('Carregar o exemplo fictício?', '<p>Os dados atuais serão substituídos pelo exemplo. Exporte um backup antes se quiser guardá-los.</p>', [['Cancelar', 'nao'], ['Carregar exemplo', 'sim', 'btn-primario']], function (r) {
        if (r === 'sim') { definirEstado(window.DadosExemplo.criar()); salvar(true); notificar('Exemplo fictício carregado.'); }
      });
    },
    limpar: function () {
      abrirModal('Limpar todos os dados?', '<p>Apaga os dados deste navegador e começa um cadastro vazio. Não pode ser desfeito. Exporte um backup antes se precisar.</p>', [['Cancelar', 'nao'], ['Limpar dados', 'sim', 'btn-perigo']], function (r) {
        if (r === 'sim') { removerLocal(CHAVE); definirEstado(M.estadoVazio(PL.anoPadrao)); notificar('Dados apagados.'); }
      });
    },
    'adicionar-socio': function () { estado.empresa.socios.push({ nome: '', participacao: 0, analisado: false, residenteExterior: false }); aoAlterar(); renderizarAba('perfil'); },
    'adicionar-despesa': function () {
      var cat = document.getElementById('nova-despesa-cat').value;
      var c = M.CATEGORIA_POR_ID[cat];
      estado.despesas.push({ id: novoId('d'), categoria: cat, nome: c.rotulo, valor: '', mesInicial: 1, mesFinal: 12, recorrencia: 'mensal', tipoValor: 'fixo', valoresMensais: [], reajustePct: '', reajusteMes: '', parcelaAtual: '', totalParcelas: '', natureza: c.tipo === 'pessoal' ? 'pessoal' : 'empresarial', pctProfissional: '', documento: 'sim', tratamento: 'nao_confirmado', ajustavel: 'false', corteMes: '', corteValorNovo: '', observacoes: '', titularidade: '', usoPessoalPct: '', vinculo: '', vidaUtilAnos: '', geraCredito: '' });
      aoAlterar(); renderizarAba('despesas');
      var ult = document.querySelectorAll('#painel-despesas .item'); if (ult.length) { var el = ult[ult.length - 1]; el.scrollIntoView({ block: 'center' }); var i = el.querySelector('input'); if (i) i.focus(); }
    },
    'adicionar-tributo': function () { estado.tributosPagos.push({ id: novoId('t'), tributo: 'DAS', valor: '', competencia: 1, dataPagamento: '', codigoReceita: '', orgao: '', natureza: 'pago', confirmado: 'nao' }); aoAlterar(); renderizarAba('tributos'); },
    'adicionar-pessoa': function () { estado.folha.pessoas.push({ id: novoId('p'), nome: '', tipo: 'clt', salario: '', mesInicio: 1, mesFim: 12, decimoTerceiro: true, ferias: true, mesFerias: 7 }); aoAlterar(); renderizarAba('folha'); },
    'adicionar-receita': function () {
      var k = +document.getElementById('add-rec-mes').value, t = document.getElementById('add-rec-tipo').value, v = num(document.getElementById('add-rec-valor').value);
      if (v === null) { notificar('Informe um valor válido.'); return; }
      var m = estado.receitas.meses[k - 1];
      m[t] = String(M.r2(n0(m[t]) + v));
      aoAlterar(); renderizarAba('receitas'); notificar('Receita adicionada a ' + M.MESES[k - 1] + '.');
    },
    'aplicar-fixa': function () {
      var tot = n0(estado.receitas.fixa.total), mix = estado.receitas.fixa.mix || {};
      var soma = M.TIPOS_RECEITA.reduce(function (a, t) { return a + n0(mix[t.id]); }, 0);
      if (tot <= 0 || soma <= 0) { notificar('Informe a receita mensal e a composição.'); return; }
      var k0 = n0(estado.analise.mesInicioPlanejamento) || 1;
      for (var k = k0; k <= 12; k++) M.TIPOS_RECEITA.forEach(function (t) { estado.receitas.meses[k - 1][t.id] = n0(mix[t.id]) ? String(M.r2(tot * n0(mix[t.id]) / soma)) : ''; });
      aoAlterar(); renderizarAba('receitas'); notificar('Receita fixa aplicada aos meses projetados.');
    },
    'salvar-cenario': function () {
      if (!analise) return;
      abrirModal('Salvar cenário', '<div class="campo"><label for="nome-cenario">Nome</label><input type="text" id="nome-cenario" value="Análise ' + (estado.cenariosSalvos.length + 1) + '"></div><label class="check" style="margin-top:8px"><input type="radio" name="qual-cen" value="rec" checked> Cenário recomendado</label><label class="check"><input type="radio" name="qual-cen" value="atual"> Cenário atual</label>', [['Cancelar', 'nao'], ['Salvar', 'sim', 'btn-primario']], function (r) {
        if (r !== 'sim') return;
        var nome = document.getElementById('nome-cenario').value || 'Cenário';
        var qual = document.querySelector('input[name="qual-cen"]:checked').value;
        var res = qual === 'rec' ? analise.recomendado : analise.atual, A = res.anual;
        estado.cenariosSalvos.push({ nome: nome + (qual === 'rec' ? ' (recomendado)' : ' (atual)'), data: new Date().toLocaleString('pt-BR'), ano: analise.ano, regime: res.regime, proLaboreMedio: M.r2(A.proLabore / 12), das: A.das, inss: A.inss, irpf: M.r2(A.irpfDevido + A.irpfmAdicional), outros: M.r2(A.tributosPJ - A.das), custoTotal: A.custoTotal, rendaLiquida: A.rendaLiquidaPF, receita: A.rb, proLabore: res.proLabore });
        salvar(true); renderizarAba('cenarios'); notificar('Cenário salvo.');
      });
    },
    'aplicar-param': function () {
      var txt = document.getElementById('json-param').value, err = document.getElementById('erro-param');
      try {
        var obj = JSON.parse(txt);
        ['ano', 'simples', 'presumido', 'real', 'previdencia', 'irpf', 'dividendos', 'irpfm'].forEach(function (k) { if (!(k in obj)) throw new Error('falta a chave "' + k + '"'); });
        ['III', 'V'].forEach(function (an) { if (!obj.simples.anexos || !obj.simples.anexos[an] || obj.simples.anexos[an].faixas.length !== 6) throw new Error('o Anexo ' + an + ' deve ter 6 faixas'); });
        obj.status = 'personalizado';
        var custom = lerLocal(CHAVE_PARAM) || { anos: {} };
        custom.anos[obj.ano] = obj;
        gravarLocal(CHAVE_PARAM, custom);
        PL = clonarParametros(); ui.anoParametros = obj.ano;
        versao++; if (analise) analiseDesatualizada = true;
        renderizarAba('parametros'); notificar('Parâmetros de ' + obj.ano + ' aplicados (personalizados).');
      } catch (e) { err.innerHTML = '<div class="aviso critico">JSON inválido: ' + esc(e.message) + '.</div>'; }
    },
    'novo-ano': function () {
      var base = ui.anoParametros || estado.analise.ano, novo = +base + 1;
      if (PL.anos[novo] && !PL.anos[novo].personalizado) { notificar('O ano ' + novo + ' já existe. Edite-o diretamente.'); ui.anoParametros = novo; renderizarAba('parametros'); return; }
      var obj = JSON.parse(JSON.stringify(PL.anos[base]));
      obj.ano = novo; obj.rotulo = novo + ' (personalizado)'; obj.status = 'personalizado';
      obj.resumoStatus = 'Criado a partir de ' + base + ' pelo usuário. Atualize valores, fontes e vigências antes de usar.';
      var custom = lerLocal(CHAVE_PARAM) || { anos: {} };
      custom.anos[novo] = obj; gravarLocal(CHAVE_PARAM, custom);
      PL = clonarParametros(); ui.anoParametros = novo; renderizarAba('parametros'); notificar('Ano ' + novo + ' criado a partir de ' + base + '.');
    },
    'restaurar-param': function () {
      abrirModal('Restaurar parâmetros padrão?', '<p>Remove todos os parâmetros personalizados deste navegador.</p>', [['Cancelar', 'nao'], ['Restaurar', 'sim', 'btn-perigo']], function (r) {
        if (r !== 'sim') return;
        removerLocal(CHAVE_PARAM); PL = clonarParametros(); ui.anoParametros = null;
        if (!PL.anos[estado.analise.ano]) estado.analise.ano = PL.anoPadrao;
        versao++; if (analise) analiseDesatualizada = true; renderizarAba('parametros'); notificar('Parâmetros padrão restaurados.');
      });
    },
    'exportar-param': function () { baixar('parametros-legais.json', JSON.stringify(PL.anos, null, 2), 'application/json'); }
  };

  function aoClicar(ev) {
    var t = ev.target.closest('button, [data-ir]');
    if (!t) return;
    if (t.hasAttribute('data-aba')) { irPara(t.getAttribute('data-aba')); return; }
    if (t.hasAttribute('data-ir')) { irPara(t.getAttribute('data-ir')); return; }
    var a = t.getAttribute('data-acao');
    if (a && ACOES[a]) { ev.preventDefault(); fecharMenus(); ACOES[a](); return; }
    var i;
    if ((i = t.getAttribute('data-remover-despesa')) !== null) { estado.despesas.splice(+i, 1); aoAlterar(); renderizarAba('despesas'); return; }
    if ((i = t.getAttribute('data-duplicar-despesa')) !== null) { var c = JSON.parse(JSON.stringify(estado.despesas[+i])); c.id = novoId('d'); c.nome = (c.nome || '') + ' (cópia)'; estado.despesas.splice(+i + 1, 0, c); aoAlterar(); renderizarAba('despesas'); return; }
    if ((i = t.getAttribute('data-remover-tributo')) !== null) { estado.tributosPagos.splice(+i, 1); aoAlterar(); renderizarAba('tributos'); return; }
    if ((i = t.getAttribute('data-remover-pessoa')) !== null) { estado.folha.pessoas.splice(+i, 1); aoAlterar(); renderizarAba('folha'); return; }
    if ((i = t.getAttribute('data-remover-socio')) !== null) { estado.empresa.socios.splice(+i, 1); if (!estado.empresa.socios.some(function (s) { return s.analisado; })) estado.empresa.socios[0].analisado = true; aoAlterar(); renderizarAba('perfil'); return; }
    if ((i = t.getAttribute('data-remover-cenario')) !== null) { estado.cenariosSalvos.splice(+i, 1); salvar(true); renderizarAba('cenarios'); return; }
    if ((i = t.getAttribute('data-duplicar-mes')) !== null) { estado.receitas.meses[+i] = JSON.parse(JSON.stringify(estado.receitas.meses[+i - 1])); aoAlterar(); renderizarAba('receitas'); notificar(M.MESES[+i - 1] + ' copiado para ' + M.MESES[+i] + '.'); return; }
    if ((i = t.getAttribute('data-copiar-seguintes')) !== null) { for (var k = +i; k < 12; k++) estado.receitas.meses[k] = JSON.parse(JSON.stringify(estado.receitas.meses[+i - 1])); aoAlterar(); renderizarAba('receitas'); notificar(M.MESES[+i - 1] + ' copiado até dezembro.'); return; }
  }

  function aoDigitar(ev) {
    var t = ev.target;
    if (t.id === 'ui-comparar') { ui.comparar = t.checked; desenharGraficosAnuais(); return; }
    if (t.hasAttribute('data-curva')) { ui.curvas[t.getAttribute('data-curva')] = t.checked; desenharOtimizacao(); return; }
    if (t.hasAttribute('data-ui-unidade')) { ui.unidade = t.value; renderizarAba('cenarios'); return; }
    if (t.id === 'ui-ano-param') { ui.anoParametros = +t.value; renderizarAba('parametros'); return; }
    if (t.hasAttribute('data-socio-analisado')) { estado.empresa.socios.forEach(function (s, j) { s.analisado = j === +t.getAttribute('data-socio-analisado'); }); aoAlterar(); return; }
    var caminho = t.getAttribute('data-bind');
    if (!caminho) return;
    var tipo = t.getAttribute('data-tipo'), v;
    if (tipo === 'bool') v = t.checked;
    else if (tipo === 'radio') { if (!t.checked) return; v = t.value; }
    else v = t.value;
    if (t.getAttribute('data-conv') === 'int') v = v === '' ? '' : parseInt(v, 10);
    if ((tipo === 'moeda' || tipo === 'numero') && v !== '' && num(v) === null) t.setAttribute('aria-invalid', 'true');
    else t.removeAttribute('aria-invalid');
    definir(estado, caminho, v);
    aoAlterar();
    // mudanças que alteram a estrutura da aba
    if (ev.type === 'change' && /(\.categoria|\.natureza|\.tipoValor|\.tipo$|politica|modoPreenchimento|analise\.ano|mesInicioPlanejamento|dataAbertura)$/.test(caminho)) {
      if (caminho === 'analise.ano' && !PL.anos[v]) return;
      renderizarAba(ui.aba);
    }
    if (ev.type === 'change' && /\.rb|receitas\.meses\./.test(caminho)) {
      var k = +caminho.split('.')[2] + 1, cel = document.querySelector('[data-rb="' + k + '"]');
      if (cel) cel.textContent = brl(rbMes(k));
    }
  }

  function aoSairCampo(ev) {
    var t = ev.target;
    if (t.id === 'incremento-livre') {
      var v = num(t.value);
      if (v !== null && v >= 10) { estado.analise.incrementoProLabore = v; aoAlterar(); renderizarAba('folha'); notificar('Incremento de ' + brl(v) + ' aplicado.'); }
      return;
    }
    if (t.getAttribute('data-tipo') === 'moeda' && t.value !== '' && num(t.value) !== null) t.value = fmtInput(t.value);
  }

  function fecharMenus() { document.querySelectorAll('details.menu[open]').forEach(function (d) { d.removeAttribute('open'); }); }

  // ------------------------------------------------------------ inicialização

  function iniciar() {
    if (MODO_ARTEFATO) document.querySelectorAll('[data-somente-arquivo]').forEach(function (el) { el.hidden = true; });
    document.querySelectorAll('[data-rotulo-artefato]').forEach(function (el) { if (MODO_ARTEFATO) el.textContent = el.getAttribute('data-rotulo-artefato'); });
    var salvo = lerLocal(CHAVE);
    var uiSalvo = lerLocal(CHAVE_UI);
    if (uiSalvo && uiSalvo.aba && ABAS.some(function (a) { return a[0] === uiSalvo.aba; })) ui.aba = uiSalvo.aba;
    var hash = (location.hash || '').replace('#', '');
    if (ABAS.some(function (a) { return a[0] === hash; })) ui.aba = hash;
    if (salvo) {
      estado = M.mesclarComPadrao(salvo);
      atualizarStatus('Dados carregados deste navegador.');
    } else {
      estado = window.DadosExemplo.criar();
      atualizarStatus('Exemplo fictício carregado. Seus dados ficam só neste navegador.');
    }
    if (!PL.anos[estado.analise.ano]) estado.analise.ano = PL.anoPadrao;
    document.addEventListener('click', aoClicar);
    document.addEventListener('input', aoDigitar);
    document.addEventListener('change', aoDigitar);
    document.addEventListener('focusout', aoSairCampo);
    var timerRedim = null;
    window.addEventListener('resize', function () {
      clearTimeout(timerRedim);
      timerRedim = setTimeout(function () {
        if (ui.aba === 'painel') desenharGraficosAnuais();
        if (ui.aba === 'cenarios') { desenharOtimizacao(); desenharTornado(); }
      }, 200);
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { document.getElementById('fundo-modal').hidden = true; fecharMenus(); } });
    document.getElementById('arquivo-backup').addEventListener('change', function (ev) { if (ev.target.files[0]) importarBackup(ev.target.files[0]); ev.target.value = ''; });
    document.getElementById('versao-param').textContent = 'Parâmetros legais v' + PL_PADRAO.versao + ' (revisão de ' + PL_PADRAO.dataAtualizacao.split('-').reverse().join('/') + '). Motor v' + M.versao + '.';
    renderizarTudo();
    if (!salvo) executarAnalise();
  }

  window.SimuladorUI = { estado: function () { return estado; }, analise: function () { return analise; }, executarAnalise: executarAnalise, irPara: irPara, parametros: function () { return PL; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
