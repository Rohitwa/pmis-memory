# Nominal.so — Design System (`design.md`)

> Exact design specification reverse-engineered from **https://nominal.so/**, extracted via headless
> Chromium reading **computed styles** across the homepage, platform, agent, compare, and blog pages
> (2026-08-19). All values below are the site's real values, not approximations.
> Stack: Webflow. Two licensed custom fonts. No external Google Fonts links.

---

## 1. Design language in one line

**Editorial minimalism for enterprise fintech.** A light serif display face set very large with tight
negative tracking, paired with a neutral grotesque for UI/body, on a warm off‑white "paper" ground,
punctuated by full-width near‑black sections and a palette of soft pastel "workflow" chips (mint,
coral, periwinkle, butter). High whitespace, calm, confident, un-busy.

---

## 2. Color palette

### 2.1 Core (ink & paper)
| Token | Hex | Role |
|---|---|---|
| `--ink` | `#151414` | Primary text; dark section backgrounds; primary button fill |
| `--paper` | `#FDFFF8` | Page/light background; text on dark; primary button label |
| `--ink-800` | `#272C2B` | Dark borders / dividers on dark |
| `--grey-600` | `#5A5A5A` | Secondary body text, eyebrow labels |
| `--grey-500` | `#767676` | Muted body text, captions, meta |
| `--grey-300` | `#BBBBBB` | Disabled / faint text |
| `--black` | `#000000` | Rare, true-black edge cases |

### 2.2 Surfaces & borders (green-tinted neutrals)
| Token | Hex | Role |
|---|---|---|
| `--surface-sage` | `#F3F7EB` | Alt light section background ("paper, greener") |
| `--surface-mint-50` | `#E0EADD` | Card fill / hairline borders (primary light border) |
| `--border-sage` | `#D1DECD` | Secondary borders, rules |
| `--tint-mint-50` | `#E0F8F2` | Very light mint wash (blog tag backgrounds) |

### 2.3 Accent "workflow" chips (soft pastels)
Used as small rounded tags / node backgrounds to label workflow types (Reconciliation, Matching,
Variance, Intercompany…) and as diagram accents. Each has a light fill and a saturated border/dot.

| Family | Fill (light) | Saturated | Deep border |
|---|---|---|---|
| **Mint / green** | `#B2EEDC` | `#5ADEB7` | `#4FCBA6`, `#95E6CD` |
| **Coral / red** | `#F2A9A9` | `#E69393` | — |
| **Periwinkle / purple** | `#B5C4F5` | `#98A5EF` | — |
| **Butter / yellow** | `#F9EBA6` | `#EADC8F` | `#DFC331` |

> Usage rule: accents are **decorative/categorical only** — never used for body text or primary CTAs.
> Text stays ink; CTAs stay ink/paper. Accents appear on chips, tags, small dots, and illustration.

### 2.4 CSS variables
```css
:root{
  --ink:#151414;      --paper:#FDFFF8;    --ink-800:#272C2B;
  --grey-600:#5A5A5A; --grey-500:#767676; --grey-300:#BBBBBB;
  --surface-sage:#F3F7EB; --surface-mint-50:#E0EADD; --border-sage:#D1DECD; --tint-mint-50:#E0F8F2;
  --mint:#5ADEB7; --mint-fill:#B2EEDC; --mint-deep:#4FCBA6;
  --coral:#E69393; --coral-fill:#F2A9A9;
  --purple:#98A5EF; --purple-fill:#B5C4F5;
  --butter:#EADC8F; --butter-fill:#F9EBA6; --butter-deep:#DFC331;
}
```

---

## 3. Typography

### 3.1 Font families
| Role | Family | Weights loaded | Fallback |
|---|---|---|---|
| **Display / headings** | **STK Bureau Serif** | 300 (Light) | `Georgia, 'Times New Roman', serif` |
| **Body / UI** | **Retorika** | 500 (Medium), 600 (SemiBold) | `system-ui, -apple-system, 'Segoe UI', sans-serif` |

- Both are self-hosted `@font-face` (Webflow asset), **not** Google Fonts. Substitute at build time.
- **Signature detail:** headings are set in a *light* (300) serif at large sizes — elegant, not bold.
- **Global tracking:** everything carries **negative letter-spacing ≈ −0.03em** (−0.028 to −0.030).

```css
--font-display:"STK Bureau Serif", Georgia, "Times New Roman", serif;
--font-sans:"Retorika", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--tracking: -0.03em;   /* apply to nearly all text */
```

### 3.2 Type scale (exact computed values @ 1440px)
| Style | Family | Size / Line-height | Weight | Tracking | Color |
|---|---|---|---|---|---|
| Display XL (hero stat / big word) | STK Bureau Serif | **120–144px / ~1.1** | 300 | −0.03em | `--ink` |
| **H1** | STK Bureau Serif | **64px / 70.4px** (1.1) | 300 | −1.92px | `--ink` |
| **H2 (section)** | STK Bureau Serif | **56px** or **48px / 52.8px** | 300 | −1.44px | `--ink` |
| **H3** | STK Bureau Serif | **48px / 52.8px** | 300 | −1.44px | `--ink` |
| **H4** | STK Bureau Serif | **40px / 44px** (1.1) | 300 | −1.2px | `--ink` |
| Sub-head | STK Bureau Serif | **28px / 33.6px** | 300 | −0.56px | `--ink` |
| **Eyebrow / kicker** (marked up as `h2`) | Retorika | **14px / 19.6px** | 500 | −0.28px | `--grey-600` |
| **Body Large** | Retorika | **18px / 25.2px** (1.4) | 500 | −0.54px | `--grey-600` / `--ink` |
| **Body Small** | Retorika | **14px / 19.6px** (1.4) | 500 | −0.28px | `--grey-500` |
| Caption / meta | Retorika | **12px / ~16.8px** | 500 | −0.03em | `--grey-500` |
| Button label | Retorika | **14px** | 600 | −0.03em | contextual |
| Nav link | Retorika | 14–16px | 500–600 | −0.03em | `--ink` |

> Rhythm: **headings line-height ≈ 1.1**, **body line-height ≈ 1.4**. Display uses the serif; every
> label, paragraph, nav item, and button uses Retorika. The "eyebrow" (14px grey Retorika above a
> serif headline) is the site's most repeated typographic unit.

---

## 4. Spacing, grid & radius

### 4.1 Spacing scale (8px base; observed values)
`4 · 8 · 12 · 16 · 21 · 24 · 32 · 48 · 64 · 80 · 96 · 120 · 128 · 160` (px)

- **Section vertical padding:** **128px** top/bottom is the default; variants **96px**, **160px**
  (large CTA bands), **80px**, **64px**.
- **Container gutter / horizontal padding:** **64px**.
- Card interior padding: **24–32px**.

```css
--space-1:4px;  --space-2:8px;  --space-3:12px; --space-4:16px; --space-5:24px;
--space-6:32px; --space-7:48px; --space-8:64px; --space-9:80px; --space-10:96px;
--space-11:120px; --space-12:128px; --space-13:160px;
--section-y:128px; --container-x:64px;
```

### 4.2 Layout / grid
- **Content max-width:** ~**1200–1280px**, centered, with 64px side gutters (full-bleed color bands
  run edge-to-edge; inner content is constrained).
- Feature rows: **2-column** (copy + product visual) and **3-column** card grids (e.g. "Close /
  Consolidate / Intercompany", agent cards).
- Alternating **light band ↔ dark band** as the primary vertical rhythm.

### 4.3 Radius
| Token | Value | Use |
|---|---|---|
| `--radius-card` | **24px** | Cards, media frames, product screenshots |
| `--radius-pill` | **9999px** (fully rounded) | Chips, tags, dots, icon buttons, pill CTAs |
| `--radius-0` | **0px** | Some inline text-link CTAs |

```css
--radius-card:24px; --radius-pill:9999px;
```

---

## 5. Components

### 5.1 Buttons
**Primary — "Book a Demo"**
- Fill `--ink` (`#151414`), label `--paper` (`#FDFFF8`).
- Label: Retorika **14px / weight 600**, tracking −0.03em, `text-transform:none` (sentence case).
- Padding: hero ≈ **32px 64px**; standard ≈ **17.5px 21px**; nav ≈ **10.5px 17.5px**.
- Shape: **pill** (`--radius-pill`). Often includes a small trailing arrow/icon glyph.

**Secondary — outline**
- Transparent fill, **1px solid `#151414`**, label `--ink`. Same type + pill shape.
- On dark sections: 1px solid `--paper`, label `--paper`.

**Tertiary — text link**
- Retorika 14–18px, `--ink`, no chrome; "Explore →", "Read More" patterns.

```css
.btn{font:600 14px/1 var(--font-sans);letter-spacing:-.03em;border-radius:var(--radius-pill);
     padding:17.5px 21px;display:inline-flex;gap:8px;align-items:center;cursor:pointer;text-decoration:none}
.btn--primary{background:var(--ink);color:var(--paper);border:1px solid var(--ink)}
.btn--outline{background:transparent;color:var(--ink);border:1px solid var(--ink)}
.btn--lg{padding:32px 64px}
.on-dark .btn--outline{color:var(--paper);border-color:var(--paper)}
```

### 5.2 Chip / tag (workflow labels)
- Pill (`--radius-pill`), soft pastel fill from §2.3, label Retorika 12–14px in `--ink`.
- Often paired with a small colored dot or icon. Used in nav mega-menu and diagrams.

```css
.chip{border-radius:var(--radius-pill);padding:6px 12px;font:500 13px/1 var(--font-sans);
      letter-spacing:-.03em;color:var(--ink);background:var(--mint-fill)}
```

### 5.3 Card
- Background `--paper` or `--surface-mint-50`; **1px border `#E0EADD`**; `--radius-card` (24px);
  interior padding 24–32px. Eyebrow + serif H4 + body-small + optional link.

```css
.card{background:var(--paper);border:1px solid var(--surface-mint-50);border-radius:var(--radius-card);padding:32px}
```

### 5.4 Navigation (top bar)
- Sticky, `--paper` background, thin bottom hairline (`--surface-mint-50`).
- Left: wordmark/logo (custom "N" mark). Center/left: **Platform · Agents · Solutions · Company ·
  Knowledge Base** (dropdown mega-menus with pastel workflow chips). Right: **Log in** (text link) +
  **Book a Demo** (primary pill).
- Link type: Retorika 14–16px / 500–600, `--ink`.

### 5.5 Footer
- Background `--ink` (`#151414`), text `--paper`/greys. Multi-column: **Meet Our Agents · Solutions
  by Use Case · Company · Connect · Solutions by ERP · Knowledge Base**. Bottom bar: "© 2026 Nominal ·
  Privacy Policy · Terms of Use · Site By Milkshake". Social: LinkedIn, Instagram, YouTube.

### 5.6 "How it works" numbered steps
- Dark band (`--ink`). Large serif number (`01`–`04`), serif sub-head, Retorika body, bulleted
  sub-points. Four stages: **Data → Shadow Ledger → Always-On Agents → Close Management**.

### 5.7 Product / UI visuals
- Real app screenshots in 24px-radius frames, shown on both light and dark bands; frequently
  annotated with the pastel workflow chips.

---

## 6. Section patterns (page composition)

The full-bleed **band** is the core layout primitive. Standard vertical order on marketing pages:

1. **Hero** — `--paper` bg, eyebrow → 64px serif H1 → 18px body → primary CTA → product screenshot.
2. **Logo trust bar** — "Trusted by large, complex companies" / "Our agents are trusted by".
3. **3-up pillar grid** — Close / Consolidate / Intercompany (or feature cards).
4. **Proof band** — oversized serif stat (e.g. `3x`) + testimonial, often on `--surface-sage`.
5. **How it works** — `--ink` dark band, 4 numbered steps.
6. **Solutions grid** — ERP-agnostic, pastel chips.
7. **Knowledge/blog teasers** — `--paper`, 3 cards.
8. **Closing CTA band** — big serif line "Move from doing the work to running the business." + CTA.
9. **Footer** — `--ink`.

Band background sequence typically alternates: `paper → paper → sage → ink → paper → ink`.

---

## 7. Iconography, imagery & motion

- **Icons:** thin line icons; small pastel dot indicators.
- **Logo:** custom geometric **"N"** monogram + "Nominal" wordmark (Retorika-like).
- **Illustration:** schematic UI/data diagrams (ledgers, entities, agent nodes) using the accent
  palette; no photography of people on core product pages.
- **Motion:** restrained scroll-reveal fades/slide-ups (Webflow interactions); hover states are
  subtle color/opacity shifts. No parallax-heavy or aggressive animation.
- **Corners & lines:** 24px radii + 1px `#E0EADD` hairlines give the calm, "spreadsheet-grid-refined"
  feel.

---

## 8. Accessibility & implementation notes

- Primary text `#151414` on `#FDFFF8` ≈ **16.7:1** contrast (AAA). Grey `#767676` on paper ≈ 4.6:1
  (AA for text ≥ ~16px) — keep muted greys at Body-Large size or above.
- Pastel accents are **low-contrast**; never place body copy on them or use them for CTA text.
- Global negative tracking (−0.03em) is essential to the brand — apply it site-wide, including body.
- Reproduce with: `--font-display` = STK Bureau Serif (light 300) or a light serif fallback
  (e.g. *Newsreader Light*, *Fraunces Light*); `--font-sans` = Retorika or a neutral grotesque
  fallback (e.g. *Inter*, *Söhne*, *Neue Haas Grotesk*).

---

## 9. Quick-start token block (drop-in)

```css
:root{
  /* color */
  --ink:#151414; --paper:#FDFFF8; --ink-800:#272C2B;
  --grey-600:#5A5A5A; --grey-500:#767676; --grey-300:#BBBBBB;
  --surface-sage:#F3F7EB; --surface-mint-50:#E0EADD; --border-sage:#D1DECD; --tint-mint-50:#E0F8F2;
  --mint:#5ADEB7; --mint-fill:#B2EEDC; --mint-deep:#4FCBA6;
  --coral:#E69393; --coral-fill:#F2A9A9;
  --purple:#98A5EF; --purple-fill:#B5C4F5;
  --butter:#EADC8F; --butter-fill:#F9EBA6; --butter-deep:#DFC331;
  /* type */
  --font-display:"STK Bureau Serif",Georgia,serif;
  --font-sans:"Retorika",system-ui,-apple-system,"Segoe UI",sans-serif;
  --tracking:-0.03em;
  /* space + shape */
  --section-y:128px; --container-x:64px; --maxw:1240px;
  --radius-card:24px; --radius-pill:9999px;
}
h1{font:300 64px/1.1 var(--font-display);letter-spacing:-1.92px;color:var(--ink)}
h2{font:300 48px/1.1 var(--font-display);letter-spacing:-1.44px;color:var(--ink)}
.eyebrow{font:500 14px/1.4 var(--font-sans);letter-spacing:-.28px;color:var(--grey-600)}
p{font:500 18px/1.4 var(--font-sans);letter-spacing:-.54px;color:var(--grey-600)}
body{background:var(--paper);color:var(--ink)}
```
