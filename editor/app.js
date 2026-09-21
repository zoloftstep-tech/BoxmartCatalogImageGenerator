const INK = "#333333";
const AXIS = "#666666";
const FEFCO_BLUE = "#415ac1";
const CHIP_BG = "rgba(255,255,255,0.92)";
const CHIP_BORDER = "#ebebeb";
const FEFCO_BG = "rgba(51,51,51,0.70)";
const HANDLE = 8;
const ROT_HANDLE = 28;
const DIM_SIZE = 13;
const AXIS_SIZE = 11;
const FEFCO_SIZE = 13;

const FONT_AXIS = `${AXIS_SIZE}px "Fira Sans", sans-serif`;
const FONT_DIM = `500 ${DIM_SIZE}px "Fira Code", monospace`;
const FONT_FEFCO = `600 ${FEFCO_SIZE}px "Fira Sans", sans-serif`;
const FONT_PLAIN = `500 13px "Fira Sans", sans-serif`;

const state = {
  tool: "select",
  image: null,
  items: [],
  selectedId: null,
  drag: null,
  history: [],
  future: [],
  dpr: Math.max(1, window.devicePixelRatio || 1),
  fontsReady: false,
};

const els = {
  canvas: document.getElementById("canvas"),
  empty: document.getElementById("empty"),
  fileInput: document.getElementById("fileInput"),
  clearImage: document.getElementById("clearImage"),
  prefix: document.getElementById("prefix"),
  value: document.getElementById("value"),
  unit: document.getElementById("unit"),
  plaque: document.getElementById("plaque"),
  hint: document.getElementById("hint"),
  selectedPanel: document.getElementById("selectedPanel"),
  selText: document.getElementById("selText"),
  selLength: document.getElementById("selLength"),
  selAngle: document.getElementById("selAngle"),
  deleteSel: document.getElementById("deleteSel"),
  bringFront: document.getElementById("bringFront"),
  undo: document.getElementById("undo"),
  redo: document.getElementById("redo"),
  exportPng: document.getElementById("exportPng"),
};

const ctx = els.canvas.getContext("2d");

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function buildLabelParts() {
  const prefix = els.prefix.value.trim();
  const value = els.value.value.trim();
  const unit = els.unit.value.trim();
  if (prefix === "FEFCO") {
    return {
      style: "fefco",
      axis: "",
      value: value || "0427",
      unit: "",
      text: `FEFCO ${value || "0427"}`.trim(),
      plaque: els.plaque.checked,
    };
  }
  if (prefix === "Д" || prefix === "Ш" || prefix === "В") {
    return {
      style: "dim",
      axis: prefix,
      value,
      unit: unit || "мм",
      text: [prefix, value, unit || "мм"].filter(Boolean).join(" "),
      plaque: true,
    };
  }
  return {
    style: "plain",
    axis: "",
    value,
    unit,
    text: [value, unit].filter(Boolean).join(" "),
    plaque: els.plaque.checked,
  };
}

function buildLabel() {
  return buildLabelParts().text;
}

function parseLabelParts(item) {
  if (item.style) {
    return {
      style: item.style,
      axis: item.axis || "",
      value: item.value || "",
      unit: item.unit || "",
      text: item.text,
      plaque: !!item.plaque,
    };
  }
  const t = String(item.text || "").trim();
  if (/^fefco\b/i.test(t)) {
    return {
      style: "fefco",
      axis: "",
      value: t.replace(/^fefco\s*/i, "").trim(),
      unit: "",
      text: t.toUpperCase(),
      plaque: !!item.plaque,
    };
  }
  const m = t.match(/^([ДШВ])\s+(.+?)(?:\s+(мм|cm|m))?$/i);
  if (m) {
    return {
      style: "dim",
      axis: m[1],
      value: m[2],
      unit: m[3] || "мм",
      text: t,
      plaque: true,
    };
  }
  return {
    style: "plain",
    axis: "",
    value: t,
    unit: "",
    text: t,
    plaque: !!item.plaque,
  };
}

function pushHistory() {
  state.history.push(JSON.stringify(state.items));
  if (state.history.length > 80) state.history.shift();
  state.future = [];
}

function restore(snapshot) {
  state.items = JSON.parse(snapshot);
  state.selectedId = null;
  syncSelectedPanel();
  draw();
}

function undo() {
  if (!state.history.length) return;
  state.future.push(JSON.stringify(state.items));
  restore(state.history.pop());
}

function redo() {
  if (!state.future.length) return;
  state.history.push(JSON.stringify(state.items));
  restore(state.future.pop());
}

function setCanvasSize(w, h) {
  const dpr = state.dpr;
  els.canvas.width = Math.round(w * dpr);
  els.canvas.height = Math.round(h * dpr);
  els.canvas.style.width = `${w}px`;
  els.canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fitImage(img) {
  const maxW = Math.min(1100, window.innerWidth - 360);
  const maxH = window.innerHeight - 48;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  return {
    w: Math.round(img.width * scale),
    h: Math.round(img.height * scale),
    scale,
  };
}

function pointer(e) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * (els.canvas.width / state.dpr),
    y: ((e.clientY - rect.top) / rect.height) * (els.canvas.height / state.dpr),
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function itemById(id) {
  return state.items.find((it) => it.id === id);
}

function selected() {
  return itemById(state.selectedId);
}

function normalizeTextAngle(deg) {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  // keep text mostly upright
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

function lineAngleDeg(x1, y1, x2, y2) {
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}

function defaultLabelPose(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  return {
    labelX: mx + px * 20,
    labelY: my + py * 20,
    labelAngle: normalizeTextAngle(lineAngleDeg(x1, y1, x2, y2)),
  };
}

function ensureLabelPose(item) {
  if (item.type !== "dim") return;
  if (item.labelX == null || item.labelY == null || item.labelAngle == null) {
    const pose = defaultLabelPose(item.x1, item.y1, item.x2, item.y2);
    item.labelX = pose.labelX;
    item.labelY = pose.labelY;
    item.labelAngle = pose.labelAngle;
  }
}

function rotHandlePos(item) {
  const ang = ((item.labelAngle || 0) * Math.PI) / 180;
  return {
    x: item.labelX + Math.cos(ang) * ROT_HANDLE,
    y: item.labelY + Math.sin(ang) * ROT_HANDLE,
  };
}

function measureDimChip(c, parts) {
  c.font = `500 ${AXIS_SIZE}px "Fira Sans", sans-serif`;
  const axisW = parts.axis ? c.measureText(parts.axis).width : 0;
  c.font = FONT_DIM;
  const valueText = [parts.value, parts.unit].filter(Boolean).join(" ");
  const valW = c.measureText(valueText).width;
  const gap = parts.axis ? 6 : 0;
  const padX = 10;
  const padY = 6;
  const innerH = Math.max(AXIS_SIZE, DIM_SIZE);
  return {
    tw: axisW + gap + valW,
    th: innerH,
    axisW,
    gap,
    valueText,
    padX,
    padY,
    boxW: axisW + gap + valW + padX * 2,
    boxH: innerH + padY * 2,
  };
}

function measureFefco(c, parts) {
  const raw = `FEFCO ${parts.value}`.trim().toUpperCase();
  const tracking = 1.2;
  c.font = FONT_FEFCO;
  let w = 0;
  for (let i = 0; i < raw.length; i++) {
    w += c.measureText(raw[i]).width;
    if (i < raw.length - 1) w += tracking;
  }
  return { text: raw, tw: w, th: FEFCO_SIZE, tracking, padX: 10, padY: 6 };
}

function measurePlain(c, parts) {
  c.font = FONT_PLAIN;
  const tw = c.measureText(parts.text).width;
  return { tw, th: 13, padX: 10, padY: 6 };
}

function measureLabel(c, item) {
  const parts = parseLabelParts(item);
  if (parts.style === "dim") return { parts, ...measureDimChip(c, parts) };
  if (parts.style === "fefco") return { parts, ...measureFefco(c, parts) };
  return { parts, ...measurePlain(c, parts) };
}

function drawTrackedText(c, text, x, y, tracking) {
  let cx = x;
  for (let i = 0; i < text.length; i++) {
    c.fillText(text[i], cx, y);
    cx += c.measureText(text[i]).width + tracking;
  }
}

function drawArrowhead(c, tipX, tipY, fromX, fromY, size = 10) {
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  c.beginPath();
  c.moveTo(tipX, tipY);
  c.lineTo(
    tipX - size * Math.cos(angle - Math.PI / 7),
    tipY - size * Math.sin(angle - Math.PI / 7),
  );
  c.lineTo(
    tipX - size * Math.cos(angle + Math.PI / 7),
    tipY - size * Math.sin(angle + Math.PI / 7),
  );
  c.closePath();
  c.fill();
}

function drawAnnotationLabel(c, item, showHandles) {
  const m = measureLabel(c, item);
  const parts = m.parts;
  const angle = ((item.labelAngle || 0) * Math.PI) / 180;
  const lx = item.labelX;
  const ly = item.labelY;

  c.save();
  c.translate(lx, ly);
  c.rotate(angle);
  c.textBaseline = "middle";

  if (parts.style === "dim") {
    const boxX = -m.padX;
    const boxY = -m.boxH / 2;
    c.fillStyle = CHIP_BG;
    roundRect(c, boxX, boxY, m.boxW, m.boxH, 8);
    c.fill();
    c.strokeStyle = CHIP_BORDER;
    c.lineWidth = 1;
    c.stroke();

    let x = 0;
    if (parts.axis) {
      c.font = `500 ${AXIS_SIZE}px "Fira Sans", sans-serif`;
      c.fillStyle = AXIS;
      c.fillText(parts.axis, x, 0);
      x += m.axisW + m.gap;
    }
    c.font = FONT_DIM;
    c.fillStyle = INK;
    c.fillText(m.valueText, x, 0);
  } else if (parts.style === "fefco") {
    if (parts.plaque) {
      const boxW = m.tw + m.padX * 2;
      const boxH = m.th + m.padY * 2;
      c.fillStyle = FEFCO_BG;
      roundRect(c, -m.padX, -boxH / 2, boxW, boxH, 8);
      c.fill();
      c.fillStyle = "#ffffff";
    } else {
      c.fillStyle = FEFCO_BLUE;
    }
    c.font = FONT_FEFCO;
    drawTrackedText(c, m.text, 0, 0, m.tracking);
  } else {
    if (parts.plaque) {
      const boxW = m.tw + m.padX * 2;
      const boxH = m.th + m.padY * 2;
      c.fillStyle = CHIP_BG;
      roundRect(c, -m.padX, -boxH / 2, boxW, boxH, 8);
      c.fill();
      c.strokeStyle = CHIP_BORDER;
      c.lineWidth = 1;
      c.stroke();
    }
    c.font = FONT_PLAIN;
    c.fillStyle = INK;
    c.fillText(parts.text, 0, 0);
  }

  c.restore();

  if (showHandles) {
    drawHandle(c, lx, ly);
    const rh = rotHandlePos(item);
    c.strokeStyle = varAccent();
    c.fillStyle = "#fff";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(lx, ly);
    c.lineTo(rh.x, rh.y);
    c.stroke();
    c.beginPath();
    c.arc(rh.x, rh.y, 6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  return m;
}

function drawDim(c, item, showHandles) {
  ensureLabelPose(item);
  const { x1, y1, x2, y2 } = item;
  c.strokeStyle = INK;
  c.fillStyle = INK;
  c.lineWidth = 2;
  c.lineCap = "round";

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const tick = 10;
  c.beginPath();
  c.moveTo(x1 + px * tick, y1 + py * tick);
  c.lineTo(x1 - px * tick, y1 - py * tick);
  c.moveTo(x2 + px * tick, y2 + py * tick);
  c.lineTo(x2 - px * tick, y2 - py * tick);
  c.stroke();

  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  drawArrowhead(c, x1, y1, x2, y2);
  drawArrowhead(c, x2, y2, x1, y1);

  drawAnnotationLabel(c, item, showHandles);

  if (showHandles) {
    drawHandle(c, x1, y1);
    drawHandle(c, x2, y2);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    drawHandle(c, mx, my);
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawLabel(c, item, showHandles) {
  if (item.labelAngle == null) item.labelAngle = 0;
  const pose = {
    ...item,
    labelX: item.x,
    labelY: item.y,
    labelAngle: item.labelAngle,
  };
  drawAnnotationLabel(c, pose, showHandles);
}

function drawHandle(c, x, y) {
  c.fillStyle = "#fff";
  c.strokeStyle = varAccent();
  c.lineWidth = 2;
  c.beginPath();
  c.rect(x - HANDLE / 2, y - HANDLE / 2, HANDLE, HANDLE);
  c.fill();
  c.stroke();
}

function varAccent() {
  return "#415ac1";
}

function draw() {
  const w = els.canvas.width / state.dpr;
  const h = els.canvas.height / state.dpr;
  ctx.clearRect(0, 0, w, h);

  if (!state.image) {
    els.empty.classList.remove("hidden");
    return;
  }
  els.empty.classList.add("hidden");
  ctx.drawImage(state.image, 0, 0, w, h);

  for (const item of state.items) {
    const sel = item.id === state.selectedId;
    if (item.type === "dim") drawDim(ctx, item, sel);
    else drawLabel(ctx, item, sel);
  }

  if (state.drag?.preview) {
    const p = state.drag.preview;
    ctx.save();
    ctx.globalAlpha = 0.7;
    if (p.type === "dim") drawDim(ctx, p, false);
    ctx.restore();
  }
}

function pointInRotatedLabel(p, item) {
  const lx = item.type === "dim" ? item.labelX : item.x;
  const ly = item.type === "dim" ? item.labelY : item.y;
  const ang = ((item.labelAngle || 0) * Math.PI) / 180;
  const probe = item.type === "dim" ? item : { ...item, labelX: item.x, labelY: item.y };
  const m = measureLabel(ctx, probe);
  const boxW = m.boxW || m.tw + (m.padX || 0) * 2;
  const boxH = m.boxH || m.th + (m.padY || 0) * 2;
  const dx = p.x - lx;
  const dy = p.y - ly;
  const localX = dx * Math.cos(-ang) - dy * Math.sin(-ang);
  const localY = dx * Math.sin(-ang) + dy * Math.cos(-ang);
  return localX >= -8 && localX <= boxW - (m.padX || 0) + 8 && localY >= -boxH / 2 - 4 && localY <= boxH / 2 + 4;
}

function hitTest(p) {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    if (item.type === "dim") {
      ensureLabelPose(item);
      const rh = rotHandlePos(item);
      if (dist(p, rh) <= 10) return { item, handle: "label-rot" };
      if (pointInRotatedLabel(p, item) || dist(p, { x: item.labelX, y: item.labelY }) <= 12) {
        return { item, handle: "label-move" };
      }
      if (dist(p, { x: item.x1, y: item.y1 }) <= 12) return { item, handle: "a" };
      if (dist(p, { x: item.x2, y: item.y2 }) <= 12) return { item, handle: "b" };
      const mx = (item.x1 + item.x2) / 2;
      const my = (item.y1 + item.y2) / 2;
      if (dist(p, { x: mx, y: my }) <= 12) return { item, handle: "move" };
      if (distToSegment(p, item) < 8) return { item, handle: "move" };
    } else {
      if (item.labelAngle == null) item.labelAngle = 0;
      const rh = {
        x: item.x + Math.cos(((item.labelAngle || 0) * Math.PI) / 180) * ROT_HANDLE,
        y: item.y + Math.sin(((item.labelAngle || 0) * Math.PI) / 180) * ROT_HANDLE,
      };
      if (dist(p, rh) <= 10) return { item, handle: "label-rot" };
      if (pointInRotatedLabel(p, item)) return { item, handle: "move" };
    }
  }
  return null;
}

function distToSegment(p, item) {
  const { x1, y1, x2, y2 } = item;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((p.x - x1) * dx + (p.y - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}

function syncSelectedPanel() {
  const item = selected();
  if (!item) {
    els.selectedPanel.hidden = true;
    return;
  }
  els.selectedPanel.hidden = false;
  els.selText.value = item.text;
  if (item.type === "dim") {
    ensureLabelPose(item);
    els.selLength.disabled = false;
    els.selLength.value = Math.round(Math.hypot(item.x2 - item.x1, item.y2 - item.y1));
    els.selAngle.value = Math.round(item.labelAngle || 0);
  } else {
    els.selLength.disabled = true;
    els.selLength.value = "";
    els.selAngle.value = Math.round(item.labelAngle || 0);
  }
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll(".tool").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  els.canvas.classList.toggle("select-mode", tool === "select");
  const hints = {
    select: "Текст — двигать подпись. Круглая ручка — угол. Квадраты на стрелках — концы/сдвиг линии.",
    "dim-h": "Горизонтальный размер. Shift — свободный угол.",
    "dim-v": "Вертикальный размер. Shift — свободный угол.",
    "dim-free": "Протяните размер под любым углом.",
    label: "Кликните, куда поставить текст/плашку.",
    fefco: "Кликните, куда поставить FEFCO.",
  };
  els.hint.textContent = hints[tool] || "";
  if (tool === "fefco") {
    els.prefix.value = "FEFCO";
    els.unit.value = "";
    if (!els.value.value || els.value.value === "450") els.value.value = "0427";
  }
  if (tool === "dim-h" || tool === "dim-free") {
    els.prefix.value = "Д";
    els.unit.value = "мм";
  }
  if (tool === "dim-v") {
    els.prefix.value = "В";
    els.unit.value = "мм";
  }
}

function makeDimPreview(x1, y1, x2, y2) {
  const pose = defaultLabelPose(x1, y1, x2, y2);
  const parts = buildLabelParts();
  return {
    type: "dim",
    x1,
    y1,
    x2,
    y2,
    style: parts.style === "plain" ? "dim" : parts.style,
    axis: parts.axis || els.prefix.value.trim() || "Д",
    value: parts.value,
    unit: parts.unit || "мм",
    text: parts.text,
    plaque: true,
    ...pose,
  };
}

function onPointerDown(e) {
  if (!state.image) return;
  const p = pointer(e);
  els.canvas.setPointerCapture?.(e.pointerId);

  if (state.tool === "select") {
    const hit = hitTest(p);
    if (!hit) {
      state.selectedId = null;
      syncSelectedPanel();
      draw();
      return;
    }
    state.selectedId = hit.item.id;
    syncSelectedPanel();
    state.drag = {
      mode: hit.handle,
      id: hit.item.id,
      start: p,
      orig: JSON.parse(JSON.stringify(hit.item)),
    };
    draw();
    return;
  }

  if (state.tool === "dim-h" || state.tool === "dim-v" || state.tool === "dim-free") {
    const axis =
      state.tool === "dim-free" ? "free" : state.tool === "dim-h" ? "h" : "v";
    state.drag = {
      mode: "create-dim",
      axis,
      start: p,
      shift: e.shiftKey,
      preview: makeDimPreview(p.x, p.y, p.x, p.y),
    };
    return;
  }

  if (state.tool === "label" || state.tool === "fefco") {
    pushHistory();
    const parts = buildLabelParts();
    if (state.tool === "fefco") {
      parts.style = "fefco";
      parts.text = `FEFCO ${parts.value || "0427"}`;
      parts.plaque = els.plaque.checked;
    }
    const item = {
      id: uid(),
      type: "label",
      x: p.x,
      y: p.y,
      style: parts.style,
      axis: parts.axis,
      value: parts.value,
      unit: parts.unit,
      text: parts.text,
      plaque: parts.plaque,
      labelAngle: 0,
    };
    state.items.push(item);
    state.selectedId = item.id;
    setTool("select");
    syncSelectedPanel();
    draw();
  }
}

function onPointerMove(e) {
  if (!state.drag) return;
  const p = pointer(e);

  if (state.drag.mode === "create-dim") {
    const s = state.drag.start;
    let x2 = p.x;
    let y2 = p.y;
    const free = state.drag.axis === "free" || e.shiftKey;
    if (!free) {
      if (state.drag.axis === "h") y2 = s.y;
      else x2 = s.x;
    }
    state.drag.preview = makeDimPreview(s.x, s.y, x2, y2);
    draw();
    return;
  }

  const item = itemById(state.drag.id);
  if (!item) return;
  const o = state.drag.orig;
  const dx = p.x - state.drag.start.x;
  const dy = p.y - state.drag.start.y;

  if (item.type === "dim") {
    ensureLabelPose(item);
    if (state.drag.mode === "a") {
      item.x1 = o.x1 + dx;
      item.y1 = o.y1 + dy;
    } else if (state.drag.mode === "b") {
      item.x2 = o.x2 + dx;
      item.y2 = o.y2 + dy;
    } else if (state.drag.mode === "label-move") {
      item.labelX = o.labelX + dx;
      item.labelY = o.labelY + dy;
    } else if (state.drag.mode === "label-rot") {
      item.labelAngle = (Math.atan2(p.y - item.labelY, p.x - item.labelX) * 180) / Math.PI;
    } else if (state.drag.mode === "move") {
      item.x1 = o.x1 + dx;
      item.y1 = o.y1 + dy;
      item.x2 = o.x2 + dx;
      item.y2 = o.y2 + dy;
      item.labelX = o.labelX + dx;
      item.labelY = o.labelY + dy;
    }
  } else if (state.drag.mode === "move") {
    item.x = o.x + dx;
    item.y = o.y + dy;
  } else if (state.drag.mode === "label-rot") {
    item.labelAngle = (Math.atan2(p.y - item.y, p.x - item.x) * 180) / Math.PI;
  }

  syncSelectedPanel();
  draw();
}

function onPointerUp() {
  if (!state.drag) return;

  if (state.drag.mode === "create-dim" && state.drag.preview) {
    const pr = state.drag.preview;
    if (Math.hypot(pr.x2 - pr.x1, pr.y2 - pr.y1) > 16) {
      pushHistory();
      const item = { id: uid(), ...pr };
      state.items.push(item);
      state.selectedId = item.id;
      setTool("select");
      syncSelectedPanel();
    }
  } else if (state.drag.id) {
    const cur = itemById(state.drag.id);
    const o = state.drag.orig;
    if (cur && JSON.stringify(cur) !== JSON.stringify(o)) {
      state.history.push(JSON.stringify(state.items.map((it) => (it.id === o.id ? o : it))));
      if (state.history.length > 80) state.history.shift();
      state.future = [];
    }
  }

  state.drag = null;
  draw();
}

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.image = img;
    state.items = [];
    state.selectedId = null;
    state.history = [];
    state.future = [];
    const { w, h } = fitImage(img);
    setCanvasSize(w, h);
    els.clearImage.disabled = false;
    syncSelectedPanel();
    draw();
  };
  img.src = url;
});

els.clearImage.addEventListener("click", () => {
  state.image = null;
  state.items = [];
  state.selectedId = null;
  setCanvasSize(640, 420);
  els.clearImage.disabled = true;
  els.fileInput.value = "";
  syncSelectedPanel();
  draw();
});

document.querySelectorAll(".tool").forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

els.selText.addEventListener("input", () => {
  const item = selected();
  if (!item) return;
  item.text = els.selText.value;
  const parsed = parseLabelParts({ text: item.text, plaque: item.plaque });
  item.style = parsed.style;
  item.axis = parsed.axis;
  item.value = parsed.value;
  item.unit = parsed.unit;
  if (parsed.style === "dim") item.plaque = true;
  draw();
});

els.selLength.addEventListener("change", () => {
  const item = selected();
  if (!item || item.type !== "dim") return;
  const len = Number(els.selLength.value);
  if (!Number.isFinite(len) || len < 20) return;
  pushHistory();
  ensureLabelPose(item);
  const dx = item.x2 - item.x1;
  const dy = item.y2 - item.y1;
  const cur = Math.hypot(dx, dy) || 1;
  const ux = dx / cur;
  const uy = dy / cur;
  const mx = (item.x1 + item.x2) / 2;
  const my = (item.y1 + item.y2) / 2;
  item.x1 = mx - (ux * len) / 2;
  item.y1 = my - (uy * len) / 2;
  item.x2 = mx + (ux * len) / 2;
  item.y2 = my + (uy * len) / 2;
  draw();
});

els.selAngle.addEventListener("input", () => {
  const item = selected();
  if (!item) return;
  const ang = Number(els.selAngle.value);
  if (!Number.isFinite(ang)) return;
  if (item.type === "dim") {
    ensureLabelPose(item);
    item.labelAngle = ang;
  } else {
    item.labelAngle = ang;
  }
  draw();
});

els.deleteSel.addEventListener("click", () => {
  const item = selected();
  if (!item) return;
  pushHistory();
  state.items = state.items.filter((it) => it.id !== item.id);
  state.selectedId = null;
  syncSelectedPanel();
  draw();
});

els.bringFront.addEventListener("click", () => {
  const item = selected();
  if (!item) return;
  pushHistory();
  state.items = [...state.items.filter((it) => it.id !== item.id), item];
  draw();
});

els.undo.addEventListener("click", undo);
els.redo.addEventListener("click", redo);

els.exportPng.addEventListener("click", () => {
  if (!state.image) return;
  const prev = state.selectedId;
  state.selectedId = null;
  draw();
  const a = document.createElement("a");
  a.download = "catalog-annotate.png";
  a.href = els.canvas.toDataURL("image/png");
  a.click();
  state.selectedId = prev;
  draw();
});

els.canvas.addEventListener("pointerdown", onPointerDown);
els.canvas.addEventListener("pointermove", onPointerMove);
els.canvas.addEventListener("pointerup", onPointerUp);
els.canvas.addEventListener("pointercancel", onPointerUp);

window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") return;
    els.deleteSel.click();
  }
  if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") return;
  if (e.key === "v") setTool("select");
  if (e.key === "h") setTool("dim-h");
  if (e.key === "j") setTool("dim-v");
  if (e.key === "f") setTool("dim-free");
  if (e.key === "t") setTool("label");
});

setCanvasSize(640, 420);
setTool("select");

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    state.fontsReady = true;
    draw();
  });
}
draw();
