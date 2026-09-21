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

Обработка **существующего** фото (не генерация коробки с нуля):

1. Ключ: [Google AI Studio](https://aistudio.google.com/apikey)
2. Vercel env: `GEMINI_API_KEY` (+ опционально `GEMINI_IMAGE_MODEL`)
3. Redeploy
4. Editor: загрузить фото → тип кадра → **Очистить фон и выровнять стиль** → разметить ДШВ

Локально: `.env` + `npx vercel dev`.

`POST /api/generate` `{ kind, imageBase64, mimeType }`

## Эталоны стиля

- `refs/style-assembled.png`
- `refs/style-diecut.png`
