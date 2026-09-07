from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageColor, ImageEnhance, ImageFilter, ImageOps


def _radial_background(width: int, height: int, base: str, highlight: str) -> Image.Image:
    base_rgb = np.array(ImageColor.getrgb(base), dtype=np.float32)
    light_rgb = np.array(ImageColor.getrgb(highlight), dtype=np.float32)
    y, x = np.ogrid[-1.0:1.0 : complex(0, height), -1.0:1.0 : complex(0, width)]
    distance = np.sqrt((x * 0.92) ** 2 + (y * 1.08) ** 2)
    weight = np.clip(1.0 - distance, 0.0, 1.0) ** 1.7
    pixels = base_rgb + (light_rgb - base_rgb) * weight[..., None]
    return Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8), "RGB")


def _enhance_foreground(cutout: Image.Image, color: dict[str, float]) -> Image.Image:
    alpha = cutout.getchannel("A")
    rgb = cutout.convert("RGB")
    rgb = ImageEnhance.Brightness(rgb).enhance(float(color["brightness"]))
    rgb = ImageEnhance.Contrast(rgb).enhance(float(color["contrast"]))
    rgb = ImageEnhance.Color(rgb).enhance(float(color["saturation"]))
    rgb = ImageEnhance.Sharpness(rgb).enhance(float(color["sharpness"]))
    return Image.merge("RGBA", (*rgb.split(), alpha))


def _subject_crop(cutout: Image.Image, threshold: int) -> tuple[Image.Image, list[int]]:
    alpha = np.asarray(cutout.getchannel("A"), dtype=np.uint8)
    ys, xs = np.where(alpha >= threshold)
    if len(xs) == 0:
        raise ValueError("La máscara está vacía; el producto no se puede componer.")
    left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    padding = max(2, int(round(max(right - left, bottom - top) * 0.004)))
    box = [
        max(0, left - padding),
        max(0, top - padding),
        min(cutout.width, right + padding),
        min(cutout.height, bottom + padding),
    ]
    return cutout.crop(tuple(box)), box


def _shadow_layer(
    canvas_size: tuple[int, int],
    alpha: Image.Image,
    subject_position: tuple[int, int],
    subject_size: tuple[int, int],
    config: dict[str, Any],
) -> Image.Image:
    canvas_width, canvas_height = canvas_size
    subject_x, subject_y = subject_position
    subject_width, subject_height = subject_size
    shadow_width = max(4, int(round(subject_width * float(config["horizontal_scale"]))))
    shadow_height = max(4, int(round(subject_height * float(config["vertical_scale"]))))
    flattened = alpha.resize((shadow_width, shadow_height), Image.Resampling.LANCZOS)
    flattened = flattened.filter(ImageFilter.GaussianBlur(float(config["blur_radius"])))
    opacity = float(config["opacity"])
    flattened = flattened.point(lambda value: int(value * opacity))
    layer = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    shadow_x = subject_x + (subject_width - shadow_width) // 2
    shadow_y = min(
        canvas_height - shadow_height,
        subject_y + subject_height - shadow_height // 2 + int(config["offset_y"]),
    )
    black = Image.new("RGBA", (shadow_width, shadow_height), (20, 20, 18, 0))
    black.putalpha(flattened)
    layer.alpha_composite(black, (shadow_x, shadow_y))
    return layer


def compose_catalog_image(
    cutout: Image.Image,
    *,
    config: dict[str, Any],
) -> tuple[Image.Image, dict[str, Any]]:
    canvas_config = config["canvas"]
    width = int(canvas_config["width"])
    height = int(canvas_config["height"])
    threshold = int(config["segmentation"]["alpha_bbox_threshold"])
    cropped, source_bbox = _subject_crop(cutout, threshold)
    cropped = _enhance_foreground(cropped, config["color"])

    safe_margin = int(round(min(width, height) * float(canvas_config["minimum_margin_fraction"])))
    max_by_fraction = int(round(min(width, height) * float(canvas_config["subject_max_fraction"])))
    max_width = min(width - safe_margin * 2, max_by_fraction)
    max_height = min(height - safe_margin * 2, max_by_fraction)
    scale = min(max_width / cropped.width, max_height / cropped.height)
    resized_width = max(1, int(round(cropped.width * scale)))
    resized_height = max(1, int(round(cropped.height * scale)))
    subject = cropped.resize((resized_width, resized_height), Image.Resampling.LANCZOS)

    center_x = width // 2
    center_y = int(round(height * float(canvas_config["vertical_center_fraction"])))
    x = max(safe_margin, min(width - safe_margin - resized_width, center_x - resized_width // 2))
    y = max(safe_margin, min(height - safe_margin - resized_height, center_y - resized_height // 2))

    background = _radial_background(
        width,
        height,
        canvas_config["background"],
        canvas_config["radial_highlight"],
    ).convert("RGBA")
    if config["shadow"]["enabled"]:
        shadow = _shadow_layer(
            (width, height),
            subject.getchannel("A"),
            (x, y),
            (resized_width, resized_height),
            config["shadow"],
        )
        background = Image.alpha_composite(background, shadow)
    background.alpha_composite(subject, (x, y))
    composed = background.convert("RGB")
    geometry = {
        "source_foreground_bbox": source_bbox,
        "subject_bbox_on_canvas": [x, y, x + resized_width, y + resized_height],
        "subject_width_fraction": resized_width / width,
        "subject_height_fraction": resized_height / height,
        "subject_max_fraction": max(resized_width / width, resized_height / height),
        "minimum_margin_pixels": min(x, y, width - x - resized_width, height - y - resized_height),
        "scale_factor": scale,
    }
    return composed, geometry


def save_exports(
    composed: Image.Image,
    *,
    output_dir: Path,
    stem: str,
    export_config: dict[str, Any],
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for name, settings in export_config.items():
        target_size = (int(settings["width"]), int(settings["height"]))
        image = composed if composed.size == target_size else composed.resize(
            target_size, Image.Resampling.LANCZOS
        )
        suffix = str(settings["format"]).lower()
        path = output_dir / f"{stem}-{name}.{suffix}"
        if suffix == "png":
            image.save(path, format="PNG", optimize=True)
        elif suffix == "webp":
            image.save(
                path,
                format="WEBP",
                quality=int(settings["quality"]),
                method=int(settings.get("method", 6)),
                exact=True,
            )
        else:
            raise ValueError(f"Formato de salida no soportado: {suffix}")
        paths[name] = path
    return paths


def _fit_on_panel(image: Image.Image, size: tuple[int, int], background: str) -> Image.Image:
    panel = Image.new("RGB", size, ImageColor.getrgb(background))
    fitted = ImageOps.contain(image.convert("RGB"), (size[0] - 32, size[1] - 32))
    panel.paste(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
    return panel


def save_comparison(
    original: Image.Image,
    normalized: Image.Image,
    *,
    path: Path,
) -> None:
    panel_size = (1000, 1000)
    left = _fit_on_panel(original, panel_size, "#DADAD8")
    right = _fit_on_panel(normalized, panel_size, "#F4F4F2")
    comparison = Image.new("RGB", (2000, 1000), "white")
    comparison.paste(left, (0, 0))
    comparison.paste(right, (1000, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    comparison.save(path, format="JPEG", quality=91, optimize=True)


def save_edge_check(cutout: Image.Image, *, path: Path) -> None:
    panel_size = (600, 600)
    backgrounds = ("#FFFFFF", "#050505", "#C9FF18", "#7A7A78")
    sheet = Image.new("RGB", (panel_size[0] * 2, panel_size[1] * 2), "white")
    crop, _ = _subject_crop(cutout, 8)
    fitted = ImageOps.contain(crop, (panel_size[0] - 48, panel_size[1] - 48))
    for index, background in enumerate(backgrounds):
        panel = Image.new("RGBA", panel_size, ImageColor.getrgb(background) + (255,))
        panel.alpha_composite(
            fitted,
            ((panel_size[0] - fitted.width) // 2, (panel_size[1] - fitted.height) // 2),
        )
        sheet.paste(panel.convert("RGB"), ((index % 2) * panel_size[0], (index // 2) * panel_size[1]))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, format="PNG", optimize=True)
