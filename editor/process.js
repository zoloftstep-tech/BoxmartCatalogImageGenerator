/**
 * Local bg-remove + studio composite (no API keys).
 * Uses @imgly/background-removal from CDN on first run (downloads model once).
 */

const IMG_LY_VERSION = "1.5.8";
const ESM_URL = `https://esm.sh/@imgly/background-removal@${IMG_LY_VERSION}`;

/** Full-precision model — sharper edges than default isnet_fp16 / quint8. */
const MODEL = "isnet";
const MAX_INPUT_SIDE = 2800;

/** Studio canvas (assembled). Match catalog look — not pure white. */
const BG_ASSEMBLED = "#F5F5F5";
const BG_DIECUT = "#FFFFFF";

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

/**
 * Keep resolution; only shrink huge phone photos. Prefer PNG (no JPEG fringe).
 * @param {HTMLImageElement} source
 * @returns {Promise<Blob>}
 */
function imageToPngBlob(source) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => {
    c.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
}

/**
 * Estimate leftover background color from near-transparent pixels (for unmixing).
 * @param {Uint8ClampedArray} d
 * @returns {[number, number, number]}
 */
function estimateFringeBg(d) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a > 0 && a < 40) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
  }
  if (n < 32) return [245, 245, 245];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/**
 * Soft model matte → binary-ish alpha + RGB decontamination (kills kraft fringe blur).
 * @param {HTMLImageElement} img
 * @returns {HTMLCanvasElement}
 */
function hardenCutout(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const [br, bg, bb] = estimateFringeBg(d);

  // Unmix semi-transparent pixels against estimated leftover bg, then hard threshold.
  const cut = 110;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    if (a < 255) {
      const af = a / 255;
      if (af > 0.02) {
        d[i] = Math.max(0, Math.min(255, Math.round((d[i] - (1 - af) * br) / af)));
        d[i + 1] = Math.max(
          0,
          Math.min(255, Math.round((d[i + 1] - (1 - af) * bg) / af)),
        );
        d[i + 2] = Math.max(
          0,
          Math.min(255, Math.round((d[i + 2] - (1 - af) * bb) / af)),
        );
      }
    }
    d[i + 3] = a >= cut ? 255 : 0;
  }

  // One-pixel inward dilate on RGB for boundary pixels that flipped opaque next to void
  // (fills tiny holes from aggressive threshold without re-softening).
  const copy = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (copy[i + 3] !== 0) continue;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sn = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = ((y + dy) * w + (x + dx)) * 4;
          if (copy[j + 3] === 255) {
            sr += copy[j];
            sg += copy[j + 1];
            sb += copy[j + 2];
            sn++;
          }
        }
      }
      // only close 1px gaps fully surrounded — skip (handled below by erode path)
      if (sn >= 6) {
        d[i] = Math.round(sr / sn);
        d[i + 1] = Math.round(sg / sn);
        d[i + 2] = Math.round(sb / sn);
        d[i + 3] = 255;
      }
    }
  }

  // Erode 1px: drop opaque pixels that touch transparent (removes fuzzy outline blobs)
  const afterFill = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (afterFill[i + 3] !== 255) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (afterFill[((y + dy) * w + (x + dx)) * 4 + 3] === 0) {
            touch = true;
            break;
          }
        }
      }
      if (touch) {
        // keep edge but ensure RGB from inward opaque neighbor (anti-fringe)
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let sn = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
            const j = (ny * w + nx) * 4;
            if (afterFill[j + 3] !== 255) continue;
            // prefer interior: not itself on boundary
            let isInterior = true;
            for (let ey = -1; ey <= 1 && isInterior; ey++) {
              for (let ex = -1; ex <= 1; ex++) {
                const ey2 = ny + ey;
                const ex2 = nx + ex;
                if (ey2 < 0 || ex2 < 0 || ey2 >= h || ex2 >= w) continue;
                if (afterFill[(ey2 * w + ex2) * 4 + 3] === 0) isInterior = false;
              }
            }
            if (!isInterior) continue;
            sr += afterFill[j];
            sg += afterFill[j + 1];
            sb += afterFill[j + 2];
            sn++;
          }
        }
        if (sn > 0) {
          d[i] = Math.round(sr / sn);
          d[i + 1] = Math.round(sg / sn);
          d[i + 2] = Math.round(sb / sn);
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return c;
}

function alphaBBox(source) {
  const w = source.width || source.naturalWidth;
  const h = source.height || source.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
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
 * Soft contact shadow under the box only — no silhouette halo (that blurred the top).
 */
function drawContactShadow(ctx, x, y, sw, sh, canvasSide) {
  const cx = x + sw * 0.5;
  const cy = y + sh * 0.92;
  const rx = sw * 0.42;
  const ry = Math.max(10, sh * 0.045);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, "rgba(0,0,0,0.22)");
  g.addColorStop(0.55, "rgba(0,0,0,0.08)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Place cutout on studio background.
 * @param {CanvasImageSource} cutout
 * @param {"assembled"|"diecut"} kind
 * @returns {string} data URL (PNG)
 */
export function compositeOnStudio(cutout, kind = "assembled") {
  const bbox = alphaBBox(cutout);
  const subject = document.createElement("canvas");
  subject.width = bbox.w;
  subject.height = bbox.h;
  const sctx = subject.getContext("2d");
  sctx.drawImage(
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
  const maxSide = 2000;
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
  // Nearest for upscale-free crisp edges when fit===1; high quality only when shrinking.
  ctx.imageSmoothingEnabled = fit < 1;
  ctx.imageSmoothingQuality = "high";

  const bg = kind === "diecut" ? BG_DIECUT : BG_ASSEMBLED;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasSide, canvasSide);

  const x = Math.round((canvasSide - sw) / 2);
  const y = Math.round((canvasSide - sh) / 2);

  if (kind === "assembled") {
    drawContactShadow(ctx, x, y, sw, sh, canvasSide);
  }

  ctx.drawImage(subject, x, y, sw, sh);

  return out.toDataURL("image/png");
}

/**
 * @param {string|Blob|HTMLImageElement} source
 * @param {"assembled"|"diecut"} kind
 * @param {(msg: string) => void} onProgress
 */
export async function processCatalogPhoto(source, kind, onProgress = () => {}) {
  onProgress("Загрузка модели вырезки (первый раз может занять время)…");
  const removeBackground = await getRemoveBackground();

  let input = source;
  if (source instanceof HTMLImageElement) {
    input = await imageToPngBlob(source);
  }

  onProgress("Вырезаю фон…");
  const blob = await removeBackground(input, {
    model: MODEL,
    output: { format: "image/png", quality: 1, type: "foreground" },
    progress: (key, current, total) => {
      if (!total) return;
      const pct = Math.round((current / total) * 100);
      onProgress(`Модель: ${key} ${pct}%`);
    },
  });

  onProgress("Уточняю края…");
  const cutout = await loadImageFromBlob(blob);
  const sharp = hardenCutout(cutout);

  onProgress("Собираю студийный кадр…");
  return compositeOnStudio(sharp, kind);
}
