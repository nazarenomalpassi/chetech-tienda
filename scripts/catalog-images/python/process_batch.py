from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy
import onnxruntime
import PIL
import rembg
from PIL import Image
from rembg import new_session

from catalog_image_common import (
    dhash,
    image_metadata,
    load_json,
    open_srgb_image,
    safe_slug,
    save_json,
    sha256_file,
)
from composition import (
    compose_catalog_image,
    save_comparison,
    save_edge_check,
    save_exports,
)
from quality import assess_quality
from segmentation import analyze_mask, save_cutout, segment_product


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _package_version(module: Any) -> str:
    return str(getattr(module, "__version__", "unknown"))


def _item_key(item: dict[str, Any]) -> str:
    stable_image_reference = (
        item.get("production_storage_path")
        or item.get("image_id")
        or str(Path(item["source_path"]).resolve())
    )
    return "|".join(
        [
            str(item.get("product_id") or ""),
            str(stable_image_reference),
            str(item.get("position") if item.get("position") is not None else ""),
            str(item.get("sku") or "").upper(),
        ]
    )


def _result_key(result: dict[str, Any]) -> str:
    source = result.get("source") or {}
    stable_image_reference = (
        source.get("production_storage_path")
        or result.get("database_image_id")
        or source.get("path")
        or result.get("id")
    )
    return "|".join(
        [
            str(result.get("product_id") or ""),
            str(stable_image_reference or ""),
            str(result.get("position") if result.get("position") is not None else ""),
            str(result.get("sku") or "").upper(),
        ]
    )


def _same_resolved_path(left: str | Path | None, right: str | Path | None) -> bool:
    if left is None or right is None:
        return left is right
    return Path(left).resolve() == Path(right).resolve()


def _artifact_is_valid(metadata: dict[str, Any] | None) -> bool:
    if not metadata or not metadata.get("path") or not metadata.get("sha256"):
        return False
    path = Path(metadata["path"])
    if not path.is_file():
        return False
    expected_bytes = metadata.get("bytes")
    if expected_bytes is not None and path.stat().st_size != int(expected_bytes):
        return False
    return sha256_file(path) == metadata["sha256"]


def _result_is_reusable(result: dict[str, Any], item: dict[str, Any]) -> bool:
    if _result_key(result) != _item_key(item):
        return False
    source_path = Path(item["source_path"]).resolve()
    source = result.get("source") or {}
    if not source_path.is_file() or not _same_resolved_path(source.get("path"), source_path):
        return False
    if sha256_file(source_path) != source.get("sha256"):
        return False
    preprocessing = source.get("preprocessing") or {}
    if preprocessing.get("pre_crop") != item.get("pre_crop"):
        return False

    mask_override_path = item.get("mask_override_path")
    recorded_mask = preprocessing.get("mask_override")
    if mask_override_path:
        resolved_mask = Path(mask_override_path).resolve()
        if (
            not resolved_mask.is_file()
            or not recorded_mask
            or not _same_resolved_path(recorded_mask.get("path"), resolved_mask)
            or sha256_file(resolved_mask) != recorded_mask.get("sha256")
        ):
            return False
    elif recorded_mask:
        return False

    required_artifacts = [
        (result.get("segmentation") or {}).get("cutout"),
        (result.get("qa") or {}).get("comparison"),
        (result.get("qa") or {}).get("edge_check"),
        *((result.get("outputs") or {}).values()),
    ]
    return bool(required_artifacts) and all(_artifact_is_valid(asset) for asset in required_artifacts)


def _load_reusable_results(
    manifest_path: Path,
    *,
    config_sha256: str,
    job_items: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    if not manifest_path.is_file():
        return {}
    try:
        previous = load_json(manifest_path)
    except (OSError, ValueError, json.JSONDecodeError):
        return {}
    if previous.get("config_sha256") != config_sha256:
        return {}
    candidates = {_result_key(result): result for result in previous.get("items", [])}
    reusable: dict[str, dict[str, Any]] = {}
    for item in job_items:
        key = _item_key(item)
        candidate = candidates.get(key)
        if candidate and _result_is_reusable(candidate, item):
            reusable[key] = candidate
    return reusable


def _ordered_values(
    values: dict[str, dict[str, Any]],
    job_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [values[key] for item in job_items if (key := _item_key(item)) in values]


def _manifest_payload(
    *,
    job: dict[str, Any],
    config: dict[str, Any],
    config_path: Path,
    config_sha256: str,
    environment: dict[str, Any],
    results_by_key: dict[str, dict[str, Any]],
    errors_by_key: dict[str, dict[str, Any]],
    reused_count: int,
    processed_this_run: int,
    run_status: str,
    started_at: str,
) -> dict[str, Any]:
    results = _ordered_values(results_by_key, job["items"])
    errors = _ordered_values(errors_by_key, job["items"])
    return {
        "run_id": job["run_id"],
        "pipeline_version": config["pipeline_version"],
        "mode": job.get("mode", "pilot"),
        "generated_at": started_at,
        "updated_at": _utc_now(),
        "run_status": run_status,
        "checkpoint_complete": run_status in {"completed", "completed_with_errors"},
        "published": False,
        "database_modified": False,
        "storage_modified": False,
        "approval_required_before_upload": True,
        "environment": environment,
        "config_path": str(config_path),
        "config_sha256": config_sha256,
        "summary": {
            "requested": len(job["items"]),
            "processed": len(results),
            "errors": len(errors),
            "automatic_pass": sum(
                item["qa"]["automatic_result"] == "pass" for item in results
            ),
            "automatic_warn": sum(
                item["qa"]["automatic_result"] == "warn" for item in results
            ),
            "automatic_fail": sum(
                item["qa"]["automatic_result"] == "fail" for item in results
            ),
            "pending_manual_review": len(results),
            "reused_from_checkpoint": reused_count,
            "processed_this_run": processed_this_run,
        },
        "items": results,
        "errors": errors,
    }


def _process_item(
    item: dict[str, Any],
    *,
    config: dict[str, Any],
    session: Any,
    output_root: Path,
) -> dict[str, Any]:
    source_path = Path(item["source_path"]).resolve()
    if not source_path.is_file():
        raise FileNotFoundError(f"No existe la fuente: {source_path}")
    sku = str(item.get("sku") or "sin-sku").upper()
    image_id = str(item.get("image_id") or sha256_file(source_path)[:12])
    stem = f"{safe_slug(sku)}-{safe_slug(image_id)[:12]}"
    item_dir = output_root / "items" / stem
    cutout_dir = item_dir / "cutout"
    export_dir = item_dir / "exports"
    qa_dir = item_dir / "qa"
    item_dir.mkdir(parents=True, exist_ok=True)

    source_image, source_decode = open_srgb_image(source_path)
    preprocessing: dict[str, Any] = {
        "source_override": bool(item.get("source_override")),
        "pre_crop": None,
        "mask_override": None,
    }
    pre_crop = item.get("pre_crop")
    if pre_crop is not None:
        if (
            not isinstance(pre_crop, list)
            or len(pre_crop) != 4
            or not all(isinstance(value, int) for value in pre_crop)
        ):
            raise ValueError("pre_crop debe ser [left, top, right, bottom] con enteros.")
        left, top, right, bottom = pre_crop
        if left < 0 or top < 0 or right > source_image.width or bottom > source_image.height:
            raise ValueError("pre_crop queda fuera de la imagen fuente.")
        if right <= left or bottom <= top:
            raise ValueError("pre_crop no tiene un área válida.")
        source_image = source_image.crop((left, top, right, bottom))
        preprocessing["pre_crop"] = pre_crop
    mask_override = item.get("mask_override_path")
    if mask_override:
        mask_path = Path(mask_override).resolve()
        with Image.open(mask_path) as opened_mask:
            alpha = opened_mask.convert("L")
        if alpha.size != source_image.size:
            raise ValueError(
                f"La máscara manual mide {alpha.size} y la fuente preparada mide {source_image.size}."
            )
        cutout = source_image.convert("RGBA")
        cutout.putalpha(alpha)
        preprocessing["mask_override"] = {
            **image_metadata(mask_path),
            "reviewed_input": True,
        }
    else:
        cutout = segment_product(
            source_image,
            session=session,
            alpha_matting=bool(config["segmentation"]["alpha_matting"]),
        )
    mask = analyze_mask(
        cutout,
        bbox_threshold=int(config["segmentation"]["alpha_bbox_threshold"]),
        warning_threshold=int(config["segmentation"]["mask_warning_threshold"]),
    )
    cutout_path = cutout_dir / f"{stem}-cutout.png"
    save_cutout(cutout_path, cutout)
    composed, geometry = compose_catalog_image(cutout, config=config)
    export_paths = save_exports(
        composed,
        output_dir=export_dir,
        stem=stem,
        export_config=config["exports"],
    )
    comparison_path = qa_dir / f"{stem}-comparison.jpg"
    edge_path = qa_dir / f"{stem}-edge-check.png"
    save_comparison(source_image, composed, path=comparison_path)
    save_edge_check(cutout, path=edge_path)

    quality = assess_quality(
        source_width=source_image.width,
        source_height=source_image.height,
        mask=mask,
        geometry=geometry,
        config=config,
    )
    outputs = {name: image_metadata(path) for name, path in export_paths.items()}
    result = {
        "id": image_id,
        "database_image_id": item.get("image_id"),
        "product_id": item.get("product_id"),
        "sku": sku,
        "product_name": item.get("product_name"),
        "is_primary": bool(item.get("is_primary", False)),
        "position": item.get("position"),
        "status": "processed_pending_approval",
        "source": {
            **image_metadata(source_path),
            "decode": source_decode,
            "provenance": item.get("source_provenance"),
            "production_url": item.get("production_url"),
            "production_storage_path": item.get("production_storage_path"),
            "dhash": dhash(source_image),
            "preprocessing": preprocessing,
        },
        "segmentation": {
            "model": config["segmentation"]["model"],
            "alpha_matting": config["segmentation"]["alpha_matting"],
            "mask": mask,
            "cutout": image_metadata(cutout_path),
        },
        "composition": {
            "template": config["pipeline_version"],
            "geometry": geometry,
            "background": config["canvas"]["background"],
            "brand_mark": config["brand_mark"],
        },
        "outputs": outputs,
        "qa": {
            "comparison": image_metadata(comparison_path),
            "edge_check": image_metadata(edge_path),
            **quality,
        },
        "review": {
            "decision": "pending",
            "reviewer": None,
            "reviewed_at": None,
            "notes": None,
        },
    }
    save_json(item_dir / "metadata.json", result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Segmenta y normaliza un lote aprobado para el piloto del catálogo."
    )
    parser.add_argument("--job", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    job = load_json(args.job)
    config = load_json(args.config)
    output_root = args.output.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    manifest_path = output_root / "manifest.json"
    config_path = args.config.resolve()
    config_sha256 = sha256_file(config_path)
    started_at = _utc_now()
    model_name = str(config["segmentation"]["model"])
    session = new_session(model_name, providers=["CPUExecutionProvider"])

    model_home = Path(os.environ.get("U2NET_HOME", Path.home() / ".u2net")).resolve()
    model_files = []
    if model_home.is_dir():
        for path in sorted(model_home.glob("*")):
            if path.is_file():
                model_files.append(
                    {
                        "path": str(path),
                        "sha256": sha256_file(path),
                        "bytes": path.stat().st_size,
                    }
                )
    environment = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "pillow": _package_version(PIL),
        "numpy": _package_version(numpy),
        "onnxruntime": _package_version(onnxruntime),
        "rembg": _package_version(rembg),
        "onnx_providers": onnxruntime.get_available_providers(),
        "model_home": str(model_home),
        "model_files": model_files,
    }

    results_by_key = _load_reusable_results(
        manifest_path,
        config_sha256=config_sha256,
        job_items=job["items"],
    )
    reused_count = len(results_by_key)
    errors_by_key: dict[str, dict[str, Any]] = {}
    processed_this_run = 0

    def checkpoint(status: str) -> dict[str, Any]:
        manifest = _manifest_payload(
            job=job,
            config=config,
            config_path=config_path,
            config_sha256=config_sha256,
            environment=environment,
            results_by_key=results_by_key,
            errors_by_key=errors_by_key,
            reused_count=reused_count,
            processed_this_run=processed_this_run,
            run_status=status,
            started_at=started_at,
        )
        save_json(manifest_path, manifest)
        return manifest

    checkpoint("in_progress")
    for index, item in enumerate(job["items"], start=1):
        key = _item_key(item)
        sku = item.get("sku") or "sin-sku"
        if key in results_by_key:
            print(f"[{index}/{len(job['items'])}] {sku} (checkpoint válido)", flush=True)
            continue
        print(f"[{index}/{len(job['items'])}] {sku}", flush=True)
        processed_this_run += 1
        try:
            results_by_key[key] = _process_item(
                item,
                config=config,
                session=session,
                output_root=output_root,
            )
            errors_by_key.pop(key, None)
        except Exception as error:  # noqa: BLE001 - el manifiesto debe conservar fallos por ítem.
            errors_by_key[key] = {
                "item_key": key,
                "sku": sku,
                "image_id": item.get("image_id"),
                "production_storage_path": item.get("production_storage_path"),
                "source_path": item.get("source_path"),
                "error_type": type(error).__name__,
                "error": str(error),
            }
            print(f"ERROR {sku}: {error}", file=sys.stderr, flush=True)
        checkpoint("in_progress")

    final_status = "completed_with_errors" if errors_by_key else "completed"
    manifest = checkpoint(final_status)
    print(json.dumps(manifest["summary"], ensure_ascii=False), flush=True)
    return 1 if errors_by_key else 0


if __name__ == "__main__":
    raise SystemExit(main())
