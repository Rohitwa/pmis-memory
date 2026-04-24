"""
Target frame segmenter — groups consecutive screenshots into meaningful segments.
A new segment starts when the work context changes.
"""

import logging
import re
from collections import deque
from datetime import datetime, date

import numpy as np
from PIL import Image
try:
    from skimage.metrics import structural_similarity as ssim
except ImportError:
    # Fallback: simple MSE-based similarity if scikit-image not installed
    def ssim(img1, img2, **kwargs):
        """Fallback SSIM approximation using normalized MSE."""
        diff = (img1.astype(float) - img2.astype(float)) / 255.0
        mse = np.mean(diff ** 2)
        return max(0.0, 1.0 - mse * 10)  # rough approximation

logger = logging.getLogger("tracker.segmenter")


def sanitize_id(raw: str, max_len: int = 200) -> str:
    """Sanitize a string for use as a ChromaDB or DB ID."""
    clean = re.sub(r"[^a-zA-Z0-9_\-]", "_", raw)
    clean = re.sub(r"_+", "_", clean).strip("_")
    return clean[:max_len]


class TargetFrameSegmenter:
    """Groups consecutive frames into target segments based on context changes."""

    def __init__(self, config: dict):
        self.ssim_threshold = config["segmentation"]["ssim_threshold"]
        self.skip_threshold = config["tracking"]["skip_similar_threshold"]
        self.min_segment_secs = config["segmentation"]["min_segment_secs"]
        # dHash pre-filter (Tier 1). Catches obvious duplicates in ~1ms against
        # a rolling buffer, short-circuiting the ~15ms SSIM path. Hamming
        # distance is out of 64 bits; ≤5 ≈ >92% bit agreement.
        tracking_cfg = config.get("tracking", {})
        self.dhash_skip_hamming = tracking_cfg.get("dhash_skip_hamming", 5)
        self.dhash_buffer_size = tracking_cfg.get("dhash_buffer_size", 10)

        # State
        self._counter = 0
        self._date = None
        self._current_segment = None
        self._last_window_info = None
        self._last_image_array = None
        self._last_agent_state = None
        # Separate reference for near-duplicate skip — only updated when a
        # frame is actually queued for VLM analysis (via mark_frame_analyzed).
        # Using _last_image_array here would break: should_start_new_segment
        # overwrites it on every call, so skip SSIM would always be 1.0.
        self._last_analyzed_image_array = None
        # Rolling buffer of dHashes from the last N analyzed frames. Deque
        # with maxlen so oldest entries auto-evict. Catches "tab-flipping"
        # duplicates that a single-reference SSIM check misses.
        self._analyzed_dhashes: deque = deque(maxlen=self.dhash_buffer_size)

    def load_last_segment_counter(self, max_counter_today: int = 0):
        """
        Set counter to resume after restart.
        Caller queries db.get_max_segment_number(today) and passes the result.
        """
        today = date.today().strftime("%Y%m%d")
        self._date = today
        self._counter = max_counter_today

    def should_start_new_segment(
        self,
        window_info: dict,
        screenshot_path: str,
        agent_active: bool,
    ) -> bool:
        """
        Determine if a new segment should start.
        Updates internal state (image, window, agent) after every call.

        Triggers:
        1. Window changed (different app or title)
        2. Visual content changed significantly (SSIM < threshold)
        3. Agent state changed (agent started or stopped)
        """
        current_array = self._load_image_gray(screenshot_path)
        needs_new = False

        # First frame ever
        if self._last_window_info is None:
            needs_new = True
        else:
            # Trigger 1: Window change
            if (
                window_info.get("bundle_id") != self._last_window_info.get("bundle_id")
                or window_info.get("title") != self._last_window_info.get("title")
            ):
                logger.debug("New segment: window changed")
                needs_new = True

            # Trigger 2: Agent state boundary
            elif self._last_agent_state is not None and agent_active != self._last_agent_state:
                logger.debug(f"New segment: agent state changed to {agent_active}")
                needs_new = True

            # Trigger 3: Visual diff
            elif self._last_image_array is not None and current_array is not None:
                try:
                    score = ssim(self._last_image_array, current_array)
                    if score < self.ssim_threshold:
                        logger.debug(f"New segment: visual diff (SSIM={score:.2f})")
                        needs_new = True
                except Exception as e:
                    logger.debug(f"SSIM comparison failed: {e}")

        # FIX C2: Always update state after comparison so next call has fresh data
        self._last_window_info = window_info
        self._last_agent_state = agent_active
        if current_array is not None:
            self._last_image_array = current_array

        return needs_new

    def should_skip_frame(self, screenshot_path: str) -> bool:
        """Two-tier near-duplicate detector.

        Tier 1 (cheap, ~1ms): dHash Hamming distance vs a rolling buffer of
        recent analyzed frames. Catches tab-flip cycles and static screens.
        Tier 2 (fallback, ~15ms): SSIM vs the single last analyzed frame.
        Catches perceptual duplicates dHash's 64-bit quantization misses.
        """
        # Tier 1: dHash against rolling buffer
        current_hash = self._compute_dhash(screenshot_path)
        if current_hash is not None and self._analyzed_dhashes:
            for h in self._analyzed_dhashes:
                if (current_hash ^ h).bit_count() <= self.dhash_skip_hamming:
                    return True

        # Tier 2: SSIM fallback for borderline cases dHash missed
        try:
            current_array = self._load_image_gray(screenshot_path)
            if self._last_analyzed_image_array is not None and current_array is not None:
                score = ssim(self._last_analyzed_image_array, current_array)
                return score > self.skip_threshold
        except Exception:
            pass
        return False

    def mark_frame_analyzed(self, screenshot_path: str) -> None:
        """Record this frame as the new skip reference. Call after queueing
        a frame for VLM analysis so the next frame is compared against it.
        Updates both the SSIM reference and the dHash rolling buffer."""
        try:
            current_array = self._load_image_gray(screenshot_path)
            if current_array is not None:
                self._last_analyzed_image_array = current_array
        except Exception:
            pass
        current_hash = self._compute_dhash(screenshot_path)
        if current_hash is not None:
            self._analyzed_dhashes.append(current_hash)

    def _compute_dhash(self, screenshot_path: str) -> int | None:
        """64-bit difference hash: 9×8 grayscale, left-right pixel comparisons.
        Each row yields 8 bits; 8 rows → 64 bits packed into an int.
        Returns None if the image can't be loaded."""
        try:
            img = Image.open(screenshot_path).convert("L").resize((9, 8))
            pixels = img.tobytes()
            hash_val = 0
            bit = 1
            for row in range(8):
                row_start = row * 9
                for col in range(8):
                    if pixels[row_start + col] > pixels[row_start + col + 1]:
                        hash_val |= bit
                    bit <<= 1
            return hash_val
        except Exception:
            return None

    def start_new_segment(self, window_info: dict, agent_active: bool) -> str:
        """Create a new segment and return its ID."""
        today = date.today().strftime("%Y%m%d")
        if self._date != today:
            self._date = today
            self._counter = 0

        self._counter += 1
        segment_id = f"TS-{today}-{self._counter:04d}"

        self._current_segment = {
            "id": segment_id,
            "start_time": datetime.now(),
            "window_info": window_info,
            "agent_active": agent_active,
        }
        # Reset dedup references so the first frame of a new segment always
        # gets analyzed (establishes the baseline for this context).
        self._last_analyzed_image_array = None
        self._analyzed_dhashes.clear()

        logger.info(f"Started segment {segment_id}: {window_info.get('app_name', '?')}")
        return segment_id

    def get_current_segment(self) -> dict | None:
        return self._current_segment

    def _load_image_gray(self, path: str) -> np.ndarray | None:
        """Load image as grayscale numpy array, resized for fast SSIM."""
        try:
            img = Image.open(path).convert("L").resize((320, 180))
            return np.array(img)
        except Exception:
            return None
