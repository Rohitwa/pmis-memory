"""Run with:  python -m unittest discover -s server/tests -t .   (from divisha/)"""

import tempfile
import unittest

from server.store import Store, StoreError, check_password, hash_password, merge


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(self.tmp.name)

    def tearDown(self):
        self.store.db.close()
        self.tmp.cleanup()

    def test_documents_are_set_read_merged_and_deleted(self):
        s = self.store
        self.assertEqual(s.get("profile/divisha")["exists"], False)
        s.set("chats/2026-10-31", {"day": "2026-10-31", "messages": {"a": {"text": "hi"}}})
        s.update("chats/2026-10-31", {"messages": {"b": {"text": "there"}}})
        doc = s.get("chats/2026-10-31")
        self.assertEqual(sorted(doc["data"]["messages"]), ["a", "b"], "two parents' messages both survive")
        self.assertEqual(doc["version"], 2)
        s.update("chats/2026-10-31", {"messages": {"a": {"proposal": None}}})
        self.assertEqual(s.get("chats/2026-10-31")["data"]["messages"]["a"], {"text": "hi", "proposal": None})
        s.delete("chats/2026-10-31")
        self.assertFalse(s.get("chats/2026-10-31")["exists"])

    def test_update_needs_an_existing_document(self):
        with self.assertRaises(StoreError) as e:
            self.store.update("chats/2026-10-31", {"x": 1})
        self.assertEqual(e.exception.code, "invalid_argument")

    def test_paths_are_checked(self):
        for bad in ("", "entries", "entries/../x", "a/b/c", "entries/has space"):
            with self.assertRaises(StoreError):
                self.store.set(bad, {})
        with self.assertRaises(StoreError):
            self.store.query("entries/x")

    def test_queries_filter_order_and_limit(self):
        s = self.store
        for i, (d, t) in enumerate([("2026-10-01", "care"), ("2026-10-03", "symptom"), ("2026-10-02", "care"), (None, "care")]):
            s.set(f"entries/e{i}", {"date": d, "type": t} if d else {"type": t})
        dates = [x["data"].get("date") for x in s.query("entries", order=["date", "desc"])]
        self.assertEqual(dates, ["2026-10-03", "2026-10-02", "2026-10-01", None], "missing fields sort last")
        care = s.query("entries", where=[["type", "==", "care"], ["date", ">=", "2026-10-02"]])
        self.assertEqual([x["id"] for x in care], ["e2"])
        self.assertEqual(len(s.query("entries", limit=2)), 2)
        self.assertEqual(s.query("other"), [])

    def test_documents_have_a_size_limit(self):
        with self.assertRaises(StoreError):
            self.store.set("entries/big", {"x": "a" * 300000})

    def test_merge_replaces_arrays_and_merges_objects(self):
        self.assertEqual(merge({"a": {"x": 1}, "l": [1]}, {"a": {"y": 2}, "l": [2]}), {"a": {"x": 1, "y": 2}, "l": [2]})

    def test_passwords_and_sessions(self):
        s = self.store
        self.assertTrue(check_password("a long secret", hash_password("a long secret")))
        self.assertFalse(check_password("wrong", hash_password("a long secret")))
        with self.assertRaises(StoreError):
            s.add_user("rohit", "Rohit Singh", "short")
        uid = s.add_user("Rohit", "Rohit Singh", "a long secret")
        self.assertIsNone(s.check_login("rohit", "nope"))
        self.assertEqual(s.check_login(" ROHIT ", "a long secret")["id"], uid, "usernames ignore case and spaces")
        token = s.start_session(uid)
        self.assertEqual(s.session_user(token)["name"], "Rohit Singh")
        self.assertIsNone(s.session_user("made-up"))
        s.set_password("rohit", "another long one")
        self.assertIsNone(s.session_user(token), "a new password signs out everywhere")

    def test_files(self):
        s = self.store
        meta = s.add_file(b"%PDF-1.4 test", "application/pdf", None)
        self.assertEqual(s.file(meta["id"])["size"], 13)
        self.assertIsNone(s.file("../../etc/passwd"))
        s.delete_file(meta["id"])
        self.assertIsNone(s.file(meta["id"]))


if __name__ == "__main__":
    unittest.main()
