# AI Accountant Landing — First-Principles UX Audit

**Scope:** the "AI Accountant Landing" design canvas (single 1280px artboard).
**Frame:** the page has one job — get a finance decision-maker at a ₹100Cr+ company to book a demo or take the 50-file check. Every element is judged against that job. The rebuilt page implementing the fixes lives in `website/index.html`.

---

## What already works (kept, deliberately)

- **The loss-framed, quantified headline.** "Loses up to ₹3 crore… and finds out after the money has moved" is a real hook — it names the pain in the buyer's own units.
- **The Field Report.** Real findings from a real run ("a bill about to be paid a second time", "150 vs 85 licences") is the strongest section on the page. Specific, verifiable-feeling, impossible to write without having done the work.
- **The 50-file pilot offer.** A near-zero-friction ask that self-selects serious buyers. Most B2B pages only offer "book a demo"; this is better.
- **The 70/30 honesty.** Saying the agent does ~70% and humans keep judgment is more credible than "full automation" claims — keep it prominent.
- **The visual identity.** Ledger paper + deep green + IBM Plex Mono labels + sharp corners reads "accounting" without a single cliché stock photo. Kept wholesale.

---

## Critical — these block the page from doing its job

### 1. Nothing on the page is clickable
Every nav item and every CTA is a `<span>`. "Book a demo" goes nowhere; the nav doesn't navigate; the pilot offer is a dead button. The page is a poster, not a website — a motivated buyer literally cannot act.
**Fixed:** real `<a>` anchors throughout; every CTA opens a pre-filled email to rohit@yantrailabs.com (demo request / 50-file check with a ready-made body line); phone number is tap-to-call.

### 2. No conversion path at all
The only contact information was plain text in the footer. First principles: the page's entire value is the moment someone acts, and that moment had no mechanism. There was also no closing section — the page ended on Team with no ask.
**Fixed:** hero CTA → mailto; field-report CTA → mailto; a new final CTA band ("Send us 50 payment files. We'll show you what they're hiding.") before the footer; contact links in the footer. **Recommended next step:** replace the mailto with a Calendly/Cal.com link or a 3-field form the moment you have one — mailto is the honest minimum, not the ceiling.

### 3. Desktop-only, fixed 1280px layout
Everything is pixel-positioned for one width. Cold B2B traffic in India arrives overwhelmingly from LinkedIn and WhatsApp on phones; those visitors got a broken page.
**Fixed:** fully responsive rebuild — fluid type (`clamp()`), the 6-step flow collapses to 2 columns then 1, the findings ledger stacks, the nav becomes a hamburger menu, the 70/30 split stacks. Verified at 1440px and 560px renders.

### 4. Security details hidden behind hover
The PRISM-ES chips reveal their content only on `:hover` — invisible on every phone and tablet, unreachable by keyboard, and the page even had to instruct users ("HOVER A LAYER FOR THE DETAIL" — when a UI needs an instruction label for its own affordance, the affordance has failed). Security is a top-3 objection for finance buyers; this content must not be gated on a pointer device.
**Fixed:** accordion rows (`<details>`) — tap, click and keyboard all work, no instruction label needed.

### 5. Conflicting numbers will burn trust in diligence
The canvas's own margin note flags it: the page claims **13 deployments / 40k docs / $15M recovered monthly**, while the reference paper says **12 customers and ~$3M saved in total**. A 60x gap between "$15M/month" and "$3M ever" is exactly the kind of thing a CFO checks. The hero speaks in ₹, the field report and metrics in $ — fine if deliberate (Dubai/Nairobi clients), jarring if not.
**Not changed** (facts are yours to settle) — the numbers are carried over verbatim with a `<!-- VERIFY BEFORE LAUNCH -->` comment at the spot. **Do not launch until one set of numbers wins.** Same for "Govt. of Odisha" as a named customer — confirm you have permission to name it.

---

## High — costs conversions or credibility

### 6. Inverted CTA hierarchy in the hero
"How it works" had the solid primary button; "Book a demo" was the outline. The visually loudest element pointed at the least committal action.
**Fixed:** primary = Book a demo, secondary = "See what it caught" (which now also routes attention to the proof).

### 7. Proof buried under mechanism
Order was Hero → How it works → Agents → Field report. The most persuasive section sat fourth, after two explanatory ones. First principles: a skeptical buyer needs a reason to keep reading before they'll study your architecture.
**Fixed:** Hero → **Field report** → How it works → Agents → Security → Rollout → Customers → Team → **Final CTA**.

### 8. Contrast failures
The muted gray `#8b948c` on paper `#f4f3ee` is ≈2.7:1 — well below the 4.5:1 WCAG AA floor — and it was used for 10px mono labels, the smallest text on the page.
**Fixed:** muted text darkened to `#5b6760` (≥4.5:1 on paper); tiny sizes nudged up.

### 9. No semantic structure, no metadata
All `<div>`/`<span>` — no `<h1>`, no `<nav>`, no landmarks, no page `<title>`, no meta description, no favicon. Invisible to search, screen readers get soup, and a shared link renders with no preview.
**Fixed:** proper `header/nav/main/section/footer` + `h1/h2` hierarchy, title, meta description, OG tags, inline SVG favicon, skip-to-content link, visible focus states, `aria-label`s on nav and the findings table.

### 10. Mangled microcopy reads as typos
Line-break artifacts from the mock: "lines amounts", "goods bank · ledger", "Oracle Tally". On a page selling *accuracy in reading documents*, typos are self-refuting.
**Fixed:** "vendor · line items · amounts · tax", "bill · order · goods · bank · ledger", "SAP · Oracle · Tally · Zoho". Also reworded "Software copies itself — no new systems ship" → "no new systems for your people to learn" (the original describes your architecture; the rewrite describes the buyer's benefit).

---

## Medium — polish and next iterations

11. **"see what this caught ↓"** was a non-interactive label styled like a link. Removed; the hero's secondary CTA now does that job as a real anchor.
12. **Customers section is name-drops only.** Logos are pending (noted on the canvas); when you have permission, add one short attributed quote — one named sentence beats five gray names.
13. **Flow animation** kept (it's a nice touch), still guarded by `prefers-reduced-motion`; smooth-scrolling also disabled under reduced motion.
14. **Team LinkedIn links** were the only working links on the page — inconsistent affordance now resolved since everything is interactive.
15. **Future:** add an FAQ/objections block (pricing signal, "what about our CA firm?", implementation load on our team) once you've heard the same three questions in demos; consider a real analytics/pixel before spending on traffic.

---

## What shipped

- `website/index.html` — production-ready rebuild: semantic, responsive, accessible, every CTA live, identity preserved. Deployable as-is to any static host (logo file `yantrai_logo.png` alongside).
- Published artifact previews: the rebuilt site and this audit.
- The original design canvas is untouched — you can keep iterating visually there.
