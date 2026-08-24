# Ledger Design System

A reusable design specification abstracted from the freehand.ai homepage, stripped of its brand.
Ledger is the system for products that must read as **instruments** rather than apps: zero radius,
hairline structure, three typefaces with three jobs, one colour that means "act".

- **Type:** written specification — 38 rules across 6 domains
- **Brand content:** none; role slots only
- **Source:** Freehand.ai homepage teardown (24 Aug 2026)

---

## 01 · Thesis

Most B2B interfaces borrow their manners from consumer software: rounded cards, soft shadows,
a sans-serif for everything. That vocabulary says *approachable*. Ledger says *accountable*.
It is built for work where the user is checking something, and where the interface's job is to
look like it can be audited.

Four axioms generate everything else. Keep only these and you still have the system.

| ID | Law | Why |
|----|-----|-----|
| **A-1** | Sharp over soft. | Zero radius, 1px strokes, no elevation shadows. Separation comes from a rule or a change of ground, never a blur. Does more brand work than a logo. |
| **A-2** | Three typefaces, three jobs, no overlap. | Display for argument, body for reading, monospace for machine speech. The discipline reads as expensive — not the faces. |
| **A-3** | One colour means "act". | A single hue for actions and section markers, never decorative. Against ground/ink/hairline it becomes a wayfinding system. |
| **A-4** | Alternating full-bleed grounds are the navigation. | One dark, one light, alternating by section. Long pages become countable; dark = conviction, light = evidence. |

---

## 02 · Fit test

**Use it when:** the product handles money, records, compliance or evidence · the buyer is a
professional evaluating a claim · credibility is the conversion barrier · you have real numbers and
proof · density is a feature · the category default is softness.

**Don't use it when:** the product is playful, social or creative · the interface is thumb-driven
(hairlines and sharp corners punish small targets) · you have no proof yet (austerity amplifies an
empty page) · the brand is already soft and rounded · the team can't hold typographic discipline ·
there is no accessibility budget.

> **The half-adoption trap.** Ledger degrades badly when applied partially. Zero radius on buttons
> but 12px on cards reads as a bug, not a blend. Adopt the axioms whole, or take only §07 (page
> grammar) and §09 (copy system), which port to any visual language.

---

## 03 · Colour

Two layers: **primitives** (raw ramps, never referenced by components) and **roles** (semantic slots
components use). Components never name a hue. That is what makes a rebrand a one-file change.

### Ramp anatomy — eight steps, fixed jobs

| Step | Job |
|------|-----|
| 10 | tint / wash |
| 20 | disabled fill |
| 30 | borders on tint |
| 40 | **brand step** |
| 50 | hover |
| 60 | active / AA-safe text |
| 70 | deep ground |
| 80 | darkest ground |

### Rules

| ID | Law | Why |
|----|-----|-----|
| **C-1** | Every hue ships as a full 10–80 ramp, even if you use two steps. | The ramp is where the fixes live. A failing button is answered by step 50 or 60, not a brand conversation. |
| **C-2** | 40 is brand, 50 is hover, 60 is active and accessible text. | Interaction states are derived, not invented. |
| **C-3** | Exactly one hue may mean "act". | Buttons, inline links, section markers, bullets. Nothing else — not illustrations, not charts. |
| **C-4** | Two grounds maximum: one dark, one light, both full-bleed. | A third ground breaks the countability of A-4. Cards sit on grounds; they don't introduce new ones. |
| **C-5** | Define more hues than the marketing site uses. | The source defines seven ramps and uses two. The reserve lets product UI, sub-brands and charts expand without a rebrand. |
| **C-6** | Semantic state colours are separate from the action hue. | If "act" and "success" share a colour, a confirmation reads as a button. |
| **C-7** | The primary button is the contrast gate. Test it first, every time. | A saturated hue at step 40 with white label text typically lands 3:1–3.5:1, below the 4.5:1 normal text requires. Most common failure in the system, on the most important element. |

### Role slots to fill

| Role | Sourced from | Used for | Contrast floor |
|------|--------------|----------|----------------|
| `ground-dark` | Neutral ramp 80, or a deeply desaturated brand hue | Hero, testimony, closing bands | — |
| `ground-light` | Off-white biased toward the brand hue | Argument, data, mechanism bands | — |
| `action` | Brand 40 fill / 50 hover / 60 text-on-light | Buttons, markers, bullets, links | 4.5:1 |
| `ink` | Near-black with a hue bias, not pure #000 | Headlines, body on light | 12:1+ |
| `ink-2` | Neutral ramp 60 | Secondary body, captions | 4.5:1 |
| `ink-3` | Neutral ramp 40–50 | Labels only, never sentences | 3:1 |
| `rule` | Ink at 8–12% opacity | All borders and dividers, 1px | — |
| `accent-reserve` | 3–5 further ramps | Product UI, charts, sub-brands | per use |

---

## 04 · Typography

Roles are defined by job, not classification. Fill them with any families meeting the criteria.

| Role | Job | Look for | Never |
|------|-----|----------|-------|
| **Display** | Carries argument and personality | High stroke contrast; distinct silhouette at 64px; usable 300 weight; tight tracking tolerance | Body copy, buttons, UI labels |
| **Body** | Carries sustained reading | Humanist proportions, large x-height, 4+ weights, real italics, strong numerals | Anything above 40px |
| **Utility** | Speaks as the machine | Monospace, legible at 10–12px uppercase, tabular by default, 500/600 available | Sentences, paragraphs, headlines |

| ID | Law | Why |
|----|-----|-----|
| **T-1** | One family per role; there is no fourth role. | A fourth family is always a symptom of a component that should have used an existing role. |
| **T-2** | Monospace appears only as eyebrows, button labels, data labels, table headers, captions, metadata. | The signature move. Buttons in letter-spaced uppercase mono read as machine output — the visual claim that the product is a mechanism. Break this and Ledger collapses into a generic serif-and-sans site. |
| **T-3** | Weight inverts with size. | Display 300–400 above 48px; body 400; utility 500–600 below 13px. Heavy-at-large is everyone else's default. |
| **T-4** | Cap the measure: display ≤22ch, body 60–68ch. | A 22ch cap forces headlines into stacked lines — the shape that reads editorial rather than banner. |
| **T-5** | Tracking: display −0.02…−0.025em; utility +0.10…+0.14em uppercase; body untouched. | The tension between tight display and loose mono is doing real work. |
| **T-6** | Balance display lines, pretty sub-heads, leave body alone. | Ragged headline breaks make a considered system look unattended. |
| **T-7** | Tabular numerals wherever digits stack. | Stat rows, comparisons, pricing. Separates a spec from a brochure. |

### The scale — five steps, no more

| Step | Size | Weight | Leading | Role | Applied to |
|------|------|--------|---------|------|-----------|
| Display 1 | 4.0 rem | 300 | 1.2 | Display | Section headlines, hero |
| Display 2 | 3.5 rem | 300 | 1.2 | Display | Sub-section headlines |
| Display 3 | 2.0 rem | 400 | 1.3 | Display | Card titles, stage names |
| Body | 1.0 rem | 400 | 1.5 | Body | All paragraphs |
| Label | 0.75 rem | 500–600 | 1.4 | Utility | Eyebrows, buttons, captions |

---

## 05 · Geometry & space

| ID | Law | Why |
|----|-----|-----|
| **G-1** | One radius token, set to zero, applied to everything. | Buttons, cards, inputs, images, video frames, badges. Keep it as a token — one edit rebrands if you ever need softness. |
| **G-2** | One stroke weight: 1px, for borders and dividers alike. | Hairlines are the connective tissue. Two weights turns them into decoration. |
| **G-3** | No shadows for elevation. | Separation via rule, gap, or change of ground. Modals may take the single exception — document it. |
| **G-4** | Sections are full-bleed; content is a centred column. | The ground runs edge to edge, the reading column never does. This is what makes A-4 legible. |
| **G-5** | Space on a 4px base, in rem; gaps, not margins. | Sibling spacing belongs to the container. Per-element margins collapse unevenly. |
| **G-6** | Grid cells separated by 1px of ground, not gutters. | A hairline grid — background showing through a 1px gap — is cheaper and sharper than bordered cards, and never double-borders. |

---

## 06 · Component grammar

| Component | Anatomy | Governing rule |
|-----------|---------|----------------|
| **Eyebrow marker** | 6px solid action square + gap + uppercase tracked mono label | One per section. No icons, no numbers, no alternate shapes — the repetition is the system. |
| **Primary button** | Action fill, white uppercase mono label, generous padding, zero radius | One per viewport. Contrast-tested per C-7. Hover moves fill to step 50. |
| **Ghost button** | 1px border, transparent fill, same label treatment | Only ever the secondary in a pair; never alone. |
| **Stat trio** | 3 hairline-separated cells, display-size number over mono unit label | The number is the heading, the unit the caption — including in markup. Three cells, never four. |
| **Head-to-head table** | 2 columns ("you today" vs "with us"), row per dimension | Rows must be verifiable. Most likely component to contradict the rest of the page — see W-4. |
| **Proof wall** | 2 rows of monochrome logos, normalised by optical weight not box | Logos are content: real alt text. Never place colour marks on the dark ground. |
| **Photographic card** | Full-bleed image, dark scrim, display title + body at the foot | Photography carries the subject's reality, not stock optimism. If the topic is waste, show waste. |
| **Pinned stage explainer** | Sticky section, N stages: title, one-line thesis, 3 sub-claims, looping media | Cap at 4 stages. Every media panel has a poster frame. A text summary must precede it. |
| **Quote carousel** | Quote, name, role, org; dot pagination on dark ground | Minimum three slides, or use a static grid. |
| **Closing offer** | Restated claim, one button, three "what to expect" bullets with the brand glyph | Offer and qualifiers identical to the hero's, word for word. |

> **The signature repeat.** Pick one geometric glyph and use it everywhere structure needs a marker:
> eyebrow, bullets, empty state, favicon. One shape, no variation, does more identity work than a
> custom icon set — and costs nothing to maintain.

---

## 07 · Page grammar

An eleven-block narrative spine for a considered-purchase landing page. Works in any visual language.

| ID | Block | Job |
|----|-------|-----|
| P-0 | Momentum bar | One line of proof the company is moving. The only place a second brand hue is allowed. |
| P-1 | Hero | Category claim in one line, mechanism in two sentences, risk-reversal offer. Not a feature list. |
| P-2 | Proof wall | Customer logos, then press/analyst marks — before any explanation. |
| P-3 | The problem | One counter-intuitive market statistic, then three quantified symptoms. |
| P-4 | Category definition | What this *is*, in the buyer's vocabulary, plus the control reassurance. Two paragraphs max. |
| P-5 | Mechanism, long | Pinned stage explainer. Depth for the evaluator who needs it. Cap at four stages. |
| P-6 | Mechanism, short | The same sequence in three verbs. Move *before* P-5 if analytics show early drop-off. |
| P-7 | Third-party voice | Analysts, partners, consultancies — they outrank customer quotes because they're harder to get. |
| P-8 | Economics | Four KPIs, then the head-to-head against the incumbent (often a service, not a product). |
| P-9 | Scope | Where else this applies — the wedge was chosen for difficulty, not limitation. |
| P-10 | Integration | Named systems and a time-to-live claim. The last objection before a call. |
| P-11 | Close | Restate the offer verbatim, one button, three expectations. Then the directory footer. |

| ID | Law | Why |
|----|-----|-----|
| **P-A** | One conversion action for the whole page. | No pricing ladder, newsletter or chat competing in the primary path. |
| **P-B** | One label for that action, everywhere. | The source uses three phrasings for one button — costs recall, fragments analytics. |
| **P-C** | Proof precedes explanation. | A stranger grants attention on borrowed credibility before spending it on your argument. |
| **P-D** | Every block states its job in an eyebrow. | A scanning reader should reconstruct the argument from eyebrows alone. |

---

## 08 · Motion

| ID | Law | Why |
|----|-----|-----|
| **M-1** | Scroll-pinning is for sequences only. | Pinning an unordered list is a trick, and readers feel it. |
| **M-2** | Every media element carries a poster frame. | The source ships five of six explainer videos with `poster=""` — a black rectangle in the middle of the explanation. |
| **M-3** | Content must render without JavaScript. | Animation may reveal, never *supply*. Two of the source's most persuasive sections render as empty whitespace pre-init. |
| **M-4** | One motion idea per page, honouring reduced-motion. | Scattered effects read as generated. |
| **M-5** | Media is lazy and deferred by default. | Preload nothing below the fold; posters stand in until playback is requested. |

---

## 09 · Copy system

| ID | Law | Why |
|----|-----|-----|
| **W-1** | Claims arrive in verb triads. | "Audit every X, enforce every Y, close every Z." The rhythm makes a capability list feel like a mechanism. |
| **W-2** | Concede before you claim. | Granting the buyer's prior investment buys the right to attack the gap. |
| **W-3** | Use the buyer's insider vocabulary without a glossary. | The words a practitioner uses to bury a problem ("variance", "exception") are the highest-signal words available. |
| **W-4** | Maintain a claims registry: one number, one value, one source, site-wide. | The most damaging teardown finding was a headline metric at four values on one page. Treat a change as a release, not an edit. |
| **W-5** | Risk reversal above the fold — with its qualifiers attached. | A guarantee whose eligibility appears 11,000px later reads as bait, damaging the sentence you most need trusted. |
| **W-6** | The autonomy sentence gets a section, not a clause. | Anything acting on a customer's behalf must answer "who is in control?" — thresholds, what runs unattended, how a decision is reversed. |

---

## 10 · Prohibitions — inherited debt

| ID | Prohibition | Observed as |
|----|-------------|-------------|
| X-1 | Never let one metric hold two values | Recovery rate published at 2–5%, 3–5% and 8–10% on one page |
| X-2 | Never state a guarantee without its eligibility condition | Revenue qualifier at the close, absent in the hero |
| X-3 | Never ship a CTA as `href="#"` | Whole funnel JS-dependent, unbookmarkable, uncrawlable |
| X-4 | Never ship a video without a poster | Five of six explainer videos with `poster=""` |
| X-5 | Never let the mobile asset exceed the desktop one | 19 MB mobile hero vs 16 MB desktop |
| X-6 | Never let proof logos carry empty alt text | 78 empty alts, including customer and press walls |
| X-7 | Never let the unit be the heading and the number the caption | Stat markup reads as units without values |
| X-8 | Never ship two versions of the same animation library | GSAP 3.15 alongside GSAP Flip 3.13 |
| X-9 | Never let a page exceed a stated weight budget | ~105 MB of MP4 reachable from one homepage |

---

## 11 · Adaptation procedure

Seven steps in order. 1–4 are decisions; 5–7 are enforcement. A day for the decisions, a week to
hold the line.

**1. Run the fit test, and record the answer.** Write down which side you landed on and why. When
someone later asks for rounded cards, the recorded answer is what you point at. If you failed the
test, take §07 and §09 only.

**2. Choose the ground pair before the brand colour.** Pick the dark ground first — it sets the
emotional register of half the page. Derive it from your subject's material world, not a hue wheel
(the source's near-black brown comes from freight, paper and rust). Then a light ground: an
off-white biased toward the same family. Two grounds, full-bleed, nothing else.

**3. Choose one action hue and build its ramp.** One saturated hue that survives on both grounds,
then generate eight steps. Immediately run C-7: white label on step 40. If it lands below 4.5:1 — it
usually will — your button fill is step 50 or 60, decided now, before a component exists. Then
define 3–5 reserve ramps you will not use yet.

**4. Fill the three type roles against the criteria, not by taste.** The display face is where
personality lives and is worth the search time; the body face should be unremarkable and
hard-working; the monospace must be legible at 10px uppercase. Set the five-step scale and stop.

- A high-contrast serif in the display role gives editorial authority.
- A wide or condensed grotesque gives industrial authority.
- Never put the same family in two roles "for now".

**5. Pick your signature repeat.** One geometric glyph: eyebrow marker, list bullet, empty-state
mark, favicon. Derivable from your logo or a primitive shape. No variations, no second glyph.

**6. Write the strip list.** Name explicitly what you are *not* carrying over. This is the step
teams skip, and it is why adaptations look like the thing they adapted from.

| Element | Verdict | Note |
|---------|---------|------|
| Zero radius + hairlines | **Keep** | The system's identity; costs one token |
| Three-role type discipline | **Keep** | Roles keep, families change |
| Mono for buttons and eyebrows | **Keep** | The single most distinctive move |
| Ground alternation | **Keep** | Your grounds, their rhythm |
| 11-block page spine | **Keep** | Reorder P-5/P-6 to taste |
| Ramp architecture | **Keep** | Step jobs are hue-independent |
| Specific hues | *Adapt* | Derive from your subject's material world |
| Typeface choices | *Adapt* | Meet the criteria, don't copy the names |
| Photography direction | *Adapt* | Honest to your subject, not stock-optimistic |
| Hero artwork concept | *Adapt* | An object embodying the claim; not a screenshot, not the same object |
| Reference's vocabulary | **Discard** | Insider language must be yours or it is cosplay |
| Heavy video payloads | **Discard** | See X-9; set a page budget first |
| JS-gated content and CTAs | **Discard** | See X-3, M-3 |
| Two-slide carousels | **Discard** | Three minimum, or a static grid |

**7. Install the enforcement, not just the design.** A system without gates reverts within two
sprints. Three artefacts do most of the work: the **token file** as the only place a colour or size
is defined; the **claims registry** (W-4) as the only place a number lives; and the **ship gate**
below. Anything a contributor can't find in one of those three is a decision they will make
themselves.

---

## 12 · Ship gate

Run before every release. Every item corresponds to a defect found in the source.

- [ ] Primary button contrast tested against its label at the shipped size — not assumed from the brand ramp
- [ ] Every quantified claim matches the claims registry, including the meta description
- [ ] Guarantee/offer language byte-identical between hero and close, qualifiers included
- [ ] Page renders and reads with JavaScript disabled; no block is empty
- [ ] Every CTA resolves to a real URL; the modal intercepts it rather than replacing it
- [ ] Every video has a poster frame; no autoplaying asset above the page's weight budget
- [ ] Mobile asset variants verified smaller than their desktop equivalents
- [ ] Logos and proof imagery carry descriptive alt text; only decoration is empty-alt
- [ ] Stat markup puts the number in the heading and the unit in the caption
- [ ] One CTA label, one action, sitewide
- [ ] No component references a hue directly — role slots only
- [ ] Type scale has five steps; grep the stylesheet for off-scale font sizes
- [ ] Radius token still zero everywhere; no local overrides
- [ ] Both themes and reduced-motion verified on the real page, not in isolation

---

**One-line summary.** Ledger is: two grounds, one action colour, three typefaces in three jobs, zero
radius, one CTA, and a registry that keeps every number honest. Everything above is an elaboration
of that sentence.
