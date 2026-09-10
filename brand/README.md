# Simpl — "Scanline Cursor" mark

The dropped "e" from *Simple* is replaced by a phosphor terminal cursor; subtle
CRT scanlines run through the whole lockup. Built from the real
`ZillaSlab-Bold.ttf` in `simpl-trading-app/assets/fonts/`, with the type
**converted to outlines** — no file here needs a font installed to render.

Colours are the tokens from `simpl-trading-app/src/lib/theme.ts`, not re-picked:
`ink #15120c`, `paper #f5efe0`, `amber #e2a23c`. The one addition is
`#8f6019` — the same amber darkened for light grounds only, because `#e2a23c`
on white is too low-contrast at icon size.

## The one rule: scanlines are for large sizes

Below roughly **120 px** the scanlines stop reading as texture and turn to mud.
Every mark therefore ships in two forms, and picking the wrong one is the main
way to misuse this set.

| Size | Use |
|---|---|
| ≥ 120 px | `*-scanline-*` |
| < 120 px | `*-solid-*` |

## Files

### Wordmark — `SIMPL▮`

| File | Use |
|---|---|
| `simpl-wordmark-scanline-dark.svg` | **Primary.** On the ink ground. |
| `simpl-wordmark-scanline-dark-transparent.svg` | Same, over your own dark background. |
| `simpl-wordmark-scanline-light.svg` | Light ground. See the caveat below. |
| `simpl-wordmark-solid-dark.svg` / `-transparent.svg` | Small sizes, dark ground. |
| `simpl-wordmark-solid-light.svg` | **Preferred for light grounds.** |
| `simpl-wordmark-mono-paper.svg` / `-ink.svg` | One colour — embroidery, stamps, faxes, single-colour print. |
| `simpl-wordmark-animated.svg` | Blinking cursor. Web/splash only — see below. |

> **Light-ground caveat.** Scanlines are a *glowing display* effect; punching
> light gaps through dark letters on paper reads as damage rather than phosphor.
> Use `simpl-wordmark-solid-light.svg` on light grounds unless you have a
> specific reason not to.

### Icon — `S▮`

The wordmark is too wide for a square tile, so the icon is the monogram.

| File | Use |
|---|---|
| `simpl-icon-scanline.svg` | Store icon master. Full-bleed, **square corners** — iOS applies its own mask and rejects baked-in rounding. |
| `simpl-icon-scanline-rounded.svg` | Squircle baked in, for places that don't mask (web, docs, slides). |
| `simpl-icon-solid.svg` / `-rounded.svg` | Small sizes. |
| `simpl-icon-adaptive-foreground.svg` | Android adaptive foreground; art sits inside the 66 % safe zone so a launcher's mask can't clip it. Pair with a solid `#15120c` background layer. |

### `png/`

| File | Target |
|---|---|
| `ios-appstore-1024.png` | iOS App Store. **RGB, no alpha channel** — Apple rejects any alpha, even fully opaque. |
| `play-store-512.png` | Google Play listing. Also flattened to RGB. |
| `android-adaptive-foreground-432.png` | Android adaptive foreground layer. |
| `icon-180/120/64/40.png`, `favicon-32.png` | In-app and web, solid variant. |
| `favicon.ico` | Multi-res 16–128, for the marketing site. |
| `wordmark-dark-1x/2x/3x.png` | App header, transparent. |
| `_contact-sheet.png` | Every size side by side — the small-size check. |

## The blinking cursor

**A store icon cannot animate.** iOS wants a static 1024×1024 PNG and Android a
static 512×512; neither supports motion, and neither ever will for the icon
itself. So the blink is defined as a **motion behaviour, not part of the logo**:

- **Static mark = cursor lit.** A terminal cursor's resting state is on; the
  dark frame is the transient. Never ship the off-frame as the mark.
- **The blink is allowed in:** the app splash/launch animation, the website
  hero, the App Store *preview video* (video may animate even though the icon
  may not), and any marketing motion.
- `simpl-wordmark-animated.svg` implements it with CSS inside the SVG, so it
  animates as a plain `<img>` with no JS, and honours `prefers-reduced-motion`.
- In React Native, animate an `opacity` loop on the cursor view rather than
  using this SVG — same 1.15 s period, `steps(1)` snap, and hold the lit state
  longer than the dark one (58 / 42) so it never reads as "broken."

## Regenerating

Both build scripts are session scratch, not committed. To change tracking,
cursor proportions, or scanline pitch, the knobs are the constants at the top of
the generator: `TRACKING`, `CURSOR_GAP`, `CURSOR_W`, and
`SCAN_PERIOD` / `SCAN_THICKNESS` / `SCAN_OPACITY`. Geometry is normalized to
cap height = 100 units so every variant shares one drawing.

The shipped set uses the **B (tuned)** scanline intensity — period 10 % of cap
height, gap 26 % of the period, 30 % opacity. Three candidate intensities were
compared before locking this one.
