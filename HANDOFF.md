# HANDOFF — Simulador Tributário Médico PJ

Documento de passagem para continuar o trabalho em uma nova sessão. Atualizado em 26/10/2026.

## 1. Objetivo do trabalho

Aplicação web em **um único arquivo HTML**, offline e em português, para planejamento financeiro e otimização tributária de médicos que atuam por pessoa jurídica no Brasil. Ela compara Simples Nacional (com a regra real do fator "r"), Lucro Presumido e Lucro Real e procura o plano de pró-labore e distribuição de lucros com o **menor custo total em 12 meses**: tributos da PJ + INSS + IRPF + IRPFM + custos administrativos incrementais.

O pedido original foi um "prompt mestre" extenso, com 24 seções (cadastro, receitas, despesas, tributos, folha, fator "r", Simples, comparação de regimes, IRPF, dividendos, otimização, sensibilidade, interface, relatório, testes, privacidade, fontes, alertas e entrega). Esta primeira versão cobre todas as seções.

**Fase atual:** redesenho da interface. As 11 abas passam a 3 áreas, separando painel de formulário. A proposta está em um canvas de design aguardando o parecer do usuário (seção 6).

## 2. Estado atual

- Repositório: `ranierimattos/med-business` (privado). Branch padrão: `main`.
- PR #1 (o simulador completo) **mesclada** em `main`. A PR #2 foi uma mesclagem de `main` de volta para a branch antiga, sem alterar arquivos. A branch antiga foi apagada pelo usuário.
- Branch de trabalho desta sessão: `ccr-9bf84731-bxdfac`, recriada a partir de `main` só para este arquivo. Nada mais pendente nela.
- Testes: `node --test tests/motor.test.js` → 41/41; `node --test tests/ui.test.js` → 1/1 (Playwright + Chromium).
- Links:
  - PR #1: https://github.com/ranierimattos/med-business/pull/1
  - App publicado como página privada (versão de hospedagem, gerada antes dos últimos ajustes de layout): https://claude.ai/artifact/7k7yCKQSfmWBm7yKNfbW7d
  - **Canvas da nova interface (aguardando parecer):** https://claude.ai/artifact/9DN79EAVXX75UdHQKYpjEE

## 3. O que já foi feito

**Motor e parâmetros**
- `src/parametros.js`: parâmetros legais de 2025, 2026 (padrão) e 2027 (projetado), com fonte, URL, data de consulta e status de validação. É o único lugar com alíquotas, faixas e limites.
- `src/motor.js`, funções puras:
  - RBT12/FS12 com início de atividade: Res. CGSN 140 até 2026; Res. CGSN 190 a partir de 2027, com defasagem de 1 mês e fator "r" = 0,28 nos 2 primeiros meses;
  - DAS por atividade, com repartição por tributo, teto de 5% de ISS e sublimite;
  - Lucro Presumido trimestral, com equiparação hospitalar só com requisitos confirmados, LC 224/2025 e CPP;
  - Lucro Real estimado, com compensação de prejuízo de 30% e créditos de PIS/Cofins;
  - INSS com teto e outras fontes;
  - IRRF e IRPF anual com a redução da Lei 15.270/2025;
  - IRPFM com redutor simplificado;
  - retenção de 10% sobre dividendos acima de R$ 50 mil/mês e regra de transição dos lucros apurados até 2025;
  - lucro distribuível com e sem escrituração;
  - fluxo de caixa em duas passagens;
  - elegibilidade, alertas, conciliação de pagamentos e nota de qualidade dos dados.

**Otimizador (`src/otimizador.js`)**
- Busca exaustiva com pró-labore uniforme.
- Programação dinâmica sobre o pró-labore acumulado, com restrição de caixa e regra de fim de horizonte.
- Busca coordenada mês a mês.
- Otimização míope, cenários do relatório, sensibilidade, pontos de equilíbrio, cenários de receita, efeito no ano seguinte e plano de ação.

**Interface e entrega**
- `src/ui.js`, `src/graficos.js` (SVG sem bibliotecas), `src/estilos.css` e `src/template.html`.
- `scripts/build.js` gera `dist/simulador-tributario-medico-pj.html` (arquivo único, com CSP que bloqueia rede) e `dist/artefato/...` (variante para hospedagem: sem imprimir nem baixar, copia para a área de transferência).
- `README.md` (uso, fórmulas, parâmetros, limitações, testes), `docs/RELATORIO-EXEMPLO.md`, `docs/exemplo-resultados.csv` e imagens em `docs/`.

**Resultado do exemplo fictício:** Simples, com pró-labore concentrado em jan–jun (R$ 12.871 a R$ 21.621) e mínimo depois. Junho a dezembro passam ao Anexo III, com economia projetada de **R$ 9.301,68/ano** (R$ 96.602,94 contra R$ 105.904,62).

## 4. Decisões tomadas e por quê

| Decisão | Motivo |
|---|---|
| Código-fonte modular em `src/`, montado num único HTML por `scripts/build.js` | Atende "arquivo único" e "separar interface do motor". Os testes carregam os mesmos módulos em Node. |
| Parâmetros só em `src/parametros.js`, com status (`conferido_secundaria`, `transcrito`, `interpretacao`, `projetado`) | Exigência de não espalhar valores e de não afirmar atualização sem fonte oficial. Os sites .gov.br estavam bloqueados pela rede do ambiente, então tudo foi conferido em fontes secundárias. |
| Horizonte = ano-calendário, com "planejar a partir do mês X" (meses anteriores ficam como realizados) | Alinha com o IRPF anual, o IRPFM e as regras do Simples por competência. |
| Linha do tempo de 25 meses (dez/ano−2 a dez/ano) | A RBT12/FS12 de 2027 olha um mês mais para trás. |
| Carga = tributos PJ + INSS + IRPF devido + IRPFM; IRRF e retenção de dividendos são antecipações | Evita dupla contagem; restituição não é economia. |
| Viabilidade de caixa medida antes das distribuições discricionárias; distribuição automática reserva as saídas comprometidas do resto do ano | Sem isso, planos com pró-labore mais alto pareciam inviáveis só porque a distribuição esvaziava o caixa. |
| Programação dinâmica com estado = pró-labore acumulado | O fator "r" de cada mês depende da folha dos meses anteriores. O DAS de um mês é cobrado quando a folha que o define já é conhecida. |
| Regra de fim de horizonte ("sustentar"): se dezembro está no Anexo III, janeiro seguinte também precisa estar | Evita recomendar derrubar o pró-labore no fim do ano só porque o efeito cai fora do horizonte. |
| Materialidade (padrão R$ 1.200/ano) e plano atual como candidato | Nunca recomendar algo mais caro que manter a estrutura; abaixo da materialidade, "manter a estrutura atual". |
| Sensibilidade com o plano recomendado fixo | A reotimização uniforme escondia o impacto das variáveis que importam para o plano mensal. |
| Despesas não são variáveis de decisão | Cortar despesa não reduz tributo no Simples/Presumido e aumenta no Real. O efeito é mostrado separado (financeiro × tributário). |
| Resultados exibidos sempre de `MotorTributario.simular()` | Exigência de que gráfico e relatório usem exatamente os números do motor (coberto por teste de interface). |
| Interface: fontes do sistema, sem rede, tokens de cor com tema claro/escuro, gráficos com um único eixo cada | Funciona offline; regras de acessibilidade e de visualização de dados. |
| Redesenho (canvas): 3 áreas (Resultado, Dados, Tabelas legais) + menu Arquivo; Dados em 5 etapas com modo Essencial/Completo e painel "Efeito no resultado" | 11 abas no mesmo nível misturavam resposta, cadastro e referência. A proposta mantém a identidade visual atual para facilitar a migração. |

## 5. Arquivos envolvidos

```
src/parametros.js      parâmetros legais por ano (+ fontes, códigos de receita, tratamentos)
src/motor.js           motor tributário (estadoVazio, prepararContexto, simular, IRPF, IRPFM, DAS, LP, LR, alertas...)
src/otimizador.js      executar(estado) → análise completa
src/exportacao.js      CSV
src/exemplo.js         dados fictícios de demonstração
src/graficos.js        gráficos SVG (linhas, barras, tornado)
src/ui.js              interface (11 abas hoje; alvo do redesenho)
src/estilos.css        estilos (tokens claro/escuro, impressão)
src/template.html      esqueleto HTML
scripts/build.js       gera dist/
scripts/relatorio-exemplo.js, scripts/capturas.js
tests/motor.test.js    41 testes do motor/otimizador
tests/ui.test.js       teste de interface (Playwright)
dist/                  arquivos gerados (versionados)
docs/                  relatório do exemplo, CSV, imagens
```

Comandos:

```
node scripts/build.js
node --test tests/motor.test.js
node --test tests/ui.test.js
node scripts/relatorio-exemplo.js && node scripts/capturas.js
```

Canvas de design (lido com a ferramenta Artifact, ação `read`, no link da seção 2): `project/canvas.json`, `Main.dc.html` (mapa da navegação), `Resultado.dc.html` (painel interativo), `Resultado-celular.dc.html`, `Dados.dc.html` (etapas interativas) e `Inicio-rapido.dc.html`.

## 6. Problemas em aberto

1. **Parecer do usuário sobre o canvas da nova interface:** pendente. Ele estava revisando as telas.
2. **Parâmetros legais não conferidos em fonte oficial.** Conferir no Planalto, na Receita Federal e no Portal do Simples quando houver acesso:
   - tabela anual do IRPF 2026 (parcelas 4.729,91 / 8.105,85 / 10.904,66);
   - Anexo V e repartições;
   - regra do fator "r" no mês de início (Res. CGSN 140, art. 26, § 6º);
   - vigência da Res. CGSN 190/2026;
   - exclusão dos lucros de transição da base do IRPFM;
   - LC 224/2025 (questionada na ADI 7936).
3. **2027 é projeção:** IRPF, teto do INSS, salário mínimo e alíquota da CBS ainda não publicados.
4. **Modelagem simplificada:** IRPFM (redutor do art. 16-B), excesso de sublimite e exclusão do Simples (só alertados), créditos de PIS/Cofins no Lucro Real, uma única pessoa física modelada.
5. **App publicado como página (7k7yCK…) desatualizado:** gerado antes dos últimos ajustes de layout. Republicar a partir de `dist/artefato/` depois do redesenho. O aviso de "download" nessa publicação vem da função de download presente no código, mas não usada no modo de hospedagem.
6. **Formato do canvas:** os laços (`sc-for`/`sc-if`) foram tirados de dentro de `<table>`, que virou grade de `div`, para evitar que o navegador reposicione os elementos. Uma tabela estática simples permaneceu na aba Cenários do `Resultado.dc.html`.

## 7. Próximos passos

1. Receber o parecer do usuário e ajustar o canvas, se pedido.
2. Implementar o redesenho no app real, sem mexer no motor:
   - **Navegação:** Resultado | Dados + engrenagem (Tabelas legais) + menu Arquivo; "Gerar relatório" como botão.
   - **Resultado:** hero com recomendação e economia; 4 indicadores com comparação ao atual; gráfico de custo × pró-labore; fator "r" com faixa de anexos; tributos por mês; pró-labore × lucros; plano mês a mês; alertas com link para a etapa de origem. Sub-seções: Resumo, Cenários, Sensibilidade, Memória de cálculo.
   - **Dados:** 5 etapas (Empresa · Receitas · Folha e custos · Sócio e lucros · Pagamentos), modo Essencial/Completo (marcar campos essenciais) e painel lateral "Efeito no resultado".
   - **Recálculo:** análise automática com debounce (hoje cerca de 0,5–1 s) ou indicador de "desatualizada".
   - **Início rápido:** 4 perguntas para quem abre pela primeira vez.
3. Atualizar `tests/ui.test.js` para os novos seletores. Manter a verificação de que gráfico e relatório = motor, de que não há rede e de que não há rolagem horizontal a 390 px.
4. Regerar `dist/`, `docs/`, README (seção "Como usar") e capturas; republicar a página hospedada.
5. Abrir PR para `main` só quando o usuário pedir.

## 8. Convenções

- Interface, textos, comentários e documentação em português do Brasil.
- Commits terminam com as linhas de atribuição indicadas pela sessão; não incluir identificador de modelo em commits, PRs ou código.
- Fazer commit e push só quando pedido; PR só quando pedido.
- O usuário clonou o repositório no computador e usa a branch `main`.
