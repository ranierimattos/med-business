/*
 * INTERFACE
 * Três áreas: Resultado (painel), Dados (formulário em 5 etapas) e Relatório,
 * mais as Tabelas legais em painel lateral e o menu Arquivo.
 * Nenhum cálculo tributário é feito aqui: todos os números exibidos vêm de
 * MotorTributario.simular() ou de Otimizador.executar().
 */
(function () {
  'use strict';
  var M = window.MotorTributario, O = window.Otimizador, G = window.Graficos, X = window.Exportacao;
  var PL_PADRAO = window.ParametrosLegais;
  var CHAVE = 'simulador-tributario-medico-pj:estado:v1';
  var CHAVE_PARAM = 'simulador-tributario-medico-pj:parametros:v1';
  var CHAVE_UI = 'simulador-tributario-medico-pj:ui:v2';
  var MODO_ARTEFATO = !!window.__MODO_ARTEFATO__;
  var esc = G.esc, brl = M.brl, num = M.num, n0 = M.n0;

  var AREAS = ['resultado', 'dados', 'relatorio'];
  var SUBS = [['resumo', 'Resumo'], ['cenarios', 'Cenários'], ['sensibilidade', 'Sensibilidade'], ['memoria', 'Memória de cálculo']];
  var ETAPAS = [
    { n: 1, nome: 'Empresa', sub: 'Período, regime e elegibilidade' },
    { n: 2, nome: 'Receitas', sub: '12 meses e histórico' },
    { n: 3, nome: 'Folha e custos', sub: 'Pró-labore, empregados e despesas' },
    { n: 4, nome: 'Sócio e lucros', sub: 'Pessoa física e distribuição' },
    { n: 5, nome: 'Pagamentos', sub: 'Opcional: conferir DAS e DARF' }
  ];
  // Onde cada alerta do motor se resolve: etapa dos Dados (e campo), plano mês a mês ou tabelas legais.
  var ORIGEM_ALERTA = {
    empresa_inexistente: { etapa: 1, campo: 'empresa.dataAbertura' },
    inicio_atividade: { etapa: 1, campo: 'empresa.dataAbertura' },
    sem_escrituracao: { etapa: 1, campo: 'empresa.contabilidadeRegular' },
    regimes_incompletos: { etapa: 1, campo: 'empresa.contabilidadeRegular' },
    caixa_negativo: { etapa: 1, campo: 'analise.caixaInicialPJ' },
    regime_caixa: { etapa: 1, campo: 'analise.regimeReconhecimento', completo: true },
    hospitalar: { etapa: 1, campo: 'empresa.requisitosHospitalares', completo: true },
    hospitalar_nao: { etapa: 1, campo: 'empresa.requisitosHospitalares', completo: true },
    iss_fixo: { etapa: 1, campo: 'empresa.iss.modoLP', completo: true },
    iss_fixo_me: { etapa: 1, campo: 'empresa.iss.modoSimples', completo: true },
    sem_receita: { etapa: 2 },
    limite_simples: { etapa: 2 },
    sublimite: { etapa: 2 },
    historico_incompleto: { etapa: 2, historico: true },
    caixa_sem_recebida: { etapa: 2, completo: true },
    nao_segregada: { etapa: 2, completo: true },
    prolabore_sem_evidencia: { etapa: 3, campo: 'folha.evidenciaPagamento' },
    prolabore_minimo: { etapa: 3, campo: 'folha.proLaboreAtual' },
    pessoal_como_pj: { etapa: 3 }, veiculo_pf: { etapa: 3 }, veiculo_uso: { etapa: 3 }, clt_em_despesa: { etapa: 3 }, sem_documento: { etapa: 3 },
    distribuicao_excesso: { etapa: 4, campo: 'distribuicao.politica' },
    outras_fontes: { etapa: 4, campo: 'pf.outrasRendasTributaveisAnual' },
    irpfm: { etapa: 4 }, retencao_dividendos: { etapa: 4 },
    nao_residente: { etapa: 4, completo: true },
    darf_sem_codigo: { etapa: 5 }, divergencia: { etapa: 5 },
    fator_r_proximo: { plano: true }, fator_r_proximo_recomendado: { plano: true },
    parametros_projetados: { tabelas: true }
  };
  var UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  var SNN = [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei']];
  var SN = [['sim', 'Sim'], ['nao', 'Não']];
  var COLUNAS_ESSENCIAIS = ['consultas', 'plantoes', 'procedimentos'];

  var PL = clonarParametros();
  var estado = null;
  var analise = null, analiseDesatualizada = false, calculando = false, edicaoPendente = false, efeito = null;
  var versao = 0, cacheSim = { v: -1, res: null, ctx: null };
  var salvoEm = null, salvoFalhou = false, focoPendente = null;
  var ui = {
    area: 'resultado', sub: 'resumo', etapa: 1, modo: 'essencial', comparar: true, unidade: 'anual',
    curvas: { real: true, pjpf: true, v: true, iii: true, presumido: true, lreal: false, banda: true },
    anoParametros: null, memK: null, memPlano: 'recomendado', alertasTodos: false, historicoAberto: false,
    despesasAbertas: {}, inicioVisto: false
  };

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
    salvoFalhou = !ok;
    if (ok) salvoEm = estado.meta.salvoEm;
    atualizarCabecalho();
    if (!silencioso) notificar(ok ? 'Dados salvos neste navegador.' : 'O navegador bloqueou o armazenamento local. Exporte um backup .json pelo menu Arquivo.');
  }
  function carregar() {
    var s = lerLocal(CHAVE);
    if (!s) { notificar('Nenhum dado salvo neste navegador.'); return; }
    definirEstado(M.mesclarComPadrao(s));
    salvoEm = s.meta && s.meta.salvoEm;
    notificar('Dados carregados.');
  }
  function uiSalvar() {
    gravarLocal(CHAVE_UI, { area: ui.area, sub: ui.sub, etapa: ui.etapa, modo: ui.modo, comparar: ui.comparar, inicioVisto: ui.inicioVisto });
  }

  function definirEstado(e) {
    estado = e;
    analise = null; analiseDesatualizada = false; efeito = null; edicaoPendente = false;
    ui.memK = null; ui.despesasAbertas = {};
    versao++;
    renderizarArea();
    atualizarCabecalho();
    agendarAnalise(30);
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
  function mediaPlanejada(plano, k0) { return M.r2(plano.slice(k0 - 1).reduce(function (s, v) { return s + v; }, 0) / Math.max(1, 13 - k0)); }

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
  function sinal0(v) { return Math.abs(v) < 0.5 ? brl0(0) : (v > 0 ? '+' : '') + brl0(v); }
  function pp(v) { return (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v).toFixed(1).replace('.', ',') + ' p.p.'; }
  function classeSinal(v, invertido) { if (Math.abs(v) < 0.005) return ''; return (v > 0) !== !!invertido ? 'negativo' : 'positivo'; }
  function nomeRegime(r) { return O.nomeRegime(r); }
  function mesLongo(k) { return M.MESES_LONGOS[k - 1]; }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function horaSalvo(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? 'Salvo às ' + hora : 'Salvo em ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + hora;
  }

  // ------------------------------------------------------------ controles

  function idDe(caminho) { return 'f-' + caminho.replace(/\./g, '-'); }
  function inp(caminho, op) {
    op = op || {};
    var v = obter(estado, caminho);
    var tipo = op.tipo || 'moeda';
    var val = v === undefined || v === null ? '' : v;
    if (tipo === 'moeda' && val !== '') val = fmtInput(val);
    var attrs = ' id="' + idDe(caminho) + '" data-bind="' + caminho + '" data-tipo="' + tipo + '"';
    if (tipo === 'data') return '<input type="date"' + attrs + ' value="' + esc(val) + '"' + (op.dis ? ' disabled' : '') + (op.aria ? ' aria-label="' + esc(op.aria) + '"' : '') + '>';
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
  function cartao(titulo, sub, corpo, cls, id) {
    return '<article class="bloco cartao' + (cls ? ' ' + cls : '') + '"' + (id ? ' id="' + id + '"' : '') + '><header><h3>' + esc(titulo) + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</header>' + corpo + '</article>';
  }
  function subtitulo(t) { return '<h5 class="subtitulo">' + esc(t) + '</h5>'; }
  function tabela(cab, linhas, op) {
    op = op || {};
    var h = '<div class="tabela-rolagem"' + (op.maxH ? ' style="max-height:' + op.maxH + 'px"' : '') + '><table class="' + (op.cls || '') + '"' + (op.id ? ' id="' + op.id + '"' : '') + '><thead><tr>';
    cab.forEach(function (c) { var t = typeof c === 'string' ? { t: c } : c; h += '<th' + (t.num ? ' class="num"' : (t.centro ? ' class="centro"' : '')) + (t.title ? ' title="' + esc(t.title) + '"' : '') + '>' + esc(t.t) + '</th>'; });
    h += '</tr></thead><tbody>' + linhas.join('') + '</tbody>';
    if (op.rodape) h += '<tfoot>' + op.rodape + '</tfoot>';
    return h + '</table></div>';
  }
  function td(v, cls) { return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</td>'; }
  function tdn(v, cls) { return '<td class="num' + (cls ? ' ' + cls : '') + '">' + v + '</td>'; }
  function selo(texto, tipo) { return '<span class="selo selo-' + (tipo || 'neutro') + '">' + esc(texto) + '</span>'; }
  function anexoTag(a) { return a ? '<span class="anexo ' + a + '">' + a + '</span>' : '—'; }
  function mesesOp() { var a = []; for (var k = 1; k <= 12; k++) a.push([k, M.MESES[k - 1]]); return a; }
  function legendaHtml(itens) {
    return '<div class="legenda">' + itens.map(function (l) {
      var chave = l.tipo === 'area' ? '<span class="chave area" style="background:' + l.cor + '"></span>' :
        (l.tipo === 'ponto' ? '<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="' + l.cor + '"/></svg>' :
          '<span class="chave' + (l.tipo === 'tracejada' ? ' tracejada' : '') + '" style="border-color:' + l.cor + '"></span>');
      return '<span class="item-leg">' + chave + esc(l.nome) + '</span>';
    }).join('') + '</div>';
  }

  function statusSelo(st) {
    return { elegivel: selo('Elegível', 'ok'), inelegivel: selo('Inelegível', 'crit'), indeterminado: selo('Validar elegibilidade', 'alerta'), estimativa_incompleta: selo('Estimativa incompleta', 'alerta') }[st] || selo(st);
  }

  // ------------------------------------------------------------ navegação

  function hashAtual() {
    var h = ui.area;
    if (ui.area === 'resultado' && ui.sub !== 'resumo') h += '/' + ui.sub;
    if (ui.area === 'dados') h += '/' + ui.etapa;
    return h;
  }
  function lerHash() {
    var p = (location.hash || '').replace(/^#/, '').split('/');
    if (AREAS.indexOf(p[0]) < 0) return false;
    ui.area = p[0];
    if (p[0] === 'resultado') ui.sub = SUBS.some(function (s) { return s[0] === p[1]; }) ? p[1] : 'resumo';
    if (p[0] === 'dados' && +p[1] >= 1 && +p[1] <= 5) ui.etapa = +p[1];
    return true;
  }
  function navegar(area, extra) {
    extra = extra || {};
    if (area) ui.area = area;
    if (extra.sub) ui.sub = extra.sub;
    if (extra.etapa) ui.etapa = extra.etapa;
    var h = '#' + hashAtual();
    if (location.hash !== h) { try { location.hash = h; } catch (e) { /* sem histórico */ } }
    mostrarArea(extra.manterRolagem);
  }
  function aoMudarHash() {
    if (location.hash === '#' + hashAtual()) return;
    if (lerHash()) mostrarArea(false);
  }
  function mostrarArea(manterRolagem) {
    AREAS.forEach(function (a) {
      var el = document.getElementById('area-' + a);
      var ativo = a === ui.area;
      el.hidden = !ativo;
      if (!ativo) el.innerHTML = '';
    });
    document.querySelectorAll('[data-area]').forEach(function (l) {
      if (l.getAttribute('data-area') === ui.area) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
    });
    renderizarArea();
    uiSalvar();
    if (!manterRolagem) window.scrollTo(0, 0);
    aplicarFocoPendente();
  }

  var RENDER_AREA = {};
  function renderizarArea() {
    var el = document.getElementById('area-' + ui.area);
    if (!el || !estado) return;
    try { el.innerHTML = RENDER_AREA[ui.area](); } catch (e) { el.innerHTML = '<div class="aviso critico">Erro ao exibir esta área: ' + esc(e.message) + '. Os dados não foram perdidos.</div>'; if (window.console) console.error(e); }
    if (ui.area === 'resultado') { try { desenharResultado(); } catch (e2) { if (window.console) console.error(e2); } }
    if (ui.area === 'relatorio') { try { desenharRelatorio(); } catch (e3) { if (window.console) console.error(e3); } }
  }
  function aplicarFocoPendente() {
    if (!focoPendente) return;
    var alvo = document.getElementById(focoPendente);
    focoPendente = null;
    if (!alvo) return;
    alvo.scrollIntoView({ block: 'center' });
    try { alvo.focus({ preventScroll: true }); } catch (e) { alvo.focus(); }
    alvo.classList.add('destacado');
    setTimeout(function () { alvo.classList.remove('destacado'); }, 2400);
  }
  function rolarPara(id) {
    if (ui.area !== 'resultado' || ui.sub !== 'resumo') navegar('resultado', { sub: 'resumo' });
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: 'start' });
  }
  function irParaAlerta(codigo) {
    var o = ORIGEM_ALERTA[codigo];
    if (!o) return;
    if (o.plano) { rolarPara('plano'); return; }
    if (o.tabelas) { abrirGaveta(); return; }
    if (o.completo) ui.modo = 'completo';
    if (o.historico) ui.historicoAberto = true;
    focoPendente = o.campo ? idDe(o.campo) : null;
    navegar('dados', { etapa: o.etapa });
  }

  // ------------------------------------------------------------ cabeçalho e recálculo

  function atualizarCabecalho() {
    var t = document.getElementById('identificacao');
    if (!t || !estado) return;
    var partes = [];
    if (salvoFalhou) partes.push('<span class="status-erro">Não salvo: armazenamento bloqueado</span>');
    else if (salvoEm) partes.push('<span>' + esc(horaSalvo(salvoEm)) + '</span>');
    if (estado.meta.exemplo) partes.push(selo('Exemplo fictício', 'exemplo'));
    if (calculando || !analise) partes.push(selo('Recalculando…', 'info'));
    else if (analiseDesatualizada) partes.push(selo('Resultado desatualizado', 'alerta'));
    t.innerHTML = partes.join(' ');
  }

  var timerAnalise = null;
  function agendarAnalise(atraso) {
    clearTimeout(timerAnalise);
    timerAnalise = setTimeout(executarAnalise, atraso === undefined ? 900 : atraso);
  }
  function executarAnalise() {
    clearTimeout(timerAnalise);
    calculando = true;
    atualizarCabecalho();
    atualizarEfeito();
    // pequena pausa para o navegador mostrar o indicador antes do cálculo
    setTimeout(function () {
      var anterior = analise, porEdicao = edicaoPendente, versaoInicio = versao;
      edicaoPendente = false;
      try {
        analise = O.executar(estado, { parametros: PL });
        analiseDesatualizada = versao !== versaoInicio;
        if (porEdicao && anterior) {
          efeito = {
            atual: M.r2(analise.atual.anual.custoTotal - anterior.atual.anual.custoTotal),
            recomendado: M.r2(analise.recomendado.anual.custoTotal - anterior.recomendado.anual.custoTotal),
            economia: M.r2(analise.economia - anterior.economia)
          };
        }
      } catch (e) {
        if (window.console) console.error(e);
        notificar('Erro no cálculo: ' + e.message);
      }
      calculando = false;
      atualizarCabecalho();
      if (ui.area === 'dados') { atualizarEfeito(); atualizarEtapas(); }
      else renderizarArea();
    }, 20);
  }

  var timerDerivados = null;
  function aoAlterar(atrasoAnalise) {
    versao++;
    if (analise) analiseDesatualizada = true;
    if (estado.meta.exemplo) estado.meta.editado = true;
    edicaoPendente = true;
    salvarAuto();
    agendarAnalise(atrasoAnalise !== undefined ? atrasoAnalise : (ui.area === 'dados' ? 1200 : 150));
    clearTimeout(timerDerivados);
    timerDerivados = setTimeout(atualizarDerivados, 250);
  }
  var DERIVADOS = {}, modoContagem = false;
  function derivado(nome, f) {
    DERIVADOS[nome] = f;
    if (modoContagem) return '';
    return '<div data-derivado="' + nome + '">' + f() + '</div>';
  }
  function atualizarDerivados() {
    atualizarCabecalho();
    var el = document.getElementById('area-' + ui.area);
    if (!el) return;
    el.querySelectorAll('[data-derivado]').forEach(function (d) {
      var f = DERIVADOS[d.getAttribute('data-derivado')];
      if (f) { try { d.innerHTML = f(); } catch (err) { d.innerHTML = '<div class="aviso critico">' + esc(err.message) + '</div>'; } }
    });
  }
  function atualizarEfeito() {
    var d = document.querySelector('#area-dados [data-derivado="efeito"]');
    if (d) d.innerHTML = efeitoHtml();
  }
  function atualizarEtapas() {
    var d = document.querySelector('#area-dados [data-derivado="etapas"]');
    if (d) d.innerHTML = etapasNavHtml();
  }

  // ------------------------------------------------------------ RESULTADO

  function opcoesCenarioReceita() {
    var a = estado.analise;
    function p(v) { var n = n0(v); return (n > 0 ? '+' : (n < 0 ? '−' : '')) + String(Math.abs(n)).replace('.', ',') + '%'; }
    return [['base', 'Base'], ['conservador', 'Conservadora (' + p(a.fatorConservador) + ')'], ['otimista', 'Otimista (' + p(a.fatorOtimista) + ')'], ['personalizado', 'Personalizada (' + p(a.fatorPersonalizado) + ')']];
  }

  RENDER_AREA.resultado = function () {
    var e = estado, a = analise;
    var anos = Object.keys(PL.anos).map(function (x) { return [x, PL.anos[x].rotulo || x]; });
    var ano = a ? a.ano : e.analise.ano;
    var h = '<div class="cabecalho-area">' +
      '<div class="titulo-area"><h2>Resultado ' + esc(ano) + '</h2>' +
      '<div class="subabas" role="tablist" aria-label="Seções do resultado">' + SUBS.map(function (s) {
        return '<button role="tab" class="subaba" id="sub-' + s[0] + '" data-sub="' + s[0] + '" aria-selected="' + (ui.sub === s[0]) + '" aria-controls="painel-sub">' + s[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="controles-area">' +
      '<label class="controle">Ano ' + sel('analise.ano', anos, { conv: 'int' }) + '</label>' +
      '<label class="controle">Receita ' + sel('analise.cenarioReceita', opcoesCenarioReceita()) + '</label>' +
      '<button class="alternar" data-acao="comparar" aria-pressed="' + ui.comparar + '"><span class="trilho" aria-hidden="true"><span class="pino"></span></span>Comparar com o plano atual</button>' +
      '</div></div>';
    h += '<div id="painel-sub" role="tabpanel" aria-labelledby="sub-' + ui.sub + '" class="painel-sub">';
    if (!a) h += carregandoHtml();
    else h += { resumo: resumoHtml, cenarios: cenariosHtml, sensibilidade: sensibilidadeHtml, memoria: memoriaAbaHtml }[ui.sub](a);
    h += '</div>';
    h += '<p class="nota-rodape">Cálculos feitos neste navegador, sem envio de dados. Parâmetros de ' + esc(ano) + ' ' + esc(rotuloStatus(parametrosAno().status)) + '. Ferramenta de apoio: valide com o contador.</p>';
    return h;
  };

  function carregandoHtml() {
    return '<section class="heroi carregando" aria-busy="true"><div class="heroi-texto"><span class="heroi-rotulo">Calculando</span><h3>Simulando regimes e planos de pró-labore…</h3><p>Cada ponto é uma simulação completa de 12 meses. Leva cerca de um segundo.</p></div></section>';
  }

  function desenharResultado() {
    if (!analise) return;
    if (ui.sub === 'resumo') { desenharCusto(false); desenharFatorR(); desenharTributosMes(); desenharRendaMes(); }
    if (ui.sub === 'cenarios') { desenharCusto(true); desenharCaixa(); }
    if (ui.sub === 'sensibilidade') desenharTornado();
  }

  // --- Resumo

  function tituloRecomendacao(a) {
    if (a.semVantagemRelevante) return 'Manter a estrutura atual';
    var reg = nomeRegime(a.regimeRecomendado);
    var verbo = a.regimeRecomendado === a.regimeReferencia ? 'Ficar no ' + reg : 'Passar para o ' + reg;
    var r = a.recomendado, k0 = a.ctx.k0;
    if (a.tipoPlano === 'atual') return verbo + ' e manter o pró-labore atual';
    if (a.tipoPlano === 'uniforme') return verbo + ' com pró-labore fixo de ' + brl0(r.proLabore[11]) + ' por mês';
    var plan = r.proLabore.slice(k0 - 1), minimo = Math.min.apply(null, plan);
    var altos = [];
    plan.forEach(function (v, i) { if (v > minimo + 1) altos.push(k0 + i); });
    var contiguo = altos.length && altos[altos.length - 1] - altos[0] === altos.length - 1;
    if (!contiguo) return verbo + ' e variar o pró-labore mês a mês';
    if (altos.length === 1) return verbo + ' e concentrar o pró-labore em ' + mesLongo(altos[0]);
    return verbo + ' e concentrar o pró-labore de ' + mesLongo(altos[0]) + ' a ' + mesLongo(altos[altos.length - 1]);
  }

  function explicacaoRecomendacao(a) {
    var rec = a.recomendado, at = a.atual, partes = [];
    if (a.semVantagemRelevante) {
      partes.push('A melhor alternativa encontrada economiza ' + brl(Math.max(0, a.economia)) + ' no ano, abaixo da materialidade de ' + brl(a.materialidade) + '. Um ganho desse tamanho não compensa o trabalho e o risco da mudança.');
    } else {
      if (rec.regime === 'simples') {
        var viram = [];
        rec.meses.forEach(function (m, i) { if (m.anexo === 'III' && at.meses[i].anexo !== 'III' && m.rb > 0) viram.push(m.k); });
        if (viram.length) partes.push('A folha dos últimos 12 meses chega a 28% da receita em ' + mesLongo(viram[0]) + ', e ' + (viram.length === 1 ? '1 mês sai' : viram.length + ' meses saem') + ' do Anexo V para o III.');
      }
      if (a.regimeRecomendado !== a.regimeReferencia) partes.push('Com as mesmas receitas e despesas, o ' + nomeRegime(a.regimeRecomendado) + ' custa ' + brl0(a.economia) + ' a menos que o ' + nomeRegime(a.regimeReferencia) + '. A mudança de regime vale a partir de janeiro.');
      if (a.tipoPlano === 'variavel' && a.equilibrio && a.equilibrio.aumentoProLabore && a.equilibrio.aumentoProLabore.para === null) partes.push('Nenhum pró-labore fixo acima do atual chega a economizar.');
      if (!partes.length) partes.push('Custo total de ' + brl0(rec.anual.custoTotal) + ' contra ' + brl0(at.anual.custoTotal) + ' no plano atual.');
    }
    if (a.qualidade.nivel === 'baixa') partes.push('Dados incompletos: trate como hipótese, não como recomendação.');
    return partes.join(' ');
  }

  function heroiHtml(a) {
    var econ = a.economia, custoAtual = a.atual.anual.custoTotal;
    return '<section class="heroi" aria-labelledby="heroi-titulo"><div class="heroi-texto">' +
      '<span class="heroi-rotulo">' + (a.semVantagemRelevante ? 'Conclusão da análise' : 'Melhor alternativa encontrada') + '</span>' +
      '<h3 id="heroi-titulo">' + esc(tituloRecomendacao(a)) + '</h3>' +
      '<p>' + esc(explicacaoRecomendacao(a)) + '</p>' +
      '<div class="linha-acoes"><button class="btn btn-claro" data-rolar="plano">Ver plano mês a mês</button><button class="btn btn-contorno" data-sub="memoria">Como foi calculado</button></div></div>' +
      '<div class="heroi-numero"><span class="heroi-legenda">Economia projetada no ano</span><span class="heroi-valor" id="economia-projetada">' + brl(econ) + '</span>' +
      '<span class="heroi-legenda">' + (econ > 0 && custoAtual > 0 ? pct(econ / custoAtual, 1) + ' do custo atual · ' : '') + 'estimativa, validar com o contador</span></div></section>';
  }

  function indicadoresHtml(a) {
    var r = a.recomendado, at = a.atual, R = r.anual, A = at.anual;
    function anexos(res) { return res.regime === 'simples' ? res.anual.mesesAnexoIII + ' de ' + (res.anual.mesesAnexoIII + res.anual.mesesAnexoV) : '—'; }
    var simples = r.regime === 'simples' || at.regime === 'simples';
    var itens = [
      { r: 'Custo tributário total', v: brl0(R.custoTotal), at: brl0(A.custoTotal), d: R.custoTotal - A.custoTotal, f: sinal0, bom: -1 },
      { r: 'Carga sobre a receita', v: pct(R.cargaEfetiva, 1), at: pct(A.cargaEfetiva, 1), d: (R.cargaEfetiva - A.cargaEfetiva) * 100, f: pp, bom: -1, tol: 0.05 },
      { r: 'Renda líquida pessoal', v: brl0(R.rendaLiquidaPF), at: brl0(A.rendaLiquidaPF), d: R.rendaLiquidaPF - A.rendaLiquidaPF, f: sinal0, bom: 1 },
      simples ? { r: 'Meses no Anexo III', v: anexos(r), at: anexos(at), d: (r.regime === 'simples' ? R.mesesAnexoIII : 0) - (at.regime === 'simples' ? A.mesesAnexoIII : 0), f: function (d) { return (d > 0 ? '+' : '') + plural(d, 'mês', 'meses'); }, bom: 1 }
        : { r: 'Tributos da empresa', v: brl0(R.tributosPJ), at: brl0(A.tributosPJ), d: R.tributosPJ - A.tributosPJ, f: sinal0, bom: -1 }
    ];
    return itens.map(function (k) {
      var zero = Math.abs(k.d) < (k.tol || 0.5);
      var cls = zero ? 'neutro' : ((k.d > 0) === (k.bom > 0) ? 'bom' : 'ruim');
      return '<div class="kpi"><span class="rotulo">' + esc(k.r) + '</span><span class="valor">' + k.v + '</span>' +
        (ui.comparar ? '<span class="comparacao"><span class="delta ' + cls + '">' + (zero ? 'igual ao atual' : k.f(k.d)) + '</span>' + (zero ? '' : 'atual: ' + k.at) + '</span>' : '') + '</div>';
    }).join('');
  }

  function resFatorR(a) { return a.recomendado.regime === 'simples' ? a.recomendado : (a.atual.regime === 'simples' ? a.atual : null); }

  function resumoHtml(a) {
    var h = heroiHtml(a);
    h += '<section class="kpis kpis-4" aria-label="Indicadores">' + indicadoresHtml(a) + '</section>';
    var fr = resFatorR(a);
    var legFr = [{ nome: fr === a.recomendado ? 'Recomendado' : 'Atual', cor: fr === a.recomendado ? 'var(--accent)' : 'var(--series-2)' }];
    if (fr === a.recomendado && ui.comparar && a.atual.regime === 'simples' && a.atual !== a.recomendado) legFr.push({ nome: 'Atual', cor: 'var(--series-2)' });
    h += '<div class="linha-cartoes">' +
      cartao('Custo tributário total por pró-labore mensal', 'R$ por ano · pró-labore fixo nos meses planejados · cada ponto é uma simulação completa', '<div id="legenda-custo"></div><div class="grafico" id="grafico-custo"></div><p class="small muted" id="nota-custo"></p>', 'largo') +
      (fr ? cartao('Fator "r" por mês', 'Folha dos últimos 12 meses ÷ receita dos últimos 12 meses' + (fr === a.atual && a.recomendado !== a.atual ? ' · plano atual' : ''), legendaHtml(legFr) + '<div class="grafico" id="grafico-fr"></div>' + reguaFatorR(fr, '', true)) : '') +
      '</div>';
    var legTrib = [{ nome: a.recomendado.regime === 'simples' ? 'DAS' : 'Tributos da empresa', cor: 'var(--accent)', tipo: 'area' }, { nome: 'INSS', cor: 'var(--accent-2)', tipo: 'area' }, { nome: 'IRPF', cor: 'var(--series-7)', tipo: 'area' }];
    if (ui.comparar && a.atual !== a.recomendado) legTrib.push({ nome: 'Total do plano atual', cor: 'var(--series-2)' });
    h += '<div class="linha-cartoes">' +
      cartao('Tributos por mês, plano recomendado', 'R$ por mês · IRPF anual distribuído pelo pró-labore (o IRRF retido é antecipação)', legendaHtml(legTrib) + '<div class="grafico" id="grafico-trib"></div>') +
      cartao('Pró-labore e lucros recebidos por mês', 'R$ por mês, plano recomendado', legendaHtml([{ nome: 'Pró-labore', cor: 'var(--accent)', tipo: 'area' }, { nome: 'Lucros distribuídos', cor: 'var(--azul-claro)', tipo: 'area' }]) + '<div class="grafico" id="grafico-renda"></div>') +
      '</div>';
    h += planoMesAMesHtml(a);
    var al = a.alertas;
    h += '<section class="bloco" aria-labelledby="titulo-alertas"><header><h3 id="titulo-alertas">Alertas e pontos de revisão (' + al.length + ')</h3><p>Não impedem a simulação, mas limitam as conclusões que dependem dos dados ausentes.</p></header>' +
      alertasHtml(al, ui.alertasTodos ? 0 : 6) +
      (al.length > 6 ? '<div><button class="btn" data-acao="alertas-todos" aria-expanded="' + ui.alertasTodos + '">' + (ui.alertasTodos ? 'Mostrar só os 6 principais' : 'Ver todos os ' + al.length + ' alertas') + '</button></div>' : '') + '</section>';
    return h;
  }

  function reguaFatorR(res, titulo, compacta) {
    var h = '<div class="grid-regua">' + (titulo ? '<div class="rotulo" style="margin-bottom:6px">' + esc(titulo) + '</div>' : '') + '<div class="regua' + (compacta ? ' regua-6' : '') + '">';
    res.meses.forEach(function (m) {
      var semRec = !m.ativo || m.rb <= 0;
      var cls = semRec || !m.anexo ? 'sem' : m.anexo;
      h += '<div class="regua-mes ' + cls + '" title="' + esc(m.rotulo + ': FS12 ' + brl(m.fs12) + ' ÷ RBT12 ' + brl(m.rbt12)) + '"><span class="m">' + m.rotulo.split('/')[0] + '</span><span class="r">' + (m.ativo ? pctR(m.fatorR) : '—') + '</span><span class="a">' + (semRec ? 'sem receita' : (m.anexo ? 'Anexo ' + m.anexo : nomeRegime(res.regime).replace('Lucro ', 'L. '))) + '</span></div>';
    });
    return h + '</div></div>';
  }

  function planoMesAMesHtml(a) {
    var r = a.recomendado, at = a.atual, simples = r.regime === 'simples';
    var irR = irpfMensalProjetado(r), R = r.anual;
    var linhas = r.meses.map(function (m, i) {
      return '<tr class="' + (m.realizado ? 'realizado' : '') + '">' + td('<strong>' + m.rotulo + '</strong>' + (m.realizado ? ' <span class="xs muted">realizado</span>' : '')) + tdn(brl0(at.proLabore[i]), 'muted') + tdn('<strong>' + brl0(m.proLabore) + '</strong>') +
        (simples ? tdn(pctR(m.fatorR)) + td(anexoTag(m.anexo), 'centro') : '') + tdn(brl0(m.tributosPJ)) + tdn(brl0(m.inss)) + tdn(brl0(irR[i])) + tdn(brl0(m.dividendoMedico)) + tdn(brl0(m.caixaFinal)) + '</tr>';
    });
    var rod = '<tr><td>Ano</td>' + tdn(brl0(at.anual.proLabore)) + tdn(brl0(R.proLabore)) + (simples ? '<td></td>' + td(R.mesesAnexoIII + ' × III', 'centro') : '') + tdn(brl0(R.tributosPJ)) + tdn(brl0(R.inss)) + tdn(brl0(M.soma(irR))) + tdn(brl0(R.dividendoMedico)) + tdn(brl0(R.caixaFinalPJ)) + '</tr>';
    var cab = ['Mês', { t: 'Pró-labore atual', num: true }, { t: 'Pró-labore sugerido', num: true }].concat(simples ? [{ t: 'Fator "r"', num: true }, { t: 'Anexo', centro: true }] : [])
      .concat([{ t: simples ? 'DAS' : 'Tributos da empresa', num: true }, { t: 'INSS', num: true }, { t: 'IRPF (projetado)', num: true }, { t: 'Lucros', num: true }, { t: 'Caixa final', num: true }]);
    var sub = (a.tipoPlano === 'variavel' ? 'Exige ata fixando o pró-labore de cada mês, pagamento efetivo e eSocial/DCTFWeb em dia. ' : '') + 'Regime: ' + nomeRegime(r.regime) + '. Meses realizados não mudam.';
    return cartao('Plano mês a mês', sub, tabela(cab, linhas, { cls: 'tabela-compacta', rodape: rod }), 'plano', 'plano');
  }

  function acaoAlerta(al) {
    var o = ORIGEM_ALERTA[al.codigo];
    if (!o) return '';
    if (o.plano) return '<button class="link" data-rolar="plano">Ver o plano mês a mês</button>';
    if (o.tabelas) return '<button class="link" data-acao="tabelas">Ver tabelas legais</button>';
    return '<button class="link" data-alerta="' + esc(al.codigo) + '">Revisar em Dados › ' + esc(ETAPAS[o.etapa - 1].nome) + '</button>';
  }
  function alertasHtml(al, limite) {
    if (!al.length) return '<div class="aviso ok">Nenhum alerta para os dados atuais.</div>';
    var ic = { critico: '!', atencao: '!', info: 'i' }, nome = { critico: 'Crítico', atencao: 'Atenção', info: 'Informação' };
    return '<div class="alertas-grade">' + (limite ? al.slice(0, limite) : al).map(function (a) {
      return '<div class="alerta ' + a.nivel + '"><span class="ic" aria-hidden="true">' + ic[a.nivel] + '</span><strong>' + nome[a.nivel] + ': ' + esc(a.titulo) + '</strong><p>' + esc(a.detalhe) + '</p>' + (a.limita ? '<span class="lim">Limita: ' + esc(a.limita) + '</span>' : '') + acaoAlerta(a) + '</div>';
    }).join('') + '</div>';
  }

  function qualidadeHtml(q) {
    var h = '<div style="display:flex;gap:10px;align-items:center"><strong style="font-size:1.4rem">' + q.nota + '/100</strong>' + selo('Qualidade ' + q.nivel, q.nivel === 'alta' ? 'ok' : (q.nivel === 'média' ? 'alerta' : 'crit')) + '</div><div class="medidor"><span style="width:' + q.nota + '%"></span></div><ul class="small" style="margin:0;padding-left:1.1em;display:grid;gap:3px">';
    q.itens.forEach(function (i) { h += '<li>' + (i.ok ? '✓ ' : '✗ ') + esc(i.texto) + (i.ok ? '' : ' <span class="muted">— ' + esc(i.efeito) + '</span>') + '</li>'; });
    return h + '</ul>';
  }

  var CORES_CURVA = { real: 'var(--accent)', v: 'var(--series-4)', iii: 'var(--series-1)', presumido: 'var(--series-7)', lreal: 'var(--series-5)' };

  function desenharCusto(detalhado) {
    var cont = document.getElementById(detalhado ? 'grafico-otim' : 'grafico-custo');
    if (!cont || !analise) return;
    var a = analise, div = detalhado && ui.unidade === 'mensal' ? 12 : 1;
    var cS = a.regimes.simples.curva, cP = a.regimes.presumido.curva, cR = a.regimes.real.curva;
    function pts(c, campo) { return c.map(function (p) { return { x: p.P, y: M.r2((campo ? p[campo] : p.custo) / div) }; }); }
    var temFR = a.curvaV.length > 0;
    var regAtual = a.regimeReferencia;
    var vis = detalhado ? ui.curvas : { real: true, v: true, iii: true, presumido: true, lreal: a.regimeRecomendado === 'real' || regAtual === 'real', banda: false, pjpf: false };
    var nomes = {
      real: 'Simples, regra real do fator "r"' + (regAtual === 'simples' ? ' (regime atual)' : ''),
      v: 'Simples sempre no Anexo V', iii: 'Simples no Anexo III (hipotético)',
      presumido: 'Lucro Presumido' + (regAtual === 'presumido' ? ' (regime atual)' : ''),
      lreal: 'Lucro Real (estimativa)' + (regAtual === 'real' ? ' (regime atual)' : '')
    };
    var series = [
      { id: 'real', nome: nomes.real, cor: CORES_CURVA.real, pontos: pts(cS), largura: 3, visivel: vis.real },
      { id: 'v', nome: nomes.v, cor: CORES_CURVA.v, pontos: temFR ? pts(a.curvaV) : [], tracejado: true, visivel: vis.v && temFR },
      { id: 'iii', nome: nomes.iii, cor: CORES_CURVA.iii, pontos: temFR ? pts(a.curvaIII) : [], tracejado: true, visivel: vis.iii && temFR },
      { id: 'presumido', nome: nomes.presumido, cor: CORES_CURVA.presumido, pontos: pts(cP), visivel: vis.presumido },
      { id: 'lreal', nome: nomes.lreal, cor: CORES_CURVA.lreal, pontos: pts(cR), visivel: vis.lreal }
    ];
    var areas = [];
    if (vis.banda) areas.push({ id: 'banda', cor: 'var(--accent)', opacidade: 0.10, superior: a.banda.map(function (b) { return { x: b.P, y: b.max / div }; }), inferior: a.banda.map(function (b) { return { x: b.P, y: b.min / div }; }) });
    if (vis.pjpf && vis.real) {
      areas.push({ id: 'pj', cor: 'var(--series-4)', opacidade: 0.10, superior: pts(cS, 'pj'), inferior: cS.map(function (p) { return { x: p.P, y: 0 }; }) });
      areas.push({ id: 'pf', cor: 'var(--series-7)', opacidade: 0.10, superior: pts(cS), inferior: pts(cS, 'pj') });
    }
    var lim = a.limitesAnexo, marc = [];
    if (lim.primeiro !== null) marc.push({ x: lim.primeiro, rotulo: '1º mês no Anexo III a partir de ' + brl0(lim.primeiro) + (lim.primeiroMes ? ' (' + lim.primeiroMes + ')' : '') });
    if (detalhado && lim.todos !== null) marc.push({ x: lim.todos, rotulo: 'Todos os meses no Anexo III a partir de ' + brl0(lim.todos) });
    var k0 = a.ctx.k0, medAtual = mediaPlanejada(a.atual.proLabore, k0), medRec = mediaPlanejada(a.recomendado.proLabore, k0);
    var melhorU = a.regimes[a.regimeRecomendado].melhorUniforme;
    var mesmoPlano = a.recomendado === a.atual;
    var pontos = [];
    if (detalhado) {
      pontos.push({ id: 'minimo', x: melhorU.P, y: melhorU.custo / div, cor: 'var(--series-6)', rotulo: 'Menor custo uniforme: ' + brl0(melhorU.custo / div), forma: 'losango', deslocY: 18 });
      pontos.push({ id: 'atual', x: medAtual, y: a.atual.anual.custoTotal / div, cor: 'var(--series-2)', rotulo: 'Plano atual: ' + brl0(a.atual.anual.custoTotal / div) });
      if (a.tipoPlano === 'variavel') pontos.push({ id: 'recomendado', x: medRec, y: a.recomendado.anual.custoTotal / div, cor: 'var(--accent)', rotulo: 'Plano mensal recomendado (média): ' + brl0(a.recomendado.anual.custoTotal / div), deslocY: 18 });
    } else {
      if (ui.comparar && !mesmoPlano) pontos.push({ id: 'atual', x: medAtual, y: a.atual.anual.custoTotal, cor: 'var(--series-2)', rotulo: 'Plano atual · ' + brl0(a.atual.anual.custoTotal) });
      pontos.push({ id: 'recomendado', x: medRec, y: a.recomendado.anual.custoTotal, cor: 'var(--accent)', rotulo: 'Plano recomendado' + (a.tipoPlano === 'variavel' ? ' (média ' + brl0(medRec) + '/mês)' : '') + ' · ' + brl0(a.recomendado.anual.custoTotal), deslocY: 18 });
    }
    if (detalhado) {
      var leg = document.getElementById('legenda-otim');
      var itensLeg = ['real', 'v', 'iii', 'presumido', 'lreal'].filter(function (id) { return temFR || (id !== 'v' && id !== 'iii'); });
      leg.innerHTML = itensLeg.map(function (id) { return '<label><input type="checkbox" data-curva="' + id + '"' + (ui.curvas[id] ? ' checked' : '') + '><span class="chave' + (id === 'v' || id === 'iii' ? ' tracejada' : '') + '" style="border-color:' + CORES_CURVA[id] + '"></span>' + esc(nomes[id]) + '</label>'; }).join('') +
        '<label><input type="checkbox" data-curva="pjpf"' + (ui.curvas.pjpf ? ' checked' : '') + '><span class="chave area" style="background:color-mix(in srgb, var(--series-4) 35%, transparent)"></span>Parcela PJ</label><span class="item-leg"><span class="chave area" style="background:color-mix(in srgb, var(--series-7) 25%, transparent)"></span>Parcela PF</span>' +
        '<label><input type="checkbox" data-curva="banda"' + (ui.curvas.banda ? ' checked' : '') + '><span class="chave area" style="background:color-mix(in srgb, var(--accent) 20%, transparent)"></span>Faixa de incerteza</label>' +
        '<span class="item-leg"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--series-2)"/></svg>Plano atual</span><span class="item-leg"><svg width="12" height="12" aria-hidden="true"><path d="M6 0L12 6L6 12L0 6Z" fill="var(--series-6)"/></svg>Menor custo uniforme</span>' + (a.tipoPlano === 'variavel' ? '<span class="item-leg"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--accent)"/></svg>Plano mensal recomendado</span>' : '');
    } else {
      var l2 = series.filter(function (s) { return s.visivel; }).map(function (s) { return { nome: s.nome, cor: s.cor, tipo: s.tracejado ? 'tracejada' : 'linha' }; });
      if (ui.comparar && !mesmoPlano) l2.push({ nome: 'Plano atual', cor: 'var(--series-2)', tipo: 'ponto' });
      l2.push({ nome: 'Plano recomendado', cor: 'var(--accent)', tipo: 'ponto' });
      document.getElementById('legenda-custo').innerHTML = legendaHtml(l2);
    }
    G.linhas(cont, {
      titulo: 'Custo tributário total por pró-labore mensal', altura: detalhado ? 380 : 340, margem: { l: 76, b: 48, t: 22 },
      x: { formato: function (v) { return G.compacto(v); }, rotulo: 'Pró-labore mensal (R$)' },
      y: { min: 0, formato: G.compacto, rotulo: div === 12 ? 'Custo total (R$/mês, média)' : 'Custo total (R$/ano)' },
      series: series, areas: areas, marcadoresV: marc, pontos: pontos, xs: cS.map(function (p) { return p.P; }),
      dica: function (i) {
        var p = cS[i];
        var l = '<div class="t">Pró-labore ' + brl(p.P) + '/mês</div>';
        function lin(n, v, c) { return '<div class="l"><span class="k"><i style="background:' + c + '"></i>' + esc(n) + '</span><span class="v">' + v + '</span></div>'; }
        l += lin('Simples (regra real)', brl(p.custo / div), CORES_CURVA.real);
        if (detalhado) { l += lin('— parcela PJ', brl(p.pj / div), 'var(--series-4)'); l += lin('— parcela PF (INSS + IR)', brl(p.pf / div), 'var(--series-7)'); }
        if (temFR) { l += lin('Anexo V forçado', brl(a.curvaV[i].custo / div), CORES_CURVA.v); l += lin('Anexo III hipotético', brl(a.curvaIII[i].custo / div), CORES_CURVA.iii); }
        l += lin('Lucro Presumido', brl(cP[i].custo / div), CORES_CURVA.presumido);
        if (vis.lreal) l += lin('Lucro Real', brl(cR[i].custo / div), CORES_CURVA.lreal);
        l += lin('Meses no Anexo III', p.mesesIII + '/' + (p.mesesIII + p.mesesV), 'transparent');
        if (vis.banda) l += lin('Faixa de incerteza', brl0(a.banda[i].min / div) + ' a ' + brl0(a.banda[i].max / div), 'transparent');
        if (!p.viavel) l += '<div class="l"><span class="k">Caixa insuficiente neste ponto</span></div>';
        return l;
      }
    });
    cont.setAttribute('data-pontos', JSON.stringify(cS.map(function (p) { return [p.P, p.custo]; })));
    if (detalhado) {
      var marcasTxt = marc.map(function (x) { return x.rotulo; }).concat(pontos.map(function (x) { return x.rotulo + ' (pró-labore ' + brl0(x.x) + ')'; }));
      document.getElementById('notas-otim').innerHTML = '<p>' + esc(marcasTxt.join(' · ')) + '</p>Mudança de anexo calculada pela regra real do fator "r" (histórico + plano), não em ponto arbitrário. Faixa de incerteza: envoltória dos cenários ' + esc(a.variantesBanda.join(', ')) + '. ' + (a.historicoIncompleto ? 'Histórico incompleto: a faixa inclui hipóteses para a folha ausente. ' : '') + 'Planos marcados no pró-labore médio dos meses planejados.';
    } else {
      document.getElementById('nota-custo').textContent = (a.tipoPlano === 'variavel' ? 'O ponto do plano recomendado fica abaixo das curvas porque o pró-labore varia de mês a mês, o que um valor fixo não reproduz. ' : '') + 'A sub-seção Cenários mostra as curvas com faixa de incerteza e separação entre empresa e pessoa física.';
    }
  }

  function eixoMeses(cont) {
    var estreito = cont.clientWidth && cont.clientWidth < 420;
    return { min: 1, max: 12, ticks: estreito ? [1, 3, 5, 7, 9, 11] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], formato: function (k) { return M.MESES[k - 1]; } };
  }
  function dicaMes(res, i, linhas) {
    return '<div class="t">' + esc(res.meses[i].rotulo) + '</div>' + linhas.map(function (l) { return '<div class="l"><span class="k"><i style="background:' + l[2] + '"></i>' + esc(l[0]) + '</span><span class="v">' + l[1] + '</span></div>'; }).join('');
  }

  function desenharFatorR() {
    var cont = document.getElementById('grafico-fr');
    if (!cont) return;
    var a = analise, fr = resFatorR(a);
    var at = a.atual.regime === 'simples' && a.atual !== fr && ui.comparar ? a.atual : null;
    function serie(res, id, nome, cor, largura) { return { id: id, nome: nome, cor: cor, largura: largura, marcadores: true, pontos: res.meses.map(function (m) { return { x: m.k, y: m.ativo ? m.fatorR : NaN }; }) }; }
    var series = [serie(fr, 'r', fr === a.recomendado ? 'Recomendado' : 'Atual', fr === a.recomendado ? 'var(--accent)' : 'var(--series-2)', 3)];
    if (at) series.unshift(serie(at, 'a', 'Atual', 'var(--series-2)', 2));
    G.linhas(cont, {
      titulo: 'Fator r por mês', altura: 220, margem: { l: 44, b: 30, r: 12, t: 16 }, x: eixoMeses(cont),
      y: { min: 0, formato: function (v) { return Math.round(v * 100) + '%'; } },
      referenciasH: [{ y: 0.28, rotulo: '28%: Anexo III' }], series: series, xs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      dica: function (i) {
        var l = [[series[series.length - 1].nome, pctR(fr.meses[i].fatorR) + ' · ' + (fr.meses[i].anexo ? 'Anexo ' + fr.meses[i].anexo : '—'), series[series.length - 1].cor]];
        if (at) l.push(['Atual', pctR(at.meses[i].fatorR) + ' · ' + (at.meses[i].anexo ? 'Anexo ' + at.meses[i].anexo : '—'), 'var(--series-2)']);
        return dicaMes(fr, i, l);
      }
    });
  }

  function desenharTributosMes() {
    var cont = document.getElementById('grafico-trib');
    if (!cont) return;
    var a = analise, r = a.recomendado, at = a.atual;
    var irR = irpfMensalProjetado(r), irA = irpfMensalProjetado(at);
    var totA = at.meses.map(function (m, i) { return M.r2(m.tributosPJ + m.inss + irA[i]); });
    var comp = ui.comparar && at !== r;
    var nomePJ = r.regime === 'simples' ? 'DAS' : 'Tributos da empresa';
    G.barras(cont, {
      titulo: 'Tributos por mês, plano recomendado', altura: 240, categorias: r.meses.map(function (m) { return M.MESES[m.k - 1]; }), y: { formato: G.compacto },
      series: [
        { nome: 'PJ', cor: 'var(--accent)', valores: r.meses.map(function (m) { return m.tributosPJ; }), pilha: 't' },
        { nome: 'INSS', cor: 'var(--accent-2)', valores: r.meses.map(function (m) { return m.inss; }), pilha: 't' },
        { nome: 'IRPF', cor: 'var(--series-7)', valores: irR, pilha: 't' }
      ].concat(comp ? [{ nome: 'Atual', cor: 'var(--series-2)', tipo: 'linha', valores: totA }] : []),
      dica: function (i) {
        var m = r.meses[i];
        return dicaMes(r, i, [[nomePJ, brl(m.tributosPJ), 'var(--accent)'], ['INSS', brl(m.inss), 'var(--accent-2)'], ['IRPF projetado', brl(irR[i]), 'var(--series-7)'], ['Total recomendado', brl(M.r2(m.tributosPJ + m.inss + irR[i])), 'transparent']].concat(comp ? [['Total do plano atual', brl(totA[i]), 'var(--series-2)']] : []));
      }
    });
  }

  function desenharRendaMes() {
    var cont = document.getElementById('grafico-renda');
    if (!cont) return;
    var r = analise.recomendado;
    G.barras(cont, {
      titulo: 'Pró-labore e lucros recebidos por mês', altura: 240, categorias: r.meses.map(function (m) { return M.MESES[m.k - 1]; }), y: { formato: G.compacto },
      series: [{ nome: 'PL', cor: 'var(--accent)', valores: r.proLabore }, { nome: 'Lucros', cor: 'var(--azul-claro)', valores: r.meses.map(function (m) { return m.dividendoMedico; }) }],
      dica: function (i) { return dicaMes(r, i, [['Pró-labore', brl(r.proLabore[i]), 'var(--accent)'], ['Lucros distribuídos', brl(r.meses[i].dividendoMedico), 'var(--azul-claro)'], ['Retenção sobre lucros', brl(r.meses[i].retencaoDividendos), 'transparent']]); }
    });
  }

  function desenharCaixa() {
    var cont = document.getElementById('grafico-caixa');
    if (!cont) return;
    var a = analise, r = a.recomendado, at = a.atual, comp = ui.comparar && at !== r;
    function serie(res, id, nome, cor) { return { id: id, nome: nome, cor: cor, marcadores: true, pontos: res.meses.map(function (m) { return { x: m.k, y: m.caixaFinal }; }) }; }
    var series = (comp ? [serie(at, 'a', 'Atual', 'var(--series-2)')] : []).concat([serie(r, 'r', 'Recomendado', 'var(--accent)')]);
    G.linhas(cont, {
      titulo: 'Caixa da empresa ao fim do mês', altura: 260, margem: { l: 64, b: 34 }, x: eixoMeses(cont), y: { formato: G.compacto },
      series: series, referenciasH: a.ctx.reserva > 0 ? [{ y: a.ctx.reserva, rotulo: 'Reserva mínima' }] : [], xs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      dica: function (i) { return dicaMes(r, i, [['Recomendado', brl(r.meses[i].caixaFinal), 'var(--accent)'], ['Distribuído no mês', brl(r.meses[i].distribuicao), 'transparent']].concat(comp ? [['Atual', brl(at.meses[i].caixaFinal), 'var(--series-2)']] : [])); }
    });
  }

  // --- Cenários

  function cenariosHtml(a) {
    var h = cartao('Comparação de cenários', 'Valores anuais com as mesmas receitas, despesas e premissas, do menor para o maior custo. Diferenças negativas significam custo menor que o atual.', comparacaoHtml(a, true));
    h += '<section class="bloco"><header><h3>Curvas de custo por regime</h3><p>Eixo X: pró-labore mensal uniforme nos meses planejados. Eixo Y: custo total ' + (ui.unidade === 'anual' ? 'anual' : 'médio mensal') + '. Cada ponto é uma simulação completa do motor.</p></header>' +
      '<div class="linha-acoes"><span class="segmentado" role="radiogroup" aria-label="Unidade"><label class="seg"><input type="radio" class="sr-only" name="unidade" value="anual" data-ui-unidade' + (ui.unidade === 'anual' ? ' checked' : '') + '><span>Anual</span></label><label class="seg"><input type="radio" class="sr-only" name="unidade" value="mensal" data-ui-unidade' + (ui.unidade === 'mensal' ? ' checked' : '') + '><span>Mensal médio</span></label></span></div>' +
      '<div class="legenda" id="legenda-otim"></div><div class="grafico" id="grafico-otim"></div><div id="notas-otim" class="small muted"></div></section>';
    h += '<div class="linha-cartoes">' + (a.cenariosReceita ? cartao('Cenários de receita', 'Melhor pró-labore fixo de cada regime em cada cenário de receita', cenariosReceitaTabela(a)) : '') + cartao('Regimes disponíveis', 'Elegibilidade com os dados informados', regimesDisponiveisHtml(a)) + '</div>';
    h += cartao('Caixa da empresa ao fim do mês', 'R$ · plano recomendado' + (ui.comparar && a.atual !== a.recomendado ? ' e plano atual' : ''), legendaHtml([{ nome: 'Recomendado', cor: 'var(--accent)' }].concat(ui.comparar && a.atual !== a.recomendado ? [{ nome: 'Atual', cor: 'var(--series-2)' }] : [])) + '<div class="grafico" id="grafico-caixa"></div>');
    h += cenariosSalvosHtml();
    return h;
  }

  function comparacaoHtml(a, ordenar) {
    var lista = a.cenarios.slice();
    if (ordenar) lista.sort(function (x, y) { return x.custoTotal - y.custoTotal; });
    var linhas = lista.map(function (c) {
      var ehRec = c.nome === 'Cenário otimizado';
      return '<tr class="' + (ehRec ? 'destaque' : '') + '"><td style="min-width:200px"><strong>' + esc(c.nome) + '</strong><br><span class="xs muted">' + esc(c.regra) + '</span></td>' + tdn(brl(c.proLaboreMedio)) + tdn(brl(c.das)) + tdn(brl(c.inss)) + tdn(brl(c.irpf + c.irpfm)) + tdn(brl(c.outros)) + tdn(brl(c.custoAdm)) + tdn('<strong>' + brl(c.custoTotal) + '</strong>') + tdn(brl(c.rendaLiquida)) +
        tdn(c.difMensal === undefined ? '—' : sinal(c.difMensal), c.difMensal === undefined ? '' : classeSinal(c.difMensal)) + tdn(c.difAnual === undefined ? '—' : sinal(c.difAnual), c.difAnual === undefined ? '' : classeSinal(c.difAnual)) + tdn(c.regime === 'simples' ? c.mesesIII + '/' + (c.mesesIII + c.mesesV) : '—') + td(c.viavel ? '' : selo('Caixa insuficiente', 'crit')) + '</tr>';
    });
    return tabela(['Cenário', { t: 'Pró-labore médio', num: true }, { t: 'DAS', num: true }, { t: 'INSS', num: true }, { t: 'IRPF + IRPFM', num: true }, { t: 'Outros tributos', num: true }, { t: 'Custo adm.', num: true }, { t: 'Custo total', num: true }, { t: 'Renda líquida', num: true }, { t: 'Dif. mensal', num: true }, { t: 'Dif. anual', num: true }, { t: 'Meses III', num: true }, ''], linhas, { cls: 'tabela-compacta' });
  }

  function cenariosReceitaTabela(a) {
    var linhas = a.cenariosReceita.map(function (c) {
      var r = c.regimes;
      return '<tr>' + td(esc(c.cenario.charAt(0).toUpperCase() + c.cenario.slice(1))) + tdn(brl0(r.simples.receita)) + ['simples', 'presumido', 'real'].map(function (g) { return tdn(brl0(r[g].custo) + '<br><span class="xs muted">PL ' + brl0(r[g].proLabore) + (g === 'simples' ? ' · ' + r[g].mesesIII + ' meses III' : '') + '</span>'); }).join('') + '</tr>';
    });
    return tabela(['Cenário', { t: 'Receita anual', num: true }, { t: 'Simples', num: true }, { t: 'Presumido', num: true }, { t: 'Real (estimativa)', num: true }], linhas);
  }

  function regimesDisponiveisHtml(a) {
    var h = '<div class="lista-regimes">' + ['simples', 'presumido', 'real'].map(function (r) {
      var el = a.elegibilidade[r];
      return '<details class="regime-linha"><summary><span>' + nomeRegime(r) + (r === a.regimeReferencia ? ' <span class="xs muted">(atual)</span>' : '') + '</span>' + statusSelo(el.status) + '</summary><ul class="small">' + el.motivos.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></details>';
    }).join('') + '</div>';
    if (a.equilibrio) {
      h += '<ul class="small lista-simples">' + a.equilibrio.regimes.map(function (r) {
        return '<li>' + (r.faturamentoAnual ? 'O ' + esc(nomeRegime(r.regime)) + ' passaria a valer a pena com receita de cerca de ' + brl0(r.faturamentoAnual) + ' por ano (' + pct(r.multiplicador - 1, 0) + ' sobre a projetada).' : 'Sem cruzamento com o ' + esc(nomeRegime(r.regime)) + ' entre ' + brl0(r.faixaTestada[0]) + ' e ' + brl0(r.faixaTestada[1]) + ' de receita anual: o ' + esc(nomeRegime(a.regimeRecomendado)) + ' segue mais barato em toda a faixa testada.') + '</li>';
      }).join('') + '</ul>';
    }
    return h;
  }

  function cenariosSalvosHtml() {
    var lista = estado.cenariosSalvos || [];
    var acao = '<div class="linha-acoes"><button class="btn" data-acao="salvar-cenario">Salvar cenário para comparar</button></div>';
    if (!lista.length) return bloco('Cenários salvos', '<p class="small muted">Salve análises com nomes diferentes (por exemplo, antes e depois de mudar a receita) para compará-las aqui.</p>' + acao);
    var linhas = lista.map(function (c, i) {
      return '<tr>' + td('<strong>' + esc(c.nome) + '</strong><br><span class="xs muted">' + esc(c.data) + ' · ' + c.ano + '</span>') + td(nomeRegime(c.regime)) + tdn(brl(c.proLaboreMedio)) + tdn(brl(c.das)) + tdn(brl(c.inss)) + tdn(brl(c.irpf)) + tdn(brl(c.outros)) + tdn(brl(c.custoTotal)) + tdn(brl(c.rendaLiquida)) + tdn(brl(c.receita)) + td('<button class="btn btn-mini btn-perigo" data-remover-cenario="' + i + '">Remover</button>', 'acao') + '</tr>';
    });
    return bloco('Cenários salvos', tabela(['Nome', 'Regime', { t: 'Pró-labore médio', num: true }, { t: 'DAS', num: true }, { t: 'INSS', num: true }, { t: 'IRPF + IRPFM', num: true }, { t: 'Outros', num: true }, { t: 'Custo total', num: true }, { t: 'Renda líquida', num: true }, { t: 'Receita', num: true }, ''], linhas, { cls: 'tabela-compacta' }) + acao);
  }

  // --- Sensibilidade

  function sensibilidadeHtml(a) {
    var h = '';
    if (a.sensibilidade) {
      h += '<section class="bloco"><header><h3>O que mais mexe no custo do plano recomendado</h3><p>' + esc(a.sensibilidade.metodo) + ' Ordenado do maior para o menor impacto; azul reduz o custo e vermelho aumenta.</p></header><div class="grafico" id="grafico-tornado"></div>' +
        '<details class="memoria"><summary>Ver em tabela</summary><div class="conteudo">' + sensibilidadeTabela(a) + '</div></details></section>';
    }
    if (a.equilibrio) h += '<section class="cartoes-equilibrio" aria-label="Pontos de equilíbrio">' + equilibrioCartoes(a) + '</section>';
    if (a.anoSeguinte) h += bloco('Efeito no ano seguinte (estimativa)', anoSeguinteHtml(a));
    return h || '<div class="aviso">Sensibilidade indisponível para esta análise.</div>';
  }

  function equilibrioCartoes(a) {
    var q = a.equilibrio, itens = [], ap = q.aumentoProLabore;
    itens.push(['Pró-labore fixo que já economiza', ap.para ? brl0(ap.para) : 'Nenhum', ap.para ? '+' + brl0(ap.aumento) + ' por mês sobre o atual (' + brl0(ap.de) + ') já reduz o custo em ' + brl0(ap.economia) + ' no ano.' : 'Acima dos ' + brl0(ap.de) + ' atuais, todo valor fixo custa mais no ano.' + (a.tipoPlano === 'variavel' ? ' A economia só vem do plano mensal.' : '')]);
    if (q.fatorRPlanoRecomendado) {
      var f = q.fatorRPlanoRecomendado;
      itens.push(['Fator "r" no plano recomendado', saldoTexto(f.saldo), 'DAS menor em ' + brl0(f.economiaDas) + '; INSS e IRPF maiores em ' + brl0(f.custoAdicionalPessoal) + ' em relação ao pró-labore mínimo (' + plural(f.mesesIII, 'mês', 'meses') + ' no Anexo III).']);
    } else if (q.fatorR) {
      itens.push(['Atingir o fator "r" com valor fixo', saldoTexto(q.fatorR.saldo), 'Com ' + brl0(q.fatorR.proLaboreAlvo) + ' por mês, ' + plural(q.fatorR.mesesIII, 'mês', 'meses') + ' no Anexo III: DAS cai ' + brl0(q.fatorR.economiaDas) + ', INSS e IRPF sobem ' + brl0(q.fatorR.custoAdicionalPessoal) + (q.fatorR.compensa ? '. Compensa.' : '. Não compensa no ano.')]);
    } else itens.push(['Atingir o fator "r"', 'Fora da grade', 'Nenhum pró-labore fixo da grade pesquisada leva algum mês ao Anexo III.']);
    itens.push(['Planejar o ano × decidir mês a mês', brl0(q.miope.diferenca), 'Decidir só pelo custo do próprio mês custaria ' + brl0(q.miope.custo) + '; planejando o ano, ' + brl0(q.miope.otimo) + '. O pró-labore de hoje só reduz o DAS dos meses seguintes.']);
    if (a.anoSeguinte) {
      var s = a.anoSeguinte;
      itens.push(['Efeito em ' + s.ano + ' (projeção)', brl0(s.recomendado.custo), 'Mantendo o pró-labore de dezembro (' + brl0(s.recomendado.proLabore) + '): ' + plural(s.recomendado.mesesIII, 'mês', 'meses') + ' no Anexo III. A estratégia precisa ser refeita a cada ano.']);
    }
    return itens.map(function (i) { return '<div class="cartao-numero"><span class="pergunta">' + esc(i[0]) + '</span><span class="numero">' + esc(i[1]) + '</span><p>' + esc(i[2]) + '</p></div>'; }).join('');
  }

  function saldoTexto(v) { return Math.abs(v) < 0.5 ? 'Empate' : (v > 0 ? 'Economia de ' : 'Custo extra de ') + brl0(Math.abs(v)); }

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

  function desenharTornado() {
    var c = document.getElementById('grafico-tornado');
    if (!c || !analise || !analise.sensibilidade) return;
    var itens = analise.sensibilidade.itens.filter(function (i) { return i.impacto > 0.005; });
    if (!itens.length) { c.innerHTML = '<p class="muted small">Nenhuma variável alterou o custo.</p>'; return; }
    G.tornado(c, { itens: itens, formato: function (v) { return brl0(v); } });
  }

  // --- Memória de cálculo

  function kPadraoMemoria(a) {
    var r = a.recomendado;
    for (var i = a.ctx.k0 - 1; i < 12; i++) if (r.meses[i].anexo === 'III' && a.atual.meses[i].anexo !== 'III') return i + 1;
    return a.ctx.k0;
  }

  function memoriaAbaHtml(a) {
    var res = ui.memPlano === 'atual' ? a.atual : a.recomendado;
    var k = ui.memK || kPadraoMemoria(a);
    var h = '<section class="bloco"><header class="cabecalho-bloco"><div><h3>Memória de cálculo · ' + mesLongo(k) + ' de ' + a.ano + ', plano ' + (ui.memPlano === 'atual' ? 'atual' : 'recomendado') + '</h3><p>Escolha o plano e a competência para ver de onde vem cada número.</p></div>' +
      '<div class="linha-acoes"><label class="controle">Plano <select id="ui-mem-plano"><option value="recomendado"' + (ui.memPlano !== 'atual' ? ' selected' : '') + '>Recomendado</option><option value="atual"' + (ui.memPlano === 'atual' ? ' selected' : '') + '>Atual</option></select></label>' +
      '<label class="controle">Competência <select id="ui-mem-k">' + res.meses.map(function (m) { return '<option value="' + m.k + '"' + (m.k === k ? ' selected' : '') + '>' + m.rotulo + '</option>'; }).join('') + '</select></label></div></header>';
    h += '<div class="grade-3">' + cartaoMemoria1(res, k) + cartaoMemoria2(res, k) + cartaoMemoria3(res) + '</div></section>';
    h += bloco('Todas as competências', memoriaHtml(res), 'Fórmulas, parâmetros e valores considerados e excluídos em cada competência.');
    h += bloco('Como a recomendação foi encontrada', '<ul class="small lista-simples">' + a.otimalidade.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '<li>Tempo de cálculo: ' + a.tempoMs + ' ms, ' + a.avaliacoes + ' simulações.</li></ul>');
    h += bloco('Qualidade dos dados', qualidadeHtml(a.qualidade));
    return h;
  }

  function linhaMem(t, cls) { return '<span' + (cls ? ' class="' + cls + '"' : '') + '>' + t + '</span>'; }

  function cartaoMemoria1(res, k) {
    var mem = res.memoria;
    if (!mem) return '';
    if (res.regime === 'simples') {
      var f = mem.fatorR[k - 1];
      return '<div class="memoria-cartao"><strong>1. Fator "r"</strong>' + linhaMem('Janela: ' + esc(f.janela)) + linhaMem('FS12 = ' + brl(f.fs12), 'tab') + linhaMem('RBT12 = ' + brl(f.rbt12), 'tab') +
        linhaMem('r = ' + brl0(f.fs12) + ' ÷ ' + brl0(f.rbt12) + ' = ' + pctR(f.r) + ' → ' + (f.anexo ? 'Anexo ' + f.anexo : '—'), 'destaque') + linhaMem('Fora da folha: ' + esc(f.excluidos) + '.', 'muted') + '</div>';
    }
    var tri = mem.trimestres ? mem.trimestres[Math.floor((k - 1) / 3)] : null;
    if (!tri) return '';
    var rot = { baseIrpj: 'Base IRPJ', baseCsll: 'Base CSLL', irpj: 'IRPJ (com adicional)', adicional: 'Adicional', csll: 'CSLL', receita: 'Receita', lair: 'LAIR', lucroReal: 'Lucro real', compensacao: 'Compensação' };
    return '<div class="memoria-cartao"><strong>1. Apuração do ' + (Math.floor((k - 1) / 3) + 1) + 'º trimestre</strong>' + Object.keys(rot).filter(function (c) { return typeof tri[c] === 'number'; }).map(function (c) { return linhaMem(rot[c] + ' = ' + brl(tri[c]), 'tab'); }).join('') +
      linhaMem(res.regime === 'presumido' ? 'Base = receita × presunção (32% serviços; 8%/12% hospitalar com requisitos)' : 'Lucro real = LAIR + adições − compensação (até 30%)', 'muted') + '</div>';
  }

  function cartaoMemoria2(res, k) {
    var mem = res.memoria, m = res.meses[k - 1];
    if (!mem) return '';
    if (res.regime === 'simples') {
      var d = mem.das.filter(function (x) { return x.k === k; })[0];
      if (!d) return '<div class="memoria-cartao"><strong>2. Alíquota e DAS</strong>' + linhaMem('Sem DAS nesta competência.') + '</div>';
      var g0 = d.grupos[0] || {};
      var mesmaFaixa = d.grupos.every(function (g) { return g.anexo === g0.anexo && g.faixa === g0.faixa; });
      var h = '<div class="memoria-cartao"><strong>2. Alíquota e DAS</strong>';
      if (mesmaFaixa && g0.anexo) h += linhaMem('Anexo ' + g0.anexo + ', ' + g0.faixa + 'ª faixa: nominal ' + pct(g0.nominal) + ', parcela a deduzir ' + brl(g0.parcelaDeduzir)) + linhaMem('Efetiva = (' + brl0(d.rbt12) + ' × ' + pct(g0.nominal) + ' − ' + brl0(g0.parcelaDeduzir) + ') ÷ ' + brl0(d.rbt12) + ' = ' + pct(g0.efetiva, 2), 'tab');
      h += linhaMem(d.grupos.map(function (g) { return esc(g.rotulo) + ' ' + brl0(g.base) + ' → ' + brl(g.valor) + (mesmaFaixa ? '' : ' (Anexo ' + g.anexo + ', efetiva ' + pct(g.efetiva, 2) + ')'); }).join(' · '), 'tab');
      h += linhaMem('DAS de ' + mesLongo(k) + ' = ' + brl(d.total) + (d.issFora ? ' + ISS fora do DAS ' + brl(d.issFora) : ''), 'destaque');
      return h + '</div>';
    }
    var itens = [['PIS', m.pis], ['Cofins', m.cofins], ['CBS', m.cbs], ['ISS', m.iss + (m.issFora || 0)], ['CPP', m.cpp], ['IRPJ', m.irpj], ['CSLL', m.csll]].filter(function (x) { return x[1]; });
    return '<div class="memoria-cartao"><strong>2. Tributos da empresa no mês</strong>' + itens.map(function (x) { return linhaMem(x[0] + ' = ' + brl(x[1]), 'tab'); }).join('') + linhaMem('Total de ' + mesLongo(k) + ' = ' + brl(m.tributosPJ), 'destaque') + linhaMem('IRPJ e CSLL são apurados por trimestre e aparecem no mês de fechamento.', 'muted') + '</div>';
  }

  function cartaoMemoria3(res) {
    var A = res.anual, I = A.irpf;
    return '<div class="memoria-cartao"><strong>3. Pessoa física no ano</strong>' + linhaMem('Pró-labore ' + brl0(A.proLabore) + ' · INSS ' + brl(A.inss), 'tab') +
      linhaMem('IRPF (' + esc(I.escolhida.opcao) + '): base ' + brl(I.escolhida.base) + ' → devido ' + brl(I.devido), 'tab') +
      linhaMem('Antecipado (IRRF e outras fontes) ' + brl(I.antecipado) + ' → ' + (I.saldo >= 0 ? 'saldo a pagar de ' : 'restituição de ') + brl(Math.abs(I.saldo)), 'tab') +
      (A.irpfmAdicional ? linhaMem('IRPFM adicional ' + brl(A.irpfmAdicional), 'tab') : '') +
      linhaMem('Lucros recebidos ' + brl0(A.dividendoMedico) + (A.retencaoDividendos ? ' (retenção ' + brl(A.retencaoDividendos) + ')' : ''), 'tab') +
      linhaMem('A restituição devolve imposto antecipado: não entra como economia.', 'muted') + '</div>';
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

  // ------------------------------------------------------------ DADOS

  var ocultos = 0;
  // Campo ou trecho que só aparece no modo Completo (no modo Essencial é contado como oculto)
  function soC(html) {
    if (ui.modo === 'completo') return html;
    ocultos += contarCampos(html);
    return '';
  }
  function contarCampos(h) { return (h.match(/class="campo[" ]/g) || []).length; }

  RENDER_AREA.dados = function () {
    var et = ETAPAS[ui.etapa - 1];
    var corpo = conteudoEtapa(ui.etapa);
    var h = '<div class="cabecalho-area"><div class="titulo-area"><h2>Dados da simulação</h2><p>Preencha em qualquer ordem. O resultado é recalculado a cada alteração, e campos vazios são permitidos.</p></div>' +
      '<div class="segmentado" role="group" aria-label="Quantidade de campos"><button class="seg-botao" data-modo="essencial" aria-pressed="' + (ui.modo === 'essencial') + '">Essencial</button><button class="seg-botao" data-modo="completo" aria-pressed="' + (ui.modo === 'completo') + '">Completo</button></div></div>';
    h += '<div class="dados-layout">' +
      '<nav class="etapas" aria-label="Etapas">' + derivado('etapas', etapasNavHtml) + '</nav>' +
      '<section class="etapa" aria-labelledby="etapa-titulo"><div class="etapa-topo"><h3 id="etapa-titulo">' + et.n + '. ' + esc(et.nome) + '</h3><span class="small muted">' + esc(corpo.contagem) + '</span></div>' + corpo.html +
      '<div class="etapa-passos">' + (ui.etapa > 1 ? '<button class="btn btn-grande" data-etapa="' + (ui.etapa - 1) + '">Etapa anterior</button>' : '<span></span>') +
      (ui.etapa < 5 ? '<button class="btn btn-grande btn-primario" data-etapa="' + (ui.etapa + 1) + '">Próxima: ' + esc(ETAPAS[ui.etapa].nome) + '</button>' : '<a class="btn btn-grande btn-primario" href="#resultado" data-area="resultado">Ver resultado</a>') + '</div></section>' +
      '<aside class="efeito" aria-label="Efeito no resultado">' + derivado('efeito', efeitoHtml) + '</aside></div>';
    return h;
  };

  function statusEtapa(n) {
    if (n === 5 && !(estado.tributosPagos || []).length) return { texto: 'opcional', tipo: 'neutro' };
    var al = simAtual().alertas.filter(function (a) { var o = ORIGEM_ALERTA[a.codigo]; return a.nivel !== 'info' && o && o.etapa === n; });
    if (!al.length) return { texto: 'pronto', tipo: 'ok' };
    var crit = al.some(function (a) { return a.nivel === 'critico'; });
    return { texto: plural(al.length, 'aviso', 'avisos'), tipo: crit ? 'crit' : 'alerta' };
  }
  function etapasNavHtml() {
    return ETAPAS.map(function (e) {
      var st = statusEtapa(e.n), atual = e.n === ui.etapa;
      return '<button class="etapa-botao" data-etapa="' + e.n + '"' + (atual ? ' aria-current="step"' : '') + '><span class="etapa-num" aria-hidden="true">' + e.n + '</span><span class="etapa-nomes"><span class="etapa-nome">' + esc(e.nome) + '</span><span class="etapa-sub">' + esc(e.sub) + '</span></span>' + selo(st.texto, st.tipo) + '</button>';
    }).join('');
  }

  function conteudoEtapa(n) {
    ocultos = 0;
    var grupos = GRUPOS[n](), html = '', visiveis = 0;
    grupos.forEach(function (g) {
      if (g.cond && !g.cond()) return;
      if (g.essencial || ui.modo === 'completo') {
        var c = g.html();
        if (!c) return;
        visiveis += contarCampos(c);
        html += '<section class="bloco grupo"><header><h4>' + esc(g.titulo) + '</h4>' + (g.sub ? '<p>' + g.sub + '</p>' : '') + '</header>' + c + '</section>';
      } else {
        modoContagem = true;
        try { ocultos += contarCampos(g.html()); } finally { modoContagem = false; }
      }
    });
    var contagem;
    if (n === 2) contagem = '12 meses · ' + colunasReceita().length + ' colunas';
    else if (n === 5) contagem = plural((estado.tributosPagos || []).length, 'pagamento informado', 'pagamentos informados');
    else contagem = ui.modo === 'completo' ? plural(visiveis, 'campo', 'campos') : visiveis + ' de ' + (visiveis + ocultos) + ' campos · modo Essencial';
    if (ui.modo === 'essencial' && (ocultos > 0 || n === 2)) html += '<p class="small muted nota-modo">' + (ocultos > 0 ? plural(ocultos, 'campo opcional escondido', 'campos opcionais escondidos') + '. ' : 'Há tabelas e opções extras escondidas. ') + '<button class="link" data-modo="completo">Mostrar tudo (modo Completo)</button></p>';
    return { html: html, contagem: contagem };
  }

  var GRUPOS = {};

  GRUPOS[1] = function () {
    var anos = Object.keys(PL.anos).map(function (a) { return [a, PL.anos[a].rotulo || a]; });
    return [
      { titulo: 'Período da análise', essencial: true, html: function () {
        return '<div class="campos">' +
          campo('Ano analisado', sel('analise.ano', anos, { conv: 'int' }), 'Define as tabelas legais usadas.') +
          campo('Planejar a partir de', sel('analise.mesInicioPlanejamento', mesesOp(), { conv: 'int' }), 'Meses anteriores ficam como realizados e não são otimizados.') +
          campo('Caixa da empresa no início do ano', inp('analise.caixaInicialPJ')) +
          campo('Reserva mínima de caixa', inp('analise.reservaCaixaMinima'), 'Planos que deixam o caixa abaixo disso são descartados.') +
          soC(campo('Reconhecimento da receita', sel('analise.regimeReconhecimento', [['competencia', 'Competência (faturamento)'], ['caixa', 'Caixa (recebimento)']]), 'Regime de caixa no Simples: não admitido a partir de 2027.')) +
          '</div>';
      } },
      { titulo: 'Empresa e regime', essencial: true, html: function () {
        return '<div class="campos">' +
          campo('Data de abertura (CNPJ)', inp('empresa.dataAbertura', { tipo: 'data' }), 'Para as regras de início de atividade.') +
          campo('Regime atual', sel('empresa.regimeAtual', [['simples', 'Simples Nacional'], ['presumido', 'Lucro Presumido'], ['real', 'Lucro Real'], ['indefinido', 'Ainda não definido']])) +
          campo('Natureza jurídica', sel('empresa.naturezaJuridica', [['ltda', 'Sociedade limitada (Ltda.)'], ['slu', 'Sociedade limitada unipessoal (SLU)'], ['simples', 'Sociedade simples'], ['simples_pura', 'Sociedade simples uniprofissional'], ['ei', 'Empresário individual'], ['sa', 'Sociedade anônima'], ['cooperativa', 'Cooperativa'], ['outra', 'Outra']])) +
          campo('Contabilidade regular (escrituração)?', sel('empresa.contabilidadeRegular', SNN), 'Define o limite de lucros isentos.') +
          soC(campo('Regime no ano anterior', sel('empresa.regimeAnoAnterior', [['simples', 'Simples Nacional'], ['presumido', 'Lucro Presumido'], ['real', 'Lucro Real'], ['indefinido', 'Não havia empresa']])) +
            campo('Balancetes e demonstrações contábeis?', sel('empresa.temBalancetes', SNN)) +
            campo('Distribuição de lucros formalmente apurada?', sel('empresa.distribuicaoFormalApurada', SNN)) +
            campo('Prejuízo fiscal acumulado (Lucro Real)', inp('empresa.prejuizoFiscalAnterior'))) +
          '</div>';
      } },
      { titulo: 'Regimes disponíveis', sub: 'O simulador só compara regimes legalmente disponíveis. Quando não for possível confirmar, a elegibilidade fica marcada para validação.', essencial: true, html: function () {
        return soC('<div class="campos">' +
          campo('Algum sócio é pessoa jurídica?', sel('empresa.socioPessoaJuridica', SN)) +
          campo('Débitos fiscais sem exigibilidade suspensa?', sel('empresa.debitosSemSuspensao', SNN)) +
          campo('Receita global das empresas dos sócios excede R$ 4,8 mi?', sel('empresa.outrasEmpresasReceitaGlobalExcede', SNN), 'Art. 3º, § 4º, III e IV da LC 123.') +
          campo('Obrigada ao Lucro Real?', sel('empresa.obrigadaLucroReal', SN)) + '</div>') + derivado('elegibilidade', elegibilidadeHtml);
      } },
      { titulo: 'Início recente de atividade', sub: 'Regras específicas de início de atividade (Res. CGSN 140, art. 22; a partir de 2027, Res. CGSN 190).', essencial: true, cond: function () { var c = simAtual().ctx; return isFinite(c.tInicio) && c.tInicio >= 1; }, html: function () {
        return '<div class="campos">' +
          campo('Data do primeiro faturamento', inp('receitas.primeiroFaturamento', { tipo: 'data' })) +
          campo('Estimativa de faturamento dos próximos 12 meses', inp('receitas.estimativa12m'), 'Preenche meses projetados vazios (1/12 por mês).') + '</div>' + derivado('inicio', inicioAtividadeHtml);
      } },
      { titulo: 'Identificação e estrutura', sub: 'CPF, CNPJ e nomes são opcionais e não entram no cálculo.', essencial: false, html: function () {
        return '<div class="campos">' +
          campo('Nome ou identificação', inp('empresa.nome', { tipo: 'texto', ph: 'Opcional' })) +
          campo('CNPJ', inp('empresa.cnpj', { tipo: 'texto', ph: 'Opcional' })) +
          campo('Município', inp('empresa.municipio', { tipo: 'texto' })) +
          campo('UF', sel('empresa.uf', [['', '—']].concat(UFS.map(function (u) { return [u, u]; })))) +
          campo('Atividade principal', inp('empresa.atividadePrincipal', { tipo: 'texto' })) +
          campo('CNAE principal', inp('empresa.cnaePrincipal', { tipo: 'texto', ph: '8630-5/03' })) +
          campo('CNAEs secundários', inp('empresa.cnaesSecundarios', { tipo: 'texto' })) +
          campo('Existem empregados?', sel('empresa.temEmpregados', SN), 'Cadastre-os em Folha e custos.') +
          campo('Sócios têm outras fontes de remuneração?', sel('empresa.outrasFontesRemuneracao', SN)) +
          campo('Sócios participam de outras empresas?', sel('empresa.participaOutrasEmpresas', SN)) +
          '</div>';
      } },
      { titulo: 'ISS, retenções e encargos', essencial: false, html: function () {
        return '<div class="campos">' +
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
          '</div>';
      } },
      { titulo: 'Custos administrativos incrementais (R$/mês)', sub: 'Diferença de honorários contábeis e obrigações acessórias em relação ao regime atual. Os valores-padrão são estimativas: substitua pelo orçamento do seu contador.', essencial: false, html: function () {
        return '<div class="campos">' + campo('Simples Nacional', inp('empresa.custosAdm.simples')) + campo('Lucro Presumido', inp('empresa.custosAdm.presumido')) + campo('Lucro Real', inp('empresa.custosAdm.real')) + '</div>';
      } }
    ];
  };

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
    var ano = estado.analise.ano, tIni = ctx.tInicio, meses = 0, semFat = 0;
    for (var t = tIni; t <= 24; t++) { meses++; if ((ctx.rbT[t] || 0) <= 0) semFat++; }
    return '<p class="small">Abertura em <strong>' + M.rotuloT(tIni, ano) + '</strong> · ' + meses + ' meses de atividade até dez/' + String(ano).slice(2) + ' · ' + semFat + ' mês(es) sem faturamento. A RBT12 é anualizada (média dos meses de atividade × 12) só para definir faixa e alíquota; não representa receita recebida.</p>';
  }

  GRUPOS[2] = function () {
    var e = estado, k0 = n0(e.analise.mesInicioPlanejamento) || 1;
    return [
      { titulo: 'Receitas mensais de ' + e.analise.ano, sub: (k0 > 1 ? 'Meses antes de ' + mesLongo(k0) + ' são realizados; os demais, projeção. ' : '') + '"Receita bruta" = soma dos tipos − cancelamentos − descontos incondicionais.', essencial: true, html: function () {
        var modo = e.receitas.modoPreenchimento;
        return '<div class="linha-acoes"><span class="segmentado" role="radiogroup" aria-label="Forma de preenchimento">' + [['fixa', 'Valor fixo'], ['variavel', 'Mês a mês'], ['cenarios', 'Cenários']].map(function (o) {
          return '<label class="seg"><input type="radio" class="sr-only" name="modo-receita" data-bind="receitas.modoPreenchimento" data-tipo="radio" value="' + o[0] + '"' + (modo === o[0] ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
        }).join('') + '</span></div>' +
          (modo === 'fixa' ? receitaFixaHtml() : '') + (modo === 'cenarios' ? cenariosReceitaHtml() : '') + receitaMensalHtml();
      } },
      { titulo: 'Histórico dos 12 meses anteriores', sub: 'Base da RBT12 e do fator "r" dos primeiros meses. Folha = pró-labore de todos os sócios + salários + 13º + férias efetivamente pagos.', essencial: true, html: function () {
        return '<div class="resumo-linha">' + derivado('hist-resumo', historicoResumoHtml) + '<button class="btn" data-acao="alternar-historico" aria-expanded="' + ui.historicoAberto + '">' + (ui.historicoAberto ? 'Ocultar histórico' : 'Editar histórico') + '</button></div>' + (ui.historicoAberto ? historicoHtml() : '');
      } },
      { titulo: 'Cenários de receita e crescimento', sub: 'Percentuais aplicados apenas sobre a projeção, sem alterar os valores digitados nem o histórico.', essencial: false, html: function () { return e.receitas.modoPreenchimento === 'cenarios' ? '' : cenariosReceitaHtml(); } },
      { titulo: 'Tratamento tributário de cada tipo de receita', sub: 'Atividades diferentes são calculadas separadamente. Não presuma que toda receita médica tem o mesmo tratamento.', essencial: false, html: tratamentoHtml },
      { titulo: 'Adicionar receita a um mês', sub: 'Soma o valor ao mês e tipo escolhidos.', essencial: false, html: function () {
        return '<div class="campos">' +
          '<div class="campo"><label for="add-rec-mes">Mês</label><select id="add-rec-mes">' + mesesOp().map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select></div>' +
          '<div class="campo"><label for="add-rec-tipo">Tipo</label><select id="add-rec-tipo">' + M.TIPOS_RECEITA.map(function (t) { return '<option value="' + t.id + '">' + esc(t.rotulo) + '</option>'; }).join('') + '<option value="outrasReceitas">Outras receitas (financeiras)</option></select></div>' +
          '<div class="campo"><label for="add-rec-valor">Valor (R$)</label><input type="text" id="add-rec-valor" class="num" inputmode="decimal" placeholder="0,00"></div>' +
          '<div class="campo" style="align-self:end"><button class="btn" data-acao="adicionar-receita">Adicionar receita</button></div></div>';
      } },
      { titulo: 'Resumo e projeção dos 12 meses', sub: 'A RBT12 anualizada (início de atividade) define faixa e alíquota; não é receita efetivamente recebida.', essencial: false, html: function () { return derivado('estat-receita', estatisticasReceitaHtml); } }
    ];
  };

  function receitaFixaHtml() {
    var mix = estado.receitas.fixa.mix || {};
    var h = '<div class="campos">' + campo('Receita mensal total', inp('receitas.fixa.total')) + '</div><div class="campos">';
    M.TIPOS_RECEITA.forEach(function (t) { h += campo(t.rotulo + ' (%)', inp('receitas.fixa.mix.' + t.id, { tipo: 'numero', ph: '0' })); });
    var soma = M.TIPOS_RECEITA.reduce(function (a, t) { return a + n0(mix[t.id]); }, 0);
    h += '</div><div class="linha-acoes"><button class="btn" data-acao="aplicar-fixa">Aplicar aos meses projetados</button><span class="small muted">Composição soma ' + soma.toFixed(1).replace('.', ',') + '%. Meses realizados não são alterados.</span></div>';
    return h;
  }

  function cenariosReceitaHtml() {
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

  function colunasReceita() {
    var todos = M.TIPOS_RECEITA.map(function (t) { return [t.id, t.rotulo.replace(' (sem detalhamento)', '')]; })
      .concat([['cancelamentos', 'Canceladas/estornadas'], ['descontos', 'Descontos incondicionais'], ['outrasReceitas', 'Outras receitas'], ['recebida', 'Recebida no mês'], ['aReceber', 'Faturada, não recebida']]);
    if (ui.modo === 'completo') return todos;
    var meses = estado.receitas.meses;
    return todos.filter(function (c) { return COLUNAS_ESSENCIAIS.indexOf(c[0]) >= 0 || meses.some(function (m) { return n0(m[c[0]]) !== 0; }); });
  }
  var colunasDesenhadas = null;
  function receitaMensalHtml() {
    var e = estado, k0 = n0(e.analise.mesInicioPlanejamento) || 1;
    var campos = colunasDesenhadas = colunasReceita();
    var linhas = [];
    for (var k = 1; k <= 12; k++) {
      var l = '<tr class="' + (k < k0 ? 'realizado' : '') + '"><td class="nowrap"><strong>' + M.MESES[k - 1] + '/' + String(e.analise.ano).slice(2) + '</strong>' + (k0 > 1 ? '<br><span class="xs muted">' + (k < k0 ? 'realizado' : 'projeção') + '</span>' : '') + '</td>';
      campos.forEach(function (c) { l += td(inp('receitas.meses.' + (k - 1) + '.' + c[0], { aria: c[1] + ' de ' + M.MESES[k - 1] })); });
      l += '<td class="num" data-rb="' + k + '">' + brl0(rbMes(k)) + '</td>';
      l += '<td class="acao">' + (k < 12 ? '<button class="btn btn-mini" data-duplicar-mes="' + k + '" title="Copiar para o mês seguinte" aria-label="Copiar ' + M.MESES[k - 1] + ' para o mês seguinte">Duplicar ↓</button> <button class="btn btn-mini" data-copiar-seguintes="' + k + '" title="Copiar para todos os meses seguintes" aria-label="Copiar ' + M.MESES[k - 1] + ' até dezembro">Até dez</button>' : '') + '</td></tr>';
      linhas.push(l);
    }
    return tabela([{ t: 'Mês' }].concat(campos.map(function (c) { return { t: c[1] }; })).concat([{ t: 'Receita bruta', num: true }, { t: '' }]), linhas, { cls: 'tabela-compacta tabela-receitas', rodape: '<tr data-totais-receita>' + totaisReceitaHtml(campos) + '</tr>' });
  }
  function totaisReceitaHtml(campos) {
    var meses = estado.receitas.meses, tot = 0;
    for (var k = 1; k <= 12; k++) tot += rbMes(k);
    return '<td>Ano</td>' + (campos || colunasDesenhadas || colunasReceita()).map(function (c) { return tdn(brl0(meses.reduce(function (s, m) { return s + n0(m[c[0]]); }, 0))); }).join('') + tdn(brl0(tot)) + '<td></td>';
  }
  function rbMes(k) {
    var m = estado.receitas.meses[k - 1];
    var b = M.TIPOS_RECEITA.reduce(function (a, t) { return a + Math.max(0, n0(m[t.id])); }, 0);
    return Math.max(0, b - n0(m.cancelamentos) - n0(m.descontos));
  }

  function historicoResumoHtml() {
    var hst = estado.receitas.historico, ano = estado.analise.ano, n = 0, rec = 0, folha = 0;
    for (var t = 1; t <= 12; t++) { if (num(hst[t].receita) !== null) n++; rec += n0(hst[t].receita); folha += n0(hst[t].folha); }
    return '<div class="resumo-texto"><strong>Histórico de ' + (ano - 1) + ' (base do fator "r")</strong><span>' + n + ' de 12 meses com receita · receita ' + brl0(rec) + ' · folha ' + brl0(folha) + '</span></div>' + selo(n === 12 ? 'Completo' : (n ? 'Incompleto' : 'Vazio'), n === 12 ? 'ok' : 'alerta');
  }
  function historicoHtml() {
    var ano = estado.analise.ano, linhas = [];
    for (var t = 0; t <= 12; t++) {
      linhas.push('<tr>' + td('<strong>' + M.rotuloT(t, ano) + '</strong>' + (t === 0 ? '<br><span class="xs muted">só regras de 2027+</span>' : '')) +
        td(inp('receitas.historico.' + t + '.receita', { aria: 'Receita ' + M.rotuloT(t, ano) })) + td(inp('receitas.historico.' + t + '.folha', { aria: 'Folha ' + M.rotuloT(t, ano) })) +
        td(inp('receitas.historico.' + t + '.fgts', { aria: 'FGTS ' + M.rotuloT(t, ano) })) + td(inp('receitas.historico.' + t + '.cpp', { aria: 'CPP ' + M.rotuloT(t, ano) })) + '</tr>');
    }
    return tabela(['Mês', 'Receita bruta', 'Folha (pró-labore + salários)', 'FGTS', 'CPP fora do DAS'], linhas, { cls: 'tabela-compacta' }) + '<p class="xs muted">CPP recolhida fora do DAS (se houver) entra na FS12. Meses vazios são estimados: receita pela média; folha pelo pró-labore atual mais a folha cadastrada.</p>';
  }

  function kpi(rotulo, valor, detalhe, cls) {
    return '<div class="kpi' + (cls ? ' ' + cls : '') + '"><span class="rotulo">' + esc(rotulo) + '</span><span class="valor">' + valor + '</span>' + (detalhe ? '<span class="detalhe">' + detalhe + '</span>' : '') + '</div>';
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
    return h + tabela(['Mês', { t: 'Receita bruta', num: true }, { t: 'Acumulada no ano', num: true }, { t: 'RBT12 (faixa)', num: true }, '', { t: 'Var. mensal', num: true }, { t: 'Ajuste do cenário', num: true }], linhas, { cls: 'tabela-compacta' });
  }

  GRUPOS[3] = function () {
    var e = estado;
    return [
      { titulo: 'Pró-labore do médico', sub: 'Aumentar o pró-labore afeta ao mesmo tempo o caixa da empresa, o INSS, o IRPF e o fator "r" dos meses seguintes. Só valores efetivamente pagos e informados no eSocial entram no fator "r".', essencial: true, html: function () {
        return '<div class="campos">' +
          campo('Pró-labore bruto mensal atual', inp('folha.proLaboreAtual'), 'Antes do INSS e do IRRF.') +
          campo('Pagamento comprovado (recibos/extratos)?', sel('folha.evidenciaPagamento', [['sim', 'Sim'], ['parcial', 'Parcialmente'], ['nao', 'Não']]), 'Só o que foi pago entra no fator "r".') +
          soC(campo('Início do pró-labore', inp('folha.inicioProLabore', { tipo: 'data' })) + campo('Há múltiplas fontes pagadoras?', sel('folha.multiplasFontes', SN))) +
          '</div>' + (ui.modo === 'completo' ? subtitulo('Pró-labore mês a mês') + derivado('folha-mensal', folhaMensalHtml) : '');
      } },
      { titulo: 'Empregados, outros sócios e autônomos', sub: 'Salários, 13º (nov/dez), férias (1/3) e FGTS entram na folha do fator "r". No Presumido e no Real, há CPP de 20% + RAT + terceiros.', essencial: true, html: pessoasHtml },
      { titulo: 'Despesas da empresa', sub: 'No Simples e no Presumido, despesas não mudam o imposto: afetam lucro, caixa e lucros distribuíveis. No Lucro Real, só as dedutíveis e documentadas reduzem IRPJ e CSLL.', essencial: true, html: despesasHtml },
      { titulo: 'Resumo das despesas', sub: 'Diferencia despesa operacional, juros, principal da dívida e aquisição de ativos. Efeito financeiro e efeito tributário aparecem separados.', essencial: false, html: function () { return derivado('resumo-despesas', resumoDespesasHtml); } },
      { titulo: 'Busca de pró-labore', sub: 'Parâmetros do otimizador.', essencial: false, html: function () {
        return '<div class="campos">' +
          campo('Incremento da busca', sel('analise.incrementoProLabore', [['100', 'R$ 100'], ['250', 'R$ 250'], ['500', 'R$ 500'], ['1000', 'R$ 1.000']].concat(['100', '250', '500', '1000'].indexOf(String(e.analise.incrementoProLabore)) < 0 ? [[String(e.analise.incrementoProLabore), brl(n0(e.analise.incrementoProLabore))]] : []))) +
          campo('Outro incremento (R$)', '<input type="text" id="incremento-livre" class="num" inputmode="decimal" placeholder="ex.: 750">', 'Substitui a opção acima ao sair do campo.') +
          campo('Pró-labore mínimo operacional', inp('analise.proLaboreMinimo', { ph: 'salário mínimo' })) +
          campo('Pró-labore máximo', inp('analise.proLaboreMaximo', { ph: 'automático' }), 'Também limitado pelo caixa disponível.') +
          campo('Variação entre meses', sel('analise.variacaoProLabore', [['livre', 'Livre (plano mensal)'], ['uniforme', 'Somente valor uniforme']])) +
          campo('Fim do horizonte', sel('analise.fimHorizonte', [['sustentar', 'Sustentar o Anexo III no mês seguinte'], ['ignorar', 'Ignorar efeitos após dezembro']])) +
          campo('Materialidade (R$/ano)', inp('analise.materialidade'), 'Economias menores não justificam mudança.') +
          '</div><p class="small muted">Diferenças que o modelo respeita: pró-labore declarado ≠ efetivamente pago; base previdenciária limitada ao teto; folha do fator "r" inclui salários e FGTS; distribuição de lucros nunca entra na folha.</p>';
      } }
    ];
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

  function categoriasOp() {
    return M.CATEGORIAS_DESPESA.map(function (g) { return { grupo: g.grupo, itens: g.itens.map(function (it) { return [it[0], it[1]]; }) }; });
  }
  function chaveDespesa(d, i) { return d.id || ('i' + i); }

  function despesasHtml() {
    var lista = estado.despesas;
    var h = '<div class="linha-acoes"><label class="sr-only" for="nova-despesa-cat">Categoria da nova despesa</label><select id="nova-despesa-cat" style="width:auto;max-width:100%">' + categoriasOp().map(function (g) { return '<optgroup label="' + esc(g.grupo) + '">' + g.itens.map(function (it) { return '<option value="' + it[0] + '">' + esc(it[1]) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select><button class="btn btn-primario" data-acao="adicionar-despesa">Adicionar despesa</button></div>';
    if (!lista.length) return h + '<div class="aviso">Nenhuma despesa cadastrada. Sem despesas, lucro e caixa ficam superestimados e o Lucro Real não pode ser estimado.</div>';
    h += '<div class="lista-despesas">' + lista.map(despesaLinhaHtml).join('') + '</div>';
    return h + derivado('total-despesas', function () { var S = simAtual(); return '<p class="small muted">' + plural(lista.length, 'despesa cadastrada', 'despesas cadastradas') + ' · ' + brl0(S.res.anual.despesasOperacionais) + ' por ano em despesas operacionais · clique numa despesa para editar.</p>'; });
  }

  function descricaoDespesa(d) {
    var ini = n0(d.mesInicial) || 1, fim = n0(d.mesFinal) || 12;
    var t;
    if (d.recorrencia === 'unica') t = 'única em ' + M.MESES[ini - 1];
    else t = { mensal: 'mensal', trimestral: 'trimestral', semestral: 'semestral', anual: 'anual' }[d.recorrencia] || d.recorrencia;
    if (d.recorrencia !== 'unica' && (ini > 1 || fim < 12)) t += ', ' + M.MESES[ini - 1] + ' a ' + M.MESES[fim - 1];
    if (n0(d.reajustePct) && n0(d.reajusteMes)) t += ', reajuste de ' + String(d.reajustePct).replace('.', ',') + '% em ' + M.MESES[n0(d.reajusteMes) - 1];
    if (n0(d.corteMes)) t += ', corte em ' + M.MESES[n0(d.corteMes) - 1];
    return t;
  }

  function despesaLinhaHtml(d, i) {
    var cat = M.CATEGORIA_POR_ID[d.categoria] || {};
    var chave = chaveDespesa(d, i);
    var tag = cat.tipo === 'ativo' ? 'investimento' : (d.natureza === 'pessoal' || cat.tipo === 'pessoal' ? 'pessoal' : (d.natureza === 'mista' ? 'misto' : 'empresarial'));
    var valor = d.tipoValor === 'variavel' ? 'variável' : brl0(n0(d.valor)) + (d.recorrencia === 'mensal' ? '/mês' : '');
    return '<details class="despesa" data-despesa="' + esc(chave) + '"' + (ui.despesasAbertas[chave] ? ' open' : '') + '><summary><span class="despesa-nome"><strong>' + esc(d.nome || cat.rotulo || 'Despesa') + '</strong> <span class="muted">· ' + esc(descricaoDespesa(d)) + '</span></span>' + selo(tag, tag === 'pessoal' ? 'info' : (tag === 'misto' ? 'alerta' : 'neutro')) + '<span class="despesa-valor">' + valor + '</span></summary><div class="despesa-corpo">' + despesaHtml(d, i).replace(/class="campo/g, 'class="item-campo campo') + '</div></details>';
  }

  function despesaHtml(d, i) {
    var cat = M.CATEGORIA_POR_ID[d.categoria] || {};
    var p = 'despesas.' + i + '.';
    var tipo = cat.tipo;
    var h = '<div class="item-topo"><span class="linha-acoes">' + esc(cat.grupo || '') +
      (tipo === 'ativo' ? selo('Ativo: deprecia', 'neutro') : '') + (tipo === 'principal' ? selo('Principal: só caixa', 'neutro') : '') + (tipo === 'juros' ? selo('Despesa financeira', 'neutro') : '') +
      (d.documento !== 'sim' && tipo !== 'pessoal' ? selo('Sem documento', 'alerta') : '') +
      (d.tratamento === 'nao_confirmado' && tipo !== 'pessoal' && d.natureza !== 'pessoal' ? selo('Tratamento não confirmado', 'neutro') : '') +
      '</span><span class="linha-acoes"><button class="btn btn-mini" data-duplicar-despesa="' + i + '">Duplicar</button><button class="btn btn-mini btn-perigo" data-remover-despesa="' + i + '">Remover</button></span></div>';
    h += '<div class="campos">' +
      campo('Nome', inp(p + 'nome', { tipo: 'texto' })) +
      campo('Categoria', sel(p + 'categoria', categoriasOp())) +
      campo(d.tipoValor === 'variavel' ? 'Valor (variável — veja abaixo)' : 'Valor (R$)', inp(p + 'valor', { dis: d.tipoValor === 'variavel' })) +
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
    h += '<details class="mais-campos"' + (ui.modo === 'completo' ? ' open' : '') + '><summary>Mais campos: período, documento, tratamento, parcelas, reajuste, corte</summary><div class="campos">' +
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
    return h;
  }

  function resumoDespesasHtml() {
    var S = simAtual(), ctx = S.ctx;
    var grupos = {}, totPes = 0, capex = 0, princ = 0, deprec = 0;
    ctx.despesas.forEach(function (D) {
      Object.keys(D.porGrupo).forEach(function (g) { grupos[g] = (grupos[g] || 0) + D.porGrupo[g]; });
      totPes += D.pessoal; capex += D.ativo; princ += D.principal; deprec += D.depreciacao;
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
    return h;
  }

  GRUPOS[4] = function () {
    var e = estado, k0 = n0(e.analise.mesInicioPlanejamento) || 1, pol = e.distribuicao.politica;
    return [
      { titulo: 'Pessoa física', sub: 'Módulo separado dos tributos da empresa. IRRF e carnê-leão são antecipações; o imposto efetivo é o devido no ajuste anual. Restituição não é economia tributária.', essencial: true, html: function () {
        return '<div class="campos">' +
          campo('Dependentes', inp('pf.dependentes', { tipo: 'numero' })) +
          campo('Despesas médicas dedutíveis (ano)', inp('pf.despesasMedicasAnual'), 'Inclui plano de saúde do titular e dependentes.') +
          campo('Despesas com instrução (ano)', inp('pf.instrucaoAnual'), 'Limite por pessoa aplicado automaticamente.') +
          campo('Outros rendimentos tributáveis (ano)', inp('pf.outrasRendasTributaveisAnual'), 'Salário CLT, aluguéis etc.') +
          soC(campo('Pensão alimentícia judicial (R$/mês)', inp('pf.pensaoMensal')) +
            campo('Previdência privada PGBL (ano)', inp('pf.pgblAnual'), 'Limitada a 12% dos rendimentos tributáveis.') +
            campo('Opção de declaração', sel('pf.opcaoDeclaracao', [['auto', 'A mais vantajosa'], ['completa', 'Completa'], ['simplificada', 'Simplificada']]))) +
          '</div>';
      } },
      { titulo: 'Distribuição de lucros', sub: 'O saldo bancário não é lucro distribuível, e distribuição não é automaticamente isenta. A partir de 2026, pagamentos acima de R$ 50 mil por mês da mesma empresa sofrem retenção de 10%, e o IRPFM alcança rendimentos anuais acima de R$ 600 mil.', essencial: true, html: function () {
        var h = '<div class="campos">' +
          campo('Política', sel('distribuicao.politica', [['automatica', 'Automática (todo lucro disponível, mês a mês)'], ['mensal', 'Valor fixo mensal'], ['trimestral', 'Trimestral'], ['anual', 'Anual (dezembro)'], ['manual', 'Manual por mês']]), pol === 'automatica' ? 'Até R$ 50 mil por mês, sem retenção, se o limite abaixo estiver marcado.' : '') +
          (pol === 'mensal' ? campo('Valor mensal', inp('distribuicao.valorMensal')) : '') +
          campo('Lucros acumulados de anos anteriores', inp('distribuicao.lucrosAcumuladosAnteriores'), 'Somente lucros apurados e não distribuídos.') +
          campo('Lucros até 2025 com distribuição aprovada até 31/12/2025', inp('distribuicao.saldoTransicao2025'), 'Sem retenção e fora da base do IRPFM se pagos em 2026–2028 conforme o ato (interpretação: validar).') +
          soC(campo('Reter do lucro do ano (%)', inp('distribuicao.percentualReter', { tipo: 'numero' })) +
            '<div class="campo" style="align-self:end">' + chk('distribuicao.limitarRetencao', 'Limitar a R$ 50 mil/mês por sócio (evita retenção)') + '</div>') + '</div>';
        if (pol === 'manual' || k0 > 1) {
          var linhas = [];
          for (var k = 1; k <= 12; k++) {
            linhas.push('<tr class="' + (k < k0 ? 'realizado' : '') + '">' + td(M.MESES[k - 1]) + td(k < k0 ? inp('distribuicao.realizadoMes.' + (k - 1), { aria: 'Distribuição realizada ' + M.MESES[k - 1] }) : '—') + td(pol === 'manual' ? inp('distribuicao.manualMes.' + (k - 1), { aria: 'Distribuição planejada ' + M.MESES[k - 1] }) : '—') + '</tr>');
          }
          h += subtitulo('Valores por mês') + tabela(['Mês', 'Distribuição realizada (meses passados)', 'Distribuição planejada (manual)'], linhas, { cls: 'tabela-compacta' });
        }
        return h;
      } },
      { titulo: 'Outras rendas e retenções', essencial: false, html: function () {
        return '<div class="campos">' +
          campo('IR retido nas outras fontes (ano)', inp('pf.irRetidoOutrasFontesAnual')) +
          campo('Salário de contribuição já usado em outras fontes (R$/mês)', inp('pf.salarioContribuicaoOutrasFontesMensal'), 'Reduz o teto disponível do INSS do pró-labore.') +
          campo('INSS descontado em outras fontes (ano)', inp('pf.inssOutrasFontesAnual')) +
          campo('Rendimentos de carnê-leão (ano)', inp('pf.carneLeaoRendimentosAnual')) +
          campo('Carnê-leão pago (ano)', inp('pf.carneLeaoPagoAnual')) +
          campo('Rendimentos isentos (ano)', inp('pf.rendimentosIsentosAnual'), 'Exclua poupança e indenizações (fora da base do IRPFM).') +
          campo('Rendimentos de tributação exclusiva (ano)', inp('pf.rendimentosExclusivosAnual')) +
          campo('IR exclusivo/definitivo pago (ano)', inp('pf.irExclusivoAnual')) +
          campo('Dividendos de outras empresas (ano)', inp('pf.dividendosOutrasEmpresasAnual')) +
          campo('IR retido sobre esses dividendos (ano)', inp('pf.irRetidoDividendosOutrasAnual')) +
          campo('Todas as rendas pessoais foram informadas?', sel('pf.outrasFontesInformadas', SN)) + '</div>';
      } },
      { titulo: 'Sócios', sub: 'Marque o médico analisado. A distribuição de lucros é rateada pela participação.', essencial: false, html: sociosHtml },
      { titulo: 'IRPF e IRPFM estimados (plano atual)', essencial: false, html: function () { return derivado('irpf', irpfHtml); } },
      { titulo: 'Prévia da distribuição mês a mês (plano atual)', essencial: false, html: function () { return derivado('dist-prev', distribuicaoPrevHtml); } }
    ];
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

  function irpfHtml() {
    var S = simAtual(), A = S.res.anual, I = A.irpf, F = A.irpfm;
    function col(o) { return [brl(o.deducoes), brl(o.base), o.faixa, brl(o.impostoTabela), brl(o.reducao), brl(o.devido)]; }
    var c = col(I.completa), s = col(I.simplificada);
    var rot = ['Deduções', 'Base de cálculo', 'Faixa', 'Imposto pela tabela anual', 'Redução (Lei 15.270)', 'Imposto devido'];
    var linhas = rot.map(function (r, i) { return '<tr>' + td(r) + tdn(c[i], I.escolhida.opcao === 'completa' ? 'positivo' : '') + tdn(s[i], I.escolhida.opcao === 'simplificada' ? 'positivo' : '') + '</tr>'; });
    var h = '<p class="small">Rendimentos tributáveis no ano: <strong>' + brl(I.tributaveis) + '</strong>. Opção ' + (estado.pf.opcaoDeclaracao === 'auto' ? 'mais vantajosa: ' : 'escolhida: ') + '<strong>' + I.escolhida.opcao + '</strong>.</p>';
    h += tabela(['', { t: 'Completa', num: true }, { t: 'Simplificada', num: true }], linhas);
    h += '<div class="kpis">' + kpi('IRPF anual devido', brl(I.devido), 'Imposto efetivo do ano') + kpi('Antecipado (IRRF + outras fontes)', brl(I.antecipado), 'Pagamentos do mesmo imposto') + kpi(I.saldo >= 0 ? 'Saldo a pagar no ajuste' : 'Restituição estimada', brl(Math.abs(I.saldo)), 'Diferença entre antecipado e devido') + '</div>';
    var hm = subtitulo('Tributação mínima de altas rendas (IRPFM)');
    if (F.ativo) {
      hm += '<dl class="small lista-def">' +
        '<dt>Rendimentos totais (base)</dt><dd>' + brl(F.rendimentos) + '</dd><dt>Alíquota mínima</dt><dd>' + pct(F.aliquota) + '</dd><dt>Imposto mínimo</dt><dd>' + brl(F.impostoMinimo) + '</dd>' +
        '<dt>(−) IRPF devido e IR exclusivo</dt><dd>' + brl(F.deducoes) + '</dd><dt>(−) Redutor art. 16-B</dt><dd>' + brl(F.redutor) + (F.redutorAplicavel && !S.ctx.demonstracoes ? ' (aplicável, mas exige demonstrações financeiras)' : '') + '</dd><dt>IRPFM adicional devido</dt><dd><strong>' + brl(F.adicional) + '</strong></dd>' +
        '<dt>Retenções sobre dividendos (antecipação)</dt><dd>' + brl(F.retencoes) + '</dd><dt>Saldo do IRPFM</dt><dd>' + brl(F.saldo) + '</dd></dl>';
      if (F.rendimentos <= parametrosAno().irpfm.limiteInferior) hm += '<p class="small muted">Rendimentos abaixo de R$ 600 mil: sem tributação mínima.</p>';
      hm += '<p class="xs muted">Lei 15.270/2025. Regulamentação em evolução: resultado condicionado à validação.</p>';
    } else hm += '<p class="small muted">Sem tributação mínima (IRPFM) no ano de ' + estado.analise.ano + '.</p>';
    var irr = S.res.meses.map(function (m) { var d = m.irrfDetalhe; return '<tr>' + td(m.rotulo) + tdn(brl(m.proLabore)) + tdn(brl(m.inss)) + tdn(d ? (d.usaSimplificado ? 'simplificado ' : 'legais ') + brl(d.deducao) : '—') + tdn(d ? brl(d.base) : '—') + tdn(d ? brl(d.impostoTabela) : '—') + tdn(d ? brl(d.reducao) : '—') + tdn(brl(m.irrf)) + '</tr>'; });
    return '<div class="grade-2"><div class="pilha">' + h + '</div><div class="pilha">' + hm + '</div></div>' + subtitulo('IRRF mensal sobre o pró-labore') +
      tabela(['Mês', { t: 'Pró-labore', num: true }, { t: 'INSS', num: true }, { t: 'Dedução usada', num: true }, { t: 'Base', num: true }, { t: 'Imposto pela tabela', num: true }, { t: 'Redução', num: true }, { t: 'IRRF', num: true }], irr, { cls: 'tabela-compacta' }) +
      '<p class="xs muted">A fonte pagadora usa a dedução mais vantajosa: deduções legais (INSS, dependentes, pensão) ou desconto simplificado mensal. IRRF até R$ 10 não é retido.</p>';
  }

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
    return h + '<ul class="small" style="margin:0;padding-left:1.1em">' + msgs.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
  }

  GRUPOS[5] = function () {
    return [
      { titulo: 'Pagamentos, retenções e provisões', sub: 'Opcional. Serve para conferir o que foi pago com o que o simulador calcula. Um DARF só conta para um tributo quando o código de receita é reconhecido.', essencial: true, html: pagamentosHtml },
      { titulo: 'Conciliação: informado × calculado (plano atual)', sub: 'Divergência = diferença acima de R$ 10 e de 1%. O simulador não presume que os pagamentos informados estejam corretos.', essencial: true, html: function () { return derivado('conciliacao', conciliacaoHtml); } }
    ];
  };

  function pagamentosHtml() {
    var codigos = PL_PADRAO.codigosReceita, completo = ui.modo === 'completo';
    var linhas = estado.tributosPagos.map(function (p, i) {
      var pre = 'tributosPagos.' + i + '.';
      var cod = String(p.codigoReceita || '').replace(/\D/g, '');
      var desc = p.tributo === 'DARF' ? (codigos[cod] ? codigos[cod].descricao : (cod ? 'Código não reconhecido' : 'Informe o código')) : '';
      return '<tr>' + td(sel(pre + 'tributo', [['DAS', 'DAS'], ['INSS', 'INSS descontado do pró-labore'], ['CPP', 'Contribuição patronal'], ['FGTS', 'FGTS'], ['IRRF', 'IRRF sobre pró-labore'], ['DARF', 'DARF'], ['ISS', 'ISS fora do DAS'], ['RETENCAO', 'Retenção sofrida'], ['OUTRO', 'Outro']], { aria: 'Tributo' })) +
        td(inp(pre + 'valor', { aria: 'Valor' })) + td(sel(pre + 'competencia', mesesOp(), { conv: 'int', aria: 'Competência' })) +
        td(inp(pre + 'codigoReceita', { tipo: 'texto', aria: 'Código de receita', ph: p.tributo === 'DARF' ? 'obrigatório' : '' }) + (desc ? '<div class="xs muted">' + esc(desc) + '</div>' : '')) +
        (completo ? td(inp(pre + 'dataPagamento', { tipo: 'data', aria: 'Data do pagamento' })) + td(inp(pre + 'orgao', { tipo: 'texto', aria: 'Órgão' })) + td(sel(pre + 'natureza', [['pago', 'Pagamento'], ['retido', 'Retenção'], ['provisionado', 'Provisão']], { aria: 'Natureza' })) + td(sel(pre + 'confirmado', [['sim', 'Confirmado'], ['nao', 'Não confirmado']], { aria: 'Situação' })) : '') +
        td('<button class="btn btn-mini btn-perigo" data-remover-tributo="' + i + '">Remover</button>', 'acao') + '</tr>';
    });
    var cab = ['Tributo', 'Valor', 'Competência', 'Código de receita'].concat(completo ? ['Pagamento', 'Órgão', 'Natureza', 'Situação'] : []).concat(['']);
    return (linhas.length ? tabela(cab, linhas, { cls: 'tabela-compacta' }) : '<div class="aviso">Nenhum pagamento informado.</div>') + '<div class="linha-acoes"><button class="btn" data-acao="adicionar-tributo">Adicionar pagamento</button></div>';
  }

  function conciliacaoHtml() {
    var S = simAtual(), c = S.conc;
    var linhas = c.linhas.map(function (l) {
      return '<tr>' + td(l.rotulo) + td(l.tributo) + tdn(brl(l.informado)) + tdn(l.calculado === null ? '—' : brl(l.calculado)) + tdn(l.diferenca === null ? '—' : sinal(l.diferenca), l.diverge ? 'negativo' : '') + td(l.diverge ? selo('Divergente', 'alerta') : (l.calculado === null ? selo('Sem cálculo', 'neutro') : selo('Confere', 'ok'))) + '</tr>';
    });
    var h = linhas.length ? tabela(['Competência', 'Tributo', { t: 'Informado', num: true }, { t: 'Calculado', num: true }, { t: 'Diferença', num: true }, 'Situação'], linhas) : '<p class="muted small">Sem pagamentos com competência e valor para conciliar.</p>';
    if (c.naoAtribuidos.length) h += '<div class="aviso atencao">' + plural(c.naoAtribuidos.length, 'DARF sem código reconhecido não foi atribuído', 'DARFs sem código reconhecido não foram atribuídos') + ' a nenhum tributo.</div>';
    return h;
  }

  // --- Painel "Efeito no resultado"

  function dicaEtapa(n) {
    var S = simAtual(), ctx = S.ctx, res = S.res, A = res.anual;
    if (n === 1) {
      var el = S.eleg, ok = [], outros = [];
      ['simples', 'presumido', 'real'].forEach(function (r) { var nome = nomeRegime(r).replace('Lucro ', ''); if (el[r].status === 'elegivel') ok.push(nome); else outros.push(nomeRegime(r) + ': ' + { inelegivel: 'inelegível', indeterminado: 'validar elegibilidade', estimativa_incompleta: 'estimativa incompleta' }[el[r].status]); });
      return (ok.length ? ok.join(', ').replace(/, ([^,]*)$/, ' e $1') + (ok.length > 1 ? ' elegíveis.' : ' elegível.') : 'Nenhum regime confirmado.') + (outros.length ? ' ' + outros.join('; ') + '.' : '') + ' Mudança de regime só vale a partir de janeiro.';
    }
    if (n === 2) {
      return 'Receita de ' + brl0(A.rb) + ' no ano. ' + (ctx.historicoFaltante.length ? 'O histórico de ' + (ctx.ano - 1) + ' está incompleto: o anexo dos primeiros meses é estimado.' : 'O histórico completo de ' + (ctx.ano - 1) + ' define o anexo dos primeiros meses.');
    }
    if (n === 3) {
      var m = res.meses[ctx.k0 - 1];
      if (res.regime !== 'simples') return 'Folha e pró-labore definem o INSS, o IRPF e a CPP no ' + nomeRegime(res.regime) + '.';
      return 'Em ' + mesLongo(m.k) + ', a folha dos últimos 12 meses é ' + pctR(m.fatorR) + ' da receita: ' + (m.fatorR >= 0.28 ? 'acima' : 'abaixo') + ' dos 28% do Anexo III.';
    }
    if (n === 4) {
      var F = A.irpfm;
      if (!F.ativo) return 'Sem tributação mínima (IRPFM) em ' + ctx.ano + '.';
      return 'Rendimentos de ' + brl0(F.rendimentos) + ': ' + (F.rendimentos > parametrosAno().irpfm.limiteInferior ? 'acima de R$ 600 mil, com IRPFM adicional estimado de ' + brl0(F.adicional) + '.' : 'abaixo de R$ 600 mil, sem tributação mínima (IRPFM).');
    }
    var c = S.conc;
    if (!(estado.tributosPagos || []).length) return 'Nenhum pagamento informado. A etapa é opcional e serve para conferência.';
    var t = [];
    if (c.divergencias.length) t.push(plural(c.divergencias.length, 'divergência', 'divergências') + ' entre o informado e o calculado');
    if (c.naoAtribuidos.length) t.push(plural(c.naoAtribuidos.length, 'DARF sem código', 'DARFs sem código'));
    return t.length ? t.join(' e ') + '.' : 'Os pagamentos informados conferem com o cálculo.';
  }

  function efeitoHtml() {
    var S = simAtual(), a = analise;
    var badge = calculando || !a ? selo('recalculando…', 'info') : (analiseDesatualizada ? selo('desatualizado', 'alerta') : selo('atualizado', 'ok'));
    var h = '<div class="efeito-topo"><h3>Efeito no resultado</h3>' + badge + '</div>';
    if (a) {
      h += '<div class="efeito-principal"><span class="small">Economia projetada</span><span class="efeito-valor">' + brl(a.economia) + '</span><span class="small muted">' + brl0(a.atual.anual.custoTotal) + ' hoje → ' + brl0(a.recomendado.anual.custoTotal) + ' no plano recomendado</span></div>';
      if (efeito) {
        var zero = Math.abs(efeito.atual) < 0.5 && Math.abs(efeito.recomendado) < 0.5 && Math.abs(efeito.economia) < 0.5;
        h += '<div class="efeito-ultima"><strong>Última alteração</strong>' + (zero ? '<span class="small">não mudou o resultado.</span>' :
          '<dl class="small"><dt>Custo hoje</dt><dd>' + sinal0(efeito.atual) + '</dd><dt>Plano recomendado</dt><dd>' + sinal0(efeito.recomendado) + '</dd><dt>Economia</dt><dd>' + sinal0(efeito.economia) + '</dd></dl>') + '</div>';
      }
    }
    var m = S.res.meses[S.ctx.k0 - 1], q = S.qualidade;
    function mini(rot, val, det, cls) { return '<div class="mini"><span class="xs">' + esc(rot) + '</span><strong>' + esc(val) + '</strong><span class="xs ' + cls + '">' + esc(det) + '</span></div>'; }
    h += '<div class="efeito-mini">' +
      mini('Fator "r" em ' + M.MESES[m.k - 1], m.ativo ? pctR(m.fatorR) : '—', S.res.regime === 'simples' ? (m.anexo ? 'Anexo ' + m.anexo : '—') : nomeRegime(S.res.regime), m.anexo === 'III' ? 'txt-ok' : 'txt-alerta') +
      mini('Qualidade dos dados', q.nota + '/100', q.nivel, q.nivel === 'alta' ? 'txt-ok' : 'txt-alerta') + '</div>';
    h += '<div class="efeito-dica"><strong>Nesta etapa</strong><p class="small">' + esc(dicaEtapa(ui.etapa)) + '</p></div>';
    h += '<a class="btn btn-escuro btn-grande" href="#resultado" data-area="resultado">Ver resultado completo</a>';
    return h;
  }

  // ------------------------------------------------------------ RELATÓRIO

  // Relatório pensado para A4: cada .folha começa uma página na impressão (Imprimir → Salvar como PDF).
  // Folha 1 é o resumo executivo; tabelas sem "R$" nas células para caber na largura útil de 180 mm.

  function valor0(v) { return brl0(v).replace('R$ ', ''); }
  function difCelula(v, tipo, fmt) {
    if (Math.abs(v) < 0.005) return tdn('—', 'muted');
    return tdn((fmt || sinal)(v), tipo === 'neutro' ? '' : classeSinal(v, tipo === 'renda'));
  }
  function nomeArquivoRelatorio() {
    var ano = analise ? analise.ano : estado.analise.ano;
    return 'Relatório tributário ' + ano + ' - ' + (estado.empresa.nome || 'empresa não identificada');
  }
  function textoCss(s) { return '"' + String(s).replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ') + '"'; }
  // Cabeçalho e rodapé de cada página do PDF (margens da página; a 1ª folha já tem o cabeçalho completo)
  function atualizarEstiloPagina() {
    var el = document.getElementById('estilo-pagina');
    if (!el) { el = document.createElement('style'); el.id = 'estilo-pagina'; document.head.appendChild(el); }
    var a = analise, e = estado;
    var fonte = 'font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 7.5pt; color: #6f7d76;';
    el.textContent = '@page { ' +
      '@top-left { content: ' + textoCss((e.empresa.nome || 'Empresa não identificada') + ' · Relatório de planejamento tributário ' + (a ? a.ano : e.analise.ano) + (e.meta.exemplo ? ' · dados fictícios' : '')) + '; ' + fonte + ' } ' +
      '@top-right { content: ' + textoCss('Gerado em ' + new Date().toLocaleDateString('pt-BR')) + '; ' + fonte + ' } ' +
      '@bottom-left { content: "Estimativa de apoio à decisão, não é valor oficial. Valide com o contador."; ' + fonte + ' } ' +
      '@bottom-right { content: "Página " counter(page) " de " counter(pages); ' + fonte + ' } } ' +
      '@page :first { @top-left { content: none; } @top-right { content: none; } }';
  }

  RENDER_AREA.relatorio = function () {
    var h = '<div class="cabecalho-area nao-imprimir"><div class="titulo-area"><h2>Relatório</h2><p>' + (MODO_ARTEFATO ? 'Texto para quem não tem formação contábil, organizado em folhas A4.' : 'Prévia do PDF: cada folha abaixo começa uma página A4. Em "Imprimir", escolha "Salvar como PDF".') + '</p></div><div class="linha-acoes">' +
      '<a class="btn" href="#resultado" data-area="resultado">Voltar ao resultado</a>' + (MODO_ARTEFATO ? '' : '<button class="btn" data-acao="imprimir">Imprimir ou salvar PDF</button>') + '<button class="btn btn-primario" data-acao="exportar-csv">' + (MODO_ARTEFATO ? 'Copiar CSV' : 'Exportar CSV') + '</button></div></div>';
    if (!analise) return h + carregandoHtml();
    var a = analise, e = estado, P = a.parametros;
    h += '<article class="relatorio">';
    if (analiseDesatualizada) h += '<div class="aviso atencao nao-imprimir">Os dados mudaram depois desta análise; o relatório será atualizado em instantes.</div>';
    h += '<section class="folha" aria-label="Resumo executivo">' + relCabecalho(a, e, P) + relConclusao(a) +
      '<section class="rel-secao"><h3>Hoje e com a recomendação</h3>' + relComparativo(a) +
      '<p class="rel-obs">Estimativas para ' + a.ano + ' com os dados informados. Atual: regime e pró-labore praticados hoje. Recomendado: melhor alternativa encontrada.</p></section>' +
      relGraficoTributos(a) + relPassos(a) + '</section>';
    h += '<section class="folha" aria-label="Detalhamento">' +
      '<section class="rel-secao"><h3><span class="n">1</span>Plano mês a mês</h3><p>' + esc(textoPlanoMensal(a)) + '</p>' + relPlanoMensal(a) + '</section>' +
      relFatorR(a) + '</section>';
    h += '<section class="folha" aria-label="Cenários, plano de ação e premissas">' +
      '<section class="rel-secao"><h3><span class="n">2</span>Cenários comparados</h3><p>Custo de cada alternativa no ano, com as mesmas receitas e despesas, do menor para o maior. Valores em R$; na última coluna, negativo significa custo menor que o atual.</p>' + relCenarios(a) + '</section>' +
      '<section class="rel-secao"><h3><span class="n">3</span>Plano de ação</h3>' + relAcoes(a) + '</section>' + relAnexo(a, P) + '</section>';
    h += '</article>';
    return h;
  };

  function relCabecalho(a, e, P) {
    var socio = (e.empresa.socios || []).filter(function (s) { return s.analisado; })[0];
    var meta = [];
    if (e.empresa.cnpj) meta.push('CNPJ ' + esc(e.empresa.cnpj));
    if (e.empresa.municipio) meta.push(esc(e.empresa.municipio + (e.empresa.uf ? '/' + e.empresa.uf : '')));
    if (socio && socio.nome) meta.push(esc(socio.nome));
    meta.push('Regime atual: ' + esc(nomeRegime(a.regimeReferencia)));
    return '<header class="rel-cabecalho"><div class="rel-sobre"><span>Relatório de planejamento tributário · ' + a.ano + '</span>' + (e.meta.exemplo ? selo('Dados fictícios de exemplo', 'exemplo') : '') + '</div>' +
      '<h2 class="rel-empresa">' + esc(e.empresa.nome || 'Empresa não identificada') + '</h2>' +
      '<p class="rel-meta">' + meta.join(' · ') + '</p>' +
      '<p class="rel-meta">Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' · Parâmetros legais de ' + P.ano + ' ' + esc(rotuloStatus(P.status)) + ' · Qualidade dos dados: ' + a.qualidade.nota + '/100 (' + esc(a.qualidade.nivel) + ')</p></header>';
  }

  function relConclusao(a) {
    var econ = Math.max(0, a.economia), custoAtual = a.atual.anual.custoTotal;
    return '<section class="rel-conclusao"><div class="rel-economia"><span class="rel-rotulo">' + (a.semVantagemRelevante ? 'Melhor economia encontrada' : 'Economia projetada no ano') + '</span>' +
      '<strong class="rel-valor">' + brl(econ) + '</strong><span class="rel-nota">' + (econ > 0 && custoAtual > 0 ? pct(econ / custoAtual, 1) + ' do custo tributário atual' : 'sem vantagem relevante') + '</span></div>' +
      '<div class="rel-recomendacao"><span class="rel-rotulo">Recomendação</span><h3>' + esc(tituloRecomendacao(a)) + '</h3><p>' + esc(explicacaoRecomendacao(a)) + '</p></div></section>';
  }

  function relComparativo(a) {
    var at = a.atual, rc = a.recomendado, A = at.anual, R = rc.anual, k0 = a.ctx.k0;
    var medA = mediaPlanejada(at.proLabore, k0), medR = mediaPlanejada(rc.proLabore, k0);
    function anexoIII(res) { return res.regime === 'simples' ? res.anual.mesesAnexoIII + ' de ' + (res.anual.mesesAnexoIII + res.anual.mesesAnexoV) : '—'; }
    function linha(rotulo, va, vr, dif, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + rotulo + '</th>' + tdn(va) + tdn(vr) + dif + '</tr>'; }
    function dinheiro(rotulo, va, vr, tipo, cls) { return linha(rotulo, brl(va), brl(vr), difCelula(M.r2(vr - va), tipo), cls); }
    var mesmoRegime = a.regimeRecomendado === a.regimeReferencia;
    var linhas = [
      linha('Regime tributário', esc(nomeRegime(a.regimeReferencia)), esc(nomeRegime(a.regimeRecomendado)), tdn(mesmoRegime ? 'mantém' : 'muda', 'muted')),
      linha('Pró-labore médio por mês', brl(medA), brl(medR) + (a.tipoPlano === 'variavel' ? '<span class="rel-obs">varia mês a mês</span>' : ''), difCelula(M.r2(medR - medA), 'neutro'))
    ];
    if (at.regime === 'simples' || rc.regime === 'simples') {
      var dIII = (rc.regime === 'simples' ? R.mesesAnexoIII : 0) - (at.regime === 'simples' ? A.mesesAnexoIII : 0);
      linhas.push(linha('Meses no Anexo III do Simples', anexoIII(at), anexoIII(rc), dIII ? tdn((dIII > 0 ? '+' : '−') + plural(Math.abs(dIII), 'mês', 'meses'), dIII > 0 ? 'positivo' : 'negativo') : tdn('—', 'muted')));
    }
    linhas.push(dinheiro(at.regime === 'simples' && rc.regime === 'simples' ? 'Tributos da empresa (DAS)' : 'Tributos da empresa', A.tributosPJ, R.tributosPJ, 'custo'));
    linhas.push(dinheiro('INSS sobre o pró-labore', A.inss, R.inss, 'custo'));
    linhas.push(dinheiro(A.irpfmAdicional || R.irpfmAdicional ? 'IRPF e IRPFM' : 'IRPF', A.tributosPF, R.tributosPF, 'custo'));
    if (A.custoAdm || R.custoAdm) linhas.push(dinheiro('Custos administrativos', A.custoAdm, R.custoAdm, 'custo'));
    linhas.push(dinheiro('Custo tributário total', A.custoTotal, R.custoTotal, 'custo', 'total'));
    linhas.push(linha('Carga sobre a receita', pct(A.cargaEfetiva, 1), pct(R.cargaEfetiva, 1), difCelula((R.cargaEfetiva - A.cargaEfetiva) * 100, 'custo', pp)));
    linhas.push(dinheiro('Renda líquida pessoal', A.rendaLiquidaPF, R.rendaLiquidaPF, 'renda'));
    linhas.push(dinheiro('Caixa da empresa em dezembro', A.caixaFinalPJ, R.caixaFinalPJ, 'neutro'));
    return tabela([{ t: 'No ano' }, { t: 'Atual', num: true }, { t: 'Recomendado', num: true }, { t: 'Diferença', num: true }], linhas, { cls: 'rel-tabela rel-comparativo' });
  }

  function relGraficoTributos(a) {
    var leg = (a.atual !== a.recomendado ? [{ nome: 'Atual', cor: 'var(--series-2)', tipo: 'area' }] : []).concat([{ nome: 'Recomendado', cor: 'var(--accent)', tipo: 'area' }]);
    return '<section class="rel-secao rel-grafico"><h3>Tributos pagos a cada mês</h3><div class="rel-grafico-topo"><p>' + (a.recomendado.regime === 'simples' ? 'DAS' : 'Tributos da empresa') + ' + INSS + IRPF (IRPF anual distribuído pelo pró-labore)</p>' + legendaHtml(leg) + '</div><div class="grafico" id="rel-grafico-tributos"></div></section>';
  }

  function relPassos(a) {
    return '<section class="rel-secao"><h3>Próximos passos</h3><ol class="rel-passos">' + a.planoAcao.map(function (p) {
      return '<li>' + esc(p.titulo) + '</li>';
    }).join('') + '</ol><p class="rel-obs">O que fazer, documentos, riscos e o que validar com o contador em cada passo: seção 3.</p></section>';
  }

  function textoPlanoMensal(a) {
    var r = a.recomendado;
    return 'Pró-labore sugerido para cada mês e o efeito nos tributos e no caixa. Regime: ' + nomeRegime(r.regime) + '. Valores em R$.' +
      (a.tipoPlano === 'variavel' ? ' Um pró-labore que varia exige ata fixando o valor de cada mês, pagamento efetivo e eSocial/DCTFWeb em dia.' : '') +
      (r.meses.some(function (m) { return m.realizado; }) ? ' Meses já realizados não mudam.' : '');
  }

  function relPlanoMensal(a) {
    var r = a.recomendado, at = a.atual, simples = r.regime === 'simples', R = r.anual;
    var irR = irpfMensalProjetado(r);
    var linhas = r.meses.map(function (m, i) {
      return '<tr' + (m.realizado ? ' class="realizado"' : '') + '><th scope="row">' + esc(m.rotulo) + (m.realizado ? '<span class="rel-obs">realizado</span>' : '') + '</th>' + tdn(valor0(at.proLabore[i]), 'muted') + tdn('<strong>' + valor0(m.proLabore) + '</strong>') +
        (simples ? tdn(pctR(m.fatorR)) + td(anexoTag(m.anexo), 'centro') : '') + tdn(valor0(m.tributosPJ)) + tdn(valor0(m.inss)) + tdn(valor0(irR[i])) + tdn(valor0(m.dividendoMedico)) + tdn(valor0(m.caixaFinal)) + '</tr>';
    });
    var rod = '<tr><th scope="row">Ano</th>' + tdn(valor0(at.anual.proLabore)) + tdn(valor0(R.proLabore)) + (simples ? '<td></td>' + td(R.mesesAnexoIII + ' × III', 'centro') : '') + tdn(valor0(R.tributosPJ)) + tdn(valor0(R.inss)) + tdn(valor0(M.soma(irR))) + tdn(valor0(R.dividendoMedico)) + tdn(valor0(R.caixaFinalPJ)) + '</tr>';
    var cab = [{ t: 'Mês' }, { t: 'Pró-labore atual', num: true }, { t: 'Pró-labore sugerido', num: true }].concat(simples ? [{ t: 'Fator "r"', num: true }, { t: 'Anexo', centro: true }] : [])
      .concat([{ t: simples ? 'DAS' : 'Tributos da empresa', num: true }, { t: 'INSS', num: true }, { t: 'IRPF projetado', num: true }, { t: 'Lucros ao médico', num: true }, { t: 'Caixa no fim do mês', num: true }]);
    return tabela(cab, linhas, { cls: 'rel-tabela rel-mensal', rodape: rod });
  }

  function relFatorR(a) {
    var fr = resFatorR(a);
    if (!fr) return '';
    var leg = (a.atual.regime === 'simples' && a.atual !== fr ? [{ nome: 'Atual', cor: 'var(--series-2)' }] : []).concat([{ nome: fr === a.recomendado ? 'Recomendado' : 'Atual', cor: fr === a.recomendado ? 'var(--accent)' : 'var(--series-2)' }]);
    return '<section class="rel-secao rel-grafico"><h4>Fator "r" por mês</h4><p>Folha dos últimos 12 meses dividida pela receita dos últimos 12 meses. A partir de 28%, o mês é tributado no Anexo III, mais barato que o Anexo V.</p>' + legendaHtml(leg) + '<div class="grafico" id="rel-grafico-fr"></div></section>';
  }

  function relCenarios(a) {
    var lista = a.cenarios.slice().sort(function (x, y) { return x.custoTotal - y.custoTotal; });
    var linhas = lista.map(function (c) {
      var det = [esc(c.regra)];
      if (c.regime === 'simples') det.push(c.mesesIII + ' de ' + (c.mesesIII + c.mesesV) + ' meses no Anexo III');
      if (!c.viavel) det.push('<strong class="negativo">caixa insuficiente</strong>');
      return '<tr class="' + (c.nome === 'Cenário otimizado' ? 'destaque' : '') + '"><th scope="row"><strong>' + esc(c.nome) + '</strong><span class="rel-obs">' + det.join(' · ') + '</span></th>' +
        tdn(valor0(c.proLaboreMedio)) + tdn(valor0(c.das + c.outros)) + tdn(valor0(c.inss)) + tdn(valor0(c.irpf + c.irpfm)) + tdn(valor0(c.custoAdm)) + tdn('<strong>' + valor0(c.custoTotal) + '</strong>') + tdn(valor0(c.rendaLiquida)) +
        (c.difAnual === undefined ? tdn('—', 'muted') : difCelula(c.difAnual, 'custo', function (v) { return sinal0(v).replace('R$ ', ''); })) + '</tr>';
    });
    return tabela([{ t: 'Cenário' }, { t: 'Pró-labore médio/mês', num: true }, { t: 'Tributos da empresa', num: true }, { t: 'INSS', num: true }, { t: 'IRPF e IRPFM', num: true }, { t: 'Custos adm.', num: true }, { t: 'Custo total', num: true }, { t: 'Renda líquida', num: true }, { t: 'Diferença no ano', num: true }], linhas, { cls: 'rel-tabela rel-cenarios' });
  }

  function relAcoes(a) {
    return '<ol class="rel-acoes">' + a.planoAcao.map(function (p, i) {
      var cl = p.classificacao === 'calculada' ? 'calculada' : (p.classificacao === 'estimada' ? 'estimada' : 'hipotese');
      var custo = p.custoAdicional === null ? 'a orçar' : (p.custoAdicional > 0 ? brl(p.custoAdicional) + '/ano' : 'nenhum');
      return '<li class="rel-acao"><header><span class="rel-acao-n" aria-hidden="true">' + (i + 1) + '</span><div><h4>' + esc(p.titulo) + '</h4><span class="classif ' + cl + '">' + esc(p.classificacao === 'calculada' ? 'Economia calculada' : (p.classificacao === 'estimada' ? 'Economia estimada' : 'Hipótese não validada')) + '</span></div></header>' +
        '<dl class="rel-acao-numeros"><div><dt>Economia</dt><dd>' + (p.economia > 0 ? brl(p.economia) + '/ano' : '—') + '</dd></div><div><dt>Custo adicional</dt><dd>' + custo + '</dd></div><div><dt>Quando faz efeito</dt><dd>' + esc(p.quando) + '</dd></div></dl>' +
        (p.economia > 0 && p.custoAdicional > 0 ? '<p class="rel-obs">O custo adicional já está descontado da economia.</p>' : '') +
        '<dl class="rel-acao-detalhes"><dt>O que fazer</dt><dd>' + esc(p.oque) + '</dd><dt>Por quê</dt><dd>' + esc(p.porque) + '</dd><dt>Documentos</dt><dd>' + esc(p.documentos) + '</dd>' +
        '<dt>Validar com o contador</dt><dd>' + esc(p.validacao) + '</dd><dt>Riscos</dt><dd>' + esc(p.riscos) + '</dd>' + (p.pendencias && p.pendencias.length ? '<dt>Dados a confirmar</dt><dd>' + esc(p.pendencias.join('; ')) + '</dd>' : '') + '</dl></li>';
    }).join('') + '</ol>';
  }

  function relAnexo(a, P) {
    var nome = { critico: 'Crítico', atencao: 'Atenção' };
    var revisar = a.alertas.filter(function (x) { return x.nivel !== 'info'; });
    var ausentes = a.qualidade.itens.filter(function (i) { return !i.ok; });
    var premissas = [
      'Parâmetros legais de ' + P.ano + ': ' + P.resumoStatus,
      'Tributos pagos na competência; pró-labore pago no próprio mês; folha do fator "r" pelo regime de caixa; DAS calculado com a alíquota efetiva sem arredondamento intermediário.',
      'O IRPF mensal do plano é o imposto anual distribuído pelo pró-labore; o IRRF retido na fonte é antecipação.',
      'Distribuição isenta limitada ao lucro contábil (com escrituração) ou ao lucro presumido menos tributos (sem escrituração).',
      'IRPFM e redutor do art. 16-B modelados de forma simplificada; regulamentação em evolução.',
      'Lucro Real e CBS (2027) são estimativas; créditos de PIS/Cofins dependem do conceito de insumo.'
    ];
    return '<section class="rel-secao"><h3><span class="n">4</span>Premissas e pontos de revisão</h3>' +
      '<h4>Revisar com o contador</h4>' + (revisar.length ? '<ul class="rel-lista">' + revisar.map(function (x) { return '<li><span class="rel-nivel ' + x.nivel + '">' + nome[x.nivel] + '</span> <strong>' + esc(x.titulo) + '.</strong> ' + esc(x.detalhe) + '</li>'; }).join('') + '</ul>' : '<p>Nenhum ponto crítico ou de atenção com os dados informados.</p>') +
      '<h4>Dados ausentes</h4>' + (ausentes.length ? '<ul class="rel-lista">' + ausentes.map(function (i) { return '<li><strong>' + esc(i.texto) + ':</strong> ' + esc(i.efeito) + '</li>'; }).join('') + '</ul>' : '<p>Nenhum: todos os itens que medem a qualidade dos dados foram preenchidos.</p>') +
      '<h4>Premissas do cálculo</h4><ul class="rel-lista">' + premissas.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<p class="rel-aviso">Este relatório apoia a decisão e não substitui a revisão do contador ou de profissional tributário habilitado. Cálculos feitos no navegador, sem envio de dados.</p></section>';
  }

  function desenharRelatorio() {
    if (!analise) return;
    var a = analise, r = a.recomendado, at = a.atual, meses = r.meses.map(function (m) { return M.MESES[m.k - 1]; });
    var c1 = document.getElementById('rel-grafico-tributos');
    if (c1) {
      var irR = irpfMensalProjetado(r), irA = irpfMensalProjetado(at);
      var totR = r.meses.map(function (m, i) { return M.r2(m.tributosPJ + m.inss + irR[i]); });
      var totA = at.meses.map(function (m, i) { return M.r2(m.tributosPJ + m.inss + irA[i]); });
      G.barras(c1, {
        titulo: 'Tributos pagos a cada mês', largura: 680, altura: 160, margem: { l: 56, t: 12 }, categorias: meses, y: { formato: G.compacto },
        series: (at !== r ? [{ nome: 'Atual', cor: 'var(--series-2)', valores: totA }] : []).concat([{ nome: 'Recomendado', cor: 'var(--accent)', valores: totR }]),
        dica: function (i) { return dicaMes(r, i, (at !== r ? [['Atual', brl(totA[i]), 'var(--series-2)']] : []).concat([['Recomendado', brl(totR[i]), 'var(--accent)']])); }
      });
    }
    var c2 = document.getElementById('rel-grafico-fr'), fr = resFatorR(a);
    if (c2 && fr) {
      var comAtual = at.regime === 'simples' && at !== fr;
      var serie = function (res, id, nome, cor, largura) { return { id: id, nome: nome, cor: cor, largura: largura, marcadores: true, pontos: res.meses.map(function (m) { return { x: m.k, y: m.ativo ? m.fatorR : NaN }; }) }; };
      var series = (comAtual ? [serie(at, 'a', 'Atual', 'var(--series-2)', 2)] : []).concat([serie(fr, 'r', fr === r ? 'Recomendado' : 'Atual', fr === r ? 'var(--accent)' : 'var(--series-2)', 3)]);
      G.linhas(c2, {
        titulo: 'Fator r por mês', largura: 680, altura: 170, margem: { l: 44, b: 28, r: 12, t: 12 },
        x: { min: 1, max: 12, ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], formato: function (k) { return M.MESES[k - 1]; } },
        y: { min: 0, formato: function (v) { return Math.round(v * 100) + '%'; } },
        referenciasH: [{ y: 0.28, rotulo: '28%: Anexo III' }], series: series, xs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        dica: function (i) { return dicaMes(fr, i, series.map(function (s) { var res = s.id === 'a' ? at : fr; return [s.nome, pctR(res.meses[i].fatorR) + ' · ' + (res.meses[i].anexo ? 'Anexo ' + res.meses[i].anexo : '—'), s.cor]; })); }
      });
    }
    atualizarEstiloPagina();
  }

  // Ctrl+P em qualquer área imprime o relatório; o título vira o nome sugerido do PDF.
  var tituloAntesImpressao = null;
  function antesDeImprimir() {
    if (!estado || !analise) return;
    if (ui.area !== 'relatorio') {
      document.getElementById('area-relatorio').innerHTML = RENDER_AREA.relatorio();
      desenharRelatorio();
    }
    tituloAntesImpressao = document.title;
    document.title = nomeArquivoRelatorio();
  }
  function depoisDeImprimir() {
    if (tituloAntesImpressao !== null) { document.title = tituloAntesImpressao; tituloAntesImpressao = null; }
    if (ui.area !== 'relatorio') document.getElementById('area-relatorio').innerHTML = '';
  }

  // ------------------------------------------------------------ TABELAS LEGAIS (painel lateral)

  var focoAntesGaveta = null;
  function abrirGaveta() {
    fecharMenus();
    focoAntesGaveta = document.activeElement;
    renderGaveta();
    document.getElementById('gaveta').hidden = false;
    document.body.classList.add('com-sobreposicao');
    var b = document.querySelector('#gaveta [data-acao="fechar-gaveta"]');
    if (b) b.focus();
  }
  function fecharGaveta() {
    var g = document.getElementById('gaveta');
    if (g.hidden) return;
    g.hidden = true;
    document.body.classList.remove('com-sobreposicao');
    if (focoAntesGaveta && focoAntesGaveta.focus && document.body.contains(focoAntesGaveta)) focoAntesGaveta.focus();
  }
  function renderGaveta() {
    var c = document.getElementById('gaveta-corpo');
    try { c.innerHTML = parametrosHtml(); } catch (e) { c.innerHTML = '<div class="aviso critico">' + esc(e.message) + '</div>'; }
  }

  function parametrosHtml() {
    var anoSel = ui.anoParametros || estado.analise.ano;
    var P = PL.anos[anoSel];
    var h = '<p class="small">' + esc(PL_PADRAO.aviso) + ' Nenhum parâmetro foi verificado diretamente na fonte oficial nesta versão: as páginas do governo não estavam acessíveis no ambiente de desenvolvimento.</p>';
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
  }

  function rotuloStatus(st) {
    return { conferido_secundaria: 'conferidos em fontes secundárias', transcrito: 'transcritos, sem conferência online', derivado: 'derivados', projetado: 'projetados, não oficiais', interpretacao: 'com interpretação', personalizado: 'personalizados pelo usuário' }[st] || st;
  }
  function fonteHtml(status, ids, obs) {
    var fontes = PL_PADRAO.fontes;
    var nomes = { conferido_secundaria: 'Conferido em fonte secundária', transcrito: 'Transcrito (sem conferência online)', derivado: 'Derivado', projetado: 'Projetado (não oficial)', interpretacao: 'Interpretação', personalizado: 'Personalizado' };
    var tipo = status === 'projetado' || status === 'interpretacao' ? 'alerta' : (status === 'conferido_secundaria' ? 'info' : 'neutro');
    return '<p class="xs muted">' + selo(nomes[status] || status, tipo) + ' ' + (ids || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (id) { return fontes[id] ? esc(fontes[id].titulo.split(' (')[0]) : esc(id); }).join(' · ') + (obs ? '<br>' + esc(obs) : '') + '</p>';
  }
  function parametrosAlterados() {
    versao++;
    if (analise) analiseDesatualizada = true;
    agendarAnalise(200);
    atualizarCabecalho();
  }

  // ------------------------------------------------------------ INÍCIO RÁPIDO

  function abrirInicio() {
    fecharMenus();
    var S = simAtual(), e = estado;
    var temDados = !e.meta.exemplo && S.res.anual.rb > 0;
    var receita = S.res.anual.rb > 0 ? M.r2(S.res.anual.rb / 12) : '';
    var salarios = e.folha.pessoas.filter(function (p) { return p.tipo === 'clt'; }).reduce(function (s, p) { return s + n0(p.salario); }, 0);
    var regime = e.empresa.regimeAtual;
    function q(id, rotulo, valor, ajuda) {
      return '<div class="campo"><label for="' + id + '">' + rotulo + '</label><input type="text" id="' + id + '" class="num" inputmode="decimal" autocomplete="off" value="' + esc(valor === '' ? '' : fmtInput(valor)) + '" placeholder="0,00"><span class="ajuda">' + ajuda + '</span></div>';
    }
    document.getElementById('inicio-conteudo').innerHTML =
      '<form class="inicio-form" novalidate>' +
      '<div class="inicio-topo"><div><span class="rotulo-secao">Início rápido</span><h2 id="inicio-titulo">Sua primeira análise em 4 perguntas</h2><p>O resto pode ser completado depois, em etapas. Cada dado a mais deixa o resultado mais preciso.</p></div>' +
      '<button type="button" class="btn btn-icone" data-acao="inicio-fechar" aria-label="Fechar o início rápido"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="inicio-campos">' +
      q('q-receita', '1. Receita média por mês', receita, 'Consultas, plantões e procedimentos') +
      q('q-pl', '2. Pró-labore atual por mês', num(e.folha.proLaboreAtual) === null ? '' : num(e.folha.proLaboreAtual), 'Valor bruto, antes do INSS') +
      q('q-folha', '3. Salários de empregados por mês', salarios || '', 'Somente CLT; deixe vazio se não houver') +
      '<div class="campo"><label for="q-regime">4. Regime atual</label><select id="q-regime">' + [['simples', 'Simples Nacional'], ['presumido', 'Lucro Presumido'], ['real', 'Lucro Real'], ['indefinido', 'Ainda não sei']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === regime ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select><span class="ajuda">Empresa aberta há mais de 12 meses</span></div>' +
      '</div>' +
      (temDados ? '<p class="aviso atencao small">As respostas substituem os dados atuais. Exporte um backup pelo menu Arquivo antes, se precisar.</p>' : '') +
      '<div class="linha-acoes"><button type="button" class="btn btn-primario btn-grande" data-acao="inicio-ver">Ver análise</button><button type="button" class="btn btn-grande" data-acao="inicio-etapas">Preencher tudo em etapas</button></div>' +
      '<button type="button" class="link" data-acao="inicio-exemplo">Abrir o exemplo fictício</button>' +
      '</form>' +
      '<aside class="inicio-previa" aria-label="Prévia" aria-live="polite" id="inicio-previa"></aside>';
    document.getElementById('inicio').hidden = false;
    document.body.classList.add('com-sobreposicao');
    var p = document.getElementById('q-receita');
    if (p) p.focus();
    atualizarPreviaInicio();
  }
  function fecharInicio() {
    document.getElementById('inicio').hidden = true;
    document.body.classList.remove('com-sobreposicao');
    clearTimeout(timerPrevia); clearTimeout(timerPreviaOtim);
    ui.inicioVisto = true;
    uiSalvar();
  }
  function respostasInicio() {
    function v(id) { var el = document.getElementById(id); return el ? num(el.value) : null; }
    var r = document.getElementById('q-regime');
    return { receita: v('q-receita'), pl: v('q-pl'), folha: v('q-folha'), regime: r ? r.value : 'simples' };
  }
  function estadoInicio(r) {
    var e = M.estadoVazio(PL.anoPadrao);
    e.receitas.modoPreenchimento = 'fixa';
    e.receitas.fixa.total = r.receita ? String(r.receita) : '';
    e.receitas.fixa.mix = { consultas: 100 };
    e.receitas.meses.forEach(function (m) { m.consultas = r.receita ? String(r.receita) : ''; });
    e.folha.proLaboreAtual = r.pl ? String(r.pl) : '';
    if (r.folha > 0) {
      e.folha.pessoas.push({ id: novoId('p'), nome: 'Empregados (CLT)', tipo: 'clt', salario: String(r.folha), mesInicio: 1, mesFim: 12, decimoTerceiro: true, ferias: true, mesFerias: 7 });
      e.empresa.temEmpregados = 'sim';
    }
    e.empresa.regimeAtual = r.regime;
    if (r.regime !== 'indefinido') e.empresa.regimeAnoAnterior = r.regime;
    e.meta.origem = 'inicio-rapido';
    return e;
  }
  var timerPrevia = null, timerPreviaOtim = null;
  function atualizarPreviaInicio() {
    clearTimeout(timerPrevia); clearTimeout(timerPreviaOtim);
    timerPrevia = setTimeout(function () {
      var el = document.getElementById('inicio-previa');
      if (!el) return;
      var r = respostasInicio();
      if (!r.receita) { el.innerHTML = '<h3>Prévia com estas respostas</h3><p class="small">Informe a receita média por mês para ver uma estimativa do custo tributário de hoje.</p>'; return; }
      var e2 = estadoInicio(r);
      var ctx = M.prepararContexto(e2, PL.anos[e2.analise.ano]);
      var eleg = M.avaliarElegibilidade(ctx);
      var reg = ['simples', 'presumido', 'real'].indexOf(r.regime) >= 0 ? r.regime : (eleg.simples.status !== 'inelegivel' ? 'simples' : 'presumido');
      var res = M.simular(ctx, { regime: reg, proLabore: ctx.proLaborePlanoAtual });
      el.innerHTML = previaInicioHtml(res, M.qualidadeDados(ctx), null);
      timerPreviaOtim = setTimeout(function () {
        var el2 = document.getElementById('inicio-previa');
        if (!el2 || document.getElementById('inicio').hidden) return;
        try { el2.innerHTML = previaInicioHtml(res, M.qualidadeDados(ctx), O.executar(e2, { parametros: PL, rapido: true })); } catch (err) { if (window.console) console.error(err); }
      }, 700);
    }, 250);
  }
  function previaInicioHtml(res, q, a) {
    var A = res.anual, m = res.meses[0];
    var pendente = q.itens.filter(function (i) { return !i.ok; }).sort(function (x, y) { return y.peso - x.peso; })[0];
    var econ = a ? (a.economia >= (a.materialidade || 0) ? 'até ' + brl0(a.economia) : 'sem economia relevante') : 'calculando…';
    return '<div class="previa-topo"><h3>Prévia com estas respostas</h3>' + selo('estimativa', 'exemplo') + '</div>' +
      '<div class="previa-principal"><span class="small">Custo tributário hoje</span><span class="previa-valor">' + brl0(A.custoTotal) + '</span><span class="small">por ano · ' + pct(A.cargaEfetiva, 1) + ' da receita</span></div>' +
      '<div class="efeito-mini">' +
      '<div class="mini"><span class="xs">Fator "r" em ' + M.MESES[0] + '</span><strong>' + (m.ativo ? pctR(m.fatorR) : '—') + '</strong><span class="xs">' + (res.regime === 'simples' ? (m.anexo ? 'Anexo ' + m.anexo : '—') : esc(nomeRegime(res.regime))) + '</span></div>' +
      '<div class="mini"><span class="xs">Potencial de economia</span><strong>' + esc(econ) + '</strong><span class="xs">por ano</span></div></div>' +
      '<div class="previa-qualidade"><div class="linha-entre small"><span>Qualidade dos dados</span><strong>' + q.nota + '/100</strong></div><div class="medidor"><span style="width:' + q.nota + '%"></span></div>' +
      (pendente ? '<p class="small">' + esc(pendente.efeito) + ' Próximo passo sugerido: ' + esc(pendente.texto.toLowerCase()) + '.</p>' : '') + '</div>';
  }

  // ------------------------------------------------------------ ações

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
    if (!analise) { notificar('Aguarde o cálculo terminar.'); return; }
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
    if (!analise) { notificar('Aguarde o cálculo terminar.'); return; }
    setTimeout(function () { window.print(); }, 60);
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
    salvar: function () { salvar(false); },
    carregar: carregar,
    'exportar-csv': exportarCSV,
    'exportar-backup': exportarBackup,
    'importar-backup': function () { document.getElementById('arquivo-backup').click(); },
    imprimir: imprimir,
    tabelas: abrirGaveta,
    'fechar-gaveta': fecharGaveta,
    comparar: function () { ui.comparar = !ui.comparar; uiSalvar(); renderizarArea(); },
    'alertas-todos': function () { ui.alertasTodos = !ui.alertasTodos; renderizarArea(); },
    'alternar-historico': function () { ui.historicoAberto = !ui.historicoAberto; renderizarArea(); },
    'inicio-rapido': abrirInicio,
    'inicio-fechar': fecharInicio,
    'inicio-exemplo': function () {
      if (!estado.meta.exemplo || estado.meta.editado) definirEstado(window.DadosExemplo.criar());
      fecharInicio();
      navegar('resultado', { sub: 'resumo' });
    },
    'inicio-ver': function () {
      var r = respostasInicio();
      if (!r.receita) { notificar('Informe a receita média por mês.'); document.getElementById('q-receita').focus(); return; }
      fecharInicio();
      definirEstado(estadoInicio(r)); salvar(true);
      navegar('resultado', { sub: 'resumo' });
    },
    'inicio-etapas': function () {
      fecharInicio();
      definirEstado(estadoInicio(respostasInicio())); salvar(true);
      navegar('dados', { etapa: 1 });
    },
    exemplo: function () {
      abrirModal('Carregar o exemplo fictício?', '<p>Os dados atuais serão substituídos pelo exemplo. Exporte um backup antes se quiser guardá-los.</p>', [['Cancelar', 'nao'], ['Carregar exemplo', 'sim', 'btn-primario']], function (r) {
        if (r === 'sim') { definirEstado(window.DadosExemplo.criar()); salvar(true); notificar('Exemplo fictício carregado.'); }
      });
    },
    limpar: function () {
      abrirModal('Limpar todos os dados?', '<p>Apaga os dados deste navegador e começa um cadastro vazio. Não pode ser desfeito. Exporte um backup antes se precisar.</p>', [['Cancelar', 'nao'], ['Limpar dados', 'sim', 'btn-perigo']], function (r) {
        if (r === 'sim') { removerLocal(CHAVE); salvoEm = null; definirEstado(M.estadoVazio(PL.anoPadrao)); notificar('Dados apagados.'); }
      });
    },
    'adicionar-socio': function () { estado.empresa.socios.push({ nome: '', participacao: 0, analisado: false, residenteExterior: false }); aoAlterar(); renderizarArea(); },
    'adicionar-despesa': function () {
      var cat = document.getElementById('nova-despesa-cat').value;
      var c = M.CATEGORIA_POR_ID[cat];
      var d = { id: novoId('d'), categoria: cat, nome: c.rotulo, valor: '', mesInicial: 1, mesFinal: 12, recorrencia: 'mensal', tipoValor: 'fixo', valoresMensais: [], reajustePct: '', reajusteMes: '', parcelaAtual: '', totalParcelas: '', natureza: c.tipo === 'pessoal' ? 'pessoal' : 'empresarial', pctProfissional: '', documento: 'sim', tratamento: 'nao_confirmado', ajustavel: 'false', corteMes: '', corteValorNovo: '', observacoes: '', titularidade: '', usoPessoalPct: '', vinculo: '', vidaUtilAnos: '', geraCredito: '' };
      estado.despesas.push(d);
      ui.despesasAbertas[d.id] = true;
      aoAlterar(); renderizarArea();
      var el = document.querySelector('[data-despesa="' + d.id + '"]');
      if (el) { el.scrollIntoView({ block: 'center' }); var i = el.querySelector('.despesa-corpo input'); if (i) i.focus(); }
    },
    'adicionar-tributo': function () { estado.tributosPagos.push({ id: novoId('t'), tributo: 'DAS', valor: '', competencia: 1, dataPagamento: '', codigoReceita: '', orgao: '', natureza: 'pago', confirmado: 'nao' }); aoAlterar(); renderizarArea(); },
    'adicionar-pessoa': function () { estado.folha.pessoas.push({ id: novoId('p'), nome: '', tipo: 'clt', salario: '', mesInicio: 1, mesFim: 12, decimoTerceiro: true, ferias: true, mesFerias: 7 }); aoAlterar(); renderizarArea(); },
    'adicionar-receita': function () {
      var k = +document.getElementById('add-rec-mes').value, t = document.getElementById('add-rec-tipo').value, v = num(document.getElementById('add-rec-valor').value);
      if (v === null) { notificar('Informe um valor válido.'); return; }
      var m = estado.receitas.meses[k - 1];
      m[t] = String(M.r2(n0(m[t]) + v));
      aoAlterar(); renderizarArea(); notificar('Receita adicionada a ' + M.MESES[k - 1] + '.');
    },
    'aplicar-fixa': function () {
      var tot = n0(estado.receitas.fixa.total), mix = estado.receitas.fixa.mix || {};
      var soma = M.TIPOS_RECEITA.reduce(function (a, t) { return a + n0(mix[t.id]); }, 0);
      if (tot <= 0 || soma <= 0) { notificar('Informe a receita mensal e a composição.'); return; }
      var k0 = n0(estado.analise.mesInicioPlanejamento) || 1;
      for (var k = k0; k <= 12; k++) M.TIPOS_RECEITA.forEach(function (t) { estado.receitas.meses[k - 1][t.id] = n0(mix[t.id]) ? String(M.r2(tot * n0(mix[t.id]) / soma)) : ''; });
      aoAlterar(); renderizarArea(); notificar('Receita fixa aplicada aos meses projetados.');
    },
    'salvar-cenario': function () {
      if (!analise) return;
      abrirModal('Salvar cenário', '<div class="campo"><label for="nome-cenario">Nome</label><input type="text" id="nome-cenario" value="Análise ' + (estado.cenariosSalvos.length + 1) + '"></div><label class="check" style="margin-top:8px"><input type="radio" name="qual-cen" value="rec" checked> Cenário recomendado</label><label class="check"><input type="radio" name="qual-cen" value="atual"> Cenário atual</label>', [['Cancelar', 'nao'], ['Salvar', 'sim', 'btn-primario']], function (r) {
        if (r !== 'sim') return;
        var nome = document.getElementById('nome-cenario').value || 'Cenário';
        var qual = document.querySelector('input[name="qual-cen"]:checked').value;
        var res = qual === 'rec' ? analise.recomendado : analise.atual, A = res.anual;
        estado.cenariosSalvos.push({ nome: nome + (qual === 'rec' ? ' (recomendado)' : ' (atual)'), data: new Date().toLocaleString('pt-BR'), ano: analise.ano, regime: res.regime, proLaboreMedio: M.r2(A.proLabore / 12), das: A.das, inss: A.inss, irpf: M.r2(A.irpfDevido + A.irpfmAdicional), outros: M.r2(A.tributosPJ - A.das), custoTotal: A.custoTotal, rendaLiquida: A.rendaLiquidaPF, receita: A.rb, proLabore: res.proLabore });
        salvar(true); renderizarArea(); notificar('Cenário salvo.');
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
        parametrosAlterados();
        renderGaveta(); notificar('Parâmetros de ' + obj.ano + ' aplicados (personalizados).');
      } catch (e) { err.innerHTML = '<div class="aviso critico">JSON inválido: ' + esc(e.message) + '.</div>'; }
    },
    'novo-ano': function () {
      var base = ui.anoParametros || estado.analise.ano, novo = +base + 1;
      if (PL.anos[novo] && !PL.anos[novo].personalizado) { notificar('O ano ' + novo + ' já existe. Edite-o diretamente.'); ui.anoParametros = novo; renderGaveta(); return; }
      var obj = JSON.parse(JSON.stringify(PL.anos[base]));
      obj.ano = novo; obj.rotulo = novo + ' (personalizado)'; obj.status = 'personalizado';
      obj.resumoStatus = 'Criado a partir de ' + base + ' pelo usuário. Atualize valores, fontes e vigências antes de usar.';
      var custom = lerLocal(CHAVE_PARAM) || { anos: {} };
      custom.anos[novo] = obj; gravarLocal(CHAVE_PARAM, custom);
      PL = clonarParametros(); ui.anoParametros = novo; renderGaveta(); notificar('Ano ' + novo + ' criado a partir de ' + base + '.');
    },
    'restaurar-param': function () {
      abrirModal('Restaurar parâmetros padrão?', '<p>Remove todos os parâmetros personalizados deste navegador.</p>', [['Cancelar', 'nao'], ['Restaurar', 'sim', 'btn-perigo']], function (r) {
        if (r !== 'sim') return;
        removerLocal(CHAVE_PARAM); PL = clonarParametros(); ui.anoParametros = null;
        if (!PL.anos[estado.analise.ano]) estado.analise.ano = PL.anoPadrao;
        parametrosAlterados(); renderGaveta(); notificar('Parâmetros padrão restaurados.');
      });
    },
    'exportar-param': function () { baixar('parametros-legais.json', JSON.stringify(PL.anos, null, 2), 'application/json'); }
  };

  function aoClicar(ev) {
    if (ev.target.id === 'gaveta') { fecharGaveta(); return; }
    var menu = document.getElementById('menu-arquivo');
    if (menu && menu.open && !menu.contains(ev.target)) menu.removeAttribute('open');
    var t = ev.target.closest('button, a[data-area]');
    if (!t) return;
    if (t.tagName === 'A' && t.hasAttribute('data-area')) {
      fecharMenus();
      var area = t.getAttribute('data-area');
      // o próprio link troca o endereço; quando o endereço já é o mesmo, a navegação é feita aqui
      if (location.hash === t.getAttribute('href') || area === ui.area) { ev.preventDefault(); navegar(area); }
      return;
    }
    var a = t.getAttribute('data-acao');
    if (a && ACOES[a]) { ev.preventDefault(); fecharMenus(); ACOES[a](); return; }
    var i;
    if ((i = t.getAttribute('data-sub')) !== null) { navegar('resultado', { sub: i }); return; }
    if ((i = t.getAttribute('data-etapa')) !== null) { navegar('dados', { etapa: +i }); return; }
    if ((i = t.getAttribute('data-modo')) !== null) { ui.modo = i; uiSalvar(); renderizarArea(); return; }
    if ((i = t.getAttribute('data-alerta')) !== null) { irParaAlerta(i); return; }
    if ((i = t.getAttribute('data-rolar')) !== null) { rolarPara(i); return; }
    if ((i = t.getAttribute('data-remover-despesa')) !== null) { estado.despesas.splice(+i, 1); aoAlterar(); renderizarArea(); return; }
    if ((i = t.getAttribute('data-duplicar-despesa')) !== null) { var c = JSON.parse(JSON.stringify(estado.despesas[+i])); c.id = novoId('d'); c.nome = (c.nome || '') + ' (cópia)'; estado.despesas.splice(+i + 1, 0, c); ui.despesasAbertas[c.id] = true; aoAlterar(); renderizarArea(); return; }
    if ((i = t.getAttribute('data-remover-tributo')) !== null) { estado.tributosPagos.splice(+i, 1); aoAlterar(); renderizarArea(); return; }
    if ((i = t.getAttribute('data-remover-pessoa')) !== null) { estado.folha.pessoas.splice(+i, 1); aoAlterar(); renderizarArea(); return; }
    if ((i = t.getAttribute('data-remover-socio')) !== null) { estado.empresa.socios.splice(+i, 1); if (!estado.empresa.socios.some(function (s) { return s.analisado; })) estado.empresa.socios[0].analisado = true; aoAlterar(); renderizarArea(); return; }
    if ((i = t.getAttribute('data-remover-cenario')) !== null) { estado.cenariosSalvos.splice(+i, 1); salvar(true); renderizarArea(); return; }
    if ((i = t.getAttribute('data-duplicar-mes')) !== null) { estado.receitas.meses[+i] = JSON.parse(JSON.stringify(estado.receitas.meses[+i - 1])); aoAlterar(); renderizarArea(); notificar(M.MESES[+i - 1] + ' copiado para ' + M.MESES[+i] + '.'); return; }
    if ((i = t.getAttribute('data-copiar-seguintes')) !== null) { for (var k = +i; k < 12; k++) estado.receitas.meses[k] = JSON.parse(JSON.stringify(estado.receitas.meses[+i - 1])); aoAlterar(); renderizarArea(); notificar(M.MESES[+i - 1] + ' copiado até dezembro.'); return; }
  }

  var ESTRUTURAIS = /(\.categoria|\.natureza|\.tipoValor|\.tipo$|politica|modoPreenchimento|analise\.ano|mesInicioPlanejamento|dataAbertura)$/;

  function aoDigitar(ev) {
    var t = ev.target;
    if (t.hasAttribute('data-curva')) { ui.curvas[t.getAttribute('data-curva')] = t.checked; desenharCusto(true); return; }
    if (t.hasAttribute('data-ui-unidade')) { if (t.checked) { ui.unidade = t.value; renderizarArea(); } return; }
    if (t.id === 'ui-ano-param') { ui.anoParametros = +t.value; renderGaveta(); return; }
    if (t.id === 'ui-mem-k') { ui.memK = +t.value; renderizarArea(); return; }
    if (t.id === 'ui-mem-plano') { ui.memPlano = t.value; renderizarArea(); return; }
    if (/^q-/.test(t.id)) { atualizarPreviaInicio(); return; }
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
    if (ev.type === 'input' && t.tagName === 'SELECT') return;
    definir(estado, caminho, v);
    aoAlterar();
    if (ev.type !== 'change') return;
    // mudanças que alteram a estrutura do formulário
    if (ui.area === 'dados' && ESTRUTURAIS.test(caminho)) {
      if (caminho === 'analise.ano' && !PL.anos[v]) return;
      renderizarArea();
      return;
    }
    if (/^receitas\.meses\./.test(caminho)) {
      var k = +caminho.split('.')[2] + 1, cel = document.querySelector('[data-rb="' + k + '"]');
      if (cel) cel.textContent = brl0(rbMes(k));
      var tot = document.querySelector('[data-totais-receita]');
      if (tot) tot.innerHTML = totaisReceitaHtml();
    }
  }

  function aoSairCampo(ev) {
    var t = ev.target;
    if (t.id === 'incremento-livre') {
      var v = num(t.value);
      if (v !== null && v >= 10) { estado.analise.incrementoProLabore = v; aoAlterar(); renderizarArea(); notificar('Incremento de ' + brl(v) + ' aplicado.'); }
      return;
    }
    if ((t.getAttribute('data-tipo') === 'moeda' || /^q-(receita|pl|folha)$/.test(t.id)) && t.value !== '' && num(t.value) !== null) t.value = fmtInput(t.value);
  }

  function aoAlternarDetalhes(ev) {
    var d = ev.target;
    if (d && d.classList && d.classList.contains('despesa')) ui.despesasAbertas[d.getAttribute('data-despesa')] = d.open;
  }

  function fecharMenus() { document.querySelectorAll('details.menu[open]').forEach(function (d) { d.removeAttribute('open'); }); }

  // ------------------------------------------------------------ inicialização

  function iniciar() {
    if (MODO_ARTEFATO) document.querySelectorAll('[data-somente-arquivo]').forEach(function (el) { el.hidden = true; });
    document.querySelectorAll('[data-rotulo-artefato]').forEach(function (el) { if (MODO_ARTEFATO) el.textContent = el.getAttribute('data-rotulo-artefato'); });
    var salvo = lerLocal(CHAVE);
    var uiSalvo = lerLocal(CHAVE_UI);
    if (uiSalvo) {
      if (AREAS.indexOf(uiSalvo.area) >= 0) ui.area = uiSalvo.area;
      if (SUBS.some(function (s) { return s[0] === uiSalvo.sub; })) ui.sub = uiSalvo.sub;
      if (uiSalvo.etapa >= 1 && uiSalvo.etapa <= 5) ui.etapa = uiSalvo.etapa;
      if (uiSalvo.modo === 'completo' || uiSalvo.modo === 'essencial') ui.modo = uiSalvo.modo;
      if (typeof uiSalvo.comparar === 'boolean') ui.comparar = uiSalvo.comparar;
      ui.inicioVisto = !!uiSalvo.inicioVisto;
    }
    lerHash();
    if (salvo) { estado = M.mesclarComPadrao(salvo); salvoEm = salvo.meta && salvo.meta.salvoEm; }
    else estado = window.DadosExemplo.criar();
    if (!PL.anos[estado.analise.ano]) estado.analise.ano = PL.anoPadrao;
    document.addEventListener('click', aoClicar);
    document.addEventListener('input', aoDigitar);
    document.addEventListener('change', aoDigitar);
    document.addEventListener('focusout', aoSairCampo);
    document.addEventListener('toggle', aoAlternarDetalhes, true);
    window.addEventListener('hashchange', aoMudarHash);
    window.addEventListener('beforeprint', antesDeImprimir);
    window.addEventListener('afterprint', depoisDeImprimir);
    var timerRedim = null, larguraAnterior = window.innerWidth;
    window.addEventListener('resize', function () {
      clearTimeout(timerRedim);
      timerRedim = setTimeout(function () {
        if (window.innerWidth === larguraAnterior) return;
        larguraAnterior = window.innerWidth;
        if (ui.area === 'resultado') desenharResultado();
      }, 200);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!document.getElementById('fundo-modal').hidden) { document.getElementById('fundo-modal').hidden = true; return; }
      if (!document.getElementById('gaveta').hidden) { fecharGaveta(); return; }
      if (!document.getElementById('inicio').hidden) { fecharInicio(); return; }
      fecharMenus();
    });
    document.getElementById('arquivo-backup').addEventListener('change', function (ev) { if (ev.target.files[0]) importarBackup(ev.target.files[0]); ev.target.value = ''; });
    document.getElementById('versao-param').textContent = 'Parâmetros legais v' + PL_PADRAO.versao + ' (revisão de ' + PL_PADRAO.dataAtualizacao.split('-').reverse().join('/') + '). Motor v' + M.versao + '.';
    mostrarArea(true);
    atualizarCabecalho();
    if (!salvo && !ui.inicioVisto) abrirInicio();
    agendarAnalise(30);
  }

  window.SimuladorUI = {
    estado: function () { return estado; }, analise: function () { return analise; },
    executarAnalise: executarAnalise, navegar: navegar, irPara: navegar, parametros: function () { return PL; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
