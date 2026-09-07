from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from catalog_image_common import image_metadata, save_json, sha256_file
from composition import compose_catalog_image, save_exports
from process_batch import _item_key, _load_reusable_results
from quality import assess_quality
from segmentation import analyze_mask


SCRIPT_DIR = Path(__file__).resolve().parents[1]


class CatalogImagePipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(
            (SCRIPT_DIR / "catalog-style-v1.json").read_text(encoding="utf-8")
        )

    def test_square_canvas_and_safe_margin(self) -> None:
        cutout = Image.new("RGBA", (900, 1200), (0, 0, 0, 0))
        draw = ImageDraw.Draw(cutout)
        draw.rounded_rectangle((100, 80, 800, 1100), radius=40, fill=(30, 80, 160, 255))
        composed, geometry = compose_catalog_image(cutout, config=self.config)
        self.assertEqual((1600, 1600), composed.size)
        self.assertEqual("RGB", composed.mode)
        self.assertGreaterEqual(geometry["minimum_margin_pixels"], 128)
        self.assertLessEqual(geometry["subject_max_fraction"], 0.7801)

    def test_exports_have_expected_dimensions(self) -> None:
        composed = Image.new("RGB", (1600, 1600), "#F4F4F2")
        with tempfile.TemporaryDirectory() as directory:
            paths = save_exports(
                composed,
                output_dir=Path(directory),
                stem="test",
                export_config=self.config["exports"],
            )
            self.assertEqual({"master", "catalog", "card", "thumbnail"}, set(paths))
            for name, expected in self.config["exports"].items():
                with Image.open(paths[name]) as image:
                    self.assertEqual((expected["width"], expected["height"]), image.size)

    def test_quality_never_auto_approves(self) -> None:
        result = assess_quality(
            source_width=1200,
            source_height=1600,
            mask={
                "empty": False,
                "touches_source_edges": False,
                "foreground_fraction": 0.4,
                "uncertain_alpha_fraction": 0.02,
                "significant_component_count": 1,
            },
            geometry={"minimum_margin_pixels": 128},
            config=self.config,
        )
        self.assertEqual("pass", result["automatic_result"])
        self.assertEqual("pending_manual_review", result["review_status"])

    def test_empty_mask_is_blocking(self) -> None:
        result = assess_quality(
            source_width=1200,
            source_height=1600,
            mask={
                "empty": True,
                "touches_source_edges": True,
                "foreground_fraction": 0.0,
                "uncertain_alpha_fraction": 0.0,
                "significant_component_count": 0,
            },
            geometry={"minimum_margin_pixels": 128},
            config=self.config,
        )
        self.assertEqual("fail", result["automatic_result"])
        self.assertIn("empty_mask", result["blocking_issues"])

    def test_multiple_large_subjects_are_flagged_conservatively(self) -> None:
        rgba = Image.new("RGBA", (480, 480), (0, 0, 0, 0))
        draw = ImageDraw.Draw(rgba)
        draw.rectangle((35, 70, 225, 410), fill=(30, 40, 50, 255))
        draw.rectangle((270, 95, 445, 385), fill=(80, 90, 100, 255))
        mask = analyze_mask(rgba, bbox_threshold=8, warning_threshold=16)
        result = assess_quality(
            source_width=480,
            source_height=480,
            mask=mask,
            geometry={"minimum_margin_pixels": 128},
            config=self.config,
        )
        self.assertGreaterEqual(mask["opened_significant_component_count"], 2)
        self.assertIn("possible_multiple_subjects", result["warnings"])
        self.assertEqual("warn", result["automatic_result"])
        self.assertEqual([], result["blocking_issues"])

    def test_soft_residue_outside_robust_bbox_is_flagged(self) -> None:
        rgba = Image.new("RGBA", (400, 500), (0, 0, 0, 0))
        draw = ImageDraw.Draw(rgba)
        draw.rectangle((90, 110, 320, 450), fill=(50, 60, 70, 255))
        draw.rectangle((95, 20, 145, 35), fill=(50, 60, 70, 10))
        mask = analyze_mask(rgba, bbox_threshold=8, warning_threshold=16)
        result = assess_quality(
            source_width=400,
            source_height=500,
            mask=mask,
            geometry={"minimum_margin_pixels": 128},
            config=self.config,
        )
        self.assertGreater(mask["soft_bbox_extension_fraction"]["top"], 0.04)
        self.assertIn("soft_mask_extends_beyond_core", result["warnings"])
        self.assertEqual([], result["blocking_issues"])

    def test_transparency_never_becomes_a_hard_failure_by_itself(self) -> None:
        rgba = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
        draw = ImageDraw.Draw(rgba)
        draw.rounded_rectangle((55, 55, 345, 345), radius=24, fill=(120, 130, 140, 128))
        mask = analyze_mask(rgba, bbox_threshold=8, warning_threshold=16)
        result = assess_quality(
            source_width=400,
            source_height=400,
            mask=mask,
            geometry={"minimum_margin_pixels": 128},
            config=self.config,
        )
        self.assertGreater(mask["uncertain_alpha_subject_fraction"], 0.95)
        self.assertEqual([], result["blocking_issues"])
        self.assertNotEqual("fail", result["automatic_result"])

    def test_core_edge_contact_is_reported_as_possible_crop(self) -> None:
        rgba = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
        draw = ImageDraw.Draw(rgba)
        draw.rectangle((0, 80, 300, 330), fill=(20, 30, 40, 255))
        mask = analyze_mask(rgba, bbox_threshold=8, warning_threshold=16)
        result = assess_quality(
            source_width=400,
            source_height=400,
            mask=mask,
            geometry={"minimum_margin_pixels": 128},
            config=self.config,
        )
        self.assertTrue(mask["core_edge_contact"])
        self.assertIn("foreground_core_touches_source_edge", result["warnings"])
        self.assertIn("possible_source_crop", result["warnings"])

    def test_checkpoint_reuses_only_complete_unchanged_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_path = root / "source.png"
            artifact_path = root / "artifact.png"
            Image.new("RGB", (64, 64), "white").save(source_path)
            Image.new("RGBA", (64, 64), (20, 30, 40, 255)).save(artifact_path)
            artifact = image_metadata(artifact_path)
            item = {
                "image_id": None,
                "product_id": "product-1",
                "sku": "SKU-001",
                "position": 0,
                "source_path": str(source_path),
                "pre_crop": None,
                "mask_override_path": None,
                "production_storage_path": "product-1/original.webp",
            }
            result = {
                "id": "review-1",
                "database_image_id": None,
                "product_id": "product-1",
                "sku": "SKU-001",
                "position": 0,
                "source": {
                    "path": str(source_path.resolve()),
                    "sha256": sha256_file(source_path),
                    "production_storage_path": "product-1/original.webp",
                    "preprocessing": {"pre_crop": None, "mask_override": None},
                },
                "segmentation": {"cutout": artifact},
                "outputs": {"master": artifact},
                "qa": {"comparison": artifact, "edge_check": artifact},
            }
            manifest_path = root / "manifest.json"
            save_json(
                manifest_path,
                {
                    "config_sha256": "config-hash",
                    "items": [result],
                },
            )
            reusable = _load_reusable_results(
                manifest_path,
                config_sha256="config-hash",
                job_items=[item],
            )
            self.assertIn(_item_key(item), reusable)

            Image.new("RGB", (64, 64), "black").save(source_path)
            reusable_after_change = _load_reusable_results(
                manifest_path,
                config_sha256="config-hash",
                job_items=[item],
            )
            self.assertEqual({}, reusable_after_change)


if __name__ == "__main__":
    unittest.main()
