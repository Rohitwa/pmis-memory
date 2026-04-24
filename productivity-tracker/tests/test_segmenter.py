"""Tests for the target frame segmenter."""

import pytest
from unittest.mock import patch
from src.pipeline.segmenter import TargetFrameSegmenter, sanitize_id


@pytest.fixture
def config():
    return {
        "segmentation": {"ssim_threshold": 0.7, "min_segment_secs": 15},
        "tracking": {"skip_similar_threshold": 0.95, "frame_batch_size": 4},
    }


@pytest.fixture
def segmenter(config):
    return TargetFrameSegmenter(config)


class TestSegmenter:
    def test_first_frame_always_new_segment(self, segmenter):
        """First frame ever should always trigger a new segment."""
        # Mock image loading to avoid needing real files
        with patch.object(segmenter, "_load_image_gray", return_value=None):
            assert segmenter.should_start_new_segment(
                window_info={"bundle_id": "com.google.Chrome", "title": "Test"},
                screenshot_path="/tmp/test.jpg",
                agent_active=False,
            )

    def test_window_change_triggers_new_segment(self, segmenter):
        """Changing app or window title should start a new segment."""
        with patch.object(segmenter, "_load_image_gray", return_value=None):
            # First frame sets state
            segmenter.should_start_new_segment(
                window_info={"bundle_id": "com.google.Chrome", "title": "Page 1"},
                screenshot_path="/tmp/test1.jpg",
                agent_active=False,
            )
            # Different window — should trigger
            assert segmenter.should_start_new_segment(
                window_info={"bundle_id": "com.apple.Terminal", "title": "bash"},
                screenshot_path="/tmp/test2.jpg",
                agent_active=False,
            )

    def test_same_window_no_new_segment(self, segmenter):
        """Same window with no visual change should NOT start a new segment."""
        with patch.object(segmenter, "_load_image_gray", return_value=None):
            info = {"bundle_id": "com.google.Chrome", "title": "Same Page"}
            # First frame
            segmenter.should_start_new_segment(
                window_info=info, screenshot_path="/tmp/t1.jpg", agent_active=False,
            )
            # Same window, no image array = skip SSIM
            assert not segmenter.should_start_new_segment(
                window_info=info, screenshot_path="/tmp/t2.jpg", agent_active=False,
            )

    def test_agent_state_change_triggers_segment(self, segmenter):
        """Agent starting or stopping should create a segment boundary."""
        with patch.object(segmenter, "_load_image_gray", return_value=None):
            info = {"bundle_id": "com.apple.Terminal", "title": "bash"}
            # First frame — human
            segmenter.should_start_new_segment(
                window_info=info, screenshot_path="/tmp/t1.jpg", agent_active=False,
            )
            # Agent started — should trigger
            assert segmenter.should_start_new_segment(
                window_info=info, screenshot_path="/tmp/t2.jpg", agent_active=True,
            )

    def test_state_updates_after_each_call(self, segmenter):
        """Internal state (window, agent) should update after every call (FIX C2)."""
        with patch.object(segmenter, "_load_image_gray", return_value=None):
            segmenter.should_start_new_segment(
                window_info={"bundle_id": "a", "title": "x"},
                screenshot_path="/tmp/t.jpg",
                agent_active=False,
            )
            # State should be updated
            assert segmenter._last_window_info["bundle_id"] == "a"
            assert segmenter._last_agent_state is False

            segmenter.should_start_new_segment(
                window_info={"bundle_id": "b", "title": "y"},
                screenshot_path="/tmp/t.jpg",
                agent_active=True,
            )
            # State updated again
            assert segmenter._last_window_info["bundle_id"] == "b"
            assert segmenter._last_agent_state is True

    def test_segment_id_format(self, segmenter):
        sid = segmenter.start_new_segment(
            window_info={"bundle_id": "test", "title": "test"},
            agent_active=False,
        )
        assert sid.startswith("TS-")
        parts = sid.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8   # YYYYMMDD
        assert len(parts[2]) == 4   # 0001

    def test_sequential_ids(self, segmenter):
        s1 = segmenter.start_new_segment({"bundle_id": "a", "title": "a"}, False)
        s2 = segmenter.start_new_segment({"bundle_id": "b", "title": "b"}, False)
        n1 = int(s1.split("-")[2])
        n2 = int(s2.split("-")[2])
        assert n2 == n1 + 1

    def test_counter_survives_load(self, segmenter):
        """Loading a counter from DB should set the right starting point (FIX M1)."""
        segmenter.load_last_segment_counter(max_counter_today=42)
        sid = segmenter.start_new_segment({"bundle_id": "a", "title": "a"}, False)
        assert sid.endswith("-0043")


class TestFrameDedup:
    def test_skip_returns_false_when_no_reference(self, segmenter):
        """Before mark_frame_analyzed is called, skip must never fire —
        otherwise the first frame of a new segment would be dropped."""
        import numpy as np
        with patch.object(
            segmenter, "_load_image_gray",
            return_value=np.zeros((180, 320), dtype=np.uint8),
        ):
            assert not segmenter.should_skip_frame("/tmp/t.jpg")

    def test_skip_identical_frames(self, segmenter):
        """Two identical frames after mark_frame_analyzed → skip."""
        import numpy as np
        frame = np.full((180, 320), 128, dtype=np.uint8)
        with patch.object(segmenter, "_load_image_gray", return_value=frame):
            segmenter.mark_frame_analyzed("/tmp/t1.jpg")
            assert segmenter.should_skip_frame("/tmp/t2.jpg")

    def test_no_skip_on_different_frames(self, segmenter):
        """SSIM below skip_threshold (0.95) → do not skip."""
        import numpy as np
        a = np.zeros((180, 320), dtype=np.uint8)
        b = np.full((180, 320), 255, dtype=np.uint8)

        with patch.object(segmenter, "_load_image_gray", return_value=a):
            segmenter.mark_frame_analyzed("/tmp/a.jpg")

        with patch.object(segmenter, "_load_image_gray", return_value=b):
            assert not segmenter.should_skip_frame("/tmp/b.jpg")

    def test_new_segment_resets_skip_reference(self, segmenter):
        """start_new_segment must clear the dedup reference so the first
        frame of a new context is always analyzed."""
        import numpy as np
        frame = np.full((180, 320), 50, dtype=np.uint8)
        with patch.object(segmenter, "_load_image_gray", return_value=frame):
            segmenter.mark_frame_analyzed("/tmp/t.jpg")
            assert segmenter._last_analyzed_image_array is not None
            segmenter.start_new_segment({"bundle_id": "x", "title": "y"}, False)
            assert segmenter._last_analyzed_image_array is None


class TestDHash:
    """Tests for the Tier-1 dHash pre-filter and rolling buffer."""

    def _write_image(self, arr, path):
        """Save a numpy grayscale array as PNG for dHash to read."""
        from PIL import Image
        Image.fromarray(arr).save(path)

    def test_identical_images_same_hash(self, segmenter, tmp_path):
        """dHash of two identical images must be equal (Hamming = 0)."""
        import numpy as np
        arr = (np.arange(9 * 8).reshape(8, 9) * 3).astype(np.uint8)
        p1, p2 = tmp_path / "a.png", tmp_path / "b.png"
        self._write_image(arr, p1)
        self._write_image(arr, p2)
        h1 = segmenter._compute_dhash(str(p1))
        h2 = segmenter._compute_dhash(str(p2))
        assert h1 == h2

    def test_different_images_differ_above_threshold(self, segmenter, tmp_path):
        """A checkerboard and a solid image must differ by >> skip threshold."""
        import numpy as np
        solid = np.full((8, 9), 128, dtype=np.uint8)
        checker = np.zeros((8, 9), dtype=np.uint8)
        checker[::2, ::2] = 255
        checker[1::2, 1::2] = 255
        p1, p2 = tmp_path / "solid.png", tmp_path / "check.png"
        self._write_image(solid, p1)
        self._write_image(checker, p2)
        h1 = segmenter._compute_dhash(str(p1))
        h2 = segmenter._compute_dhash(str(p2))
        assert (h1 ^ h2).bit_count() > segmenter.dhash_skip_hamming

    def test_tier1_dhash_catches_duplicate(self, segmenter, tmp_path):
        """should_skip_frame must return True via dHash alone, without
        needing SSIM (Tier 2 reference never set)."""
        import numpy as np
        arr = (np.arange(9 * 8).reshape(8, 9) * 3).astype(np.uint8)
        p1, p2 = tmp_path / "a.png", tmp_path / "b.png"
        self._write_image(arr, p1)
        self._write_image(arr, p2)
        # Only seed the dHash buffer, not _last_analyzed_image_array
        h = segmenter._compute_dhash(str(p1))
        segmenter._analyzed_dhashes.append(h)
        assert segmenter.should_skip_frame(str(p2)) is True

    def test_buffer_capacity_respected(self, segmenter, tmp_path):
        """Rolling buffer must auto-evict at dhash_buffer_size."""
        import numpy as np
        for i in range(segmenter.dhash_buffer_size + 5):
            arr = np.full((8, 9), i * 3 % 255, dtype=np.uint8)
            p = tmp_path / f"f{i}.png"
            self._write_image(arr, p)
            segmenter.mark_frame_analyzed(str(p))
        assert len(segmenter._analyzed_dhashes) == segmenter.dhash_buffer_size

    def test_buffer_cleared_on_new_segment(self, segmenter, tmp_path):
        """start_new_segment must clear the dHash buffer alongside SSIM ref."""
        import numpy as np
        arr = np.full((8, 9), 50, dtype=np.uint8)
        p = tmp_path / "f.png"
        self._write_image(arr, p)
        segmenter.mark_frame_analyzed(str(p))
        assert len(segmenter._analyzed_dhashes) == 1
        segmenter.start_new_segment({"bundle_id": "x", "title": "y"}, False)
        assert len(segmenter._analyzed_dhashes) == 0


class TestSanitizeId:
    def test_spaces_replaced(self):
        assert " " not in sanitize_id("Product Development - Frontend")

    def test_max_length(self):
        long = "a" * 300
        assert len(sanitize_id(long)) <= 200

    def test_special_chars_replaced(self):
        result = sanitize_id("hourly-2026-04-02-15-Product Dev/Test")
        assert "/" not in result
        assert all(c.isalnum() or c in "_-" for c in result)

    def test_no_double_underscores(self):
        result = sanitize_id("a   b   c")
        assert "__" not in result
