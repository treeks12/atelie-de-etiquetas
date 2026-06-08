# Atelie de Etiquetas

Aplicativo local e moderno para estudar, importar e recriar etiquetas de roupa do legado Paulimaq/MasterPrint.

## Como abrir

Abra `index.html` no navegador.

## Como usar com a pasta real

1. Clique em `Pasta`.
2. Selecione `C:\Program Files (x86)\paulimaq\ARQUIVOS`.
3. O app carrega arquivos `.ETQ` e associa imagens `.png` com nomes iguais ou `resized_`.

## O que esta versao ja faz

- Lista um catalogo inicial com os 58 `.ETQ` encontrados em `ARQUIVOS`.
- Prioriza etiquetas de roupa, especialmente `LNT-2 (25 x 55 mm)`.
- Le arquivos `.ETQ/.ETM` no formato `WDDESIGNVCM4`.
- Extrai metadados, textos, blocos RTF e offsets de JPEG/WMF.
- Detecta presets visuais de modelo, incluindo `LNT-2` e `LNT-4`.
- Monta uma etiqueta moderna editavel com tecido, composicao, observacoes e simbolos de cuidado.
- Compara PNG legado carregado com a etiqueta moderna gerada.
- Monta folhas A4 paginadas com copias, colunas, margem, espacamento e orientacao.
- Importa lote CSV/TSV com `tecido`, `composicao`, `observacoes`, `largura`, `altura` e `copias`.
- Usa o lote importado para montar uma folha com etiquetas diferentes na mesma pagina.
- Salva e carrega projeto em JSON com editor, folha e lote.
- Imprime a etiqueta atual.
- Exporta a etiqueta atual ou a folha atual em SVG.

## Lote CSV/TSV

Use um arquivo com cabecalho. Exemplo:

```csv
tecido;modelo;composicao;observacoes;largura;altura;copias
Moletom;LNT-2;50% ALGODAO|50% POLIESTER;Industria Brasileira;25;55;3
Linho;LNT-4;70% VISCOSE|30% LINHO;Lote piloto;;;2
```

Quando houver lote carregado, a aba `Folha` usa as quantidades de cada linha. Sem lote, ela usa `Copias` da etiqueta atual. Se a quantidade passar da capacidade de uma A4, o app cria paginas adicionais e a impressao respeita a quebra de pagina. A coluna `modelo` aceita nomes como `LNT-2` e `LNT-4` e aplica as medidas conhecidas quando largura/altura ficam vazias.

## Verificacoes salvas

- `parser-smoke-result.txt`: leitura real de `Viscolycra UNICA.ETQ`.
- `sheet-smoke-result.txt`: calculo de grade A4 paginada para etiquetas `25 x 55 mm`.
- `batch-smoke-result.txt`: importacao de lote e geracao de 21 etiquetas em 2 paginas.
- `preset-smoke-result.txt`: deteccao de `LNT-4`, dimensoes `33 x 69,9` e layout alto.
- `screenshot-sheet-paginated.png`: evidencia visual de uma folha A4 paginada.
- `screenshot-preset-lnt4.png`: evidencia visual do preset `LNT-4`.

## Limites atuais

- O app ainda nao reconstroi todos os objetos internos do `.ETQ` com posicao perfeita.
- Para comparar com a arte antiga, carregue tambem os `.png` da pasta `ARQUIVOS`.
- Misturar modelos de medidas muito diferentes na mesma folha ainda usa a primeira medida da pagina; o proximo passo e agrupar por modelo na impressao.

## Observacao

Este app nao reutiliza codigo decompilado. Ele usa comportamento e formato de arquivo observados para criar uma implementacao nova.
