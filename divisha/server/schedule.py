"""schedule.py — the schedule rules again, for sending reminders while the app is closed.

These mirror the rules in app/helper.js (isDueOn, occurrencesOn). Both are
checked against the same cases in tests/schedule-cases.json, so they can't
drift apart unnoticed.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta

NO_TIME_REMINDER = "09:00"           # an item with no time is reminded at 9 am that day


def _day(key: str) -> date:
    return date.fromisoformat(key)


def times_of(s: dict) -> list[str]:
    if isinstance(s.get("times"), list) and s["times"]:
        return s["times"]
    return [s["time"]] if s.get("time") else []


def _weekday_sun0(d: date) -> int:
    return (d.weekday() + 1) % 7       # 0 = Sunday … 6 = Saturday, as in JavaScript


def is_due_on(s: dict, day: str) -> bool:
    start = s.get("date")
    if s.get("paused") or not start or day < start or (s.get("until") and day > s["until"]):
        return False
    repeat = s.get("repeat")
    if repeat == "daily":
        return (_day(day) - _day(start)).days % max(1, int(s.get("every") or 1)) == 0
    if repeat == "weekly":
        wds = s.get("weekdays") or [_weekday_sun0(_day(start))]
        return _weekday_sun0(_day(day)) in wds
    if repeat == "monthly":
        want, d = int(start[8:]), _day(day)
        return d.day == min(want, monthrange(d.year, d.month)[1])
    return day == start


def occurrences_on(s: dict, day: str) -> list[dict]:
    if not is_due_on(s, day):
        return []
    times = times_of(s)
    return [{"key": f"{day} {t}", "date": day, "time": t} for t in times] if times else [{"key": day, "date": day, "time": ""}]


def reminders_due(s: dict, now_local: datetime, window_minutes: int = 10) -> list[dict]:
    """Occurrences whose reminder time falls in the last `window_minutes` (inclusive of now).

    `now_local` is naive local time for the person's phone. A reminder is sent
    once per occurrence per phone; the caller remembers what it has sent.
    """
    lead = int(s.get("lead", 30) if s.get("lead") is not None else 30)
    today = now_local.date()
    due = []
    for offset in range(-1, 3):                                 # lead can be up to a day
        day = (today + timedelta(days=offset)).isoformat()
        for o in occurrences_on(s, day):
            at = datetime.fromisoformat(f"{o['date']}T{o['time'] or NO_TIME_REMINDER}")
            remind_at = at - timedelta(minutes=0 if not o["time"] else lead)
            if remind_at <= now_local < remind_at + timedelta(minutes=window_minutes):
                due.append({**o, "remind_at": remind_at})
    return due
