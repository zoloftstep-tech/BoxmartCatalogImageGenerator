/**
 * POST /api/generate  (process existing photo)
 * Body: {
 *   kind: "assembled"|"diecut",
 *   imageBase64: string,  // no data: prefix
 *   mimeType?: string     // default image/jpeg
 * }
 * Returns: { mimeType, imageBase64, model, prompt }
 *
 * Env:
 *   GEMINI_API_KEY (required)
 *   GEMINI_IMAGE_MODEL (optional) — default gemini-2.5-flash-image
 */

function buildEditPrompt(kind) {
  if (kind === "diecut") {
    return [
      "Edit this exact product photo of a cardboard box die-cut / flat blank.",
      "Keep the same cardboard piece: geometry, flaps, slots, proportions, and top-down orientation.",
      "Remove background, table edges, floor, machines, hands, graffiti, handwritten marks, and any text overlays.",
      "Place on a pure white seamless background, orthographic catalog plate, no drop shadow.",
      "Slightly improve clarity and even lighting for a consistent ecommerce look.",
      "Do NOT redesign the blank, do NOT add text, arrows, dimensions, FEFCO labels, or watermarks.",
      "Leave generous white margin around the subject for later annotations.",
    ].join(" ");
  }
  return [
    "Edit this exact product photo of a kraft corrugated cardboard box.",
    "Keep the same box identity: shape, proportions, folds, and camera angle.",
    "Remove background clutter (tables, rollers, workshop, hands), graffiti, handwritten numbers, and UI overlays.",
    "Place on a seamless light gray #F5F5F5 studio background with a soft natural contact shadow.",
    "Improve lighting and sharpness slightly for a consistent Boxmart catalog style.",
    "Do NOT redesign the box, do NOT add text, arrows, dimension labels, or watermarks.",
    "Leave generous empty margin around the box for later size annotations.",
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

function stripDataUrl(input) {
  if (!input || typeof input !== "string") return { mimeType: null, data: null };
  const m = input.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mimeType: m[1], data: m[2] };
  return { mimeType: null, data: input.replace(/\s/g, "") };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "GEMINI_API_KEY не задан. Добавьте в Vercel → Settings → Environment Variables.",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }
  body = body || {};

  const kind = body.kind === "diecut" ? "diecut" : "assembled";
  const parsed = stripDataUrl(body.imageBase64 || body.image || "");
  const mimeType = body.mimeType || parsed.mimeType || "image/jpeg";
  const imageData = parsed.data;

  if (!imageData || imageData.length < 32) {
    return res.status(400).json({
      error: "Нужно исходное фото: imageBase64 (загрузите снимок, затем обработайте).",
    });
  }

  // ~4MB base64 safety for serverless payload
  if (imageData.length > 5_500_000) {
    return res.status(413).json({
      error: "Фото слишком большое. Уменьшите до ~1600px по длинной стороне.",
    });
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const prompt = buildEditPrompt(kind);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: imageData } },
            ],
          },
        ],
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
