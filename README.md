# Atelie de Etiquetas

Aplicativo local e moderno para estudar, importar e recriar etiquetas de roupa do legado Paulimaq/MasterPrint.

Substituto funcional do Paulimaq MasterPrint 3.0 (WinDOOR Sistemas / Diagramador de Documentos v2.0).

## Como abrir

Abra `index.html` no navegador.

## Como usar com a pasta real

1. Clique em `Pasta`.
2. Selecione `C:\Program Files (x86)\paulimaq\ARQUIVOS`.
3. O app carrega arquivos `.ETQ` e associa imagens `.png` com nomes iguais ou `resized_`.

## Funcionalidades

### Importacao e Parser
- Lista um catalogo com os 58 `.ETQ` encontrados em `ARQUIVOS`.
- Le arquivos `.ETQ/.ETM` no formato binario `WDDESIGNVCM4`.
- Extrai metadados, textos, blocos RTF, offsets de JPEG/WMF e objetos internos com posicoes X/Y.
- Parser robusto com validacao anti-lixo-binario.
- 143 presets de modelo carregados dos 17 arquivos `.INF` originais.

### Editor de Etiqueta
- Etiqueta editavel com nome do tecido, composicao, observacoes.
- 41 simbolos de cuidado graficos (ISO 3758) em SVG: lavar, alvejar, passar, secar, secadora.
- Seletor de variante por categoria (temperatura, suave/permanent press, etc.).
- Geracao de codigo de barras (EAN13, EAN8, CODE128, CODE39, UPC) via JsBarcode.
- Comparacao visual com PNG legado.

### Canvas WYSIWYG (aba Design)
- Canvas SVG com drag-and-drop, snap-to-grid (1mm).
- Adicionar texto, simbolos de cuidado, barcode, linhas.
- Selecao com 8 handles de redimensionamento.
- Edicao inline de texto (duplo-clique).
- Painel de propriedades (posicao, tamanho, fonte, cor).
- Regua mm nas bordas.
- Conversao automatica editor <-> canvas.

### Impressao e Exportacao
- Folhas A4 paginadas com copias, colunas, margem, espacamento e orientacao.
- Impressao precisa via iframe com `@page { size: A4; margin: 0 }`.
- Importacao de lote CSV/TSV.
- Salva e carrega projeto em JSON.
- Exportacao SVG da etiqueta ou folha.

## Lote CSV/TSV

Use um arquivo com cabecalho. Exemplo:

```csv
tecido;modelo;composicao;observacoes;largura;altura;copias
Moletom;LNT-2;50% ALGODAO|50% POLIESTER;Industria Brasileira;25;55;3
Linho;LNT-4;70% VISCOSE|30% LINHO;Lote piloto;;;2
```

## Arquivos

| Arquivo | Funcao |
|---------|--------|
| `index.html` | Interface principal |
| `app.js` | Logica do app, parser WDDESIGNVCM4 |
| `canvas-designer.js` | Canvas WYSIWYG drag-and-drop |
| `care-symbols.js` | 41 simbolos ISO 3758 em SVG |
| `label-presets.js` | 143 presets dos .INF originais |
| `catalog-seed.js` | Catalogo de 58 etiquetas ARQUIVOS |
| `styles.css` | Estilos + print CSS |
| `vendor/jsbarcode.min.js` | Geracao de codigo de barras |

## Origem

Este app nao reutiliza codigo decompilado. Ele usa comportamento e formato de arquivo observados para criar uma implementacao nova que substitui o Paulimaq MasterPrint 3.0 (baseado no motor CadMapa/Diagramador de Documentos v2.0, ©1997-2009 Gustavo M. Hispagnol / WinDOOR Sistemas Ltda).
