"""The pages a share link opens: a guide, and the routine with guide steps."""

import unittest

from server.shares import guide_page, routine_page

KADHA = {"title": "How to make Kadha", "forWhat": "Cough and cold", "makes": "1 small cup", "takes": "10 minutes",
         "need": ["1 cup paani", "4 tulsi <leaves>"], "steps": ["Boil the paani.", "Strain & cool till warm."],
         "tips": ["Give it warm, not hot."], "editedAt": "2026-11-01T08:00:00Z"}
ITEM = {"id": "s1", "what": "Kadha", "repeat": "daily", "date": "2026-10-30", "times": ["08:00"], "guideId": "g1", "category": "care"}


class GuidePages(unittest.TestCase):
    def test_guide_page_shows_the_whole_guide_safely(self):
        html = guide_page("Divisha", KADHA, [ITEM], "2026-11-01", "Rohit", None)
        self.assertIn("<h1>How to make Kadha</h1>", html)
        self.assertIn("<strong>Makes</strong> 1 small cup", html)
        self.assertIn("4 tulsi &lt;leaves&gt;", html)                       # escaped
        self.assertIn("<ol><li>Boil the paani.</li><li>Strain &amp; cool till warm.</li></ol>", html)
        self.assertIn("In Divisha's schedule: Every day at 8 am", html)
        self.assertIn("Updated Sun 1 November 2026", html)
        self.assertIn("window.print()", html)
        self.assertNotIn("This link works until", html)

    def test_paused_or_finished_items_are_not_listed(self):
        html = guide_page("Divisha", KADHA, [{**ITEM, "paused": True}, {**ITEM, "until": "2026-10-31"}], "2026-11-01", "Rohit", "2026-11-08T00:00:00Z")
        self.assertNotIn("schedule:", html)
        self.assertIn("This link works until Sun 8 Nov.", html)

    def test_routine_shows_each_items_guide_steps(self):
        html = routine_page("Divisha", [ITEM, {**ITEM, "id": "s2", "what": "Vitamin D", "guideId": ""}], "2026-11-01", "Rohit", None, {"g1": KADHA})
        self.assertEqual(html.count('<details class="how" open>'), 1)
        self.assertIn("<summary>How to make Kadha</summary>", html)
        self.assertIn("<strong>You need:</strong> 1 cup paani; 4 tulsi &lt;leaves&gt;", html)
        self.assertIn("<ol><li>Boil the paani.</li>", html)
        self.assertIn("<strong>Keep in mind:</strong> Give it warm, not hot.</p>", html)
        two = routine_page("Divisha", [ITEM], "2026-11-01", "Rohit", None, {"g1": {**KADHA, "tips": ["Warm, not hot.", "At 8 am."]}})
        self.assertIn("Warm, not hot; At 8 am.", two)
        # A guide that was removed is simply left out.
        self.assertNotIn('class="how"', routine_page("Divisha", [ITEM], "2026-11-01", "Rohit", None, {}))


if __name__ == "__main__":
    unittest.main()
