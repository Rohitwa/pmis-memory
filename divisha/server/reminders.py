"""reminders.py — sends each schedule reminder to the phones that turned reminders on.

Every 30 seconds it looks at her schedule, works out what is due in each
phone's own time zone (30 minutes before by default), and sends a push
notification once per occurrence per phone. Anything already marked Done or
Skipped is left alone. Snoozed reminders come back after 10 minutes.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .push import Pusher
from .schedule import reminders_due
from .store import Store

log = logging.getLogger("divisha.reminders")
DEFAULT_TZ = os.environ.get("DEFAULT_TZ", "Asia/Kolkata")


def zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TZ)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_TZ)


def time_text(t: str) -> str:
    h, m = (int(x) for x in t.split(":"))
    return f"{h % 12 or 12}{f':{m:02d}' if m else ''} {'am' if h < 12 else 'pm'}"


def message(s: dict, occ: dict, now_local: datetime, *, snoozed: bool = False) -> dict:
    if occ["time"]:
        at = datetime.fromisoformat(f"{occ['date']}T{occ['time']}")
        minutes = round((at - now_local).total_seconds() / 60)
        clock = time_text(occ["time"])
        if at.date() > now_local.date():
            when = f"Tomorrow at {clock}"
        elif minutes <= 1:
            when = f"Now, {clock}"
        elif minutes < 60:
            when = f"In {minutes} minutes, at {clock}"
        else:
            when = f"Today at {clock}"
    else:
        when = "Today"
    body = when + (f" · {s['details']}" if s.get("details") else "")
    return {
        "title": ("Snoozed: " if snoozed else "") + s.get("what", "Reminder"),
        "body": body,
        "tag": f"{s['id']}|{occ['key']}",
        "scheduleId": s["id"], "key": occ["key"], "url": "/#schedule",
    }


class Reminders:
    def __init__(self, store: Store, pusher: Pusher, interval: float = 30):
        self.store, self.pusher, self.interval = store, pusher, interval

    async def run(self) -> None:
        while True:
            try:
                await asyncio.to_thread(self.tick, datetime.now(timezone.utc))
            except Exception:
                log.exception("Reminder check failed")
            await asyncio.sleep(self.interval)

    def _send(self, sub: dict, msg: dict) -> bool:
        status = self.pusher.send({"endpoint": sub["endpoint"], "keys": sub["keys"]}, msg)
        if status in (404, 410):
            log.info("A phone turned reminders off; forgetting it")
            self.store.remove_push_sub(sub["endpoint"])
            return True                                           # nothing more to do for it
        return 200 <= status < 300

    def tick(self, now_utc: datetime) -> int:
        subs = self.store.push_subs()
        if not subs:
            return 0
        schedules = [dict(d["data"], id=d["id"]) for d in self.store.query("schedules")]
        by_id = {s["id"]: s for s in schedules}
        sent = 0
        for sub in subs:
            now_local = now_utc.astimezone(zone(sub["tz"])).replace(tzinfo=None)
            for s in schedules:
                if s.get("for") and s["for"] != sub["user_id"]:
                    continue
                for occ in reminders_due(s, now_local):
                    if (s.get("done") or {}).get(occ["key"]) or self.store.was_sent(s["id"], occ["key"], sub["endpoint"]):
                        continue
                    if self._send(sub, message(s, occ, now_local)):
                        self.store.mark_sent(s["id"], occ["key"], sub["endpoint"])
                        sent += 1
        for snooze in self.store.due_snoozes(now_utc.isoformat()):
            s = by_id.get(snooze["schedule_id"])
            sub = next((x for x in subs if x["endpoint"] == snooze["endpoint"]), None)
            if s and sub and not (s.get("done") or {}).get(snooze["occ_key"]):
                date_part, _, time_part = snooze["occ_key"].partition(" ")
                now_local = now_utc.astimezone(zone(sub["tz"])).replace(tzinfo=None)
                if not self._send(sub, message(s, {"key": snooze["occ_key"], "date": date_part, "time": time_part}, now_local, snoozed=True)):
                    continue
                sent += 1
            self.store.mark_snooze_sent(snooze["id"])
        self.store.prune_sent((now_utc - timedelta(days=3)).isoformat())
        return sent
