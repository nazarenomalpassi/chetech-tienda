from __future__ import annotations

import io
from collections import deque
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageFilter
from rembg import remove


def segment_product(
    image: Image.Image,
    *,
    session: Any,
    alpha_matting: bool,
) -> Image.Image:
    result = remove(
        image,
        session=session,
        alpha_matting=alpha_matting,
        post_process_mask=False,
        only_mask=False,
    )
    if isinstance(result, bytes):
        with Image.open(io.BytesIO(result)) as opened:
            return opened.convert("RGBA")
    if isinstance(result, Image.Image):
        return result.convert("RGBA")
    array = np.asarray(result)
    return Image.fromarray(array).convert("RGBA")


def _component_areas(mask: np.ndarray) -> list[int]:
    pixels = np.asarray(mask, dtype=bool)
    height, width = pixels.shape
    visited = np.zeros_like(pixels, dtype=bool)
    areas: list[int] = []
    for y in range(height):
        for x in range(width):
            if not pixels[y, x] or visited[y, x]:
                continue
            queue: deque[tuple[int, int]] = deque([(y, x)])
            visited[y, x] = True
            area = 0
            while queue:
                cy, cx = queue.popleft()
                area += 1
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        ny, nx = cy + dy, cx + dx
                        if (
                            0 <= ny < height
                            and 0 <= nx < width
                            and pixels[ny, nx]
                            and not visited[ny, nx]
                        ):
                            visited[ny, nx] = True
                            queue.append((ny, nx))
            areas.append(area)
    return sorted(areas, reverse=True)


def _analysis_alpha(alpha: np.ndarray, maximum_size: int = 384) -> np.ndarray:
    small = Image.fromarray(alpha, "L")
    small.thumbnail((maximum_size, maximum_size), Image.Resampling.NEAREST)
    return np.asarray(small, dtype=np.uint8)


def _opened_mask(mask: np.ndarray, kernel_size: int = 7) -> np.ndarray:
    minimum_dimension = min(mask.shape)
    size = min(kernel_size, minimum_dimension if minimum_dimension % 2 else minimum_dimension - 1)
    if size < 3:
        return mask
    image = Image.fromarray((mask.astype(np.uint8) * 255), "L")
    opened = image.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))
    return np.asarray(opened, dtype=np.uint8) > 0


def _bbox_for(alpha: np.ndarray, threshold: int) -> list[int] | None:
    ys, xs = np.where(alpha >= threshold)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def _soft_bbox_extension(
    soft_bbox: list[int],
    robust_bbox: list[int],
) -> dict[str, float]:
    robust_width = max(1, robust_bbox[2] - robust_bbox[0])
    robust_height = max(1, robust_bbox[3] - robust_bbox[1])
    values = {
        "left": max(0.0, (robust_bbox[0] - soft_bbox[0]) / robust_width),
        "top": max(0.0, (robust_bbox[1] - soft_bbox[1]) / robust_height),
        "right": max(0.0, (soft_bbox[2] - robust_bbox[2]) / robust_width),
        "bottom": max(0.0, (soft_bbox[3] - robust_bbox[3]) / robust_height),
    }
    values["maximum"] = max(values.values())
    return values


def _longest_true_run(values: np.ndarray) -> int:
    longest = 0
    current = 0
    for value in values:
        if bool(value):
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def _edge_metrics(mask: np.ndarray) -> dict[str, dict[str, float]]:
    sides = {
        "left": mask[:, 0],
        "top": mask[0, :],
        "right": mask[:, -1],
        "bottom": mask[-1, :],
    }
    return {
        name: {
            "occupancy_fraction": float(values.mean()),
            "longest_run_fraction": float(_longest_true_run(values) / max(1, len(values))),
        }
        for name, values in sides.items()
    }


def analyze_mask(
    rgba: Image.Image,
    *,
    bbox_threshold: int,
    warning_threshold: int,
) -> dict[str, Any]:
    alpha = np.asarray(rgba.getchannel("A"), dtype=np.uint8)
    foreground = alpha >= warning_threshold
    soft = alpha >= bbox_threshold
    soft_bbox = _bbox_for(alpha, bbox_threshold)
    if soft_bbox is None:
        return {
            "empty": True,
            "bbox": None,
            "soft_bbox": None,
            "robust_bbox": None,
            "foreground_fraction": 0.0,
            "core_foreground_fraction": 0.0,
            "uncertain_alpha_fraction": 0.0,
            "uncertain_alpha_subject_fraction": 0.0,
            "touches_source_edges": True,
            "soft_edge_contact": True,
            "core_edge_contact": False,
            "soft_edge_metrics": {},
            "core_edge_metrics": {},
            "component_count": 0,
            "significant_component_count": 0,
            "component_fractions": [],
            "dominant_component_fraction": 0.0,
            "satellite_foreground_fraction": 0.0,
            "opened_component_count": 0,
            "opened_significant_component_count": 0,
            "opened_component_fractions": [],
            "opened_second_component_fraction": 0.0,
            "soft_bbox_fill_fraction": 0.0,
            "soft_bbox_extension_fraction": {
                "left": 0.0,
                "top": 0.0,
                "right": 0.0,
                "bottom": 0.0,
                "maximum": 0.0,
            },
        }

    robust_bbox = _bbox_for(alpha, 128) or _bbox_for(alpha, warning_threshold) or soft_bbox
    uncertain = (alpha > 0) & (alpha < 245)
    analysis_alpha = _analysis_alpha(alpha)
    analysis_foreground = analysis_alpha >= warning_threshold
    component_areas = _component_areas(analysis_foreground)
    analysis_pixels = max(1, analysis_foreground.size)
    foreground_pixels = max(1, int(analysis_foreground.sum()))
    component_fractions = [area / analysis_pixels for area in component_areas]
    relative_component_fractions = [area / foreground_pixels for area in component_areas]
    significant = sum(fraction >= 0.0025 for fraction in component_fractions)
    dominant_component_fraction = (
        relative_component_fractions[0] if relative_component_fractions else 0.0
    )

    opened_core = _opened_mask(analysis_alpha >= 64)
    opened_areas = _component_areas(opened_core)
    opened_pixels = max(1, sum(opened_areas))
    opened_fractions = [area / opened_pixels for area in opened_areas]
    opened_significant = sum(fraction >= 0.05 for fraction in opened_fractions)

    left, top, right, bottom = soft_bbox
    soft_bbox_area = max(1, (right - left) * (bottom - top))
    soft_bbox_fill = float(foreground[top:bottom, left:right].sum() / soft_bbox_area)
    soft_edge_metrics = _edge_metrics(soft)
    core = alpha >= 128
    core_edge_metrics = _edge_metrics(core)
    soft_edge_contact = any(
        metrics["occupancy_fraction"] > 0 for metrics in soft_edge_metrics.values()
    )
    core_edge_contact = any(
        metrics["occupancy_fraction"] > 0 for metrics in core_edge_metrics.values()
    )
    return {
        "empty": False,
        "bbox": soft_bbox,
        "soft_bbox": soft_bbox,
        "robust_bbox": robust_bbox,
        "foreground_fraction": float(foreground.mean()),
        "core_foreground_fraction": float(core.mean()),
        "uncertain_alpha_fraction": float(uncertain.mean()),
        "uncertain_alpha_subject_fraction": float(
            uncertain.sum() / max(1, int((alpha > 0).sum()))
        ),
        "touches_source_edges": bool(
            soft_bbox[0] <= 1
            or soft_bbox[1] <= 1
            or soft_bbox[2] >= rgba.width - 1
            or soft_bbox[3] >= rgba.height - 1
        ),
        "soft_edge_contact": soft_edge_contact,
        "core_edge_contact": core_edge_contact,
        "soft_edge_metrics": soft_edge_metrics,
        "core_edge_metrics": core_edge_metrics,
        "component_count": len(component_areas),
        "significant_component_count": significant,
        "component_fractions": component_fractions[:20],
        "dominant_component_fraction": float(dominant_component_fraction),
        "satellite_foreground_fraction": float(1.0 - dominant_component_fraction),
        "opened_component_count": len(opened_areas),
        "opened_significant_component_count": opened_significant,
        "opened_component_fractions": opened_fractions[:20],
        "opened_second_component_fraction": float(
            opened_fractions[1] if len(opened_fractions) > 1 else 0.0
        ),
        "soft_bbox_fill_fraction": soft_bbox_fill,
        "soft_bbox_extension_fraction": _soft_bbox_extension(soft_bbox, robust_bbox),
    }


def save_cutout(path: Path, cutout: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cutout.save(path, format="PNG", optimize=True)
