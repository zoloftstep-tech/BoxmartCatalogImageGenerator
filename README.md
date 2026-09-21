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

## Деплой на Vercel

```bash
git push
# Import repo на vercel.com → Deploy
# или: npx vercel --prod
```

`vercel.json` отдаёт `/` и статику из `editor/`.

## Эталоны стиля

- `refs/style-assembled.png`
- `refs/style-diecut.png`
