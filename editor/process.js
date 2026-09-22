/**
 * Local bg-remove + studio composite (no API keys).
 * Uses @imgly/background-removal from CDN on first run (downloads model ~40MB once).
 */

const IMG_LY_VERSION = "1.5.8";
const ESM_URL = `https://esm.sh/@imgly/background-removal@${IMG_LY_VERSION}`;

let removeBackgroundFn = null;

async function getRemoveBackground() {
  if (removeBackgroundFn) return removeBackgroundFn;
  const mod = await import(ESM_URL);
  removeBackgroundFn = mod.removeBackground || mod.default;
  if (typeof removeBackgroundFn !== "function") {
    throw new Error("Не удалось загрузить @imgly/background-removal");
  }
  return removeBackgroundFn;
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть результат вырезки"));
    };
    img.src = url;
  });
}

function alphaBBox(img) {
  const c = document.createElement("canvas");
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return { x: 0, y: 0, w, h };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Place cutout on studio background.
 * @param {HTMLImageElement} cutout
 * @param {"assembled"|"diecut"} kind
 * @returns {string} data URL (PNG)
 */
export function compositeOnStudio(cutout, kind = "assembled") {
  const bbox = alphaBBox(cutout);
  const subject = document.createElement("canvas");
  subject.width = bbox.w;
  subject.height = bbox.h;
  subject.getContext("2d").drawImage(
    cutout,
    bbox.x,
    bbox.y,
    bbox.w,
    bbox.h,
    0,
    0,
    bbox.w,
    bbox.h,
  );

  const padding = 0.14;
  const maxSide = 1600;
  const fit = Math.min(maxSide / bbox.w, maxSide / bbox.h, 1);
  const sw = Math.max(1, Math.round(bbox.w * fit));
  const sh = Math.max(1, Math.round(bbox.h * fit));
  const canvasSide = Math.max(
    Math.round(Math.max(sw, sh) / (1 - 2 * padding)),
    Math.max(sw, sh) + 80,
  );

  const out = document.createElement("canvas");
  out.width = canvasSide;
  out.height = canvasSide;
  const ctx = out.getContext("2d");

  const bg = kind === "diecut" ? "#FFFFFF" : "#F5F5F5";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasSide, canvasSide);

  const x = Math.round((canvasSide - sw) / 2);
  const y = Math.round((canvasSide - sh) / 2);

  if (kind === "assembled") {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.22)";
    ctx.shadowBlur = Math.max(18, Math.round(canvasSide * 0.02));
    ctx.shadowOffsetY = Math.max(8, Math.round(canvasSide * 0.01));
    ctx.drawImage(subject, x, y, sw, sh);
    ctx.restore();
  } else {
    ctx.drawImage(subject, x, y, sw, sh);
  }

  return out.toDataURL("image/png");
}

/**
 * @param {string|Blob|HTMLImageElement} source
 * @param {"assembled"|"diecut"} kind
 * @param {(msg: string) => void} onProgress
 */
export async function processCatalogPhoto(source, kind, onProgress = () => {}) {
  onProgress("Загрузка модели вырезки (первый раз ~40 МБ)…");
  const removeBackground = await getRemoveBackground();

  let input = source;
  if (source instanceof HTMLImageElement) {
    const c = document.createElement("canvas");
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
    input = await new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
  }

  onProgress("Вырезаю фон…");
  const blob = await removeBackground(input, {
    progress: (key, current, total) => {
      if (!total) return;
      const pct = Math.round((current / total) * 100);
      onProgress(`Модель: ${key} ${pct}%`);
    },
  });

  onProgress("Собираю студийный кадр…");
  const cutout = await loadImageFromBlob(blob);
  return compositeOnStudio(cutout, kind);
}
