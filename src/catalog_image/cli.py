from __future__ import annotations

from pathlib import Path

import click

from .models import DimsMm
from .pipeline import ProcessOptions, process_and_save


@click.group()
def main() -> None:
    """CatalogImageGenerator — размеры Д×Ш×В на готовых каталожных фото."""


@main.command("ui")
@click.option("--host", default="127.0.0.1", show_default=True)
@click.option("--port", default=7860, show_default=True, type=int)
@click.option("--reload", is_flag=True, help="Автоперезагрузка при правках кода")
def ui_cmd(host: str, port: int, reload: bool) -> None:
    """Локальный веб-интерфейс (annotate)."""
    import uvicorn

    click.echo(f"UI: http://{host}:{port}")
    uvicorn.run(
        "catalog_image.web:app",
        host=host,
        port=port,
        reload=reload,
    )


@main.command("annotate")
@click.argument("source", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--l", "length", required=True, type=int, help="Длина, мм")
@click.option("--w", "width", required=True, type=int, help="Ширина, мм")
@click.option("--h", "height", required=True, type=int, help="Высота, мм")
@click.option(
    "--kind",
    type=click.Choice(["assembled", "diecut"], case_sensitive=False),
    default="assembled",
    show_default=True,
)
@click.option("--fefco", default=None, help="Код FEFCO, например 0427")
@click.option("--bg", default="#F5F5F5", show_default=True, help="Цвет полей при паддинге")
@click.option(
    "-o",
    "--output",
    type=click.Path(path_type=Path),
    default=None,
    help="Куда сохранить (по умолчанию output/<name>-dims.png)",
)
@click.option(
    "--format",
    "fmt",
    type=click.Choice(["PNG", "JPEG", "WEBP"], case_sensitive=False),
    default="PNG",
    show_default=True,
)
@click.option("--no-dims", is_flag=True, help="Не рисовать размеры")
@click.option("--refit", is_flag=True, help="Переложить на квадратный холст 1600px")
def annotate_cmd(
    source: Path,
    length: int,
    width: int,
    height: int,
    kind: str,
    fefco: str | None,
    bg: str,
    output: Path | None,
    fmt: str,
    no_dims: bool,
    refit: bool,
) -> None:
    """Нанести стрелки и подписи Д×Ш×В на готовое фото (без rembg)."""
    root = Path.cwd()
    if output is None:
        out_dir = root / "output"
        suffix = f"{kind.lower()}-dims"
        if fefco:
            suffix = f"{suffix}-fefco{fefco}"
        output = out_dir / f"{source.stem}-{suffix}.{fmt.lower()}"

    options = ProcessOptions(
        dims=DimsMm(length=length, width=width, height=height),
        kind=kind.lower(),  # type: ignore[arg-type]
        bg="#FFFFFF" if kind.lower() == "diecut" and bg == "#F5F5F5" else bg,
        fefco=fefco,
        draw_dims=not no_dims,
        refit=refit,
    )
    path = process_and_save(source, output, options, format=fmt.upper())
    click.echo(f"Saved: {path}")


# Alias for muscle memory
@main.command("process", hidden=True)
@click.pass_context
@click.argument("source", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--l", "length", required=True, type=int)
@click.option("--w", "width", required=True, type=int)
@click.option("--h", "height", required=True, type=int)
@click.option("--kind", default="assembled")
@click.option("--fefco", default=None)
@click.option("--bg", default="#F5F5F5")
@click.option("-o", "--output", type=click.Path(path_type=Path), default=None)
@click.option("--format", "fmt", default="PNG")
@click.option("--no-dims", is_flag=True)
def process_cmd(ctx: click.Context, **kwargs) -> None:
    """Устарело: используйте `cig annotate`."""
    ctx.invoke(annotate_cmd, **kwargs)


if __name__ == "__main__":
    main()
