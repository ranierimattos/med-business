/*
 * OTIMIZADOR DE CENÁRIOS
 * ---------------------------------------------------------------------------
 * Objetivo: minimizar, no horizonte do ano analisado,
 *   custo total = tributos da PJ + INSS do sócio + IRPF devido + IRPFM adicional
 *                 + custos administrativos incrementais do regime.
 * Retenções (IRRF, 10% sobre dividendos) são antecipações e não entram no
 * custo; restituições não são tratadas como economia.
 *
 * Métodos (todos determinísticos):
 *  1. Busca exaustiva em grade de pró-labore uniforme (mesmo valor em todos os
 *     meses planejados). Ótimo global dentro desse espaço.
 *  2. Programação dinâmica sobre o pró-labore acumulado (Simples com fator
 *     "r"): ótima no espaço discretizado de planos mensais, sob a aproximação
 *     de que o IRPF anual depende do total anual e o IRPFM de referência é fixo.
 *  3. Busca coordenada (mês a mês, vizinhança de ±6 passos) com o motor
 *     completo, a partir do melhor candidato.
 * Todo resultado apresentado vem de uma simulação completa do motor.
 */
(function (raiz) {
  'use strict';
  var M = raiz.MotorTributario;
  var r2 = M.r2, n0 = M.n0;

  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function uniforme(v) { var a = []; for (var i = 0; i < 12; i++) a.push(v); return a; }

  function grade(ctx, estado) {
    var P = ctx.P;
    var passo = Math.max(10, n0(estado.analise.incrementoProLabore) || 250);
    var minInf = M.num(estado.analise.proLaboreMinimo);
    var maxInf = M.num(estado.analise.proLaboreMaximo);
    var pmin = minInf === null ? P.previdencia.salarioMinimo : Math.max(0, minInf);
    var mediaRec = 0, n = 0;
    ctx.meses.forEach(function (m) { if (m.ativo) { mediaRec += m.rb; n++; } });
    mediaRec = n ? mediaRec / n : 0;
    var atual = Math.max.apply(null, ctx.proLaborePlanoAtual.concat([0]));
    var pmaxAuto = Math.max(pmin + 40 * passo, 0.45 * mediaRec, atual * 1.5);
    var pmax = maxInf === null ? pmaxAuto : Math.max(pmin, maxInf);
    pmin = Math.floor(pmin / 1) * 1;
    var maxPontos = 160;
    var passoEf = passo;
    if ((pmax - pmin) / passo > maxPontos) passoEf = Math.ceil((pmax - pmin) / maxPontos / passo) * passo;
    var valores = [];
    for (var v = pmin; v <= pmax + 1e-9; v += passoEf) valores.push(r2(v));
    if (valores[valores.length - 1] < pmax - 1e-9) valores.push(r2(valores[valores.length - 1] + passoEf));
    return { valores: valores, passo: passo, passoEfetivo: passoEf, min: pmin, max: valores[valores.length - 1], ajustado: passoEf !== passo, mediaReceita: mediaRec };
  }

  function planoUniforme(ctx, v) {
    return ctx.proLaboreFixo.map(function (f) { return f !== null ? f : v; });
  }

  function custo(res) { return res.anual.custoTotal; }

  function criarAvaliador(ctx) {
    var cache = {};
    var n = 0;
    function avaliar(regime, plano, forcar) {
      var chave = regime + '|' + (forcar || '') + '|' + plano.join(',');
      if (cache[chave]) return cache[chave];
      n++;
      var res = M.simular(ctx, { regime: regime, proLabore: plano, forcarAnexo: forcar || null });
      cache[chave] = res;
      return res;
    }
    avaliar.contagem = function () { return n; };
    return avaliar;
  }

  function temFatorR(ctx) {
    return M.TIPOS_RECEITA.some(function (tp) {
      var tr = ctx.tratamento[tp.id].simples;
      return (tr === 'fator_r' || tr === 'nao_segregada') && ctx.meses.some(function (m) { return m.grupos[tp.id] > 0; });
    });
  }

  // Regra de fim de horizonte: se dezembro está no Anexo III, o mês seguinte também deve estar.
  function sustentaFimHorizonte(ctx, res) {
    var ult = null;
    for (var k = 12; k >= 1; k--) { if (res.meses[k - 1].ativo && res.meses[k - 1].rb > 0) { ult = res.meses[k - 1]; break; } }
    if (!ult || ult.anexo !== 'III') return true;
    return M.fatorRMesSeguinte(ctx, res) >= ctx.P.simples.limiteFatorR - 1e-12;
  }

  // ------------------------------------------------ programação dinâmica

  // Limite de pró-labore acumulado por mês para manter o caixa (sem distribuições
  // discricionárias) acima da reserva. Usa o plano de pró-labore mínimo como referência.
  function limiteCaixaAcumulado(ctx, baseRes) {
    var lim = [], acumFluxo = ctx.caixaInicial, acumPL = 0;
    for (var k = 1; k <= 12; k++) {
      var i = k - 1;
      acumFluxo += baseRes.fluxoOperacional[i] + baseRes.proLabore[i] - (baseRes.distribuicaoFixa[i] || 0);
      acumPL += baseRes.proLabore[i];
      lim.push(Math.max(acumFluxo - ctx.reserva, acumPL));
    }
    return lim;
  }

  function otimizarPD(ctx, G, avaliarRef, exigirTerminal, limiteAcum) {
    var P = ctx.P, S = P.simples;
    var vals = G.valores, m = vals.length, pmin = vals[0], passo = G.passoEfetivo;
    var planejados = [];
    for (var k = 1; k <= 12; k++) if (ctx.proLaboreFixo[k - 1] === null && ctx.meses[k - 1].ativo) planejados.push(k);
    if (!planejados.length) return null;
    var ehPlanejado = {}; planejados.forEach(function (k) { ehPlanejado[k] = true; });
    var fixoAcum = [0];
    var nPlanAte = [0];
    for (k = 1; k <= 12; k++) {
      var f = ctx.proLaboreFixo[k - 1];
      fixoAcum.push(fixoAcum[k - 1] + (f !== null ? f : 0));
      nPlanAte.push(nPlanAte[k - 1] + (ehPlanejado[k] ? 1 : 0));
    }
    var Jmax = (m - 1) * planejados.length;
    // DAS de k cobrado ao fim do mês d_k
    var cobrarApos = {};
    var constante = 0;
    for (k = 1; k <= 12; k++) {
      var d = M.mesDependenciaFolha(ctx, k);
      if (d === null || d === 0 || nPlanAte[d] === 0) {
        var somaPL = d ? fixoAcum[d] : 0;
        constante += M.dasMes(ctx, k, M.apurarFatorR(ctx, k, somaPL), null, false).total;
      } else {
        (cobrarApos[d] = cobrarApos[d] || []).push(k);
      }
    }
    function dasEm(k, d, J) {
      var somaPL = fixoAcum[d] + nPlanAte[d] * pmin + J * passo;
      return M.dasMes(ctx, k, M.apurarFatorR(ctx, k, somaPL), null, false).total;
    }
    var inssV = vals.map(function (v) { return M.inssSocio(ctx, 1, v).valor; });
    var inssFixo = 0;
    for (k = 1; k <= 12; k++) { var fx = ctx.proLaboreFixo[k - 1]; if (fx) inssFixo += M.inssSocio(ctx, k, fx).valor; }

    // Referência para o termo anual da pessoa física
    var ref = avaliarRef;
    var pf = ctx.pf;
    var imRef = ref.anual.irpfm.impostoMinimo;
    function terminal(J) {
      var totPlan = planejados.length * pmin + J * passo;
      var media = totPlan / planejados.length;
      var inssPlan = M.inssSocio(ctx, 1, media).valor * planejados.length;
      var trib = fixoAcum[12] + totPlan + pf.outrasTributaveis + pf.carneLeaoRend;
      var irpf = M.calcularIrpfAnual(P, {
        tributaveis: trib, inss: inssFixo + inssPlan + pf.inssOutrasAnual, dependentes: pf.dependentes, pensao: pf.pensaoMensal * 12,
        medicas: pf.medicas, instrucao: pf.instrucao, pgbl: pf.pgbl, opcao: pf.opcao, irrf: 0, irOutrasFontes: 0, carneLeaoPago: 0
      }).devido;
      var adicional = Math.max(0, imRef - irpf - pf.irExclusivo);
      return irpf + adicional;
    }
    // Restrição terminal: FS da janela do mês seguinte
    var L = S.apuracao.defasagemMeses || 0;
    var estagioTerminal = 12 - L;
    var Jnec = -1;
    if (exigirTerminal) {
      var rb = 0, fs = 0, tFim = 24 - L, tIni = tFim - 11;
      var ini = isFinite(ctx.tInicio) ? Math.max(tIni, ctx.tInicio) : tIni;
      for (var t = ini; t <= tFim; t++) { rb += ctx.rbT[t] || 0; fs += ctx.fsFixoT[t] || 0; if (t >= 13 && ctx.proLaboreFixo[t - 13] !== null) fs += ctx.proLaboreFixo[t - 13]; }
      var faltam = S.limiteFatorR * rb - fs - nPlanAte[estagioTerminal] * pmin;
      Jnec = Math.max(0, Math.ceil(faltam / passo - 1e-9));
    }

    var INF = 1e18;
    var custoAtual = new Float64Array(Jmax + 1).fill(INF);
    custoAtual[0] = constante + inssFixo;
    var escolhas = [];
    var Jalc = 0;
    for (k = 1; k <= 12; k++) {
      var novo;
      if (ehPlanejado[k]) {
        novo = new Float64Array(Jmax + 1).fill(INF);
        var arg = new Int16Array(Jmax + 1).fill(-1);
        for (var J = 0; J <= Jalc; J++) {
          var c = custoAtual[J];
          if (c >= INF) continue;
          for (var i = 0; i < m; i++) {
            var nj = J + i, nc = c + inssV[i];
            if (nc < novo[nj]) { novo[nj] = nc; arg[nj] = i; }
          }
        }
        Jalc += m - 1;
        escolhas.push({ k: k, arg: arg });
      } else {
        novo = custoAtual;
        escolhas.push({ k: k, arg: null });
      }
      var cobrar = cobrarApos[k] || [];
      if (cobrar.length) {
        for (J = 0; J <= Jalc; J++) {
          if (novo[J] >= INF) continue;
          for (var q = 0; q < cobrar.length; q++) novo[J] += dasEm(cobrar[q], k, J);
        }
      }
      if (limiteAcum) {
        var jLim = Math.floor((limiteAcum[k - 1] - fixoAcum[k] - nPlanAte[k] * pmin) / passo + 1e-9);
        for (J = Math.max(0, jLim + 1); J <= Jalc; J++) novo[J] = INF;
      }
      if (exigirTerminal && k === estagioTerminal) {
        for (J = 0; J < Math.min(Jnec, Jalc + 1); J++) novo[J] = INF;
      }
      custoAtual = novo;
    }
    var melhor = INF, Jbest = -1;
    for (J = 0; J <= Jalc; J++) {
      if (custoAtual[J] >= INF) continue;
      var tot = custoAtual[J] + terminal(J);
      if (tot < melhor) { melhor = tot; Jbest = J; }
    }
    if (Jbest < 0) return null;
    var plano = ctx.proLaboreFixo.map(function (x) { return x !== null ? x : 0; });
    var Jc = Jbest;
    for (var e = escolhas.length - 1; e >= 0; e--) {
      var es = escolhas[e];
      if (!es.arg) continue;
      var idx = es.arg[Jc];
      if (idx < 0) return null;
      plano[es.k - 1] = vals[idx];
      Jc -= idx;
    }
    for (k = 1; k <= 12; k++) if (!ctx.meses[k - 1].ativo) plano[k - 1] = 0;
    return { plano: plano, custoAproximado: melhor };
  }

  function buscaCoordenada(ctx, G, regime, inicial, avaliar, valido, passes) {
    var vals = G.valores;
    var atual = inicial.slice();
    var resAtual = avaliar(regime, atual);
    var melhorCusto = custo(resAtual);
    var planejados = [];
    for (var k = 1; k <= 12; k++) if (ctx.proLaboreFixo[k - 1] === null && ctx.meses[k - 1].ativo) planejados.push(k);
    for (var p = 0; p < (passes || 2); p++) {
      var melhorou = false;
      planejados.forEach(function (k) {
        var idx = vals.indexOf(atual[k - 1]);
        if (idx < 0) idx = 0;
        var cand = {};
        for (var d = -6; d <= 6; d++) { var i = idx + d; if (i >= 0 && i < vals.length) cand[i] = true; }
        cand[0] = true; cand[vals.length - 1] = true;
        Object.keys(cand).forEach(function (si) {
          var i = +si;
          if (vals[i] === atual[k - 1]) return;
          var teste = atual.slice(); teste[k - 1] = vals[i];
          var r = avaliar(regime, teste);
          if (!valido(r)) return;
          if (custo(r) < melhorCusto - 0.005) { melhorCusto = custo(r); atual = teste; resAtual = r; melhorou = true; }
        });
      });
      if (!melhorou) break;
    }
    return { plano: atual, res: resAtual };
  }

  // Otimização míope: cada mês minimiza só o custo do próprio mês.
  function otimizarMiope(ctx, G, regime) {
    var plano = ctx.proLaboreFixo.map(function (x) { return x !== null ? x : G.valores[0]; });
    for (var k = ctx.k0; k <= 12; k++) {
      if (ctx.proLaboreFixo[k - 1] !== null || !ctx.meses[k - 1].ativo) continue;
      var melhor = null, mc = Infinity;
      G.valores.forEach(function (v) {
        var t = plano.slice(); t[k - 1] = v;
        var r = M.simular(ctx, { regime: regime, proLabore: t });
        var o = r.meses[k - 1];
        var c = o.tributosPJ + o.inss + o.irrf;
        if (c < mc - 0.005) { mc = c; melhor = v; }
      });
      plano[k - 1] = melhor;
    }
    return plano;
  }

  function otimizarRegime(ctx, G, regime, opcoes) {
    opcoes = opcoes || {};
    var avaliar = opcoes.avaliar || criarAvaliador(ctx);
    var curva = [];
    var baseRes = avaliar(regime, planoUniforme(ctx, G.valores[0]));
    var deficitBase = baseRes.deficitCaixa;
    function viavel(r) { return r.deficitCaixa <= deficitBase + 1; }
    var melhor = null;
    G.valores.forEach(function (v) {
      var r = avaliar(regime, planoUniforme(ctx, v));
      var pt = { P: v, custo: custo(r), pj: r2(r.anual.tributosPJ + r.anual.custoAdm), pf: r2(r.anual.inss + r.anual.tributosPF), viavel: viavel(r), mesesIII: r.anual.mesesAnexoIII, mesesV: r.anual.mesesAnexoV, res: r };
      curva.push(pt);
      if (pt.viavel && (!melhor || pt.custo < melhor.custo - 0.005)) melhor = pt;
    });
    if (!melhor) melhor = curva[0];
    var out = { regime: regime, curva: curva, melhorUniforme: { P: melhor.P, plano: planoUniforme(ctx, melhor.P), custo: melhor.custo }, deficitBase: deficitBase, metodo: ['Busca exaustiva em ' + G.valores.length + ' valores uniformes'] };
    if (opcoes.somenteUniforme) return out;

    var sustentar = (opcoes.fimHorizonte || 'sustentar') === 'sustentar';
    var validoVar = function (r) { return viavel(r) && (regime !== 'simples' || !sustentar || sustentaFimHorizonte(ctx, r)); };
    var candidatos = [{ origem: 'uniforme', plano: out.melhorUniforme.plano }];
    if (regime === 'simples' && temFatorR(ctx) && opcoes.variacao !== 'uniforme') {
      var limCx = limiteCaixaAcumulado(ctx, baseRes);
      [[false, null, 'pd'], [true, null, 'pd_terminal'], [false, limCx, 'pd_caixa'], [true, limCx, 'pd_caixa_terminal']].forEach(function (cfg) {
        var pd = otimizarPD(ctx, G, melhor.res, cfg[0], cfg[1]);
        if (pd) candidatos.push({ origem: cfg[2], plano: pd.plano });
      });
      out.metodo.push('Programação dinâmica sobre o pró-labore acumulado (' + G.valores.length + ' valores por mês)');
    }
    var melhorVar = null;
    candidatos.forEach(function (c) {
      var r = avaliar(regime, c.plano);
      c.res = r; c.valido = validoVar(r);
      if (c.valido && (!melhorVar || custo(r) < custo(melhorVar.res) - 0.005)) melhorVar = c;
    });
    if (!melhorVar) melhorVar = candidatos[0];
    if (opcoes.variacao !== 'uniforme') {
      var cd = buscaCoordenada(ctx, G, regime, melhorVar.plano, avaliar, validoVar, 2);
      if (custo(cd.res) < custo(avaliar(regime, melhorVar.plano)) - 0.005) melhorVar = { origem: melhorVar.origem + '+busca_coordenada', plano: cd.plano, res: cd.res, valido: true };
      out.metodo.push('Busca coordenada mês a mês (±6 passos) com o motor completo');
    }
    out.melhorVariavel = { plano: melhorVar.plano, custo: custo(avaliar(regime, melhorVar.plano)), origem: melhorVar.origem };
    out.candidatos = candidatos.map(function (c) { return { origem: c.origem, custo: custo(c.res), valido: c.valido }; });
    return out;
  }

  function regimeReferencia(ctx, eleg) {
    var r = ctx.regimeAtual;
    if (r === 'simples' || r === 'presumido' || r === 'real') return r;
    if (eleg.simples.status !== 'inelegivel') return 'simples';
    return 'presumido';
  }

  function limitesAnexo(curva) {
    var primeiro = null, todos = null;
    var maxIII = 0;
    curva.forEach(function (p) { maxIII = Math.max(maxIII, p.mesesIII); });
    curva.forEach(function (p) {
      if (primeiro === null && p.mesesIII > 0) primeiro = p;
      if (todos === null && p.mesesV === 0 && p.mesesIII > 0) todos = p;
    });
    var primeiroMes = null;
    if (primeiro) {
      var m = primeiro.res.meses.filter(function (x) { return x.anexo === 'III' && x.rb > 0; })[0];
      primeiroMes = m ? m.rotulo : null;
    }
    return { primeiro: primeiro ? primeiro.P : null, primeiroMes: primeiroMes, todos: todos ? todos.P : null, maxMesesIII: maxIII };
  }

  function linhaCenario(nome, regra, res, base) {
    var A = res.anual;
    var outros = r2(A.tributosPJ - A.das);
    var l = {
      nome: nome, regra: regra, regime: res.regime, proLaboreMedio: r2(M.soma(res.proLabore) / 12), plano: res.proLabore.slice(),
      das: A.das, inss: A.inss, irpf: A.irpfDevido, irpfm: A.irpfmAdicional, outros: outros, custoAdm: A.custoAdm,
      carga: A.cargaTributaria, custoTotal: A.custoTotal, rendaLiquida: A.rendaLiquidaPF, lucroRetido: A.lucroRetido, caixaFinal: A.caixaFinalPJ,
      mesesIII: A.mesesAnexoIII, mesesV: A.mesesAnexoV, viavel: res.viavel, res: res
    };
    if (base) { l.difAnual = r2(A.custoTotal - base.anual.custoTotal); l.difMensal = r2(l.difAnual / 12); l.difRenda = r2(A.rendaLiquidaPF - base.anual.rendaLiquidaPF); }
    return l;
  }

  function contextoVariante(estado, P, opcoesCtx, mutar) {
    var e = clonar(estado);
    if (mutar) mutar(e);
    return M.prepararContexto(e, P, opcoesCtx || {});
  }

  function melhorUniformeRapido(ctx, estado, regime, passos) {
    var G = grade(ctx, estado);
    var vals = G.valores.filter(function (v, i) { return i % (passos || 4) === 0; });
    if (vals[vals.length - 1] !== G.valores[G.valores.length - 1]) vals.push(G.valores[G.valores.length - 1]);
    var base = M.simular(ctx, { regime: regime, proLabore: planoUniforme(ctx, vals[0]) });
    var melhor = null;
    vals.forEach(function (v) {
      var r = M.simular(ctx, { regime: regime, proLabore: planoUniforme(ctx, v) });
      if (r.deficitCaixa > base.deficitCaixa + 1) return;
      if (!melhor || r.anual.custoTotal < melhor.anual.custoTotal - 0.005) melhor = r;
    });
    return melhor || base;
  }

  /*
   * Executa a análise completa.
   * opcoes: { rapido: bool (sem sensibilidade/equilíbrio), parametros: ParametrosLegais }
   */
  function executar(estado, opcoes) {
    opcoes = opcoes || {};
    var PL = opcoes.parametros || raiz.ParametrosLegais;
    var ano = +estado.analise.ano;
    var P = PL.anos[ano] || PL.anos[PL.anoPadrao];
    var t0 = Date.now();
    var ctx = M.prepararContexto(estado, P);
    var G = grade(ctx, estado);
    var eleg = M.avaliarElegibilidade(ctx);
    var regRef = regimeReferencia(ctx, eleg);
    var variacao = estado.analise.variacaoProLabore || 'livre';
    var fimH = estado.analise.fimHorizonte || 'sustentar';

    var avaliar = criarAvaliador(ctx);
    var atual = M.simular(ctx, { regime: regRef, proLabore: ctx.proLaborePlanoAtual, detalhar: true });

    var regimes = {};
    ['simples', 'presumido', 'real'].forEach(function (rg) {
      var o = otimizarRegime(ctx, G, rg, { avaliar: avaliar, variacao: variacao, fimHorizonte: fimH, somenteUniforme: rg !== 'simples' });
      o.elegibilidade = eleg[rg];
      regimes[rg] = o;
    });

    // Curvas hipotéticas do Simples com anexo forçado
    var curvaV = [], curvaIII = [];
    if (temFatorR(ctx)) {
      G.valores.forEach(function (v) {
        curvaV.push({ P: v, custo: custo(avaliar('simples', planoUniforme(ctx, v), 'V')) });
        curvaIII.push({ P: v, custo: custo(avaliar('simples', planoUniforme(ctx, v), 'III')) });
      });
    }

    // Faixa de incerteza
    var variantes = [];
    variantes.push({ nome: 'Receita conservadora', ctx: M.prepararContexto(estado, P, { cenarioReceita: 'conservador' }) });
    variantes.push({ nome: 'Receita otimista', ctx: M.prepararContexto(estado, P, { cenarioReceita: 'otimista' }) });
    var histIncompleto = ctx.historicoFaltante.length > 0;
    if (histIncompleto) {
      variantes.push({ nome: 'Histórico ausente: folha zero', ctx: contextoVariante(estado, P, {}, function (e) { e.receitas.historico.forEach(function (h) { if (M.num(h.folha) === null) h.folha = '0'; }); }) });
      variantes.push({ nome: 'Histórico ausente: folha 50% maior', ctx: contextoVariante(estado, P, {}, function (e) {
        var est = n0(e.folha.proLaboreAtual) * 1.5;
        e.receitas.historico.forEach(function (h) { if (M.num(h.folha) === null) h.folha = String(est); });
      }) });
    }
    var banda = G.valores.map(function (v) {
      var cs = variantes.map(function (va) { return M.simular(va.ctx, { regime: 'simples', proLabore: planoUniforme(va.ctx, v) }).anual.custoTotal; });
      return { P: v, min: Math.min.apply(null, cs), max: Math.max.apply(null, cs) };
    });

    // Escolha do regime recomendado
    var anoEmCurso = ctx.k0 > 1;
    var elegiveis = ['simples', 'presumido', 'real'].filter(function (rg) {
      var st = eleg[rg].status;
      if (st === 'inelegivel' || st === 'estimativa_incompleta') return false;
      if (anoEmCurso && rg !== regRef) return false;
      return true;
    });
    if (!elegiveis.length) elegiveis = [regRef];
    var melhorRegime = null, melhorPlano = null, melhorCusto = Infinity, tipoPlano = 'uniforme';
    elegiveis.forEach(function (rg) {
      var o = regimes[rg];
      var c = o.melhorUniforme.custo, pl = o.melhorUniforme.plano, tp = 'uniforme';
      if (o.melhorVariavel && o.melhorVariavel.custo < c - 0.005) { c = o.melhorVariavel.custo; pl = o.melhorVariavel.plano; tp = 'variavel'; }
      if (c < melhorCusto - 0.005) { melhorCusto = c; melhorRegime = rg; melhorPlano = pl; tipoPlano = tp; }
    });
    var materialidade = Math.max(0, n0(estado.analise.materialidade));
    // Preferência por plano uniforme quando a vantagem do variável é imaterial
    var oRec = regimes[melhorRegime];
    var ganhoVariavel = oRec.melhorVariavel ? r2(oRec.melhorUniforme.custo - oRec.melhorVariavel.custo) : 0;
    if (tipoPlano === 'variavel' && ganhoVariavel < materialidade) { melhorPlano = oRec.melhorUniforme.plano; tipoPlano = 'uniforme'; melhorCusto = oRec.melhorUniforme.custo; }
    var recomendado = M.simular(ctx, { regime: melhorRegime, proLabore: melhorPlano, detalhar: true });
    // O plano atual também é candidato: nunca recomendar algo mais caro que manter a estrutura.
    var atualElegivel = elegiveis.indexOf(regRef) >= 0;
    if (atualElegivel && atual.anual.custoTotal < recomendado.anual.custoTotal - 0.005 && atual.deficitCaixa <= regimes[regRef].deficitBase + 1) {
      recomendado = atual; melhorRegime = regRef; tipoPlano = 'atual';
    }
    var economia = r2(atual.anual.custoTotal - recomendado.anual.custoTotal);
    var qual = M.qualidadeDados(ctx);
    var semVantagem = economia < materialidade;

    // Cenários comparativos
    var curvaS = regimes.simples.curva;
    var lim = limitesAnexo(curvaS);
    var cen = [];
    cen.push(linhaCenario('Cenário atual', 'Plano de pró-labore informado, regime ' + nomeRegime(regRef), atual, null));
    var Gv = G.valores;
    var resRed = avaliar(regRef, planoUniforme(ctx, Gv[0]));
    cen.push(linhaCenario('Pró-labore reduzido', 'Mínimo da grade: ' + M.brl(Gv[0]) + '/mês', resRed, atual));
    var pInter = lim.todos !== null ? lim.todos : (lim.primeiro !== null ? lim.primeiro : Gv[Math.floor(Gv.length / 2)]);
    var resInt = avaliar(regRef, planoUniforme(ctx, pInter));
    cen.push(linhaCenario('Pró-labore intermediário', lim.todos !== null ? 'Menor valor uniforme com todos os meses no Anexo III: ' + M.brl(pInter) : (lim.primeiro !== null ? 'Menor valor uniforme com algum mês no Anexo III: ' + M.brl(pInter) : 'Ponto médio da grade: ' + M.brl(pInter)), resInt, atual));
    var pEl = nearest(Gv, pInter * 1.5);
    var resEl = avaliar(regRef, planoUniforme(ctx, pEl));
    cen.push(linhaCenario('Pró-labore elevado', '150% do intermediário: ' + M.brl(pEl), resEl, atual));
    cen.push(linhaCenario('Cenário otimizado', 'Melhor plano encontrado (' + ({ variavel: 'mensal variável', uniforme: 'uniforme', atual: 'plano atual' }[tipoPlano]) + ', ' + nomeRegime(melhorRegime) + ')', recomendado, atual));
    ['simples', 'presumido', 'real'].forEach(function (rg) {
      if (rg === melhorRegime) return;
      var o = regimes[rg];
      var r = avaliar(rg, o.melhorUniforme.plano);
      var st = eleg[rg].status;
      cen.push(linhaCenario('Melhor ' + nomeRegime(rg), 'Pró-labore uniforme de ' + M.brl(o.melhorUniforme.P) + (st === 'inelegivel' ? ' — INELEGÍVEL' : (st === 'estimativa_incompleta' ? ' — estimativa incompleta' : (anoEmCurso && rg !== regRef ? ' — só no próximo ano' : ''))), r, atual));
    });

    // Otimização míope
    var planoMiope = otimizarMiope(ctx, G, melhorRegime);
    var resMiope = M.simular(ctx, { regime: melhorRegime, proLabore: planoMiope });

    var analise = {
      ano: ano, parametros: P, ctx: ctx, grade: G, elegibilidade: eleg, regimeReferencia: regRef,
      atual: atual, recomendado: recomendado, regimeRecomendado: melhorRegime, tipoPlano: tipoPlano,
      ganhoPlanoVariavel: ganhoVariavel, economia: economia, semVantagemRelevante: semVantagem, materialidade: materialidade,
      regimes: regimes, curvaV: curvaV, curvaIII: curvaIII, banda: banda, variantesBanda: variantes.map(function (v) { return v.nome; }),
      historicoIncompleto: histIncompleto, limitesAnexo: lim, cenarios: cen, miope: { plano: planoMiope, res: resMiope },
      qualidade: qual, avaliacoes: avaliar.contagem(), anoEmCurso: anoEmCurso
    };
    analise.conciliacao = M.conciliarPagamentos(ctx, atual);
    var insuf = null;
    if (eleg.real.status === 'estimativa_incompleta') insuf = 'Lucro Real sem escrituração ou sem despesas cadastradas: tratado como estimativa incompleta e excluído da recomendação.';
    analise.alertas = M.gerarAlertas(ctx, atual, { divergencias: analise.conciliacao.divergencias, dadosInsuficientesRegimes: insuf });
    var proxRec = recomendado.regime === 'simples' ? recomendado.meses.filter(function (m) { return m.anexo === 'III' && m.rb > 0 && m.fatorR < 0.31; }) : [];
    if (proxRec.length && recomendado !== atual) analise.alertas.unshift({ nivel: 'atencao', codigo: 'fator_r_proximo_recomendado', titulo: 'Plano recomendado com fator "r" pouco acima de 28%', detalhe: 'Meses entre 28% e 31% no plano recomendado: ' + proxRec.map(function (m) { return m.rotulo + ' (' + M.pct(m.fatorR, 2) + ')'; }).join(', ') + '. Uma queda de folha ou aumento de receita devolve o mês ao Anexo V; acompanhe mês a mês.', limita: 'A economia projetada depende de executar o plano exatamente.' });
    analise.otimalidade = textoOtimalidade(analise);
    if (!opcoes.rapido) {
      analise.equilibrio = pontosEquilibrio(analise, estado, PL);
      analise.sensibilidade = sensibilidade(analise, estado, PL);
      analise.cenariosReceita = cenariosReceita(estado, P);
      analise.anoSeguinte = efeitoAnoSeguinte(analise, estado, PL);
    }
    analise.planoAcao = gerarPlanoAcao(analise);
    analise.tempoMs = Date.now() - t0;
    return analise;
  }

  function nearest(vals, x) {
    var b = vals[0];
    vals.forEach(function (v) { if (Math.abs(v - x) < Math.abs(b - x)) b = v; });
    return b;
  }

  function nomeRegime(r) {
    return { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', indefinido: 'não definido' }[r] || r;
  }

  function textoOtimalidade(a) {
    var o = a.regimes[a.regimeRecomendado];
    var t = [];
    t.push('Pró-labore uniforme: ótimo global na grade de ' + a.grade.valores.length + ' valores entre ' + M.brl(a.grade.min) + ' e ' + M.brl(a.grade.max) + ' (passo ' + M.brl(a.grade.passoEfetivo) + (a.grade.ajustado ? ', ajustado para limitar o número de pontos' : '') + ').');
    if (o.melhorVariavel) {
      t.push('Plano mensal variável: melhor solução encontrada por programação dinâmica e busca coordenada; é ótima no espaço discretizado sob a aproximação descrita (IRPF anual pelo total do ano e IRPFM de referência fixo), confirmada por simulação completa. Não há garantia de ótimo global fora da grade pesquisada.');
      if (a.tipoPlano === 'atual') t.push('O plano atual custa menos que todas as alternativas da grade pesquisada (por exemplo, por estar abaixo do pró-labore mínimo da grade) e foi mantido como recomendação.');
      if (a.tipoPlano === 'uniforme' && a.ganhoPlanoVariavel > 0) t.push('O plano variável economizaria ' + M.brl(a.ganhoPlanoVariavel) + ', abaixo da materialidade de ' + M.brl(a.materialidade) + '; por simplicidade e menor risco, recomenda-se o plano uniforme.');
    }
    t.push('Regimes comparados com as mesmas receitas, despesas, período e premissas.');
    return t;
  }

  // ------------------------------------------------------- equilíbrio

  function pontosEquilibrio(a, estado, PL) {
    var out = {};
    var ctx = a.ctx;
    var regRef = a.regimeReferencia;
    var curva = a.regimes[regRef].curva;
    var medAtual = M.soma(a.atual.proLabore.slice(ctx.k0 - 1)) / Math.max(1, 13 - ctx.k0);
    var custoAtual = a.atual.anual.custoTotal;
    var achado = null;
    curva.forEach(function (p) { if (!achado && p.P > medAtual + 0.5 && p.viavel && p.custo < custoAtual - 0.005) achado = p; });
    out.aumentoProLabore = achado ? { de: r2(medAtual), para: achado.P, aumento: r2(achado.P - medAtual), economia: r2(custoAtual - achado.custo) } : { de: r2(medAtual), para: null };

    // Fator R: custo incremental e DAS economizado
    var lim = a.limitesAnexo;
    if (lim.primeiro !== null) {
      var pAlvo = lim.todos !== null ? lim.todos : lim.primeiro;
      var cBase = a.regimes.simples.curva[0].res, cAlvo = null;
      a.regimes.simples.curva.forEach(function (p) { if (p.P === pAlvo) cAlvo = p.res; });
      if (cAlvo) {
        var dDas = r2(cBase.anual.das - cAlvo.anual.das);
        var dPessoal = r2((cAlvo.anual.inss + cAlvo.anual.tributosPF) - (cBase.anual.inss + cBase.anual.tributosPF));
        out.fatorR = { proLaboreMinimo: a.grade.min, proLaboreAlvo: pAlvo, mesesIII: cAlvo.anual.mesesAnexoIII, economiaDas: dDas, custoAdicionalPessoal: dPessoal, saldo: r2(dDas - dPessoal), compensa: dDas > dPessoal };
      }
    } else out.fatorR = null;

    // Plano recomendado × pró-labore mínimo (efeito líquido do fator "r")
    var rRec = a.recomendado, rMin = a.regimes[a.regimeRecomendado].curva[0].res;
    if (a.regimeRecomendado === 'simples') {
      var dDas2 = r2(rMin.anual.das - rRec.anual.das);
      var dPes2 = r2((rRec.anual.inss + rRec.anual.tributosPF) - (rMin.anual.inss + rMin.anual.tributosPF));
      out.fatorRPlanoRecomendado = { mesesIII: rRec.anual.mesesAnexoIII, economiaDas: dDas2, custoAdicionalPessoal: dPes2, saldo: r2(dDas2 - dPes2) };
    }

    // Mensal × anual
    out.miope = { custo: a.miope.res.anual.custoTotal, otimo: a.recomendado.anual.custoTotal, diferenca: r2(a.miope.res.anual.custoTotal - a.recomendado.anual.custoTotal) };

    // Faturamento em que outro regime passa a ser vantajoso
    var pares = [];
    var rec = a.regimeRecomendado;
    ['simples', 'presumido', 'real'].forEach(function (rg) {
      if (rg === rec) return;
      if (a.elegibilidade[rg].status === 'inelegivel') return;
      pares.push(rg);
    });
    out.regimes = pares.map(function (rg) {
      function dif(f) {
        var c = M.prepararContexto(estado, a.parametros, { multiplicadorReceita: f });
        var x = melhorUniformeRapido(c, estado, rec, 6).anual.custoTotal;
        var y = melhorUniformeRapido(c, estado, rg, 6).anual.custoTotal;
        return x - y;
      }
      var fs = [0.4, 0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
      var difs = fs.map(dif);
      var cruz = null;
      for (var i = 1; i < fs.length; i++) {
        if ((difs[i - 1] <= 0 && difs[i] > 0) || (difs[i - 1] > 0 && difs[i] <= 0)) {
          var lo = fs[i - 1], hi = fs[i], dlo = difs[i - 1];
          for (var it = 0; it < 10; it++) {
            var mid = (lo + hi) / 2, dm = dif(mid);
            if ((dlo <= 0) === (dm <= 0)) { lo = mid; dlo = dm; } else hi = mid;
          }
          cruz = (lo + hi) / 2; break;
        }
      }
      var rbBase = M.soma(ctx.meses.map(function (m) { return m.rb; }));
      return { regime: rg, multiplicador: cruz, faturamentoAnual: cruz ? r2(rbBase * cruz) : null, faixaTestada: [r2(rbBase * fs[0]), r2(rbBase * fs[fs.length - 1])], vantagemNaBase: r2(-dif(1)) };
    });
    return out;
  }

  // ------------------------------------------------------- sensibilidade

  function sensibilidade(a, estado, PL) {
    var P = a.parametros, reg = a.regimeRecomendado, plano = a.recomendado.proLabore;
    var base = a.recomendado.anual.custoTotal;
    function custoCom(e, opc, Pano) {
      var c = M.prepararContexto(e, Pano || P, opc || {});
      return M.simular(c, { regime: reg, proLabore: plano }).anual.custoTotal;
    }
    function variante(m) { var e = clonar(estado); m(e); return e; }
    var itens = [];
    function add(nome, baixo, alto, rotBaixo, rotAlto) {
      itens.push({ nome: nome, baixo: r2(baixo - base), alto: r2(alto - base), rotuloBaixo: rotBaixo, rotuloAlto: rotAlto, impacto: r2(Math.max(Math.abs(baixo - base), Math.abs(alto - base))) });
    }
    add('Faturamento', custoCom(estado, { multiplicadorReceita: 0.9 }), custoCom(estado, { multiplicadorReceita: 1.1 }), '−10%', '+10%');
    add('Crescimento anual', custoCom(variante(function (e) { e.analise.crescimentoAnual = n0(e.analise.crescimentoAnual) - 5; })), custoCom(variante(function (e) { e.analise.crescimentoAnual = n0(e.analise.crescimentoAnual) + 5; })), '−5 p.p.', '+5 p.p.');
    add('Sazonalidade', custoCom(estado, { amplitudeSazonal: 0.5 }), custoCom(estado, { amplitudeSazonal: 1.5 }), 'metade', '+50%');
    var ctxB = M.prepararContexto(estado, P);
    function comPlano(f) { return M.simular(ctxB, { regime: reg, proLabore: plano.map(function (v) { return v * f; }) }).anual.custoTotal; }
    add('Pró-labore', comPlano(0.9), comPlano(1.1), '−10%', '+10%');
    function escDesp(f) { return variante(function (e) { e.despesas.forEach(function (d) { d.valor = String(n0(d.valor) * f); if (Array.isArray(d.valoresMensais)) d.valoresMensais = d.valoresMensais.map(function (v) { return String(n0(v) * f); }); }); }); }
    add('Despesas operacionais', custoCom(escDesp(0.9)), custoCom(escDesp(1.1)), '−10%', '+10%');
    add('Custos contábeis/administrativos', custoCom(variante(function (e) { Object.keys(e.empresa.custosAdm).forEach(function (k) { e.empresa.custosAdm[k] = n0(e.empresa.custosAdm[k]) * 0.5; }); })), custoCom(variante(function (e) { Object.keys(e.empresa.custosAdm).forEach(function (k) { e.empresa.custosAdm[k] = n0(e.empresa.custosAdm[k]) * 1.5; }); })), '−50%', '+50%');
    var salMedio = 0, nCLT = 0;
    (estado.folha.pessoas || []).forEach(function (p) { if (p.tipo === 'clt') { salMedio += n0(p.salario); nCLT++; } });
    salMedio = nCLT ? salMedio / nCLT : P.previdencia.salarioMinimo * 1.5;
    add('Número de empregados', custoCom(variante(function (e) { var i = e.folha.pessoas.findIndex(function (p) { return p.tipo === 'clt'; }); if (i >= 0) e.folha.pessoas.splice(i, 1); })), custoCom(variante(function (e) { e.folha.pessoas.push({ id: 'sens', nome: 'Empregado adicional', tipo: 'clt', salario: String(salMedio), mesInicio: 1, mesFim: 12, decimoTerceiro: true, ferias: true, mesFerias: 7 }); })), nCLT ? '−1' : 'sem alteração', '+1 (' + M.brl(salMedio) + ')');
    add('Folha histórica (fator "r")', custoCom(variante(function (e) { e.receitas.historico.forEach(function (h) { if (M.num(h.folha) !== null) h.folha = String(n0(h.folha) * 0.9); }); })), custoCom(variante(function (e) { e.receitas.historico.forEach(function (h) { if (M.num(h.folha) !== null) h.folha = String(n0(h.folha) * 1.1); }); })), '−10%', '+10%');
    add('Outras rendas pessoais', base, custoCom(variante(function (e) { e.pf.outrasRendasTributaveisAnual = String(n0(e.pf.outrasRendasTributaveisAnual) + 100000); })), 'atual', '+R$ 100 mil/ano');
    add('Distribuição de lucros', base, custoCom(variante(function (e) { e.distribuicao.politica = 'anual'; })), 'política atual', 'anual em dezembro');
    var outros = ['simples', 'presumido', 'real'].filter(function (r) { return r !== reg && a.elegibilidade[r].status !== 'inelegivel'; });
    if (outros.length) {
      var custos = outros.map(function (r) { return a.regimes[r].melhorUniforme.custo; });
      var iMin = custos.indexOf(Math.min.apply(null, custos));
      add('Regime tributário', base, custos[iMin], 'recomendado', 'melhor alternativa: ' + nomeRegime(outros[iMin]));
    }
    var anos = Object.keys(PL.anos).map(Number).filter(function (y) { return y !== P.ano; });
    if (anos.length) {
      var y = anos.indexOf(P.ano + 1) >= 0 ? P.ano + 1 : anos[anos.length - 1];
      add('Tabelas legais', base, custoCom(estado, {}, PL.anos[y]), String(P.ano), String(y) + (PL.anos[y].status === 'projetado' ? ' (projetado)' : ''));
    }
    itens.sort(function (x, y2) { return y2.impacto - x.impacto; });
    return { base: r2(base), regime: reg, itens: itens, metodo: 'Plano recomendado mantido fixo; para cada variável, mede-se a variação do custo total anual (tributos + INSS + custos administrativos). Em "Regime tributário", compara-se com o melhor plano uniforme do regime alternativo.' };
  }

  function cenariosReceita(estado, P) {
    return ['conservador', 'base', 'otimista'].map(function (c) {
      var ctx = M.prepararContexto(estado, P, { cenarioReceita: c });
      var linhas = {};
      ['simples', 'presumido', 'real'].forEach(function (rg) {
        var r = melhorUniformeRapido(ctx, estado, rg, 2);
        linhas[rg] = { custo: r.anual.custoTotal, proLabore: r.proLabore[11], rendaLiquida: r.anual.rendaLiquidaPF, mesesIII: r.anual.mesesAnexoIII, receita: r.anual.rb };
      });
      return { cenario: c, regimes: linhas };
    });
  }

  // Ano seguinte em regime permanente: mesma receita, plano final mantido.
  function efeitoAnoSeguinte(a, estado, PL) {
    var anoS = a.ano + 1;
    var Ps = PL.anos[anoS] || a.parametros;
    function proximo(res) {
      var e = clonar(estado);
      e.analise.ano = anoS;
      e.analise.mesInicioPlanejamento = 1;
      e.receitas.historico = [{ receita: String(M.n0(estado.receitas.historico[12] && estado.receitas.historico[12].receita)), folha: String(M.n0(estado.receitas.historico[12] && estado.receitas.historico[12].folha)), fgts: '', cpp: '' }];
      res.meses.forEach(function (m, i) {
        var f = a.ctx.folha[i];
        e.receitas.historico.push({ receita: String(m.base), folha: String(m.proLabore + f.totalTerceiros), fgts: String(f.fgts), cpp: res.regime === 'simples' ? '' : String(m.cpp) });
      });
      var plFinal = res.proLabore[11];
      e.folha.proLaboreAtual = String(plFinal);
      e.folha.proLaboreMes = e.folha.proLaboreMes.map(function () { return ''; });
      e.folha.pagoMes = e.folha.pagoMes.map(function () { return ''; });
      e.distribuicao.realizadoMes = e.distribuicao.realizadoMes.map(function () { return ''; });
      e.distribuicao.lucrosAcumuladosAnteriores = String(Math.max(0, res.anual.lucroRetido + n0(estado.distribuicao.lucrosAcumuladosAnteriores) - n0(estado.distribuicao.saldoTransicao2025)));
      e.distribuicao.saldoTransicao2025 = String(Math.max(0, n0(estado.distribuicao.saldoTransicao2025) - res.anual.dividendoTransicao / Math.max(0.01, a.ctx.participacao)));
      e.analise.caixaInicialPJ = String(res.anual.caixaFinalPJ);
      e.despesas = e.despesas.filter(function (d) { return d.recorrencia === 'mensal' || d.recorrencia === 'anual' || d.recorrencia === 'trimestral' || d.recorrencia === 'semestral'; });
      var c = M.prepararContexto(e, Ps);
      var r = M.simular(c, { regime: res.regime, proLabore: uniforme(plFinal) });
      var ot = melhorUniformeRapido(c, e, res.regime, 2);
      return {
        custo: r.anual.custoTotal, mesesIII: r.anual.mesesAnexoIII, proLabore: plFinal, rendaLiquida: r.anual.rendaLiquidaPF,
        otimoUniforme: { proLabore: ot.proLabore[11], custo: ot.anual.custoTotal, mesesIII: ot.anual.mesesAnexoIII }
      };
    }
    return {
      ano: anoS, parametrosStatus: Ps.status,
      atual: proximo(a.atual), recomendado: proximo(a.recomendado),
      premissas: 'Mesma receita e despesas recorrentes do ano analisado e histórico formado pelo próprio ano analisado. Duas leituras: pró-labore de dezembro mantido nos 12 meses, e melhor pró-labore uniforme recalculado para o ano seguinte. Parâmetros de ' + anoS + (PL.anos[anoS] ? ' (' + Ps.status + ')' : ' (repetidos do ano analisado)') + '.'
    };
  }

  // ------------------------------------------------------- plano de ação

  function gerarPlanoAcao(a) {
    var acoes = [];
    var rec = a.recomendado, atu = a.atual;
    var RA = rec.anual, AA = atu.anual;
    var qual = a.qualidade;
    var confianca = qual.nivel === 'alta' ? 'calculada' : (qual.nivel === 'média' ? 'estimada' : 'hipótese não validada');
    var planoMudou = rec.proLabore.some(function (v, i) { return Math.abs(v - atu.proLabore[i]) > 0.5; });
    if (a.regimeRecomendado !== a.regimeReferencia) {
      acoes.push({
        titulo: 'Avaliar migração para o ' + nomeRegime(a.regimeRecomendado),
        oque: 'Mudar o regime tributário de ' + nomeRegime(a.regimeReferencia) + ' para ' + nomeRegime(a.regimeRecomendado) + '.',
        porque: 'Custo total anual projetado ' + M.brl(Math.abs(a.economia)) + ' menor com as mesmas receitas e despesas.',
        economia: a.economia, custoAdicional: r2(RA.custoAdm - AA.custoAdm), classificacao: confianca,
        quando: a.regimeRecomendado === 'simples' ? 'Opção em janeiro, com efeito desde 1º de janeiro (ou em até 30 dias da última inscrição, no início de atividade).' : 'Opção com o pagamento da primeira quota do ano (efeito para o ano-calendário inteiro, irretratável).',
        documentos: 'Balancetes, folha (eSocial/DCTFWeb), relatório de receitas por atividade, certidões de regularidade fiscal.',
        validacao: 'Confirmar elegibilidade, enquadramento do CNAE e custo contábil do novo regime.',
        riscos: 'A vantagem pode inverter com variação de receita (veja o ponto de equilíbrio) e com obrigações acessórias adicionais.',
        pendencias: pendencias(a)
      });
    }
    if (planoMudou && a.economia > 0) {
      var medRec = r2(M.soma(rec.proLabore.slice(a.ctx.k0 - 1)) / Math.max(1, 13 - a.ctx.k0));
      var medAtu = r2(M.soma(atu.proLabore.slice(a.ctx.k0 - 1)) / Math.max(1, 13 - a.ctx.k0));
      acoes.push({
        titulo: (medRec > medAtu ? 'Aumentar' : 'Reduzir') + ' o pró-labore conforme o plano ' + (a.tipoPlano === 'variavel' ? 'mensal' : 'uniforme'),
        oque: 'Pró-labore médio de ' + M.brl(medAtu) + ' para ' + M.brl(medRec) + ' por mês' + (a.tipoPlano === 'variavel' ? ' (valores mês a mês no relatório)' : '') + '.',
        porque: a.regimeRecomendado === 'simples' && RA.mesesAnexoIII > AA.mesesAnexoIII ? 'Eleva a folha dos últimos 12 meses e leva ' + RA.mesesAnexoIII + ' mês(es) ao Anexo III (contra ' + AA.mesesAnexoIII + ' no plano atual). A redução do DAS supera o INSS e o IRPF adicionais.' : 'Reduz INSS e IRPF sem alterar o anexo ou o regime.',
        economia: a.economia, custoAdicional: r2((RA.inss + RA.tributosPF) - (AA.inss + AA.tributosPF)), classificacao: confianca,
        quando: 'A partir do mês ' + a.ctx.k0 + '. No Simples, o pró-labore de um mês só altera o fator "r" dos meses seguintes' + (a.parametros.simples.apuracao.defasagemMeses ? ' (com defasagem adicional de um mês)' : '') + '.',
        documentos: 'Ata ou alteração contratual fixando o pró-labore, recibos/folha, comprovantes de pagamento, eSocial e DCTFWeb transmitidos no prazo.',
        validacao: 'Contador deve confirmar a composição da folha do fator "r" e o IRRF mensal.',
        riscos: 'Pró-labore declarado e não pago não conta no fator "r". Fator "r" próximo de 28% exige monitoramento mensal.',
        pendencias: pendencias(a)
      });
    }
    if (RA.retencaoDividendos > 0) acoes.push({
      titulo: 'Escalonar distribuições para até R$ 50 mil por mês', oque: 'Distribuir lucros em parcelas mensais de até R$ 50 mil por sócio.', porque: 'Evita retenção de 10% na fonte (' + M.brl(RA.retencaoDividendos) + ' no ano). A retenção é antecipação; o efeito é de caixa, não de carga final.',
      economia: 0, custoAdicional: 0, classificacao: 'calculada', quando: 'Imediato.', documentos: 'Atas de distribuição e balancetes.', validacao: 'Confirmar lucro apurado por balancete.', riscos: 'O IRPFM anual continua devido se os rendimentos superarem R$ 600 mil.', pendencias: []
    });
    if (a.ctx.estado.empresa.contabilidadeRegular !== 'sim') acoes.push({
      titulo: 'Manter escrituração contábil completa', oque: 'Escrituração com balancetes mensais e demonstrações anuais.', porque: 'Sem escrituração, a distribuição isenta fica limitada ao lucro presumido menos tributos e o redutor do IRPFM não pode ser usado.',
      economia: 0, custoAdicional: null, classificacao: 'hipótese não validada', quando: 'Para o exercício corrente.', documentos: 'Contrato com contador, livros Diário e Razão.', validacao: 'Custo do serviço contábil.', riscos: 'Distribuições acima do limite podem ser tributadas como rendimento.', pendencias: []
    });
    if (!acoes.length || a.semVantagemRelevante) acoes.unshift({
      titulo: 'Manter a estrutura atual', oque: 'Não alterar regime nem pró-labore neste momento.', porque: a.semVantagemRelevante ? 'A melhor alternativa encontrada economiza ' + M.brl(Math.max(0, a.economia)) + ' no ano, abaixo da materialidade de ' + M.brl(a.materialidade) + '. Os custos e riscos da mudança não se justificam.' : 'Nenhuma alternativa elegível reduz o custo total.',
      economia: 0, custoAdicional: 0, classificacao: confianca, quando: 'Reavaliar a cada trimestre ou quando a receita mudar mais de 10%.', documentos: '—', validacao: 'Revisar com o contador.', riscos: 'Mudanças de receita podem alterar a conclusão.', pendencias: pendencias(a)
    });
    return acoes;
  }

  function pendencias(a) {
    var p = [];
    a.qualidade.itens.forEach(function (i) { if (!i.ok) p.push(i.texto); });
    return p;
  }

  raiz.Otimizador = {
    executar: executar, grade: grade, otimizarRegime: otimizarRegime, otimizarPD: otimizarPD, otimizarMiope: otimizarMiope,
    limiteCaixaAcumulado: limiteCaixaAcumulado, planoUniforme: planoUniforme, nomeRegime: nomeRegime, sustentaFimHorizonte: sustentaFimHorizonte, criarAvaliador: criarAvaliador
  };
})(typeof window !== 'undefined' ? window : globalThis);
