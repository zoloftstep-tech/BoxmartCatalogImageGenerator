/**
 * POST /api/generate
 * Body: { kind: "assembled"|"diecut", l: number, w: number, h: number, fefco?: string }
 * Returns: { mimeType, imageBase64 }
 *
 * Env:
 *   GEMINI_API_KEY (required) — from https://aistudio.google.com/apikey
 *   GEMINI_IMAGE_MODEL (optional) — default gemini-2.5-flash-image
 */

function buildPrompt({ kind, l, w, h, fefco }) {
  const L = Number(l);
  const W = Number(w);
  const H = Number(h);
  if (kind === "diecut") {
    const code = fefco ? String(fefco).trim() : "0427";
    return [
      `Top-down flat lay of an unfolded kraft corrugated cardboard box blank (FEFCO ${code} style),`,
      `die-cut with score lines and flaps, exact panel proportions for inner size ${L}×${W}×${H} mm.`,
      `Pure white background, orthographic, no perspective, no shadow, no text, no arrows,`,
      `no handwritten marks, no watermark, no FEFCO text on the cardboard.`,
      `Catalog technical plate style. Generous white margin around the blank.`,
    ].join(" ");
  }
  return [
    `Product photo of a closed kraft corrugated cardboard shipping box,`,
    `exact proportions length×width×height = ${L}×${W}×${H} mm.`,
    `Three-quarter studio angle, soft diffused light, subtle contact shadow.`,
    `Seamless light gray #F5F5F5 background.`,
    `No text, no arrows, no labels, no watermark, no people, no table clutter.`,
    `Sharp edges, realistic cardboard texture, catalog ecommerce style.`,
    `Generous empty margin around the box for later dimension annotations.`,
  ].join(" ");
}

function extractImage(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      return {
        mimeType: inline.mimeType || inline.mime_type || "image/png",
        data: inline.data,
      };
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "GEMINI_API_KEY не задан. Добавьте в Vercel → Settings → Environment Variables.",
    });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const kind = body.kind === "diecut" ? "diecut" : "assembled";
  const l = Number(body.l);
  const w = Number(body.w);
  const h = Number(body.h);
  if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) {
    return res.status(400).json({ error: "Укажите l, w, h > 0 (мм)" });
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const prompt = buildPrompt({ kind, l, w, h, fefco: body.fefco });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    const payload = await upstream.json();
    if (!upstream.ok) {
      const msg =
        payload?.error?.message ||
        payload?.message ||
        `Gemini error ${upstream.status}`;
      return res.status(upstream.status).json({ error: msg, details: payload });
    }

    const image = extractImage(payload);
    if (!image) {
      return res.status(502).json({
        error: "Gemini не вернул изображение. Проверьте модель / квоту AI Studio.",
        details: payload,
      });
    }

    return res.status(200).json({
      mimeType: image.mimeType,
      imageBase64: image.data,
      model,
      prompt,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
};
