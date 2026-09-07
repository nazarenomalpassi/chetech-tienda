from __future__ import annotations

import hashlib
import io
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any

from PIL import Image, ImageCms, ImageOps


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(
            json.dumps(value, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip())
    return cleaned.strip("-._").lower() or "image"


def open_srgb_image(path: Path) -> tuple[Image.Image, dict[str, Any]]:
    with Image.open(path) as source:
        source.load()
        original_info = dict(source.info)
        image = ImageOps.exif_transpose(source)
        converted_profile = False
        icc_profile = original_info.get("icc_profile")
        if icc_profile:
            try:
                input_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc_profile))
                output_profile = ImageCms.createProfile("sRGB")
                image = ImageCms.profileToProfile(
                    image.convert("RGB"),
                    input_profile,
                    output_profile,
                    outputMode="RGB",
                )
                converted_profile = True
            except (OSError, ValueError, TypeError):
                image = image.convert("RGB")
        else:
            image = image.convert("RGB")
        metadata = {
            "width": image.width,
            "height": image.height,
            "format": source.format,
            "mode": source.mode,
            "icc_profile_present": bool(icc_profile),
            "icc_profile_converted_to_srgb": converted_profile,
            "exif_orientation_applied": True,
        }
        return image.copy(), metadata


def image_metadata(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        return {
            "path": str(path.resolve()),
            "sha256": sha256_file(path),
            "width": image.width,
            "height": image.height,
            "format": image.format,
            "mode": image.mode,
            "bytes": path.stat().st_size,
        }


def dhash(image: Image.Image, hash_size: int = 8) -> str:
    sample = image.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    pixels = list(sample.getdata())
    bits: list[int] = []
    for row in range(hash_size):
        offset = row * (hash_size + 1)
        for col in range(hash_size):
            bits.append(int(pixels[offset + col] > pixels[offset + col + 1]))
    value = 0
    for bit in bits:
        value = (value << 1) | bit
    return f"{value:0{hash_size * hash_size // 4}x}"
