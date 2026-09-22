# Как связаны Cursor и Vercel

В репозитории **две части**. Они не сливаются в один сайт.

| Где | Что |
|-----|-----|
| **Cursor** (этот проект открыт в IDE) | AI-генерация чистого фото коробки по правилам `.cursor/rules/` |
| **Vercel** (`editor/`) | Онлайн-редактор стрелок / ДШВ / FEFCO |

```
Editor на Vercel (статический)
  ├─ Загрузка сырого фото
  ├─ Браузер: вырезка фона (@imgly) + студийный фон
  └─ Ручная разметка: стрелки / ДШВ / FEFCO
```

Без API-ключей и биллинга. `api/generate.js` (Gemini) оставлен опционально, UI его не вызывает.

## Gemini

См. README → «Gemini на сайте». Ключ только в env Vercel, не в git.

## Подключение «Диалог (AI) — генерация»

Уже подключено, если работаете **в этом репозитории** в Cursor:

1. Откройте папку `CatalogImageGenerator` как workspace (File → Open Folder).
2. Правила подхватятся автоматически:
   - `.cursor/rules/catalog-photo-generation.mdc`
   - `.cursor/rules/dimension-overlay-style.mdc`
3. В чате пишете, например:  
   `собери assembled 450×120×30 мм, FEFCO 0427`  
   → агент генерирует фото **без** стрелок.
4. Скачиваете картинку → открываете задеплоенный editor → размечаете.

На Vercel Cursor-агент **не** запускается. Генерация всегда в Cursor (или другом AI с теми же промптами из `PROMPTS.md`).

## Git + Vercel

```bash
cd "/Users/rostislav/Documents/Cursor Projects/CatalogImageGenerator"
git init   # если ещё нет
git add .
git commit -m "Catalog annotate editor + Cursor generation rules"
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

Vercel:

1. [vercel.com/new](https://vercel.com/new) → Import репозитория  
2. Framework: **Other**, Root Directory: `.` (корень)  
3. Build: пусто, Output: не нужен (static)  
4. Deploy  

Сайт = редактор. Правила `.cursor/` на сайт не влияют (и не должны).

Локально после пуша:

```bash
npx vercel
```

## Что не класть в git

Уже в `.gitignore`: `.venv/`, `output/*` (кроме `.gitkeep`).  
Сырые/готовые PNG лучше не коммитить массово — только `refs/` эталоны.
