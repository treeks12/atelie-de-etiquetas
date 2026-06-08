const state = {
  files: [],
  imageByBase: new Map(),
  selectedId: null,
  mode: "preview",
  editor: {
    widthMm: 25,
    heightMm: 55,
    presetId: "lnt2",
    fabricName: "Viscolycra UNICA",
    composition: "96% VISCOSE\n4% ELASTANO",
    notes: "Indústria Brasileira",
    care: new Set(["wash", "iron", "dry"]),
  },
  sheet: {
    copies: 24,
    columns: 4,
    marginMm: 8,
    gapMm: 3,
    orientation: "portrait",
  },
  batch: {
    records: [],
    selectedIndex: -1,
  },
};

const LABEL_PRESETS = [
  { id: "lnt2", model: "LNT-2", label: "LNT-2 25 x 55", widthMm: 25, heightMm: 55, layout: "legacy-compact", defaultColumns: 4 },
  { id: "lnt4", model: "LNT-4", label: "LNT-4 33 x 69,9", widthMm: 33, heightMm: 69.9, layout: "tall-composition", defaultColumns: 3 },
  { id: "lcs3", model: "LCS-3", label: "LCS-3 33 x 55", widthMm: 33, heightMm: 55, layout: "wide-compact", defaultColumns: 3 },
  { id: "nttyny1", model: "NT/TY/NY-1", label: "NT/TY/NY-1 25,4 x 44,5", widthMm: 25.4, heightMm: 44.5, layout: "small-care", defaultColumns: 4 },
  { id: "tyb3", model: "TYB-3", label: "TYB-3 33 x 51", widthMm: 33, heightMm: 51, layout: "wide-compact", defaultColumns: 3 },
];

const els = {
  fileInput: document.getElementById("fileInput"),
  folderInput: document.getElementById("folderInput"),
  batchInput: document.getElementById("batchInput"),
  projectInput: document.getElementById("projectInput"),
  saveProjectButton: document.getElementById("saveProjectButton"),
  searchInput: document.getElementById("searchInput"),
  libraryList: document.getElementById("libraryList"),
  fileCount: document.getElementById("fileCount"),
  selectedMeta: document.getElementById("selectedMeta"),
  labelPreview: document.getElementById("labelPreview"),
  metadataList: document.getElementById("metadataList"),
  textHits: document.getElementById("textHits"),
  embeddedList: document.getElementById("embeddedList"),
  legacyImage: document.getElementById("legacyImage"),
  widthInput: document.getElementById("widthInput"),
  heightInput: document.getElementById("heightInput"),
  presetSelect: document.getElementById("presetSelect"),
  fabricNameInput: document.getElementById("fabricNameInput"),
  compositionInput: document.getElementById("compositionInput"),
  notesInput: document.getElementById("notesInput"),
  copiesInput: document.getElementById("copiesInput"),
  columnsInput: document.getElementById("columnsInput"),
  marginInput: document.getElementById("marginInput"),
  gapInput: document.getElementById("gapInput"),
  labelOrientationInput: document.getElementById("labelOrientationInput"),
  sheetPreview: document.getElementById("sheetPreview"),
  sheetMeta: document.getElementById("sheetMeta"),
  batchList: document.getElementById("batchList"),
  batchCount: document.getElementById("batchCount"),
  printButton: document.getElementById("printButton"),
  exportButton: document.getElementById("exportButton"),
};

const decoder1252 = new TextDecoder("windows-1252");
const decoderUtf8 = new TextDecoder("utf-8", { fatal: false });

function basename(name) {
  return name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").toLowerCase();
}

function extname(name) {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function presetById(id) {
  return LABEL_PRESETS.find((preset) => preset.id === id) || null;
}

function almostEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.15;
}

function presetFromSize(widthMm, heightMm) {
  return LABEL_PRESETS.find((preset) => almostEqual(preset.widthMm, widthMm) && almostEqual(preset.heightMm, heightMm)) || null;
}

function presetFromLabel(labelName, widthMm, heightMm) {
  const label = String(labelName || "").toUpperCase();
  const byModel = LABEL_PRESETS.find((preset) => label.includes(preset.model));
  return byModel || presetFromSize(widthMm, heightMm);
}

function applyPreset(id, { updateSize = true, updateSheet = false } = {}) {
  const preset = presetById(id);
  state.editor.presetId = preset ? preset.id : "custom";
  if (preset && updateSize) {
    state.editor.widthMm = preset.widthMm;
    state.editor.heightMm = preset.heightMm;
  }
  if (preset && updateSheet) state.sheet.columns = preset.defaultColumns;
}

function syncPresetFromSize() {
  const preset = presetFromSize(state.editor.widthMm, state.editor.heightMm);
  state.editor.presetId = preset?.id || "custom";
}

function decodeBytes(bytes) {
  const utf8 = decoderUtf8.decode(bytes);
  if (!utf8.includes("�") && /[ÃÂ]/.test(utf8) === false) return utf8.replace(/\0/g, "");
  return decoder1252.decode(bytes).replace(/\0/g, "");
}

function cleanText(text) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\r/g, "")
    .trim();
}

function readUint32(view, offset) {
  return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0;
}

function readFloat64(view, offset) {
  return offset + 8 <= view.byteLength ? view.getFloat64(offset, true) : 0;
}

function readPascalString(bytes, offset) {
  if (offset + 4 > bytes.length) return { text: "", next: offset, ok: false };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(offset, true);
  const start = offset + 4;
  const end = start + length;
  if (length < 1 || length > 4096 || end > bytes.length) return { text: "", next: offset, ok: false };
  return { text: cleanText(decodeBytes(bytes.slice(start, end))), next: end, ok: true };
}

function findPascalString(bytes, offset, maxScan = 32) {
  for (let delta = 0; delta <= maxScan; delta += 1) {
    const candidate = readPascalString(bytes, offset + delta);
    if (candidate.ok && /[A-Za-zÀ-ÿ]/.test(candidate.text)) return candidate;
  }
  return { text: "", next: offset, ok: false };
}

function findAllBytes(bytes, pattern) {
  const offsets = [];
  outer: for (let i = 0; i <= bytes.length - pattern.length; i += 1) {
    for (let j = 0; j < pattern.length; j += 1) {
      if (bytes[i + j] !== pattern[j]) continue outer;
    }
    offsets.push(i);
  }
  return offsets;
}

function extractPrintableStrings(bytes) {
  const hits = [];
  let run = [];
  let start = 0;
  const flush = () => {
    if (run.length >= 4) {
      const text = cleanText(decodeBytes(new Uint8Array(run)));
      if (/[A-Za-zÀ-ÿ]{2}/.test(text) && !/^[0-9A-Fa-f\s]+$/.test(text)) {
        hits.push({ offset: start, text });
      }
    }
    run = [];
  };
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const printable = b >= 32 && b !== 127;
    if (printable) {
      if (run.length === 0) start = i;
      run.push(b);
    } else {
      flush();
    }
  }
  flush();
  return Array.from(new Map(hits.map((h) => [h.text, h])).values()).slice(0, 160);
}

function stripRtf(rtf) {
  return rtf
    .replace(/\\'[0-9a-fA-F]{2}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16)))
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractRtfBlocks(bytes) {
  const magic = new TextEncoder().encode("{\\rtf");
  return findAllBytes(bytes, magic).map((offset, index) => {
    const tail = bytes.slice(offset, Math.min(bytes.length, offset + 12000));
    const raw = decodeBytes(tail);
    let depth = 0;
    let end = raw.length;
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i] === "{") depth += 1;
      if (raw[i] === "}") {
        depth -= 1;
        if (depth <= 0) {
          end = i + 1;
          break;
        }
      }
    }
    const rtf = raw.slice(0, end);
    return { index, offset, text: stripRtf(rtf).slice(0, 1000), rawLength: end };
  });
}

function parseWddesign(file, bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = decodeBytes(bytes.slice(0, 12));
  const valid = magic === "WDDESIGNVCM4";
  const result = {
    id: createId(),
    name: file.name,
    kind: extname(file.name).toUpperCase(),
    size: file.size,
    valid,
    magic,
    printer: "",
    category: "",
    labelName: "",
    widthMm: null,
    heightMm: null,
    composition: [],
    ints: [],
    doubles: [],
    textHits: [],
    rtfBlocks: [],
    embedded: { jpegOffsets: [], wmfOffsets: [], rtfOffsets: [] },
    objectGuess: [],
    file,
    source: "file",
  };
  if (!valid) return result;

  let offset = bytes[12] === 0 ? 13 : 12;
  let parsed = readPascalString(bytes, offset);
  result.printer = parsed.text;
  offset = parsed.next;
  while (offset < bytes.length && bytes[offset] === 0 && offset < 96) offset += 1;
  parsed = findPascalString(bytes, offset);
  result.category = parsed.text;
  offset = parsed.next;
  parsed = findPascalString(bytes, offset);
  result.labelName = parsed.text;
  offset = parsed.next;
  const sizeMatch = /\((\d+(?:[,.]\d+)?)x(\d+(?:[,.]\d+)?)mm\)/i.exec(result.labelName);
  if (sizeMatch) {
    result.widthMm = Number(sizeMatch[1].replace(",", "."));
    result.heightMm = Number(sizeMatch[2].replace(",", "."));
  }

  for (let i = 0; i < 6; i += 1) {
    result.ints.push(readUint32(view, offset));
    offset += 4;
  }
  for (let i = 0; i < 8; i += 1) {
    const value = readFloat64(view, offset);
    if (Number.isFinite(value) && Math.abs(value) < 100000) result.doubles.push(value);
    offset += 8;
  }

  result.embedded.jpegOffsets = findAllBytes(bytes, [0xff, 0xd8, 0xff]);
  result.embedded.wmfOffsets = findAllBytes(bytes, [0xd7, 0xcd, 0xc6, 0x9a]);
  result.rtfBlocks = extractRtfBlocks(bytes);
  result.embedded.rtfOffsets = result.rtfBlocks.map((b) => b.offset);
  result.textHits = extractPrintableStrings(bytes);
  result.composition = extractCompositionParts([
    ...result.rtfBlocks.map((b) => b.text),
    ...result.textHits.map((h) => h.text),
  ].join("\n"));
  result.objectGuess = guessObjects(bytes);
  return result;
}

function extractCompositionParts(text) {
  const normalized = cleanText(text)
    .toUpperCase()
    .replace(/ALGODAO/g, "ALGODÃO")
    .replace(/POLIESTER/g, "POLIÉSTER")
    .replace(/([A-ZÀ-Ý])[^A-ZÀ-Ý0-9%\s]+/g, "$1 ");
  const parts = [];
  const regex = /(\d{1,3})\s*%\s*([A-ZÀ-Ý]{2,18})/g;
  let match;
  while ((match = regex.exec(normalized))) {
    const material = match[2].replace(/[^A-ZÀ-Ý]/g, "");
    const normalizedMaterial = normalizeMaterial(material);
    if (["DE", "DO", "DA", "COM", "SEM"].includes(normalizedMaterial)) continue;
    const part = `${Number(match[1])}% ${normalizedMaterial}`;
    if (!parts.includes(part)) parts.push(part);
  }
  return parts.slice(0, 8);
}

function normalizeMaterial(material) {
  if (material.startsWith("ALGOD")) return "ALGODÃO";
  if (material.startsWith("POLI") && material !== "POLIAMIDA") return "POLIÉSTER";
  if (material.startsWith("CNHAM") || material.startsWith("CANHAM")) return "CÂNHAMO";
  const aliases = {
    ALGODO: "ALGODÃO",
    ALGOD: "ALGODÃO",
    POLIESTER: "POLIÉSTER",
    POLI: "POLIÉSTER",
    CNHAMO: "CÂNHAMO",
    CANHAMO: "CÂNHAMO",
    LA: "LÃ",
  };
  return aliases[material] || material;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function guessObjects(bytes) {
  const objects = [];
  const rtfBlocks = extractRtfBlocks(bytes);
  for (const block of rtfBlocks) {
    objects.push({ type: "text", offset: block.offset, text: block.text.slice(0, 180) });
  }
  for (const offset of findAllBytes(bytes, [0xff, 0xd8, 0xff])) {
    objects.push({ type: "jpeg", offset });
  }
  for (const offset of findAllBytes(bytes, [0xd7, 0xcd, 0xc6, 0x9a])) {
    objects.push({ type: "wmf", offset });
  }
  return objects.sort((a, b) => a.offset - b.offset);
}

function inferEditorFromRecord(record) {
  const label = record.labelName || "";
  const size = /\((\d+(?:[,.]\d+)?)x(\d+(?:[,.]\d+)?)mm\)/i.exec(label);
  if (size) {
    state.editor.widthMm = Number(size[1].replace(",", "."));
    state.editor.heightMm = Number(size[2].replace(",", "."));
  }
  const preset = presetFromLabel(record.labelName, record.widthMm || state.editor.widthMm, record.heightMm || state.editor.heightMm);
  state.editor.presetId = preset?.id || "custom";
  const fabricName = record.name.replace(/\.[^.]+$/, "");
  state.editor.fabricName = fabricName;
  if (Array.isArray(record.composition) && record.composition.length) {
    state.editor.composition = record.composition.join("\n");
  }
  const usefulRtf = record.rtfBlocks.map((b) => b.text).find((t) => /%|algod|visco|poli|elast|linho|malha/i.test(t));
  const usefulStrings = record.textHits.map((h) => h.text).filter((t) => /%|ALGOD|VISCO|POLI|ELAST|LINHO|MALHA/i.test(t));
  if (usefulRtf) state.editor.composition = usefulRtf.slice(0, 180);
  else if (!record.composition?.length && usefulStrings.length) state.editor.composition = usefulStrings.slice(0, 3).join("\n");
  syncEditorControls();
}

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  const imageFiles = files.filter((file) => ["png", "jpg", "jpeg"].includes(extname(file.name)));
  for (const file of imageFiles) {
    state.imageByBase.set(basename(file.name).replace(/^resized_/, ""), URL.createObjectURL(file));
  }

  const designFiles = files.filter((file) => ["etq", "etm"].includes(extname(file.name)));
  for (const file of designFiles) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const record = parseWddesign(file, bytes);
    const key = basename(file.name);
    record.previewImage = state.imageByBase.get(key) || state.imageByBase.get(`resized_${key}`) || "";
  const existingIndex = state.files.findIndex((item) => item.name === record.name);
    if (existingIndex >= 0) {
      const previous = state.files[existingIndex];
      record.id = previous.id;
      if (!record.composition.length && previous.composition?.length) record.composition = previous.composition;
      if (!record.widthMm && previous.widthMm) record.widthMm = previous.widthMm;
      if (!record.heightMm && previous.heightMm) record.heightMm = previous.heightMm;
      state.files[existingIndex] = record;
    }
    else state.files.push(record);
  }

  state.files.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  if (!state.selectedId && state.files.length) {
    state.selectedId = state.files[0].id;
    inferEditorFromRecord(state.files[0]);
  }
  render();
}

function selectedRecord() {
  return state.files.find((item) => item.id === state.selectedId) || null;
}

function renderLibrary() {
  const query = els.searchInput.value.trim().toLowerCase();
  const rows = state.files.filter((item) => {
    const haystack = `${item.name} ${item.category} ${item.labelName} ${item.printer}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  els.fileCount.textContent = String(state.files.length);
  if (!rows.length) {
    els.libraryList.innerHTML = `<div class="library-empty">Abra a pasta <strong>ARQUIVOS</strong> ou selecione arquivos .ETQ para começar.</div>`;
    return;
  }
  els.libraryList.innerHTML = rows
    .map(
      (item) => `
      <button class="library-item ${item.id === state.selectedId ? "active" : ""}" data-id="${item.id}">
        <span class="item-title">${escapeHtml(item.name.replace(/\.[^.]+$/, ""))}</span>
        <span class="item-kind">${escapeHtml(item.kind)}</span>
        <span class="item-subtitle">${escapeHtml(item.labelName || item.category || "Formato WDDESIGN")}</span>
      </button>
    `
    )
    .join("");
}

function renderMeta(record) {
  if (!record) {
    els.selectedMeta.textContent = "Nenhum arquivo carregado";
    els.metadataList.innerHTML = "";
    els.textHits.innerHTML = "";
    els.embeddedList.innerHTML = "";
    els.legacyImage.innerHTML = `<span class="library-empty">Sem prévia externa.</span>`;
    return;
  }
  els.selectedMeta.textContent = `${record.name} · ${record.labelName || record.category || "sem modelo"}`;
  const data = [
    ["Arquivo", record.name],
    ["Origem", record.source === "catalog" ? "Catálogo ARQUIVOS" : "Arquivo carregado"],
    ["Formato", record.magic || "Referência"],
    ["Impressora", record.printer],
    ["Categoria", record.category],
    ["Modelo", record.labelName],
    ["Preset visual", presetById(record.presetId || state.editor.presetId)?.label || "Personalizado"],
    ["Medida", record.widthMm && record.heightMm ? `${record.widthMm} x ${record.heightMm} mm` : "-"],
    ["PNG legado", record.previewImage ? "carregado" : record.hasPngPreview ? "existente no ARQUIVOS" : "-"],
    ["Tamanho", record.size ? `${record.size.toLocaleString("pt-BR")} bytes` : "-"],
    ["RTF", `${record.embedded?.rtfOffsets?.length || 0} bloco(s)`],
    ["JPEG", `${record.embedded?.jpegOffsets?.length || 0} bloco(s)`],
    ["WMF", `${record.embedded?.wmfOffsets?.length || 0} bloco(s)`],
  ];
  els.metadataList.innerHTML = data
    .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || "-")}</dd></div>`)
    .join("");
  const textItems = [
    ...(record.composition || []),
    ...(record.rtfBlocks || []).map((b) => b.text),
    ...(record.textHits || []).map((h) => h.text),
  ]
    .filter(Boolean)
    .filter((text, index, arr) => arr.indexOf(text) === index)
    .slice(0, 80);
  els.textHits.innerHTML = textItems.length
    ? textItems.map((text) => `<div class="text-pill">${escapeHtml(text)}</div>`).join("")
    : `<div class="library-empty">Nenhum texto extraído ainda.</div>`;
  els.embeddedList.innerHTML = record.objectGuess?.length
    ? record.objectGuess
        .map((obj) => `<div class="embedded-pill">${escapeHtml(obj.type.toUpperCase())} · offset 0x${obj.offset.toString(16).toUpperCase()}${obj.text ? `<br>${escapeHtml(obj.text)}` : ""}</div>`)
        .join("")
    : `<div class="library-empty">Nenhum bloco embutido detectado.</div>`;
  els.legacyImage.innerHTML = record.previewImage
    ? `<div class="legacy-compare">
        <div class="compare-card">
          <h3>Legado PNG</h3>
          <img src="${record.previewImage}" alt="Prévia externa de ${escapeHtml(record.name)}">
        </div>
        <div class="compare-card compare-modern">
          <h3>Moderna</h3>
          ${renderLabelSvg()}
        </div>
      </div>`
    : `<span class="library-empty">Selecione também os PNGs da pasta para ver a prévia antiga.</span>`;
}

function loadSeedCatalog() {
  const rows = globalThis.PAULIMAQ_ARCHIVE_CATALOG || [];
  state.files = rows.map((item) => ({
    id: createId(),
    name: item.name,
    kind: "REF",
    source: "catalog",
    size: 0,
    valid: true,
    magic: "",
    printer: "Epson Stylus Photo R200",
    category: item.category || "Etiq. para Composições em Folhas",
    labelName: item.labelName || "LNT-2 (25,0x55mm)",
    widthMm: item.widthMm || 25,
    heightMm: item.heightMm || 55,
    presetId: presetFromLabel(item.labelName, item.widthMm || 25, item.heightMm || 55)?.id || "custom",
    composition: item.composition || [],
    hasPngPreview: Boolean(item.hasPngPreview),
    previewImage: "",
    embedded: { jpegOffsets: [], wmfOffsets: [], rtfOffsets: [] },
    textHits: [],
    rtfBlocks: [],
    objectGuess: [],
  }));
  if (state.files.length) {
    state.selectedId = state.files[0].id;
    inferEditorFromRecord(state.files[0]);
  }
}

function editorFromBatchRecord(record) {
  const preset = presetById(record.presetId) || presetFromSize(record.widthMm, record.heightMm);
  return {
    widthMm: Number(record.widthMm || preset?.widthMm || state.editor.widthMm || 25),
    heightMm: Number(record.heightMm || preset?.heightMm || state.editor.heightMm || 55),
    presetId: preset?.id || record.presetId || "custom",
    fabricName: record.fabricName || "Etiqueta",
    composition: record.composition || "",
    notes: record.notes || state.editor.notes || "",
    care: new Set(record.care?.length ? record.care : Array.from(state.editor.care)),
  };
}

function buildSheetItems() {
  if (!state.batch.records.length) {
    return Array.from({ length: state.sheet.copies }, () => ({ editor: state.editor, copies: 1 }));
  }
  const items = [];
  state.batch.records.forEach((record) => {
    const copies = Math.max(1, Math.min(200, Number(record.copies || 1)));
    for (let i = 0; i < copies; i += 1) {
      items.push({ editor: editorFromBatchRecord(record), copies: 1 });
    }
  });
  return items;
}

function sheetMetrics(items = buildSheetItems()) {
  const baseEditor = items[0]?.editor || state.editor;
  const pageW = 210;
  const pageH = 297;
  const px = 3.4;
  const pagePxW = pageW * px;
  const pagePxH = pageH * px;
  const labelWmm = state.sheet.orientation === "landscape" ? baseEditor.heightMm : baseEditor.widthMm;
  const labelHmm = state.sheet.orientation === "landscape" ? baseEditor.widthMm : baseEditor.heightMm;
  const labelW = labelWmm * px;
  const labelH = labelHmm * px;
  const margin = state.sheet.marginMm * px;
  const gap = state.sheet.gapMm * px;
  const maxColumns = Math.max(1, Math.floor((pagePxW - margin * 2 + gap) / (labelW + gap)));
  const usedColumns = Math.min(Math.max(1, state.sheet.columns), maxColumns);
  const maxRows = Math.max(1, Math.floor((pagePxH - margin * 2 + gap) / (labelH + gap)));
  return {
    pagePxW,
    pagePxH,
    labelWmm,
    labelHmm,
    labelW,
    labelH,
    margin,
    gap,
    usedColumns,
    maxRows,
    capacity: usedColumns * maxRows,
  };
}

function renderSheetPage({ items, metrics, pageIndex }) {
  const start = pageIndex * metrics.capacity;
  const pageItems = items.slice(start, start + metrics.capacity);
  const nodes = [];
  pageItems.forEach((item, i) => {
    const col = i % metrics.usedColumns;
    const row = Math.floor(i / metrics.usedColumns);
    const x = metrics.margin + col * (metrics.labelW + metrics.gap);
    const y = metrics.margin + row * (metrics.labelH + metrics.gap);
    const labelSvg = renderLabelSvg({
      className: "sheet-label-svg",
      widthMmOverride: metrics.labelWmm,
      heightMmOverride: metrics.labelHmm,
      editorOverride: item.editor || state.editor,
    });
    const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(labelSvg)}`;
    nodes.push(`<image href="${encoded}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${metrics.labelW.toFixed(2)}" height="${metrics.labelH.toFixed(2)}"/>`);
  });
  return `
    <svg class="sheet-svg" data-page="${pageIndex + 1}" width="${metrics.pagePxW}" height="${metrics.pagePxH}" viewBox="0 0 ${metrics.pagePxW} ${metrics.pagePxH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${metrics.pagePxW}" height="${metrics.pagePxH}" fill="#fff"/>
      <rect x="${metrics.margin}" y="${metrics.margin}" width="${metrics.pagePxW - metrics.margin * 2}" height="${metrics.pagePxH - metrics.margin * 2}" fill="none" stroke="#d8ded9" stroke-dasharray="7 7"/>
      ${nodes.join("")}
    </svg>
  `;
}

function renderLabelSvg({ className = "label-svg", widthMmOverride = null, heightMmOverride = null, editorOverride = null } = {}) {
  const editor = editorOverride || state.editor;
  const { fabricName, composition, notes, care } = editor;
  const preset = presetById(editor.presetId) || presetFromSize(editor.widthMm, editor.heightMm);
  const layout = preset?.layout || "legacy-compact";
  const widthMm = widthMmOverride || editor.widthMm;
  const heightMm = heightMmOverride || editor.heightMm;
  const scale = 7.5;
  const w = Math.max(16, widthMm) * scale;
  const h = Math.max(20, heightMm) * scale;
  const margin = Math.max(10, Math.min(w, h) * 0.08);
  const titleY = layout === "tall-composition" ? margin + 27 : margin + 22;
  const ruleY = layout === "small-care" ? margin + 30 : titleY + 13;
  const compositionStart = layout === "tall-composition" ? margin + 68 : margin + 60;
  const compositionGap = layout === "tall-composition" ? 20 : 18;
  const compositionLimit = layout === "tall-composition" ? 7 : 5;
  const careItems = [
    ["wash", "LAVAR", "30"],
    ["bleach", "ALV", "X"],
    ["iron", "FERRO", "\u2022\u2022"],
    ["dry", "SECAR", "\u25A1"],
  ].filter(([id]) => care.has(id));
  const careSize = Math.max(20, Math.min(layout === "tall-composition" ? 38 : 34, (w - margin * 2) / Math.max(1, careItems.length) - 5));
  const careY = layout === "tall-composition" ? Math.max(margin + 190, h - margin - careSize - 58) : Math.max(margin + 132, h - margin - careSize - 52);
  const compositionLines = composition.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const noteLines = notes.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return `
    <svg class="${className}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="4" fill="#fff" stroke="#1a1f1d" stroke-width="1"/>
      <rect x="${margin}" y="${margin}" width="${w - margin * 2}" height="${h - margin * 2}" rx="3" fill="#fbfcfb" stroke="#d6ddd8" stroke-width="1"/>
      <text x="${w / 2}" y="${titleY}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="${fitText(fabricName, w - margin * 2, layout === "tall-composition" ? 19 : 18, 10)}" font-weight="800" fill="#151a18">${escapeSvg(fabricName.toUpperCase())}</text>
      <line x1="${margin + 8}" x2="${w - margin - 8}" y1="${ruleY}" y2="${ruleY}" stroke="#1a1f1d" stroke-width="1"/>
      ${layout === "tall-composition" ? `<rect x="${margin + 9}" y="${margin + 48}" width="${w - margin * 2 - 18}" height="${Math.min(120, h * 0.27)}" rx="2" fill="#fff" stroke="#e2e8e3" stroke-width="1"/>` : ""}
      ${compositionLines
        .slice(0, compositionLimit)
        .map((line, i) => `<text x="${w / 2}" y="${compositionStart + i * compositionGap}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="${fitText(line, w - margin * 2, layout === "tall-composition" ? 16 : 15, 9)}" font-weight="${/%/.test(line) ? 700 : 500}" fill="#1c2420">${escapeSvg(line)}</text>`)
        .join("")}
      <g transform="translate(${margin + 6}, ${careY})">
        ${careItems
          .map(([, label, mark], i) => {
            const x = i * (careSize + 7);
            return `<g transform="translate(${x},0)">
              <rect width="${careSize}" height="${careSize}" rx="3" fill="#fff" stroke="#1a1f1d" stroke-width="1"/>
              <text x="${careSize / 2}" y="${careSize / 2 + 5}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="${Math.max(9, careSize * 0.36)}" font-weight="800">${escapeSvg(mark)}</text>
              <text x="${careSize / 2}" y="${careSize + 13}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="7" fill="#4d5a54">${escapeSvg(label)}</text>
            </g>`;
          })
          .join("")}
      </g>
      ${noteLines
        .slice(0, 3)
        .map((line, i) => `<text x="${w / 2}" y="${h - margin - 14 + i * 12}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="${fitText(line, w - margin * 2, 10, 7)}" fill="#39443f">${escapeSvg(line)}</text>`)
        .join("")}
    </svg>
  `;
}

function renderLabel() {
  els.labelPreview.innerHTML = renderLabelSvg();
}

function renderSheet() {
  readSheetControls();
  const sheetItems = buildSheetItems();
  const metrics = sheetMetrics(sheetItems);
  const totalCopies = state.batch.records.length ? sheetItems.length : state.sheet.copies;
  const totalPages = Math.max(1, Math.ceil(totalCopies / metrics.capacity));
  els.sheetMeta.textContent = `${totalCopies} cópias · ${totalPages} página(s) · ${metrics.usedColumns} col.`;
  els.sheetPreview.innerHTML = Array.from({ length: totalPages }, (_, pageIndex) =>
    `<div class="sheet-page">${renderSheetPage({ items: sheetItems, metrics, pageIndex })}</div>`
  ).join("");
}

function fitText(text, maxWidth, preferred, min) {
  const estimate = text.length * preferred * 0.56;
  if (estimate <= maxWidth) return preferred;
  return Math.max(min, Math.floor(maxWidth / Math.max(1, text.length * 0.56)));
}

function syncEditorControls() {
  syncPresetFromSize();
  els.widthInput.value = String(state.editor.widthMm || 25);
  els.heightInput.value = String(state.editor.heightMm || 55);
  els.presetSelect.value = state.editor.presetId || "custom";
  els.fabricNameInput.value = state.editor.fabricName;
  els.compositionInput.value = state.editor.composition;
  els.notesInput.value = state.editor.notes;
  els.copiesInput.value = String(state.sheet.copies);
  els.columnsInput.value = String(state.sheet.columns);
  els.marginInput.value = String(state.sheet.marginMm);
  els.gapInput.value = String(state.sheet.gapMm);
  els.labelOrientationInput.value = state.sheet.orientation;
  document.querySelectorAll("[data-care]").forEach((input) => {
    input.checked = state.editor.care.has(input.dataset.care);
  });
}

function readEditorControls() {
  state.editor.widthMm = Number(els.widthInput.value || 25);
  state.editor.heightMm = Number(els.heightInput.value || 55);
  syncPresetFromSize();
  state.editor.fabricName = els.fabricNameInput.value || "Etiqueta";
  state.editor.composition = els.compositionInput.value || "";
  state.editor.notes = els.notesInput.value || "";
  state.editor.care = new Set(
    Array.from(document.querySelectorAll("[data-care]"))
      .filter((input) => input.checked)
      .map((input) => input.dataset.care)
  );
}

function readSheetControls() {
  state.sheet.copies = Math.max(1, Math.min(200, Number(els.copiesInput.value || 1)));
  state.sheet.columns = Math.max(1, Math.min(8, Number(els.columnsInput.value || 1)));
  state.sheet.marginMm = Math.max(0, Math.min(30, Number(els.marginInput.value || 0)));
  state.sheet.gapMm = Math.max(0, Math.min(15, Number(els.gapInput.value || 0)));
  state.sheet.orientation = els.labelOrientationInput.value || "portrait";
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseDelimitedText(text) {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [];
  const lines = normalized.split("\n").filter((line) => line.trim());
  const delimiter = ["\t", ";", ","].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const headers = splitDelimitedLine(lines.shift(), delimiter).map((header) => header.trim().toLowerCase());
  return lines
    .map((line, index) => {
      const cells = splitDelimitedLine(line, delimiter);
      const row = Object.fromEntries(headers.map((header, i) => [header, cells[i] || ""]));
      const requestedModel = row.modelo || row.model || row.preset || "";
      const preset = presetFromLabel(requestedModel, null, null) || presetById(String(requestedModel).toLowerCase());
      const composition = (row.composicao || row.composition || "")
        .split(/[|;]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .join("\n");
      return {
        id: createId(),
        rowNumber: index + 2,
        fabricName: row.tecido || row.fabric || row.nome || row.name || `Etiqueta ${index + 1}`,
        composition,
        notes: row.observacoes || row.observacao || row.notes || row.rodape || "",
        widthMm: Number(String(row.largura || row.width || "").replace(",", ".")) || preset?.widthMm || state.editor.widthMm,
        heightMm: Number(String(row.altura || row.height || "").replace(",", ".")) || preset?.heightMm || state.editor.heightMm,
        presetId: preset?.id || "custom",
        copies: Math.max(1, Math.min(200, Number(row.copias || row.copies || 1))),
        care: Array.from(state.editor.care),
      };
    })
    .filter((row) => row.fabricName || row.composition);
}

function applyBatchRecord(index) {
  const record = state.batch.records[index];
  if (!record) return;
  state.batch.selectedIndex = index;
  const editor = editorFromBatchRecord(record);
  state.editor.widthMm = editor.widthMm;
  state.editor.heightMm = editor.heightMm;
  state.editor.fabricName = editor.fabricName;
  state.editor.composition = editor.composition;
  state.editor.notes = editor.notes;
  state.editor.care = editor.care;
  syncEditorControls();
}

function renderBatch() {
  if (!els.batchList) return;
  els.batchCount.textContent = String(state.batch.records.length);
  if (!state.batch.records.length) {
    els.batchList.innerHTML = `<div class="library-empty">Importe um CSV/TSV para montar folhas com varios tecidos.</div>`;
    return;
  }
  els.batchList.innerHTML = state.batch.records
    .map(
      (record, index) => `
        <button class="batch-row ${index === state.batch.selectedIndex ? "active" : ""}" data-batch-index="${index}">
          <span class="batch-name">${escapeHtml(record.fabricName)}</span>
          <span class="batch-composition">${escapeHtml(record.composition || "-")}</span>
          <span class="batch-meta">${escapeHtml(`${presetById(record.presetId)?.model || "Custom"} · ${record.widthMm} x ${record.heightMm} mm · ${record.copies} copia(s)`)}</span>
        </button>
      `
    )
    .join("");
}

async function handleBatchFile(file) {
  if (!file) return;
  const text = await file.text();
  state.batch.records = parseDelimitedText(text);
  state.batch.selectedIndex = state.batch.records.length ? 0 : -1;
  if (state.batch.records.length) applyBatchRecord(0);
  state.mode = "batch";
  render();
}

function projectSnapshot() {
  readEditorControls();
  readSheetControls();
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    editor: { ...state.editor, care: Array.from(state.editor.care) },
    sheet: { ...state.sheet },
    batch: {
      records: state.batch.records,
      selectedIndex: state.batch.selectedIndex,
    },
  };
}

async function loadProjectFile(file) {
  if (!file) return;
  const payload = JSON.parse(await file.text());
  if (payload.editor) {
    state.editor = {
      ...state.editor,
      ...payload.editor,
      care: new Set(payload.editor.care || Array.from(state.editor.care)),
    };
  }
  if (payload.sheet) state.sheet = { ...state.sheet, ...payload.sheet };
  if (payload.batch) {
    state.batch.records = Array.isArray(payload.batch.records) ? payload.batch.records : [];
    state.batch.selectedIndex = Number(payload.batch.selectedIndex ?? -1);
  }
  syncEditorControls();
  render();
}

function saveProject() {
  const data = new Blob([JSON.stringify(projectSnapshot(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.editor.fabricName || "etiquetas"}-projeto.json`.replace(/[\\/:*?"<>|]/g, "-");
  a.click();
  URL.revokeObjectURL(url);
}

function renderModes() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === state.mode);
  });
  document.querySelectorAll(".mode-view").forEach((view) => view.classList.remove("active"));
  document.getElementById(`${state.mode}Mode`).classList.add("active");
}

function render() {
  renderLibrary();
  renderMeta(selectedRecord());
  renderLabel();
  renderSheet();
  renderBatch();
  renderModes();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function escapeSvg(text) {
  return escapeHtml(text);
}

function sheetDocumentSvg() {
  const svgs = Array.from(els.sheetPreview.querySelectorAll("svg"));
  if (!svgs.length) return "";
  if (svgs.length === 1) return svgs[0].outerHTML;
  const first = svgs[0];
  const width = Number(first.getAttribute("width") || 714);
  const height = Number(first.getAttribute("height") || 1010);
  const gap = 34;
  const pages = svgs
    .map((svg, index) => {
      const y = index * (height + gap);
      return `<g transform="translate(0 ${y})">${svg.innerHTML}</g>`;
    })
    .join("");
  return `<svg class="sheet-export-svg" width="${width}" height="${svgs.length * height + (svgs.length - 1) * gap}" viewBox="0 0 ${width} ${svgs.length * height + (svgs.length - 1) * gap}" xmlns="http://www.w3.org/2000/svg">${pages}</svg>`;
}

function exportSvg() {
  const svgText = state.mode === "sheet" ? sheetDocumentSvg() : els.labelPreview.querySelector("svg")?.outerHTML;
  if (!svgText) return;
  const data = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  const suffix = state.mode === "sheet" ? "folha" : "etiqueta";
  a.download = `${state.editor.fabricName || "etiqueta"}-${suffix}.svg`.replace(/[\\/:*?"<>|]/g, "-");
  a.click();
  URL.revokeObjectURL(url);
}

els.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
els.folderInput.addEventListener("change", (event) => handleFiles(event.target.files));
els.batchInput.addEventListener("change", (event) => handleBatchFile(event.target.files[0]));
els.projectInput.addEventListener("change", (event) => loadProjectFile(event.target.files[0]));
els.saveProjectButton.addEventListener("click", saveProject);
els.searchInput.addEventListener("input", renderLibrary);
els.libraryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  state.selectedId = button.dataset.id;
  const record = selectedRecord();
  if (record) inferEditorFromRecord(record);
  render();
});
els.batchList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-batch-index]");
  if (!button) return;
  applyBatchRecord(Number(button.dataset.batchIndex));
  render();
});
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.mode = tab.dataset.mode;
    renderModes();
  });
});
[els.widthInput, els.heightInput, els.fabricNameInput, els.compositionInput, els.notesInput].forEach((el) => {
  el.addEventListener("input", () => {
    readEditorControls();
    renderLabel();
    renderSheet();
  });
});
document.querySelectorAll("[data-care]").forEach((input) => {
  input.addEventListener("change", () => {
    readEditorControls();
    renderLabel();
    renderSheet();
  });
});
els.presetSelect.addEventListener("change", () => {
  applyPreset(els.presetSelect.value, { updateSize: true, updateSheet: true });
  syncEditorControls();
  renderLabel();
  renderSheet();
});
[els.copiesInput, els.columnsInput, els.marginInput, els.gapInput, els.labelOrientationInput].forEach((el) => {
  el.addEventListener("input", renderSheet);
  el.addEventListener("change", renderSheet);
});
els.printButton.addEventListener("click", () => window.print());
els.exportButton.addEventListener("click", exportSvg);

loadSeedCatalog();
syncEditorControls();
render();
