# Simulador Tributário Médico PJ — versão de teste

Página publicada: https://ranierimattos.github.io/simulador-medico-pj/

Versão de teste, em um único arquivo HTML (`index.html`), do simulador de planejamento tributário para médicos que atuam por pessoa jurídica: Simples Nacional com a regra do fator "r", Lucro Presumido, Lucro Real, pró-labore, IRPF e distribuição de lucros.

- Todos os cálculos rodam no navegador. Nada é enviado a servidores: os dados ficam no armazenamento local do navegador de quem usa.
- A página abre com um exemplo fictício. Os parâmetros legais foram conferidos apenas em fontes secundárias.
- Ferramenta de apoio à decisão: não substitui o contador.

## Como a página é publicada

O workflow `.github/workflows/publicar.yml` publica o `index.html` no GitHub Pages a cada push na branch `main`, ou manualmente em Actions → Publicar no GitHub Pages → Run workflow. Ele exige Settings → Pages → Source: GitHub Actions.

O `index.html` é gerado no repositório de desenvolvimento e copiado para cá pelo script `scripts/publicar-demo.sh` de lá.
