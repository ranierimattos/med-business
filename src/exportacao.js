/*
 * EXPORTAÇÃO — CSV (separador ";" e vírgula decimal, compatível com planilhas
 * em português). Funções puras: recebem a análise e devolvem texto.
 */
(function (raiz) {
  'use strict';
  var M = raiz.MotorTributario;

  function num(v, casas) {
    if (v === null || v === undefined || v === '' || !isFinite(v)) return '';
    return Number(v).toFixed(casas === undefined ? 2 : casas).replace('.', ',');
  }
  function txt(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function linha(cols) { return cols.join(';'); }

  function mensal(res, nome) {
    var L = [];
    L.push(linha(['Cenário', 'Mês', 'Receita bruta', 'Base de cálculo', 'RBT12', 'FS12', 'Fator r (%)', 'Anexo', 'DAS', 'ISS fora do DAS', 'IRPJ', 'CSLL', 'PIS', 'Cofins', 'CBS', 'ISS', 'CPP patronal', 'Tributos PJ', 'Pró-labore', 'INSS sócio', 'IRRF', 'Folha de terceiros', 'FGTS', 'Despesas operacionais', 'Lucro contábil', 'Distribuição total', 'Dividendo do médico', 'Retenção 10% dividendos', 'Caixa antes da distribuição', 'Caixa final'].map(txt)));
    res.meses.forEach(function (m) {
      L.push(linha([txt(nome), txt(m.rotulo), num(m.rb), num(m.base), num(m.rbt12), num(m.fs12), num(m.fatorR * 100, 4), txt(m.anexo || ''), num(m.das), num(m.issFora), num(m.irpj), num(m.csll), num(m.pis), num(m.cofins), num(m.cbs), num(m.iss), num(m.cpp), num(m.tributosPJ), num(m.proLabore), num(m.inss), num(m.irrf), num(m.folhaTerceiros), num(m.fgts), num(m.despesasOperacionais), num(m.lucroContabil), num(m.distribuicao), num(m.dividendoMedico), num(m.retencaoDividendos), num(m.caixaAntesDistribuicao), num(m.caixaFinal)]));
    });
    return L;
  }

  function resumo(res) {
    var A = res.anual;
    return [
      ['Regime', raiz.Otimizador ? raiz.Otimizador.nomeRegime(res.regime) : res.regime],
      ['Receita bruta anual', A.rb], ['DAS', A.das], ['IRPJ', A.irpj], ['CSLL', A.csll], ['PIS', A.pis], ['Cofins', A.cofins], ['CBS', A.cbs],
      ['ISS (fora do DAS)', r(A.iss + A.issFora)], ['CPP patronal', A.cpp], ['Tributos da PJ', A.tributosPJ], ['INSS do sócio', A.inss],
      ['IRPF devido (ajuste anual)', A.irpfDevido], ['IRPFM adicional', A.irpfmAdicional], ['Carga tributária total', A.cargaTributaria],
      ['Custo administrativo incremental', A.custoAdm], ['Custo total da estratégia', A.custoTotal], ['Carga efetiva sobre a receita (%)', A.cargaEfetiva * 100],
      ['IRRF antecipado', A.irrf], ['Retenção sobre dividendos (antecipação)', A.retencaoDividendos], ['Saldo do ajuste anual (positivo = a pagar)', A.ajusteAnualTotal],
      ['Pró-labore anual', A.proLabore], ['Dividendos do médico', A.dividendoMedico], ['Renda líquida anual da PF', A.rendaLiquidaPF],
      ['Lucro contábil estimado', A.lucroContabil], ['Lucro retido', A.lucroRetido], ['Caixa final da PJ', A.caixaFinalPJ], ['Meses no Anexo III', A.mesesAnexoIII], ['Meses no Anexo V', A.mesesAnexoV]
    ];
  }
  function r(v) { return M.r2(v); }

  function csv(analise) {
    var L = [];
    var P = analise.parametros;
    L.push(txt('Simulador tributário — médicos PJ. Exportado em ' + new Date().toISOString().slice(0, 10) + '. Parâmetros ' + P.ano + ' (' + P.status + '). Estimativas sujeitas a validação profissional.'));
    L.push('');
    L.push(txt('RESUMO ANUAL'));
    L.push(linha(['Indicador', 'Cenário atual', 'Cenário recomendado', 'Diferença'].map(txt)));
    var ra = resumo(analise.atual), rr = resumo(analise.recomendado);
    ra.forEach(function (x, i) {
      var a = x[1], b = rr[i][1];
      if (typeof a === 'number') L.push(linha([txt(x[0]), num(a), num(b), num(b - a)]));
      else L.push(linha([txt(x[0]), txt(a), txt(b), '']));
    });
    L.push('');
    L.push(txt('CENÁRIOS COMPARATIVOS (valores anuais)'));
    L.push(linha(['Cenário', 'Regra', 'Regime', 'Pró-labore médio', 'DAS', 'INSS', 'IRPF', 'IRPFM', 'Outros tributos', 'Custo administrativo', 'Carga tributária', 'Custo total', 'Renda líquida PF', 'Diferença anual vs atual', 'Diferença mensal vs atual', 'Meses Anexo III', 'Caixa viável'].map(txt)));
    analise.cenarios.forEach(function (c) {
      L.push(linha([txt(c.nome), txt(c.regra), txt(c.regime), num(c.proLaboreMedio), num(c.das), num(c.inss), num(c.irpf), num(c.irpfm), num(c.outros), num(c.custoAdm), num(c.carga), num(c.custoTotal), num(c.rendaLiquida), num(c.difAnual), num(c.difMensal), num(c.mesesIII, 0), txt(c.viavel ? 'sim' : 'não')]));
    });
    L.push('');
    L.push(txt('PRÓ-LABORE MENSAL'));
    L.push(linha(['Mês'].concat(analise.atual.meses.map(function (m) { return m.rotulo; })).map(txt)));
    L.push(linha([txt('Atual')].concat(analise.atual.proLabore.map(function (v) { return num(v); }))));
    L.push(linha([txt('Recomendado')].concat(analise.recomendado.proLabore.map(function (v) { return num(v); }))));
    L.push('');
    L.push(txt('DETALHE MENSAL'));
    mensal(analise.atual, 'Atual').forEach(function (l) { L.push(l); });
    mensal(analise.recomendado, 'Recomendado').slice(1).forEach(function (l) { L.push(l); });
    L.push('');
    L.push(txt('CURVA DE OTIMIZAÇÃO (custo total anual por pró-labore mensal uniforme)'));
    L.push(linha(['Pró-labore mensal', 'Simples — regra real do fator r', 'Parcela PJ', 'Parcela PF', 'Simples — Anexo V forçado', 'Simples — Anexo III hipotético', 'Lucro Presumido', 'Lucro Real', 'Faixa mínima', 'Faixa máxima', 'Meses no Anexo III'].map(txt)));
    var cs = analise.regimes.simples.curva, cp = analise.regimes.presumido.curva, cr = analise.regimes.real.curva;
    cs.forEach(function (p, i) {
      L.push(linha([num(p.P), num(p.custo), num(p.pj), num(p.pf), num(analise.curvaV[i] ? analise.curvaV[i].custo : null), num(analise.curvaIII[i] ? analise.curvaIII[i].custo : null), num(cp[i] ? cp[i].custo : null), num(cr[i] ? cr[i].custo : null), num(analise.banda[i].min), num(analise.banda[i].max), num(p.mesesIII, 0)]));
    });
    L.push('');
    L.push(txt('PARÂMETROS LEGAIS'));
    L.push(linha([txt('Ano'), txt(P.ano)]));
    L.push(linha([txt('Status'), txt(P.status)]));
    L.push(linha([txt('Observação'), txt(P.resumoStatus)]));
    return '﻿' + L.join('\r\n') + '\r\n';
  }

  raiz.Exportacao = { csv: csv, numeroCsv: num };
})(typeof window !== 'undefined' ? window : globalThis);
