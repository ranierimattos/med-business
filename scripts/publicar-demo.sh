#!/usr/bin/env bash
# Publica a versão de teste no repositório público ranierimattos/simulador-tributario-medico-pj.
# Gera o arquivo único e copia para um clone desse repositório o index.html,
# o README e o workflow do GitHub Pages (de demo/); depois faz commit e push na main.
#   scripts/publicar-demo.sh ../simulador-tributario-medico-pj
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
destino="${1:?Informe o caminho de um clone de ranierimattos/simulador-tributario-medico-pj}"
[ -d "$destino/.git" ] || { echo "Não é um clone git: $destino" >&2; exit 1; }

node "$raiz/scripts/build.js"
mkdir -p "$destino/.github/workflows"
cp "$raiz/dist/simulador-tributario-medico-pj.html" "$destino/index.html"
cp "$raiz/demo/README.md" "$destino/README.md"
cp "$raiz/demo/publicar.yml" "$destino/.github/workflows/publicar.yml"

versao="$(git -C "$raiz" rev-parse --short HEAD)"
[ -z "$(git -C "$raiz" status --porcelain)" ] || versao="$versao com alterações locais"

cd "$destino"
git add index.html README.md .github/workflows/publicar.yml
if git diff --cached --quiet; then
  echo "Nada mudou desde a última publicação."
  exit 0
fi
git commit -q -m "Atualiza a versão de teste ($versao)"
git push origin HEAD:main
echo "Publicado. O GitHub Pages atualiza em cerca de um minuto."
