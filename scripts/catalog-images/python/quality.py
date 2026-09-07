from __future__ import annotations

from typing import Any


def assess_quality(
    *,
    source_width: int,
    source_height: int,
    mask: dict[str, Any],
    geometry: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    thresholds = config["quality"]
    warnings: list[str] = []
    blocking: list[str] = []
    confidence = 1.0

    def warn(code: str, deduction: float) -> None:
        nonlocal confidence
        if code not in warnings:
            warnings.append(code)
            confidence -= deduction

    if mask.get("empty"):
        blocking.append("empty_mask")
        confidence = 0.0
    if min(source_width, source_height) < int(thresholds["minimum_source_short_edge"]):
        warn("low_source_resolution", 0.08)
    if mask.get("core_edge_contact"):
        warn("foreground_core_touches_source_edge", 0.2)
    elif mask.get("touches_source_edges") or mask.get("soft_edge_contact"):
        warn("foreground_touches_source_edge", 0.14)
    foreground_fraction = float(mask.get("foreground_fraction", 0.0))
    if foreground_fraction < float(thresholds["minimum_foreground_fraction"]):
        warn("very_small_foreground", 0.2)
    if foreground_fraction > float(thresholds["maximum_foreground_fraction"]):
        warn("foreground_may_include_background", 0.2)
    if float(mask.get("uncertain_alpha_fraction", 0.0)) > float(
        thresholds["maximum_uncertain_alpha_fraction"]
    ):
        # Transparencias reales (por ejemplo blísters) también elevan esta métrica.
        # Por eso nunca es bloqueante por sí sola.
        warn("high_uncertain_alpha_area", 0.08)
    if int(mask.get("significant_component_count", 0)) > int(
        thresholds["maximum_significant_components"]
    ):
        warn("many_disconnected_components", 0.08)

    dominant_fraction = float(mask.get("dominant_component_fraction", 1.0))
    satellite_fraction = float(mask.get("satellite_foreground_fraction", 0.0))
    if (
        dominant_fraction < float(thresholds.get("minimum_dominant_component_fraction", 0.86))
        and satellite_fraction
        > float(thresholds.get("maximum_satellite_foreground_fraction", 0.14))
    ):
        warn("foreground_has_large_satellites", 0.12)

    opened_significant = int(mask.get("opened_significant_component_count", 0))
    opened_second = float(mask.get("opened_second_component_fraction", 0.0))
    if (
        opened_significant
        > int(thresholds.get("maximum_opened_significant_components", 1))
        and opened_second
        >= float(thresholds.get("minimum_secondary_cluster_fraction", 0.05))
    ):
        warn("possible_multiple_subjects", 0.2)

    extension = float(
        (mask.get("soft_bbox_extension_fraction") or {}).get("maximum", 0.0)
    )
    if extension > float(thresholds.get("maximum_soft_bbox_extension_fraction", 0.04)):
        warn("soft_mask_extends_beyond_core", 0.12)

    bbox_fill = float(mask.get("soft_bbox_fill_fraction", 1.0))
    if (
        bbox_fill < float(thresholds.get("minimum_soft_bbox_fill_fraction", 0.45))
        and (opened_significant > 1 or extension > 0.04)
    ):
        warn("sparse_or_multiple_foreground", 0.1)

    longest_core_edge_run = max(
        (
            float(metrics.get("longest_run_fraction", 0.0))
            for metrics in (mask.get("core_edge_metrics") or {}).values()
        ),
        default=0.0,
    )
    if longest_core_edge_run > float(
        thresholds.get("maximum_core_edge_run_fraction", 0.02)
    ):
        warn("possible_source_crop", 0.12)

    if int(geometry.get("minimum_margin_pixels", 0)) < int(
        thresholds["minimum_edge_margin_pixels"]
    ):
        blocking.append("output_safe_margin_failed")
        confidence -= 0.3

    confidence = max(0.0, min(1.0, confidence))
    if blocking:
        automatic_result = "fail"
    elif warnings:
        automatic_result = "warn"
    else:
        automatic_result = "pass"
    return {
        "automatic_result": automatic_result,
        "confidence": round(confidence, 4),
        "warnings": warnings,
        "blocking_issues": blocking,
        "review_status": "pending_manual_review",
    }
