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

## Обработка фото (без ключей)

В браузере: `@imgly/background-removal` → студийный фон (`#F5F5F5` / белый).  
Ключ Gemini **не нужен**.

1. Загрузить фото  
2. Тип кадра → **Очистить фон и выровнять стиль**  
3. Разметить Д×Ш×В  

Первый запуск скачает модель (~40 МБ) с CDN.

## Эталоны стиля

- `refs/style-assembled.png`
- `refs/style-diecut.png`
