import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from server.reminders import Reminders, message
from server.store import Store


class FakePusher:
    """Records what would be sent; `gone` endpoints answer 410 like an unsubscribed phone."""

    def __init__(self):
        self.sent, self.gone = [], set()

    def send(self, sub, msg, ttl=3600):
        if sub["endpoint"] in self.gone:
            return 410
        self.sent.append((sub["endpoint"], msg))
        return 201


def utc(local_iso: str, offset_minutes: int = 330) -> datetime:
    """A Kolkata wall-clock time (UTC+5:30) as UTC."""
    return datetime.fromisoformat(local_iso).replace(tzinfo=timezone(timedelta(minutes=offset_minutes))).astimezone(timezone.utc)


class RemindersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(self.tmp.name)
        self.push = FakePusher()
        self.rem = Reminders(self.store, self.push)
        self.store.add_push_sub("https://push.example/rohit", "u_rohit", {"p256dh": "x", "auth": "y"}, "Asia/Kolkata")
        self.store.add_push_sub("https://push.example/ananya", "u_ananya", {"p256dh": "x", "auth": "y"}, "Asia/Kolkata")
        self.store.set("schedules/syrup", {"what": "Cough syrup 5 ml", "repeat": "daily", "date": "2026-11-01", "times": ["09:00", "21:00"], "lead": 30, "details": "after food"})

    def tearDown(self):
        self.store.db.close()
        self.tmp.cleanup()

    def titles(self):
        return [(e.rsplit("/", 1)[1], m["title"], m["body"]) for e, m in self.push.sent]

    def test_sent_30_minutes_before_once_to_each_phone(self):
        self.assertEqual(self.rem.tick(utc("2026-11-02T08:29")), 0)
        self.assertEqual(self.rem.tick(utc("2026-11-02T08:30")), 2)
        self.assertEqual(self.titles(), [("rohit", "Cough syrup 5 ml", "In 30 minutes, at 9 am · after food"), ("ananya", "Cough syrup 5 ml", "In 30 minutes, at 9 am · after food")])
        self.assertEqual(self.rem.tick(utc("2026-11-02T08:31")), 0, "never twice")
        self.assertEqual(self.push.sent[0][1]["tag"], "syrup|2026-11-02 09:00")

    def test_done_or_skipped_isnt_reminded(self):
        self.store.update("schedules/syrup", {"done": {"2026-11-02 21:00": {"status": "done"}}})
        self.assertEqual(self.rem.tick(utc("2026-11-02T20:30")), 0)

    def test_an_item_for_one_person_goes_only_to_their_phones(self):
        self.store.update("schedules/syrup", {"for": "u_ananya"})
        self.rem.tick(utc("2026-11-02T08:30"))
        self.assertEqual([t[0] for t in self.titles()], ["ananya"])

    def test_each_phone_uses_its_own_time_zone(self):
        self.store.remove_push_sub("https://push.example/ananya")
        self.store.add_push_sub("https://push.example/london", "u_ananya", {"p256dh": "x", "auth": "y"}, "Europe/London")
        self.rem.tick(datetime(2026, 11, 2, 8, 30, tzinfo=timezone.utc))      # 08:30 in London, 14:00 in Kolkata
        self.assertEqual([t[0] for t in self.titles()], ["london"])

    def test_snooze_comes_back_later(self):
        self.store.add_snooze("https://push.example/rohit", "syrup", "2026-11-02 09:00", utc("2026-11-02T08:40").isoformat())
        self.rem.tick(utc("2026-11-02T08:39"))
        self.push.sent.clear()
        self.rem.tick(utc("2026-11-02T08:40"))
        self.assertEqual(self.titles(), [("rohit", "Snoozed: Cough syrup 5 ml", "In 20 minutes, at 9 am · after food")])
        self.rem.tick(utc("2026-11-02T08:41"))
        self.assertEqual(len(self.push.sent), 1, "a snooze comes back once")

    def test_a_phone_that_turned_notifications_off_is_forgotten(self):
        self.push.gone.add("https://push.example/rohit")
        self.rem.tick(utc("2026-11-02T08:30"))
        self.assertEqual([s["endpoint"] for s in self.store.push_subs()], ["https://push.example/ananya"])

    def test_paused_items_are_quiet(self):
        self.store.update("schedules/syrup", {"paused": True})
        self.assertEqual(self.rem.tick(utc("2026-11-02T08:30")), 0)

    def test_message_wording(self):
        s = {"id": "v", "what": "Dr Mehta follow-up", "details": ""}
        self.assertEqual(message(s, {"key": "2026-11-03 10:00", "date": "2026-11-03", "time": "10:00"}, datetime(2026, 11, 2, 10, 0))["body"], "Tomorrow at 10 am")
        self.assertEqual(message(s, {"key": "2026-11-02 10:00", "date": "2026-11-02", "time": "10:00"}, datetime(2026, 11, 2, 10, 0))["body"], "Now, 10 am")
        self.assertEqual(message(s, {"key": "2026-11-02", "date": "2026-11-02", "time": ""}, datetime(2026, 11, 2, 9, 0))["body"], "Today")


if __name__ == "__main__":
    unittest.main()
