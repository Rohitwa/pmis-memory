import json
import unittest
from datetime import datetime
from pathlib import Path

from server.schedule import occurrences_on, reminders_due

CASES = json.loads((Path(__file__).parents[2] / "tests" / "schedule-cases.json").read_text())


class ScheduleRulesTest(unittest.TestCase):
    """The same cases the app's tests use (tests/schedule-cases.json)."""

    def test_due(self):
        for case in CASES["due"]:
            for day, keys in case["days"].items():
                with self.subTest(case["name"], day=day):
                    self.assertEqual([o["key"] for o in occurrences_on({"what": "x", **case["s"]}, day)], keys)

    def test_reminders(self):
        for case in CASES["reminders"]:
            for at, keys in case["at"].items():
                with self.subTest(case["name"], at=at):
                    self.assertEqual([o["key"] for o in reminders_due({"what": "x", **case["s"]}, datetime.fromisoformat(at))], keys)


if __name__ == "__main__":
    unittest.main()
