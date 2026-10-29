# HANDOFF — Simulador Tributário Médico PJ

Documento de passagem para continuar o trabalho em uma nova sessão. Atualizado em 26/10/2026 (relatório para PDF).

## 1. Objetivo do trabalho

Aplicação web em **um único arquivo HTML**, offline e em português, para planejamento financeiro e otimização tributária de médicos que atuam por pessoa jurídica no Brasil. Ela compara Simples Nacional (com a regra real do fator "r"), Lucro Presumido e Lucro Real e procura o plano de pró-labore e distribuição de lucros com o **menor custo total em 12 meses**: tributos da PJ + INSS + IRPF + IRPFM + custos administrativos incrementais.

O pedido original foi um "prompt mestre" extenso, com 24 seções (cadastro, receitas, despesas, tributos, folha, fator "r", Simples, comparação de regimes, IRPF, dividendos, otimização, sensibilidade, interface, relatório, testes, privacidade, fontes, alertas e entrega). Esta primeira versão cobre todas as seções.

**Fase atual:** **personalização da marca** (issue #5) implementada na branch `ccr-9bf84731-bxdfac`, **aguardando a aprovação do usuário** na página de teste. Aprovado: abrir PR para `main` com "Closes #5". O redesenho da interface (PR #3) e o relatório para PDF (PR #4) já estão em `main`.

## 2. Estado atual

- Repositório: `ranierimattos/med-business` (privado). Branch padrão: `main`.
- PRs #1 (simulador completo), #3 (redesenho da interface) e #4 (relatório para PDF, branch `report-design`) **mescladas** em `main`. A PR #2 foi uma mesclagem de `main` de volta para a branch antiga, sem alterar arquivos.
- Branch `ccr-9bf84731-bxdfac` recomeçada a partir de `main` (8275112) para a issue #5. **Sem PR aberta**: depende da aprovação do usuário.
- A versão de teste no GitHub Pages e a página hospedada da `main` foram republicadas com o relatório para PDF (main 8275112).
- Testes: `node --test tests/motor.test.js` → 41/41; `node --test tests/ui.test.js` → 1/1 (Playwright + Chromium; inclui as verificações de impressão e do PDF).
- Links:
  - PR #1: https://github.com/ranierimattos/med-business/pull/1
  - App publicado como página privada (variante de hospedagem, `dist/artefato/`): https://claude.ai/artifact/7k7yCKQSfmWBm7yKNfbW7d
  - Canvas da nova interface (**aprovado**): https://claude.ai/artifact/9DN79EAVXX75UdHQKYpjEE
  - PR #3: https://github.com/ranierimattos/med-business/pull/3
  - Issue #5 (personalização da marca): https://github.com/ranierimattos/med-business/issues/5
  - Página de teste das branches (variante hospedada, separada da página da `main`): https://claude.ai/artifact/9MAuYJ4tMNVnrskWAgwjm2. Hoje mostra a branch `claude/stoic-fermat-zazd6u` (exemplos de neurologia e anestesia). Para atualizar, publicar de novo o `dist/artefato/` da branch com o título "Simulador PJ (teste)". A impressão não funciona em páginas hospedadas; o PDF se testa no arquivo offline.
  - Versão de teste pública (GitHub Pages), publicada a partir de `main` com `scripts/publicar-demo.sh`: https://ranierimattos.github.io/simulador-medico-pj/ (repositório `ranierimattos/simulador-medico-pj`). O usuário pediu para **não** publicar a branch `report-design` lá.

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

**Redesenho da interface (implementado nesta sessão)**
- `src/template.html`: topo com Resultado | Dados, **Gerar relatório**, menu **Arquivo** (salvar, carregar, backup, importar, CSV, imprimir, tabelas legais, início rápido, exemplo, limpar) e engrenagem das **Tabelas legais** (painel lateral); no celular, barra inferior Resultado · Dados · Relatório e menu ⋮.
- `src/ui.js` reescrito:
  - navegação por endereço (`#resultado/cenarios`, `#dados/3`, `#relatorio`), com Voltar do navegador;
  - **Resultado**: herói com recomendação gerada a partir da análise e economia; 4 indicadores com comparação ao atual (chave "Comparar com o plano atual"); custo × pró-labore; fator "r" com faixa de anexos; tributos por mês; pró-labore × lucros; plano mês a mês; alertas com link para a etapa/campo de origem (`ORIGEM_ALERTA`). Sub-seções Cenários (tabela ordenada, curvas detalhadas com faixa de incerteza e PJ/PF, cenários de receita, regimes, caixa, cenários salvos), Sensibilidade (tornado, cartões de equilíbrio, ano seguinte) e Memória de cálculo (competência e plano selecionáveis);
  - **Dados**: 5 etapas (Empresa · Receitas · Folha e custos · Sócio e lucros · Pagamentos), status por etapa a partir dos alertas, modo **Essencial/Completo** (`soC()` marca o que só aparece no Completo e conta os campos escondidos), despesas em lista compacta expansível, painel **Efeito no resultado** (economia, diferença da última alteração, fator "r", qualidade, dica da etapa);
  - **recálculo automático**: `agendarAnalise()` com espera de 1,2 s nos Dados (150 ms nos controles do Resultado); topo mostra "Resultado desatualizado"/"Recalculando…"; o formulário não é redesenhado durante o cálculo;
  - **Início rápido**: 4 perguntas com prévia ao vivo (simulação do plano atual + otimizador rápido), aberto na primeira visita e pelo menu Arquivo.
- `src/estilos.css`: componentes novos com os mesmos tokens claro/escuro; o CSS do menu saiu de `scripts/build.js`.
- `src/motor.js`: só cinco textos de alerta que citavam abas antigas (nenhuma regra mudou).
- `tests/ui.test.js` reescrito; `scripts/capturas.js` gera também `docs/dados-etapas.png`; README (seção "Como usar" e testes) atualizado.

**Relatório para PDF (branch `report-design`, aguardando aprovação)**
- Motivo: o PDF gerado pelo botão Imprimir cortava a tabela de comparação e o texto das limitações na margem direita (a tabela de 13 colunas alargava a página), deixava um título sozinho no fim da página e não tinha número de página.
- `RENDER_AREA.relatorio` em `src/ui.js` monta 3 `.folha`; cada uma começa uma página na impressão:
  1. **Resumo executivo** (cabe em 1 página): cabeçalho com empresa, ano, data, status dos parâmetros e selo de dados fictícios; economia projetada e recomendação; tabela Atual × Recomendado × Diferença; gráfico de tributos por mês (atual × recomendado); próximos passos.
  2. **Plano mês a mês** (valores sem "R$" para caber em 180 mm) e gráfico do fator "r" com a linha de 28%.
  3. **Cenários comparados** (9 colunas), **plano de ação** em cartões (economia, custo adicional, quando faz efeito; nota de que o custo adicional já está descontado) e **premissas e pontos de revisão** (alertas, dados ausentes, premissas).
- `src/estilos.css`: `@page` A4 (margens 16/15/17 mm); na impressão, tokens claros mesmo no tema escuro, `print-color-adjust: exact`, fluxo em bloco (o `break-after: avoid` não funciona bem dentro de grid) e quebras controladas. A regra de impressão esconde `#conteudo > .area`: a antiga `.area` também escondia a chave colorida das legendas (`.chave.area`).
- Cabeçalho e rodapé de cada página (empresa, data, aviso, "Página X de Y") vêm de margin boxes do `@page`, injetados em `<style id="estilo-pagina">` por `atualizarEstiloPagina()`. A 1ª página não repete o cabeçalho. Chrome 131+ suporta margin boxes; Firefox ignora.
- `beforeprint`/`afterprint`: Ctrl+P em qualquer área monta o relatório fora da tela e troca `document.title` para "Relatório tributário <ano> - <empresa>" (nome sugerido do PDF). O botão Imprimir não navega mais para o relatório.
- Nenhum cálculo mudou; o relatório usa os mesmos campos da análise (`atual`, `recomendado`, `cenarios`, `planoAcao`, `alertas`, `qualidade`).

**Personalização da marca (issue #5, branch `ccr-9bf84731-bxdfac`, aguardando aprovação)**
- Pedido do usuário: campos para a marca do médico ou da clínica; envio de logotipo, com o símbolo da medicina quando vazio; logo, nome, endereço e telefone nas telas e no relatório; tirar os avisos de "exemplo fictício"; incluir a marca "ML Soluções" e o rodapé "Desenvolvido por Mattos-Lage Soluções Agênticas - Nexus 2, powered by Claude Opus." (texto pedido pelo usuário, usado como está).
- `src/ui.js`: painel **Marca e contato** na mesma gaveta das Tabelas legais (`abrirGaveta('marca')`), aberto pelo menu Arquivo, pelo logotipo do topo e por um link em Dados › Identificação. Campos: nome, registro profissional, endereço, telefone, e-mail, site e logotipo.
- A marca fica em `localStorage` próprio (`simulador-tributario-medico-pj:marca:v1`), fora do estado da simulação: "Limpar dados" e o exemplo não a apagam; o backup (.json) leva a marca no campo `marca`, e a importação a restaura. `normalizarMarca` só aceita logotipo `data:image/(png|jpeg|webp|svg+xml)`.
- Logotipo: lido com FileReader; imagens com lado maior que 480 px (ou acima de ~300 KB) são reduzidas num canvas. Sem logotipo, `iconeMedicina()` desenha o bastão de Asclépio em SVG (máscaras com id único por ícone para a cobra passar à frente e por trás do bastão).
- Onde aparece: topo (logotipo ou ícone + nome; com nome, "Simulador Tributário Médico PJ" vai para a linha de status), rodapé (logotipo, nome e contato), timbre do relatório (logotipo, nome, contato em até duas linhas, ano e data), cabeçalho das páginas 2+ do PDF (marca e empresa) e crédito no fim do relatório e do rodapé.
- Sem avisos de exemplo: o selo "Exemplo fictício" do topo e do relatório, o "dados fictícios" do cabeçalho das páginas e os rótulos do menu e do início rápido saíram; o exemplo se chama "Clínica Demonstração Ltda." e a sócia "Dra. Exemplo". `estado.meta.exemplo` continua existindo para a lógica interna. Os documentos do repositório (`docs/RELATORIO-EXEMPLO.md`) ainda dizem que os dados são inventados.
- Folha 1 do PDF: com timbre, o gráfico de tributos ficou com 130 px e os próximos passos passam a 2 colunas quando há mais de 2; medido com nome e endereço longos, sobram pelo menos 44 px.

**Exemplos novos (branch `claude/stoic-fermat-zazd6u`)**
- `src/exemplo.js` agora tem três exemplos em `DadosExemplo.lista` (`id`, `titulo`, `resumo`); `DadosExemplo.criar(id)` cria o estado (sem `id`, a Clínica Demonstração) e grava `meta.exemploId`.
  - `neurologia`: Clínica Sinapse Neurologia Ltda., Ijuí (RS), Dr. Henrique Valentini. Consulta particular R$ 600, só Unimed além do particular, eletroencefalograma, pareceres no hospital (Unimed) e SUS voluntário sem receita. Simples, pró-labore R$ 8.000 → economia de R$ 43.927,46 (Anexo V → III).
  - `anestesia`: Morfeu Anestesiologia Ltda., Porto Alegre (RS), Dra. Helena Albuquerque. Lucro Presumido, sem funcionários, pró-labore R$ 8.000, vínculo CLT no teto do INSS → reduzir o pró-labore; economia de R$ 36.360,30.
- Interface: **Arquivo › Carregar exemplo…** abre uma janela com os três exemplos; o Início rápido traz um link por exemplo (`data-exemplo`, tratado em `aoClicar` por `abrirExemplo`).

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
| Redesenho (canvas aprovado): 3 áreas (Resultado, Dados, Tabelas legais) + menu Arquivo; Dados em 5 etapas com modo Essencial/Completo e painel "Efeito no resultado" | 11 abas no mesmo nível misturavam resposta, cadastro e referência. A proposta mantém a identidade visual atual para facilitar a migração. |
| Sócios na etapa 4 (Sócio e lucros), modo Completo | O canvas punha o perfil inteiro na etapa 1, mas sócios e participação só afetam a distribuição de lucros. |
| Recálculo automático no navegador, sem Web Worker | A análise completa leva cerca de 1 s; um worker exigiria afrouxar a CSP (`worker-src blob:`) e copiar a análise entre threads. O cálculo só roda depois de 1,2 s sem edição. |
| Fonte do sistema em vez da IBM Plex Sans do canvas | O arquivo único funciona offline e a CSP bloqueia fontes externas. |
| Gráficos do Resumo simplificados; versão com faixa de incerteza, parcelas PJ/PF e unidade anual/mensal em Cenários | O Resumo segue o canvas; as opções avançadas continuam disponíveis. |

## 5. Arquivos envolvidos

```
src/parametros.js      parâmetros legais por ano (+ fontes, códigos de receita, tratamentos)
src/motor.js           motor tributário (estadoVazio, prepararContexto, simular, IRPF, IRPFM, DAS, LP, LR, alertas...)
src/otimizador.js      executar(estado) → análise completa
src/exportacao.js      CSV
src/exemplo.js         dados de demonstração (Clínica Demonstração Ltda.)
src/graficos.js        gráficos SVG (linhas, barras, tornado)
src/ui.js              interface: Resultado, Dados (5 etapas), Relatório (folhas A4), Tabelas legais, Início rápido
src/estilos.css        estilos (tokens claro/escuro, impressão)
src/template.html      esqueleto HTML
scripts/build.js       gera dist/
scripts/relatorio-exemplo.js, scripts/capturas.js (imagens e docs/relatorio-exemplo.pdf)
scripts/publicar-demo.sh  publica dist/ no repositório público de teste (index.html + demo/)
demo/                  README e workflow do GitHub Pages do repositório público de teste
tests/motor.test.js    41 testes do motor/otimizador
tests/ui.test.js       teste de interface da nova navegação (Playwright)
dist/                  arquivos gerados (versionados)
docs/                  relatório do exemplo (.md e .pdf), CSV, imagens (painel-geral, grafico-otimizacao, dados-etapas)
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

1. **Parâmetros legais não conferidos em fonte oficial.** Conferir no Planalto, na Receita Federal e no Portal do Simples quando houver acesso:
   - tabela anual do IRPF 2026 (parcelas 4.729,91 / 8.105,85 / 10.904,66);
   - Anexo V e repartições;
   - regra do fator "r" no mês de início (Res. CGSN 140, art. 26, § 6º);
   - vigência da Res. CGSN 190/2026;
   - exclusão dos lucros de transição da base do IRPFM;
   - LC 224/2025 (questionada na ADI 7936).
2. **2027 é projeção:** IRPF, teto do INSS, salário mínimo e alíquota da CBS ainda não publicados.
3. **Modelagem simplificada:** IRPFM (redutor do art. 16-B), excesso de sublimite e exclusão do Simples (só alertados), créditos de PIS/Cofins no Lucro Real, uma única pessoa física modelada.
4. **Página hospedada (7k7yCK…):** republicada com o redesenho a partir de `dist/artefato/`. O aviso de "download" da publicação vem da função de download presente no código, mas não usada no modo de hospedagem.
5. **Pequenas diferenças em relação ao canvas:** fonte do sistema; "Comparar com o plano atual" também afeta o fator "r", os tributos por mês e o caixa; a tabela "Plano mês a mês" ganhou a coluna Caixa final; o herói e os textos são gerados a partir da análise (no exemplo, os mesmos do canvas).

## 7. Próximos passos

1. Receber o parecer do usuário sobre a marca na página de teste. Aprovado: abrir PR de `ccr-9bf84731-bxdfac` para `main` com "Closes #5". Não aprovado: ajustar na mesma branch.
2. Depois de mesclar em `main`, republicar a versão de teste pública (`scripts/publicar-demo.sh <clone do simulador-medico-pj>`) e a página hospedada da `main`, só quando o usuário pedir.
3. Conferir os parâmetros legais em fonte oficial quando houver acesso (seção 6, item 1).
4. Ideias não feitas: navegação por setas entre as sub-seções (hoje só Tab); barra fixa com a economia no celular enquanto se edita os Dados; recálculo em Web Worker se a análise ficar mais lenta.

## 8. Convenções

- Interface, textos, comentários e documentação em português do Brasil.
- Commits terminam com as linhas de atribuição indicadas pela sessão; não incluir identificador de modelo em commits, PRs ou código.
- Commit e push na branch de trabalho ao concluir uma entrega; PR só quando pedido. Experimentos de layout ficam numa branch própria (ex.: `report-design`) até o usuário aprovar.
- O usuário clonou o repositório no computador e usa a branch `main`.
