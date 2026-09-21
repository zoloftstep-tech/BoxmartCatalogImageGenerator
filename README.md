# CatalogImageGenerator

Ручная разметка каталожных фото + правила для AI-генерации в Cursor.

**Полная схема:** [WORKFLOW.md](./WORKFLOW.md)

## Две части одного репо

1. **Cursor-диалог** — генерация чистого фото (без размеров)  
   Правила: `.cursor/rules/catalog-photo-generation.mdc`  
   Промпты: `PROMPTS.md`

2. **Editor (Vercel / локально)** — стрелки, Д/Ш/В, FEFCO  
   Папка: `editor/`

## Локально

```bash
cd editor && python3 -m http.server 5173
# http://127.0.0.1:5173
```

## Gemini на сайте

1. Ключ: [Google AI Studio](https://aistudio.google.com/apikey)
2. Vercel → Project → Settings → Environment Variables:
   - `GEMINI_API_KEY` = ваш ключ
   - опционально `GEMINI_IMAGE_MODEL` = `gemini-2.5-flash-image` (или `gemini-3.1-flash-image`)
3. Redeploy
4. В editor: блок **Генерация (Gemini)** → Сгенерировать фото → разметить ДШВ

Локально с API: `npx vercel dev` (подхватит `.env`).

API: `POST /api/generate` `{ kind, l, w, h, fefco? }`

## Эталоны стиля

- `refs/style-assembled.png`
- `refs/style-diecut.png`
