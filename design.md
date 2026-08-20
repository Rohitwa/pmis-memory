# Design Learnings — zig.ai

Teardown of **https://zig.ai/** (captured 2026-08-20). Every value below was pulled
from the live HTML and the site's compiled stylesheet
(`zig-ai.webflow.shared.3bf0705fc.min.css`, 272 KB) — nothing here is inferred from
screenshots.

**Stack:** Webflow · GSAP 3 (ScrollTrigger + SplitText) · Lenis smooth scroll ·
Lottie (18 instances) · Splide carousel · HubSpot forms · Ketch consent.

---

## 1. What the product is

Zig sells **AI assistants for sales reps** — "Close deals. Zig handles the rest."
The pitch is not "a faster CRM"; it is *give the rep a team*. That framing decision
drives every other design choice on the page, so it's the first thing worth stealing:
**the site sells a replacement for headcount, not a replacement for software.**

Sub-headline: *"Your own team of AI assistants — take out one per workflow. They
research, outreach, prep, follow up, and log. You approve and close."*

---

## 2. Narrative architecture (the real lesson)

13 sections, in a deliberate order. This is the most transferable part of the site —
it's a complete B2B SaaS argument, and each section has exactly one job:

| # | Section | Job | Headline |
|---|---------|-----|----------|
| 1 | Hero | Promise | "Close deals. Zig handles the rest." |
| 2 | Problem | Agitate, with a **Before / After** split | "You didn't get into sales to do **data entry**" |
| 3 | Pivot line | One-sentence reframe | "Zig doesn't speed up admin. It gives the rep a team that runs it." |
| 4 | Logos | Borrow trust | "Trusted by" |
| 5 | Differentiation | 6 numbered claims `/ 01`–`/ 06` | "Why Zig is different from everything else you've tried" |
| 6 | Impact | 4 hard numbers | 60+ hrs · 95% CRM accuracy · 30% faster · 3x revenue |
| 7 | Two audiences | Rep **and** buyer-of-record | "The rep closes. The leader has their back." |
| 8 | Split proof | Two columns, one per persona | rep benefits / leader benefits |
| 9 | Workflow map | Show the surface area | Research → Outreach → Meetings → Follow-Up → CRM Sync → Pipeline |
| 10 | Moat | Compounding-value timeline | Month 1 → 3 → 4 → 6 |
| 11 | Testimonials | Named humans + logos | 3 quotes, role + company |
| 12 | FAQ | Kill objections | 7 questions |
| 13 | Footer CTA | Cost of inaction | "Every day without Zig is 40 minutes per rep you're not getting back." |

### Copy patterns worth copying

- **Two-line headlines with a hard break.** `"Close deals."` / `"Zig handles the
  rest."` — the same shape recurs in nearly every section heading ("The rep closes." /
  "The leader has their back."). Short declarative, then the turn.
- **Before/After as a literal two-column layout**, not prose. Left column is the
  reader's current pain in second person ("You log into 8 tools to close *one deal*");
  right column is the same line resolved ("Every action logged. You didn't touch a thing.").
- **Objections answered as headlines, not buried in FAQ.** "The rep stays in control"
  is claim `/ 04`, before the FAQ ever mentions approval flows.
- **Named competitors.** "One layer that replaces Apollo, Gong, Salesloft, and the
  notetaker." And the FAQ leads with *"I already use Salesforce, Gong, and Apollo. Do I
  have to give them up?"* — the scariest question first.
- **A moat section.** Section 10 argues the product gets *better with time*, which
  converts "why now" into "why not later." Ends with: *"Start today. Because in 6
  months, today is what you'll wish you'd done."*
- **Dual CTA everywhere**, unchanged all page: `Start Now` (self-serve, coral fill) +
  `Book a demo for a Team` (outline). Two motions, one for each persona in section 7.

---

## 3. Color

Flat token set, no semantic aliasing layer. Six ramps, each 50→500 (grays go to 800):

```
Base       black       #15171a      white  #ffffff
Primary    coral-500   #ce3c2b      ← every primary CTA
           coral-400   #e06f68   coral-300 #e69786   coral-200 #ebb5ab
           coral-100   #f6dad5   coral-50  #fbeeec   coral-10  #fdfafa
Neutral    gray-800    #2e3332   gray-700 #454e4c   gray-600 #5c6764
           gray-500    #73817e   gray-400 #8b9a96   gray-300 #a5b2af
           gray-200    #bec9c6   gray-100 #d9dfde   gray-50  #f2f6f5
Accent     green-500   #08906c   blue-500 #478fb8   purple-500 #ac49d8
Status     error-red   #f44336
```

**The learning:** the grays are not neutral — they're green-tinted
(`#f2f6f5`, `#73817e`). Against a warm coral primary that produces a subtle
complementary tension across the whole page and stops the "default Tailwind slate"
look. Choosing a *tinted* gray ramp is one of the cheapest ways to make a site look
art-directed.

Accents are used almost entirely as **chip/label colors**, never as fills:
`.chips--coral`, `.chips--green`. Section 5's `/ 01`–`/ 06` numbering rides on these.

Only two real gradients on the page: `linear-gradient(248deg, #064c39 16%, #08906c)`
(deep green, for the dark panels) and black-to-transparent edge fades used to mask the
logo marquee (`linear-gradient(90deg, #15171a00, #15171a)`).

Shadows are soft and *tinted to the surface*, not black:
`0 22px 22px #2b4d6017, 0 5px 12px #2b4d601a` (blue-tinted),
`0 16px 33px #7513131f` (red-tinted under coral elements).

---

## 4. Typography

**Four families loaded** — `Archivo` (everything), `Azeret Mono` (labels/eyebrows),
`Switzer` (chips), `Afacad`. Archivo + Azeret Mono is the working pair; the other two
are near-vestigial and are a cost, not a feature (see §8).

Scale, with the responsive clamp at each of the three sizes (mobile / tablet / desktop):

| Token | Mobile | Tablet | Desktop | Line-height | Weight | Tracking |
|-------|--------|--------|---------|-------------|--------|----------|
| `title-xl` | 2rem | 2.875rem | **4.5rem** | 120% | 500 | −0.03em |
| `title-l`  | 1.75rem | 2.5rem | 3.625rem | 110% | 500 | −0.04em |
| `title-m`  | 1.375rem | 1.75rem | 2.25rem | 120% | 500 | −0.03em |
| `title-s`  | 1.25rem | 1.375rem | 1.75rem | 110% | 500 | −0.04em |
| `title-xs` | 1.125rem | 1.25rem | 1.375rem | 120% | 500 | — |
| `text-xl`  | 1rem | 1.125rem | 1.25rem | 140% | 400 | −0.01em |
| `text-l`   | 0.875rem | 1rem | 1.125rem | 150% | 400 | −0.03em |
| `text-m`   | 0.75rem | 0.875rem | 1rem | 150% | 400 | 0 |
| `text-s`   | 0.75rem | — | 0.875rem | 150% | 400 | 0 |
| `nav-link` | — | — | 0.875rem | — | 500 | — |

Stat numbers get their own sizes outside the scale: `.text--number` 4.375rem,
`.text--90` 5.625rem, `.text--70` 3.125rem — all at line-height 100%.

**Three learnings:**

1. **Headings are weight 500, never 700.** Bold is reserved and mostly unused.
   Large + medium + very tight tracking reads more confident than large + bold.
2. **Negative tracking scales with size.** −0.04em on display, −0.01em on body,
   0 on small text. Tighten as you go up; never tighten small type.
3. **Line-height inverts against size.** 110–120% on titles, 140–150% on body. The
   ratio is the rhythm.

Monospace (`Azeret Mono`, 1rem) is used only for eyebrows and the `/ 01` numbering —
the standard "technical credibility" signal in AI-product marketing. Cheap, effective,
and easy to overuse.

---

## 5. Spacing, layout, shape

Spacing is a raw **`base-size` scale in rem**, referenced directly by number:

```
4 6 8 10 12 14 16 18 20 24 32 38 40 42 44 48 50 52 60 64 80 90 100 105 120 140
```

That's 26 steps — far more granular than a 4/8pt system, and the odd values (38, 42,
50, 105) are evidence of values back-filled from a Figma file rather than designed as a
scale. It works, but it's the weakest part of the system (§8).

- **Container:** `85rem` (1360px) max-width, centered.
- **Gutter:** `padding_global` = `2.5rem` (40px) left/right.
- **Grid:** `main_grid` is `1fr 1fr 1fr` with a `1.25rem` gap.
- **Card radius:** `1.5rem` (24px) — `.support-card`, `.features_additional-card`.
- **Card padding:** `1.5rem` (24px).
- **Button radius:** `5rem` — full pill.
- **Hero float cards:** `1rem` radius, white, absolutely positioned at
  `left:-2.625rem` / `right:-4.375rem` so they **break the image bounds**. Small trick,
  large effect: it makes a flat hero image read as depth.

### Buttons

```css
.button {
  padding: 1rem 2.5rem;
  border-radius: 5rem;
  background: #ce3c2b;         /* coral-500 */
  color: #fff;
  font-size: 1rem;
  font-weight: 500;
  line-height: 130%;
  letter-spacing: -0.03em;
  white-space: nowrap;
  transition: background-color .3s, color .3s;
}
.button.primary-outline { padding: .5rem 1rem; background: #fff; color: #15171a; }
.button.additional-l    { background: #fbeeec; color: #ce3c2b; }  /* coral-50 tint */
```

Three tiers: solid coral → white outline → coral-tinted ghost. Note the tinted ghost
uses the 50-step of the same ramp as its text color — the cheapest way to get a
tertiary button that still reads as brand.

### Breakpoints

```
max-width: 479px   (mobile)
max-width: 767px   (mobile landscape)
max-width: 991px   (tablet)          ← Webflow defaults
min-width: 768px
min-width: 1280px  min-width: 1440px  min-width: 1920px   ← custom, added upward
```

Webflow's three max-width breakpoints for shrinking, plus three custom min-width ones
for scaling *up* past 1280. The type scale only has three values though — the
1440/1920 queries are doing layout, not typography.

---

## 6. Motion

The whole page is scroll-driven:

- **Lenis** — smooth scroll, which is what makes every ScrollTrigger effect feel
  attached to the page instead of fired at it. Enable this *first*; the rest depends on it.
- **GSAP ScrollTrigger** — section reveals and pinning.
- **GSAP SplitText** — per-word/per-character headline reveals. This is why the
  two-line headlines with a hard break exist: the break is an animation seam.
- **Lottie ×18** — the product UI is never shown as a static screenshot; it's
  animated vector. Separate `desktop` / `tablet` / `mobile` / `_1280` Lottie files per
  hero breakpoint rather than one scaled file.
- **Splide** — testimonial carousel.
- Transitions are uniformly `.3s` on color only. No transforms on hover.

**The learning:** the motion budget is spent almost entirely on *entrance and
storytelling*, near-zero on *interaction feedback*. For a page whose job is to be read
top-to-bottom once, that's the correct allocation.

---

## 7. Imagery

- All raster art is **`.avif`** (`built-img--1..6.avif`), with `-mob` variants for
  mobile-specific crops. No JPEG/PNG in content — only favicons and the OG image.
- All icons are **inline SVG** files (arrow, check, close, star, expand, lightbulb, tag).
- Logo marquee runs client logos as SVG with **light and dark variants**
  (`Ketch Logo.svg` / `Ketch Logo2.svg`, `SellingSara Logo.svg` / `-w.svg`) so the same
  strip works on both the white and near-black panels.
- Testimonial headshots are `.avif` too.

---

## 8. What *not* to copy

Honest read of the weak points:

1. **272 KB of CSS.** Webflow re-declares the *entire* variable set (≈95 custom
   properties) inside every utility class at every breakpoint. `.title--s` alone
   restates all 95. This is machine-generated bloat, not a design decision — but if
   you're hand-writing this system, declare tokens once on `:root` and override only
   what changes per breakpoint.
2. **Four font families for two roles.** `Switzer` appears in exactly one class
   (`.section_chips`) and `Afacad` is barely reachable. Each is a render-blocking
   download. Archivo + Azeret Mono does the entire job.
3. **No semantic token layer.** Components reference `coral-500` directly rather than
   something like `--button-primary-bg`. Compare Podium Automation's site (same
   Webflow generation), which maps
   `--_button---primary--background: var(--_color---primary--primary-yellow)` — a real
   two-layer system. Zig's flat approach means rebranding is a find-and-replace across
   every component; Podium's means changing one line. **If you build one thing from
   this teardown, build the semantic layer.**
4. **26-step spacing scale with off-grid values.** 38, 42, 50, 105 exist because a
   Figma frame happened to be that tall. A tighter scale (4, 8, 12, 16, 24, 32, 48, 64,
   80, 120) would cover the same page with a third of the tokens and more consistency.
5. **Three analytics/consent scripts** (Ketch, HubSpot, LeadPipe) on top of the motion
   stack. The page is doing a lot of work before it paints.

---

## 9. Transferable checklist

If you're building a B2B AI product page, this is the distilled version:

- [ ] Sell the **replacement for a person**, not a better tool.
- [ ] Structure: promise → agitate (before/after) → one-line reframe → logos →
      numbered differentiators → hard numbers → both personas → surface-area map →
      compounding moat → named testimonials → objection FAQ → cost-of-inaction CTA.
- [ ] Two CTAs, fixed all page: self-serve + demo. One per persona.
- [ ] Name your competitors, and put the scariest objection first in the FAQ.
- [ ] Headings at weight **500**, tracking **−0.03/−0.04em**, line-height **110–120%**.
      Body at **400 / 150% / 0em**.
- [ ] Pick a **tinted** neutral ramp, not pure gray.
- [ ] One saturated brand color; use its 50-step for tertiary buttons and its 500-step
      for every primary CTA. Accents live in chips only.
- [ ] Tint your shadows to the surface underneath them.
- [ ] Pill buttons (`border-radius: 5rem`), 24px card radius, 85rem container, 40px gutter.
- [ ] Lenis + ScrollTrigger + SplitText. Write headlines with a hard line break so
      SplitText has a seam.
- [ ] AVIF for raster, inline SVG for icons, light+dark logo variants.
- [ ] **Build a semantic token layer over your primitives.** zig.ai didn't; it's the
      one thing the page would most benefit from.

---

*Sources: `https://zig.ai/` homepage HTML and
`https://cdn.prod.website-files.com/692db0eaf3c473ac91a06392/css/zig-ai.webflow.shared.3bf0705fc.min.css`,
fetched 2026-08-20.*
