# Relatório comparativo — exemplo fictício

> **Dados fictícios.** A empresa "Clínica Demonstração Ltda.", a médica e todos os valores foram inventados para demonstrar o simulador. Gerado por `scripts/relatorio-exemplo.js` com o mesmo motor da aplicação (parâmetros legais de 2026, conferidos em fontes secundárias). Economia projetada, não garantida; validar com contador.

## Dados do exemplo

- Sociedade limitada aberta em mar/2023, uma sócia (100%), Simples Nacional, atividade médica (fator "r"), ISS de 5% no DAS.
- Receita 2026 (consultas, plantões e procedimentos): R$ 576.200,00, com sazonalidade (menor em jan, jul e dez). Receita 2025: R$ 528.000,00.
- Pró-labore atual de R$ 3.000/mês; uma secretária CLT (R$ 2.300); folha de 2025 ≈ 12% da receita (Anexo V).
- Despesas operacionais de R$ 125.250,00, compra de ultrassom de R$ 30.000 em fevereiro, empréstimo até agosto; caixa inicial R$ 35.000, reserva mínima R$ 10.000.
- Pessoa física: 2 dependentes, despesas médicas de R$ 18.000 e instrução de R$ 14.000 no ano; lucros acumulados de R$ 80.000 (R$ 60.000 apurados até 2025 com distribuição aprovada).

## A. Diagnóstico atual

- Regime: Simples Nacional, 12 meses no Anexo V (fator "r" entre 12,03% e 12,81%).
- DAS R$ 101.944,62 · INSS R$ 3.960,00 · IRPF devido R$ 0,00 · carga total R$ 105.904,62 (18,4% da receita).
- Renda líquida da médica: R$ 298.585,38 no ano. Qualidade dos dados: 100/100.

## B. Comparação de cenários (valores anuais, mesmas premissas)

| Cenário | Pró-labore médio | DAS | INSS | IRPF + IRPFM | Outros tributos | Custo adm. | Custo total | Renda líquida | Dif. mensal | Dif. anual | Meses Anexo III |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Cenário atual**<br>Plano de pró-labore informado, regime Simples Nacional | R$ 3.000,00 | R$ 101.944,62 | R$ 3.960,00 | R$ 0,00 | R$ 0,00 | R$ 0,00 | **R$ 105.904,62** | R$ 298.585,38 | — | — | 0/12 |
| **Pró-labore reduzido**<br>Mínimo da grade: R$ 1.621,00/mês | R$ 1.621,00 | R$ 101.944,62 | R$ 2.139,72 | R$ 0,00 | R$ 0,00 | R$ 0,00 | **R$ 104.084,34** | R$ 300.405,66 | −R$ 151,69 | −R$ 1.820,28 | 0/12 |
| **Pró-labore intermediário**<br>Menor valor uniforme com algum mês no Anexo III: R$ 11.371,00 | R$ 11.371,00 | R$ 98.857,49 | R$ 11.187,72 | R$ 14.403,49 | R$ 0,00 | R$ 0,00 | **R$ 124.448,70** | R$ 280.041,30 | R$ 1.545,34 | R$ 18.544,08 | 1/12 |
| **Pró-labore elevado**<br>150% do intermediário: R$ 17.121,00 | R$ 17.121,00 | R$ 83.166,26 | R$ 11.187,72 | R$ 33.378,49 | R$ 0,00 | R$ 0,00 | **R$ 127.732,47** | R$ 276.757,53 | R$ 1.818,99 | R$ 21.827,85 | 5/12 |
| **Cenário otimizado**<br>Melhor plano encontrado (mensal variável, Simples Nacional) | R$ 10.704,33 | R$ 76.491,63 | R$ 6.663,72 | R$ 13.447,59 | R$ 0,00 | R$ 0,00 | **R$ 96.602,94** | R$ 307.887,06 | −R$ 775,14 | −R$ 9.301,68 | 7/12 |
| **Melhor Lucro Presumido**<br>Pró-labore uniforme de R$ 1.621,00 | R$ 1.621,00 | R$ 0,00 | R$ 2.139,72 | R$ 0,00 | R$ 106.509,19 | R$ 3.000,00 | **R$ 111.648,91** | R$ 292.841,09 | R$ 478,69 | R$ 5.744,29 | — |
| **Melhor Lucro Real**<br>Pró-labore uniforme de R$ 6.371,00 | R$ 6.371,00 | R$ 0,00 | R$ 8.409,72 | R$ 0,00 | R$ 152.655,32 | R$ 14.400,00 | **R$ 175.465,04** | R$ 229.024,96 | R$ 5.796,70 | R$ 69.560,42 | — |

## C. Plano de pró-labore recomendado

| Mês | Pró-labore atual | Pró-labore sugerido | Fator "r" | Anexo | DAS | INSS | Caixa final |
|---|---:|---:|---:|---:|---:|---:|---:|
| jan/26 | R$ 3.000,00 | R$ 12.871,00 | 12,81% | V | R$ 6.697,50 | R$ 932,31 | R$ 39.454,96 |
| fev/26 | R$ 3.000,00 | R$ 21.621,00 | 14,65% | V | R$ 7.669,96 | R$ 932,31 | R$ 10.000,00 |
| mar/26 | R$ 3.000,00 | R$ 21.621,00 | 18,10% | V | R$ 8.820,43 | R$ 932,31 | R$ 10.000,00 |
| abr/26 | R$ 3.000,00 | R$ 21.621,00 | 21,45% | V | R$ 8.650,81 | R$ 932,31 | R$ 10.000,00 |
| mai/26 | R$ 3.000,00 | R$ 21.621,00 | 24,76% | V | R$ 9.046,20 | R$ 932,31 | R$ 10.000,00 |
| jun/26 | R$ 3.000,00 | R$ 19.371,00 | 28,01% | III | R$ 5.028,14 | R$ 932,31 | R$ 10.000,00 |
| jul/26 | R$ 3.000,00 | R$ 1.621,00 | 30,80% | III | R$ 4.216,90 | R$ 178,31 | R$ 10.000,00 |
| ago/26 | R$ 3.000,00 | R$ 1.621,00 | 30,41% | III | R$ 5.357,36 | R$ 178,31 | R$ 10.000,00 |
| set/26 | R$ 3.000,00 | R$ 1.621,00 | 29,91% | III | R$ 5.423,95 | R$ 178,31 | R$ 10.000,00 |
| out/26 | R$ 3.000,00 | R$ 1.621,00 | 29,45% | III | R$ 5.696,21 | R$ 178,31 | R$ 10.000,00 |
| nov/26 | R$ 3.000,00 | R$ 1.621,00 | 28,91% | III | R$ 5.506,70 | R$ 178,31 | R$ 10.000,00 |
| dez/26 | R$ 3.000,00 | R$ 1.621,00 | 28,40% | III | R$ 4.377,47 | R$ 178,31 | R$ 10.000,00 |

Plano mensal variável: pró-labore mais alto de janeiro a junho eleva a folha dos últimos 12 meses e leva junho a dezembro ao Anexo III; depois o pró-labore volta ao mínimo sem perder o anexo, porque a janela de 12 meses ainda contém os meses altos. A restrição de fim de horizonte garante fator "r" ≥ 28% também em janeiro do ano seguinte, e a restrição de caixa impede pagar pró-labore que a empresa não tem.

## D. Pontos de equilíbrio

- **Aumento uniforme de pró-labore:** nenhum valor uniforme acima do atual reduz o custo no ano.
- **Custo de atingir o fator "r" com pró-labore uniforme:** R$ 11.371,00/mês leva 1 mês ao Anexo III; DAS cai R$ 3.087,13, INSS + IRPF sobem R$ 23.451,49 (saldo −R$ 20.364,36).
- **Economia de DAS × custos adicionais no plano recomendado:** DAS R$ 25.452,99 menor; INSS + IRPF R$ 17.971,59 maiores; saldo R$ 7.481,40.
- **Otimizar mês a mês × ano inteiro:** míope R$ 104.084,34 contra R$ 96.602,94 (diferença R$ 7.481,40).
- **Lucro Presumido:** sem cruzamento entre R$ 230.480,00 e R$ 1.728.600,00 de receita anual.
- **Lucro Real:** sem cruzamento entre R$ 230.480,00 e R$ 1.728.600,00 de receita anual.

## E. Sensibilidade (plano recomendado mantido fixo)

| Variável | Variação 1 | Δ custo | Variação 2 | Δ custo |
|---|---:|---:|---:|---:|
| Outras rendas pessoais | atual | R$ 0,00 | +R$ 100 mil/ano | R$ 27.500,00 |
| Faturamento | −10% | −R$ 8.429,83 | +10% | R$ 24.431,11 |
| Número de empregados | −1 | R$ 22.414,64 | +1 (R$ 2.300,00) | R$ 0,00 |
| Regime tributário | recomendado | R$ 0,00 | melhor alternativa: Lucro Presumido | R$ 15.045,97 |
| Pró-labore | −10% | R$ 14.955,13 | +10% | R$ 3.609,99 |
| Crescimento anual | −5 p.p. | −R$ 2.044,99 | +5 p.p. | R$ 8.965,78 |
| Sazonalidade | metade | R$ 3.978,73 | +50% | −R$ 384,86 |
| Folha histórica (fator "r") | −10% | R$ 3.636,28 | +10% | R$ 0,00 |
| Tabelas legais | 2026 | R$ 0,00 | 2027 (projetado) | R$ 3.526,28 |
| Despesas operacionais | −10% | R$ 0,00 | +10% | R$ 0,00 |
| Custos contábeis/administrativos | −50% | R$ 0,00 | +50% | R$ 0,00 |
| Distribuição de lucros | política atual | R$ 0,00 | anual em dezembro | R$ 0,00 |

## F. Efeito no ano seguinte (2027, parâmetros projetado)

| Partindo de | Custo com pró-labore de dez mantido | Meses III | Melhor uniforme | Custo | Meses III |
|---|---:|---:|---:|---:|---:|
| Plano atual | R$ 106.415,58 | 0 | R$ 1.621,00 | R$ 104.595,30 | 0 |
| Plano recomendado | R$ 98.607,87 | 2 | R$ 1.621,00 | R$ 98.607,87 | 2 |

Leitura: a estratégia concentrada no início do ano cria um benefício que se esgota quando os meses altos saem da janela de 12 meses. Para manter o Anexo III de forma permanente, a folha anual precisa ficar perto de 28% da receita; com esta receita, isso custa mais em INSS e IRPF do que economiza em DAS, e o melhor pró-labore uniforme em 2027 deixa só 2 mês(es) no Anexo III. A análise deve ser refeita a cada ano.

## G. Recomendação final

**Melhor alternativa encontrada:** permanecer no Simples Nacional e adotar o plano mensal de pró-labore da seção C. Custo total projetado de R$ 96.602,94 contra R$ 105.904,62 no plano atual: **economia projetada de R$ 9.301,68 em 2026**, com renda líquida pessoal R$ 9.301,68 maior.

Pró-labore uniforme: ótimo global na grade de 81 valores entre R$ 1.621,00 e R$ 21.621,00 (passo R$ 250,00). Plano mensal variável: melhor solução encontrada por programação dinâmica e busca coordenada; é ótima no espaço discretizado sob a aproximação descrita (IRPF anual pelo total do ano e IRPFM de referência fixo), confirmada por simulação completa. Não há garantia de ótimo global fora da grade pesquisada. Regimes comparados com as mesmas receitas, despesas, período e premissas.

**Pontos que exigem validação profissional antes de agir:**

- Pró-labore variável deliberado em ata, efetivamente pago todo mês e transmitido no eSocial/DCTFWeb; o fator "r" só considera valores pagos.
- Composição da folha do fator "r" (pró-labore, salários, 13º, férias, FGTS) e a regra de caixa adotada pelo contador.
- Fator "r" entre 28% e 31% em vários meses: pequenas quedas de folha ou aumentos de receita devolvem o mês ao Anexo V.
- Conciliação: o DAS informado de janeiro diverge do calculado e há um DARF sem código de receita.
- Lucros apurados até 2025 tratados como isentos de retenção e fora do IRPFM (regra de transição da Lei 15.270/2025, sujeita a interpretação).
- Parâmetros legais conferidos apenas em fontes secundárias; conferir no Portal do Simples Nacional e no site da Receita Federal.

**Alertas emitidos pelo simulador:** Plano recomendado com fator "r" pouco acima de 28%; DARF sem código de receita; Divergência entre tributos informados e calculados.
