from __future__ import annotations

import io
import re
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image

from .models import DimsMm
from .pipeline import ProcessOptions, process_and_save, process_image

PACKAGE_DIR = Path(__file__).resolve().parent
STATIC_DIR = PACKAGE_DIR / "static"
PROJECT_ROOT = Path.cwd()
OUTPUT_DIR = PROJECT_ROOT / "output"


def create_app() -> FastAPI:
    app = FastAPI(title="CatalogImageGenerator", version="0.1.0")
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/", response_class=HTMLResponse)
    def index() -> HTMLResponse:
        return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))

    @app.post("/api/process")
    async def api_process(
        file: UploadFile = File(...),
        length: int = Form(...),
        width: int = Form(...),
        height: int = Form(...),
        kind: str = Form("assembled"),
        fefco: str = Form(""),
        bg: str = Form("#F5F5F5"),
        canvas: int = Form(1600),
        draw_dims: str = Form("true"),
        save: str = Form("true"),
        fmt: str = Form("PNG"),
    ) -> Response:
        if length <= 0 or width <= 0 or height <= 0:
            raise HTTPException(400, "Размеры должны быть > 0 мм")
        kind_l = kind.lower().strip()
        if kind_l not in ("assembled", "diecut"):
            raise HTTPException(400, "kind: assembled | diecut")
        fmt_u = fmt.upper().strip()
        if fmt_u not in ("PNG", "JPEG", "WEBP"):
            raise HTTPException(400, "format: PNG | JPEG | WEBP")

        draw_dims_b = str(draw_dims).lower() in {"1", "true", "yes", "on"}
        save_b = str(save).lower() in {"1", "true", "yes", "on"}

        raw = await file.read()
        if not raw:
            raise HTTPException(400, "Пустой файл")
        try:
            image = Image.open(io.BytesIO(raw)).convert("RGBA")
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(400, f"Не удалось открыть изображение: {exc}") from exc

        fefco_clean = fefco.strip() or None
        options = ProcessOptions(
            dims=DimsMm(length=length, width=width, height=height),
            kind=kind_l,  # type: ignore[arg-type]
            bg=bg.strip() or "#F5F5F5",
            canvas=max(512, min(canvas, 4096)),
            fefco=fefco_clean,
            draw_dims=draw_dims_b,
        )
        result = process_image(image, options)

        stem = Path(file.filename or "image").stem
        stem = re.sub(r"[^\w\-]+", "_", stem, flags=re.UNICODE).strip("_") or "image"
        suffix = kind_l
        if fefco_clean:
            suffix = f"{suffix}-fefco{fefco_clean}"
        filename = f"{stem}-{suffix}.{fmt_u.lower()}"

        if save_b:
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            out_path = OUTPUT_DIR / filename
            save_kwargs = {}
            to_save = result
            if fmt_u == "JPEG":
                to_save = result.convert("RGB")
                save_kwargs = {"quality": 92, "optimize": True}
            elif fmt_u == "WEBP":
                save_kwargs = {"quality": 90, "method": 6}
            to_save.save(out_path, format=fmt_u, **save_kwargs)

        buf = io.BytesIO()
        if fmt_u == "JPEG":
            result.convert("RGB").save(buf, format="JPEG", quality=92)
            media = "image/jpeg"
        elif fmt_u == "WEBP":
            result.save(buf, format="WEBP", quality=90)
            media = "image/webp"
        else:
            result.save(buf, format="PNG")
            media = "image/png"

        headers = {
            "X-Saved-As": filename if save_b else "",
            "Content-Disposition": f'inline; filename="{filename}"',
        }
        return Response(content=buf.getvalue(), media_type=media, headers=headers)

    @app.get("/api/outputs")
    def list_outputs() -> dict:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        files = sorted(
            [p.name for p in OUTPUT_DIR.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}],
            reverse=True,
        )
        return {"files": files, "dir": str(OUTPUT_DIR)}

    @app.get("/api/outputs/{name}")
    def get_output(name: str) -> FileResponse:
        safe = Path(name).name
        path = OUTPUT_DIR / safe
        if not path.is_file():
            raise HTTPException(404, "Файл не найден")
        return FileResponse(path)

    return app


app = create_app()
