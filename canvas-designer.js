(function () {
  var NS = "http://www.w3.org/2000/svg";
  var GRID = 1;
  var HS = 5;
  var RULER = 28;
  var PX = 5;

  var elements = [];
  var selectedId = null;
  var labelW = 25;
  var labelH = 55;
  var nextId = 1;
  var drag = null;
  var zoomLevel = 1;
  var editInput = null;

  var canvasDiv, propsDiv, svg, canvasG, elementsG, selectionG;

  function mm(v) { return v * PX; }
  function toMm(v) { return v / PX; }
  function snap(v) { return Math.round(v / GRID) * GRID; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function mk(tag, a) {
    var e = document.createElementNS(NS, tag);
    if (a) for (var k in a) e.setAttribute(k, a[k]);
    return e;
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function findEl(id) { return elements.find(function (e) { return e.id === id; }); }

  function init() {
    canvasDiv = document.getElementById("designCanvas");
    propsDiv = document.getElementById("designProps");
    document.addEventListener("keydown", function (e) {
      var dm = document.getElementById("designMode");
      if (!dm || !dm.classList.contains("active")) return;
      if (editInput) return;
      var t = (e.target.tagName || "").toUpperCase();
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
        e.preventDefault();
      }
    });
  }

  function buildCanvas() {
    if (!canvasDiv) return;
    var cw = RULER + mm(labelW) + 40;
    var ch = RULER + mm(labelH) + 40;

    svg = mk("svg", {
      viewBox: "0 0 " + cw + " " + ch,
      width: Math.round(cw * zoomLevel),
      height: Math.round(ch * zoomLevel),
      style: "display:block"
    });

    svg.appendChild(mk("rect", { x: 0, y: 0, width: cw, height: ch, fill: "#e4e9e5" }));
    svg.appendChild(mk("rect", { x: RULER, y: 0, width: mm(labelW) + 30, height: RULER, fill: "#eef1ee" }));
    svg.appendChild(mk("rect", { x: 0, y: RULER, width: RULER, height: mm(labelH) + 30, fill: "#eef1ee" }));

    var hStep, vStep;
    if (labelW <= 20) hStep = 1;
    else if (labelW <= 50) hStep = 2;
    else if (labelW <= 100) hStep = 5;
    else hStep = 10;
    if (labelH <= 20) vStep = 1;
    else if (labelH <= 50) vStep = 2;
    else if (labelH <= 100) vStep = 5;
    else vStep = 10;

    for (var i = 0; i <= labelW; i += hStep) {
      var tx = RULER + mm(i);
      var th = (i % (hStep * 5) === 0) ? 10 : (i % (hStep * 2) === 0 || hStep >= 5) ? 7 : 4;
      svg.appendChild(mk("line", { x1: tx, y1: RULER - th, x2: tx, y2: RULER, stroke: "#888", "stroke-width": 0.5 }));
      if (i % (hStep * 5) === 0 || labelW <= 25) {
        var tt = mk("text", { x: tx, y: RULER - 12, "text-anchor": "middle", "font-size": "7", fill: "#666", "font-family": "Arial" });
        tt.textContent = i;
        svg.appendChild(tt);
      }
    }
    for (var j = 0; j <= labelH; j += vStep) {
      var ty = RULER + mm(j);
      var tw = (j % (vStep * 5) === 0) ? 10 : (j % (vStep * 2) === 0 || vStep >= 5) ? 7 : 4;
      svg.appendChild(mk("line", { x1: RULER - tw, y1: ty, x2: RULER, y2: ty, stroke: "#888", "stroke-width": 0.5 }));
      if (j % (vStep * 5) === 0 || labelH <= 30) {
        var lt = mk("text", { x: RULER - 13, y: ty + 3, "text-anchor": "end", "font-size": "7", fill: "#666", "font-family": "Arial" });
        lt.textContent = j;
        svg.appendChild(lt);
      }
    }

    canvasG = mk("g", { transform: "translate(" + RULER + "," + RULER + ")" });
    canvasG.appendChild(mk("rect", { x: 0, y: 0, width: mm(labelW), height: mm(labelH), fill: "#fff", stroke: "#1a1f1d", "stroke-width": 1.5, rx: 3 }));

    var gStepH = GRID;
    if (labelW > 80) gStepH = 2;
    if (labelW > 150) gStepH = 5;
    for (var gx = gStepH; gx < labelW; gx += gStepH) {
      canvasG.appendChild(mk("line", { x1: mm(gx), y1: 0, x2: mm(gx), y2: mm(labelH), stroke: "#d8ddd9", "stroke-width": 0.3 }));
    }
    var gStepV = GRID;
    if (labelH > 80) gStepV = 2;
    if (labelH > 150) gStepV = 5;
    for (var gy = gStepV; gy < labelH; gy += gStepV) {
      canvasG.appendChild(mk("line", { x1: 0, y1: mm(gy), x2: mm(labelW), y2: mm(gy), stroke: "#d8ddd9", "stroke-width": 0.3 }));
    }

    elementsG = mk("g", {});
    canvasG.appendChild(elementsG);
    selectionG = mk("g", {});
    canvasG.appendChild(selectionG);
    svg.appendChild(canvasG);

    canvasDiv.innerHTML = "";
    canvasDiv.appendChild(svg);

    renderElements();
    renderSelection();

    svg.addEventListener("mousedown", onDown);
    svg.addEventListener("mousemove", onMove);
    svg.addEventListener("mouseup", onUp);
    svg.addEventListener("mouseleave", onUp);
    svg.addEventListener("dblclick", onDbl);
  }

  function renderElements() {
    if (!elementsG) return;
    elementsG.innerHTML = "";
    elements.forEach(function (el) {
      elementsG.appendChild(renderElement(el));
    });
  }

  function renderElement(el) {
    var g = mk("g", {
      "data-id": el.id,
      "data-type": el.type,
      transform: "translate(" + mm(el.x) + "," + mm(el.y) + ")",
      cursor: "move"
    });

    switch (el.type) {
      case "text":
        g.appendChild(mk("rect", {
          x: 0, y: 0, width: mm(el.width), height: mm(el.height),
          fill: "rgba(180,210,195,0.12)", stroke: "#aac4b8", "stroke-width": 0.5, "stroke-dasharray": "3,2"
        }));
        var fs = Math.max(3, Math.min(
          (el.fontSize || 14) * PX * 0.28,
          mm(el.height) * 0.85,
          mm(el.width) * 0.18
        ));
        var t = mk("text", {
          x: mm(el.width) / 2, y: mm(el.height) / 2 + fs * 0.35,
          "text-anchor": "middle", "font-size": fs,
          "font-family": el.font || "Segoe UI, Arial",
          "font-weight": "600", fill: el.color || "#151a18"
        });
        t.textContent = (el.content || "").split("\n")[0].substring(0, 40);
        g.appendChild(t);
        break;

      case "careSymbol":
        g.appendChild(mk("rect", {
          x: 0, y: 0, width: mm(el.width), height: mm(el.height),
          fill: "#fff", stroke: "#1a1f1d", "stroke-width": 1, rx: 2
        }));
        var syms = window.CARE_SYMBOLS || {};
        var sym = syms[el.careSymbolKey];
        if (sym) {
          var inner = sym.svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");
          var sz = Math.min(mm(el.width) - 4, mm(el.height) - 4) / 40;
          var sg = mk("g", { transform: "scale(" + sz + ")", "transform-origin": "2 2" });
          sg.innerHTML = inner;
          g.appendChild(sg);
        }
        break;

      case "barcode":
        g.appendChild(mk("rect", {
          x: 0, y: 0, width: mm(el.width), height: mm(el.height),
          fill: "#fff", stroke: "#888", "stroke-width": 0.5, rx: 1
        }));
        var val = el.barcodeValue || "";
        if (val.length > 0) {
          var n = Math.min(val.length, 40);
          var bw = mm(el.width) / (n * 2 + 2);
          var bh = mm(el.height) - 14;
          for (var b = 0; b < n; b++) {
            var c = val.charCodeAt(b % val.length);
            if (c % 3 !== 0) {
              g.appendChild(mk("rect", {
                x: bw + b * bw * 2, y: 2,
                width: bw * (1 + c % 2), height: Math.max(4, bh),
                fill: "#000"
              }));
            }
          }
          var bt = mk("text", {
            x: mm(el.width) / 2, y: mm(el.height) - 2,
            "text-anchor": "middle", "font-size": 5.5, fill: "#333", "font-family": "monospace"
          });
          bt.textContent = val;
          g.appendChild(bt);
        }
        break;

      case "line":
        g.appendChild(mk("line", {
          x1: 0, y1: 0, x2: mm(el.width), y2: mm(el.height),
          stroke: el.color || "#1a1f1d", "stroke-width": 1.5
        }));
        g.appendChild(mk("line", {
          x1: 0, y1: 0, x2: mm(el.width), y2: mm(el.height),
          stroke: "transparent", "stroke-width": 10
        }));
        break;

      case "image":
        g.appendChild(mk("rect", {
          x: 0, y: 0, width: mm(el.width), height: mm(el.height),
          fill: "#f0f0f0", stroke: "#999", "stroke-width": 0.5, "stroke-dasharray": "4,2"
        }));
        var it = mk("text", {
          x: mm(el.width) / 2, y: mm(el.height) / 2 + 3,
          "text-anchor": "middle", "font-size": 7, fill: "#888"
        });
        it.textContent = "IMG";
        g.appendChild(it);
        break;
    }
    return g;
  }

  function renderSelection() {
    if (!selectionG) return;
    selectionG.innerHTML = "";
    if (!selectedId) return;
    var el = findEl(selectedId);
    if (!el) return;
    var x = mm(el.x), y = mm(el.y), w = mm(el.width), h = mm(el.height);
    selectionG.appendChild(mk("rect", {
      x: x - 1, y: y - 1, width: w + 2, height: h + 2,
      fill: "none", stroke: "#0f7f6d", "stroke-width": 1.5, "stroke-dasharray": "4,2",
      "pointer-events": "none"
    }));
    getHandles(x, y, w, h).forEach(function (hd) {
      selectionG.appendChild(mk("rect", {
        x: hd.x - HS / 2, y: hd.y - HS / 2, width: HS, height: HS,
        fill: "#fff", stroke: "#0f7f6d", "stroke-width": 1,
        cursor: hd.cursor, "data-handle": hd.name
      }));
    });
  }

  function getHandles(x, y, w, h) {
    return [
      { name: "nw", x: x, y: y, cursor: "nw-resize" },
      { name: "n", x: x + w / 2, y: y, cursor: "n-resize" },
      { name: "ne", x: x + w, y: y, cursor: "ne-resize" },
      { name: "w", x: x, y: y + h / 2, cursor: "w-resize" },
      { name: "e", x: x + w, y: y + h / 2, cursor: "e-resize" },
      { name: "sw", x: x, y: y + h, cursor: "sw-resize" },
      { name: "s", x: x + w / 2, y: y + h, cursor: "s-resize" },
      { name: "se", x: x + w, y: y + h, cursor: "se-resize" }
    ];
  }

  function getSvgPt(e) {
    var pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function onDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    var pt = getSvgPt(e);
    var cx = pt.x - RULER, cy = pt.y - RULER;

    if (selectedId) {
      var sel = findEl(selectedId);
      if (sel) {
        var hds = getHandles(mm(sel.x), mm(sel.y), mm(sel.width), mm(sel.height));
        for (var i = 0; i < hds.length; i++) {
          if (Math.abs(cx - hds[i].x) < HS + 2 && Math.abs(cy - hds[i].y) < HS + 2) {
            drag = {
              type: "resize", handle: hds[i].name, el: sel,
              sx: cx, sy: cy, ox: sel.x, oy: sel.y, ow: sel.width, oh: sel.height
            };
            return;
          }
        }
      }
    }

    for (var j = elements.length - 1; j >= 0; j--) {
      var el = elements[j];
      var ex1 = mm(el.x) - 2, ey1 = mm(el.y) - 2;
      var ex2 = mm(el.x + el.width) + 2, ey2 = mm(el.y + el.height) + 2;
      if (el.type === "line") { ex1 -= 5; ey1 -= 5; ex2 += 5; ey2 += 5; }
      if (cx >= ex1 && cx <= ex2 && cy >= ey1 && cy <= ey2) {
        selectedId = el.id;
        drag = { type: "move", el: el, sx: cx, sy: cy, ox: el.x, oy: el.y };
        renderSelection();
        renderProps();
        return;
      }
    }

    selectedId = null;
    renderSelection();
    renderProps();
  }

  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    var pt = getSvgPt(e);
    var cx = pt.x - RULER, cy = pt.y - RULER;
    var dx = toMm(cx - drag.sx), dy = toMm(cy - drag.sy);

    if (drag.type === "move") {
      drag.el.x = snap(clamp(drag.ox + dx, 0, labelW - drag.el.width));
      drag.el.y = snap(clamp(drag.oy + dy, 0, labelH - drag.el.height));
    } else {
      var h = drag.handle;
      var nx = drag.ox, ny = drag.oy, nw = drag.ow, nh = drag.oh;
      if (h.indexOf("e") >= 0) nw = snap(Math.max(1, drag.ow + dx));
      if (h.indexOf("w") >= 0) { nx = snap(drag.ox + dx); nw = snap(Math.max(1, drag.ow - dx)); }
      if (h.indexOf("s") >= 0) nh = snap(Math.max(1, drag.oh + dy));
      if (h.indexOf("n") >= 0) { ny = snap(drag.oy + dy); nh = snap(Math.max(1, drag.oh - dy)); }
      nx = Math.max(0, nx);
      ny = Math.max(0, ny);
      if (nx + nw > labelW) nw = labelW - nx;
      if (ny + nh > labelH) nh = labelH - ny;
      drag.el.x = nx;
      drag.el.y = ny;
      drag.el.width = nw;
      drag.el.height = nh;
    }
    renderElements();
    renderSelection();
    renderProps();
  }

  function onUp() { drag = null; }

  function onDbl(e) {
    if (!selectedId) return;
    var el = findEl(selectedId);
    if (!el || el.type !== "text") return;
    if (editInput) editInput.blur();

    var svgRect = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    var sx = svgRect.width / vb.width;
    var sy = svgRect.height / vb.height;
    var ex = (RULER + mm(el.x)) * sx + svgRect.left;
    var ey = (RULER + mm(el.y)) * sy + svgRect.top;
    var ew = mm(el.width) * sx;
    var eh = mm(el.height) * sy;

    editInput = document.createElement("textarea");
    editInput.style.cssText = "position:fixed;left:" + ex + "px;top:" + ey + "px;width:" + ew + "px;height:" + eh + "px;font-size:" + Math.max(10, 14 * sx) + "px;border:2px solid #0f7f6d;background:#fff;z-index:9999;resize:none;padding:4px;font-family:Segoe UI,Arial";
    editInput.value = el.content || "";
    document.body.appendChild(editInput);
    editInput.focus();
    editInput.select();

    function done() {
      if (!editInput) return;
      el.content = editInput.value;
      var ref = editInput;
      editInput = null;
      if (ref.parentNode) ref.parentNode.removeChild(ref);
      renderElements();
      renderSelection();
      renderProps();
    }
    editInput.addEventListener("blur", done);
    editInput.addEventListener("keydown", function (ev) { if (ev.key === "Escape") done(); });
  }

  function renderProps() {
    if (!propsDiv) return;
    if (!selectedId) {
      propsDiv.innerHTML = '<div class="props-empty">Selecione um elemento</div>';
      return;
    }
    var el = findEl(selectedId);
    if (!el) { propsDiv.innerHTML = '<div class="props-empty">Selecione um elemento</div>'; return; }

    var typeNames = { text: "Texto", careSymbol: "S\u00edmbolo", barcode: "C\u00f3digo de barras", line: "Linha", image: "Imagem" };
    var h = '<div class="props-title">' + (typeNames[el.type] || el.type) + '</div>';
    h += propNum("X (mm)", "x", el.x);
    h += propNum("Y (mm)", "y", el.y);
    h += propNum("Largura", "width", el.width);
    h += propNum("Altura", "height", el.height);

    if (el.type === "text") {
      h += '<div class="props-field"><label>Conte\u00fado<textarea data-prop="content" rows="3">' + esc(el.content || "") + '</textarea></label></div>';
      h += propNum("Tamanho", "fontSize", el.fontSize || 14);
      h += '<div class="props-field"><label>Cor<input type="color" value="' + (el.color || "#151a18") + '" data-prop="color"></label></div>';
    } else if (el.type === "careSymbol") {
      var syms = window.CARE_SYMBOLS || {};
      h += '<div class="props-field"><label>S\u00edmbolo<select data-prop="careSymbolKey">';
      Object.keys(syms).forEach(function (k) {
        h += '<option value="' + k + '"' + (k === el.careSymbolKey ? " selected" : "") + '>' + esc(syms[k].label) + '</option>';
      });
      h += '</select></label></div>';
    } else if (el.type === "barcode") {
      h += '<div class="props-field"><label>Valor<input type="text" value="' + esc(el.barcodeValue || "") + '" data-prop="barcodeValue"></label></div>';
      h += '<div class="props-field"><label>Formato<select data-prop="barcodeFormat">';
      ["EAN13", "EAN8", "CODE128", "CODE39", "UPC"].forEach(function (f) {
        h += '<option value="' + f + '"' + (f === el.barcodeFormat ? " selected" : "") + '>' + f + '</option>';
      });
      h += '</select></label></div>';
    } else if (el.type === "line") {
      h += '<div class="props-field"><label>Cor<input type="color" value="' + (el.color || "#1a1f1d") + '" data-prop="color"></label></div>';
    }

    propsDiv.innerHTML = h;
    propsDiv.querySelectorAll("[data-prop]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var p = this.dataset.prop;
        if (p === "content" || p === "color" || p === "barcodeValue" || p === "careSymbolKey" || p === "barcodeFormat") {
          el[p] = this.value;
        } else {
          el[p] = parseFloat(this.value) || 0;
        }
        renderElements();
        renderSelection();
      });
    });
  }

  function propNum(label, prop, val) {
    return '<div class="props-field"><label>' + label + '<input type="number" step="0.5" value="' + val.toFixed(1) + '" data-prop="' + prop + '"></label></div>';
  }

  function addText() {
    elements.push({
      id: nextId++, type: "text", x: 2, y: 2,
      width: Math.min(labelW - 4, 20), height: 4,
      content: "Texto", font: "Segoe UI, Arial", fontSize: 14, color: "#151a18"
    });
    selectedId = elements[elements.length - 1].id;
    renderElements(); renderSelection(); renderProps();
  }

  function addCareSymbol() {
    var keys = Object.keys(window.CARE_SYMBOLS || {});
    elements.push({
      id: nextId++, type: "careSymbol", x: 2, y: labelH - 10,
      width: 6, height: 6, careSymbolKey: keys[0] || "wash-30"
    });
    selectedId = elements[elements.length - 1].id;
    renderElements(); renderSelection(); renderProps();
  }

  function addBarcode() {
    elements.push({
      id: nextId++, type: "barcode", x: 2, y: labelH * 0.5,
      width: labelW - 4, height: 8,
      barcodeValue: "7891234567890", barcodeFormat: "EAN13"
    });
    selectedId = elements[elements.length - 1].id;
    renderElements(); renderSelection(); renderProps();
  }

  function addLine() {
    elements.push({
      id: nextId++, type: "line", x: 2, y: labelH * 0.3,
      width: labelW - 4, height: 0, color: "#1a1f1d"
    });
    selectedId = elements[elements.length - 1].id;
    renderElements(); renderSelection(); renderProps();
  }

  function deleteSelected() {
    if (!selectedId) return;
    elements = elements.filter(function (e) { return e.id !== selectedId; });
    selectedId = null;
    renderElements(); renderSelection(); renderProps();
  }

  function zoomIn() {
    zoomLevel = Math.min(4, zoomLevel + 0.25);
    buildCanvas();
  }

  function zoomOut() {
    zoomLevel = Math.max(0.25, zoomLevel - 0.25);
    buildCanvas();
  }

  function loadFromEditor(editor) {
    elements = [];
    selectedId = null;
    labelW = editor.widthMm || 25;
    labelH = editor.heightMm || 55;
    nextId = 1;
    zoomLevel = 1;

    var margin = 2;
    var cw = labelW - margin * 2;
    var y = margin;

    if (editor.fabricName) {
      elements.push({
        id: nextId++, type: "text", x: margin, y: y, width: cw, height: 5,
        content: editor.fabricName, font: "Segoe UI, Arial", fontSize: 18, color: "#151a18", role: "fabricName"
      });
      y += 6;
    }
    elements.push({
      id: nextId++, type: "line", x: margin + 2, y: y, width: cw - 4, height: 0, color: "#1a1f1d", role: "separator"
    });
    y += 2;

    if (editor.composition) {
      var lines = editor.composition.split(/\n+/).filter(Boolean);
      lines.forEach(function (line, i) {
        elements.push({
          id: nextId++, type: "text", x: margin, y: y + i * 3.5, width: cw, height: 3,
          content: line, font: "Segoe UI, Arial", fontSize: 14, color: "#1c2420", role: "composition"
        });
      });
      y += lines.length * 3.5 + 2;
    }

    var careVariantSelects = document.querySelectorAll("[data-care-symbol]");
    var variantMap = {};
    careVariantSelects.forEach(function (s) { variantMap[s.dataset.careSymbol] = s.value; });
    var CARE_DEFAULTS = [
      ["wash", "wash-30"], ["bleach", "bleach"], ["iron", "iron-medium"], ["dry", "dry-tumble"]
    ];
    var activeCare = CARE_DEFAULTS.filter(function (d) { return editor.care.has(d[0]); });
    if (activeCare.length) {
      var symSize = Math.min(6, (cw - activeCare.length) / activeCare.length);
      var totalW = activeCare.length * (symSize + 1) - 1;
      var startX = (labelW - totalW) / 2;
      var careY = labelH - margin - symSize - 10;
      activeCare.forEach(function (d, i) {
        elements.push({
          id: nextId++, type: "careSymbol",
          x: startX + i * (symSize + 1), y: careY, width: symSize, height: symSize,
          careSymbolKey: variantMap[d[0]] || d[1], role: "careSymbol"
        });
      });
    }

    if (editor.notes) {
      var noteLines = editor.notes.split(/\n+/).filter(Boolean);
      var notesY = labelH - margin - noteLines.length * 2.5;
      noteLines.forEach(function (line, i) {
        elements.push({
          id: nextId++, type: "text", x: margin, y: notesY + i * 2.5, width: cw, height: 2.5,
          content: line, font: "Segoe UI, Arial", fontSize: 10, color: "#39443f", role: "notes"
        });
      });
    }

    if (editor.barcodeEnabled && editor.barcodeValue) {
      elements.push({
        id: nextId++, type: "barcode", x: margin + 1, y: labelH * 0.65,
        width: cw - 2, height: 8,
        barcodeValue: editor.barcodeValue, barcodeFormat: editor.barcodeFormat || "EAN13", role: "barcode"
      });
    }

    buildCanvas();
    renderProps();
  }

  function saveToEditor(editor) {
    var fabEl = elements.find(function (e) { return e.role === "fabricName"; });
    if (fabEl) editor.fabricName = fabEl.content || editor.fabricName;

    var compEls = elements.filter(function (e) { return e.role === "composition"; });
    if (compEls.length) editor.composition = compEls.map(function (e) { return e.content; }).join("\n");

    var notesEl = elements.find(function (e) { return e.role === "notes"; });
    if (notesEl) editor.notes = notesEl.content || editor.notes;

    var careEls = elements.filter(function (e) { return e.type === "careSymbol"; });
    if (careEls.length) {
      var syms = window.CARE_SYMBOLS || {};
      var newCare = new Set();
      var gmap = { wash: "wash", bleach: "bleach", iron: "iron", tumble: "dry", drying: "dry" };
      careEls.forEach(function (el) {
        var s = syms[el.careSymbolKey];
        if (s) { var g = gmap[s.group] || s.group; if (g) newCare.add(g); }
      });
      editor.care = newCare;
    }

    var bcEl = elements.find(function (e) { return e.role === "barcode"; });
    if (bcEl) {
      editor.barcodeEnabled = true;
      editor.barcodeValue = bcEl.barcodeValue;
      editor.barcodeFormat = bcEl.barcodeFormat;
    } else {
      editor.barcodeEnabled = false;
    }
  }

  function getSvg() {
    var s = 7.5;
    var w = labelW * s, h = labelH * s;
    var p = [];
    p.push('<svg class="label-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">');
    p.push('<rect x="0.5" y="0.5" width="' + (w - 1) + '" height="' + (h - 1) + '" rx="4" fill="#fff" stroke="#1a1f1d" stroke-width="1"/>');

    elements.forEach(function (el) {
      var ex = el.x * s, ey = el.y * s, ew = el.width * s, eh = el.height * s;
      switch (el.type) {
        case "text":
          var fs = Math.max(3, Math.min((el.fontSize || 14) * s * 0.28, eh * 0.85));
          p.push('<text x="' + (ex + ew / 2) + '" y="' + (ey + eh / 2 + fs * 0.35) + '" text-anchor="middle" font-family="' + (el.font || "Segoe UI, Arial") + '" font-size="' + fs + '" font-weight="600" fill="' + (el.color || "#151a18") + '">' + esc(el.content || "") + '</text>');
          break;
        case "careSymbol":
          p.push('<g transform="translate(' + ex + ',' + ey + ')">');
          p.push('<rect width="' + ew + '" height="' + eh + '" rx="3" fill="#fff" stroke="#1a1f1d" stroke-width="1"/>');
          var syms2 = window.CARE_SYMBOLS || {};
          var sym2 = syms2[el.careSymbolKey];
          if (sym2) {
            var inner = sym2.svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");
            p.push('<g transform="scale(' + ((ew - 4) / 40) + ')" transform-origin="2 2">' + inner + '</g>');
          }
          p.push('</g>');
          break;
        case "barcode":
          p.push('<g transform="translate(' + ex + ',' + ey + ')">');
          p.push('<rect width="' + ew + '" height="' + eh + '" fill="#fff" stroke="#888" stroke-width="0.5" rx="1"/>');
          var bv = el.barcodeValue || "";
          if (bv.length > 0) {
            var bn = Math.min(bv.length, 40);
            var bbw = ew / (bn * 2 + 2);
            var bbh = eh - 14;
            for (var b = 0; b < bn; b++) {
              var bc = bv.charCodeAt(b % bv.length);
              if (bc % 3 !== 0) {
                p.push('<rect x="' + (bbw + b * bbw * 2) + '" y="2" width="' + (bbw * (1 + bc % 2)) + '" height="' + Math.max(4, bbh) + '" fill="#000"/>');
              }
            }
            p.push('<text x="' + (ew / 2) + '" y="' + (eh - 2) + '" text-anchor="middle" font-size="5.5" fill="#333" font-family="monospace">' + esc(bv) + '</text>');
          }
          p.push('</g>');
          break;
        case "line":
          p.push('<line x1="' + ex + '" y1="' + ey + '" x2="' + (ex + ew) + '" y2="' + (ey + eh) + '" stroke="' + (el.color || "#1a1f1d") + '" stroke-width="1.5"/>');
          break;
      }
    });
    p.push('</svg>');
    return p.join("\n");
  }

  window.CanvasDesigner = {
    init: init,
    loadFromEditor: loadFromEditor,
    saveToEditor: saveToEditor,
    getSvg: getSvg,
    addText: addText,
    addCareSymbol: addCareSymbol,
    addBarcode: addBarcode,
    addLine: addLine,
    deleteSelected: deleteSelected,
    zoomIn: zoomIn,
    zoomOut: zoomOut
  };
})();
