---
name: Clearance
description: A macOS control room for concurrent Claude Code pipeline runs, where the run waiting on you is the headline.
colors:
  accent: "#0a6bf2"
  accent-fg: "#ffffff"
  accent-bg: "#e9f1fe"
  attn: "#d8640b"
  attn-fg: "#964300"
  attn-bg: "#fff1e4"
  work: "#2e6ddb"
  work-bg: "#e8effd"
  ok: "#1f8c4d"
  ok-bg: "#e5f4ea"
  skip: "#9b9ba2"
  pane: "#ffffff"
  list: "#f5f5f7"
  win: "#ededf0"
  desk: "#c9ced8"
  field: "#ffffff"
  kbd: "#f0f0f3"
  sel: "#e3e3e8"
  line: "#d9d9de"
  line-soft: "#e8e8ec"
  fg: "#1c1c1f"
  fg-2: "#68686f"
  fg-3: "#9b9ba2"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.25
  subtitle:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  body-dense:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  section-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.04em"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "5px"
  md: "7px"
  lg: "9px"
  xl: "12px"
  pill: "13px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "16px"
  xxl: "20px"
  gutter: "28px"
components:
  button-default:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    height: "28px"
    padding: "0 10px"
  button-default-hover:
    backgroundColor: "{colors.sel}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.md}"
    height: "28px"
    padding: "0 10px"
  button-icon:
    textColor: "{colors.fg-2}"
    rounded: "{rounded.md}"
    size: "28px"
  button-icon-hover:
    backgroundColor: "{colors.sel}"
    textColor: "{colors.fg}"
  chip-quick-reply:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.fg}"
    rounded: "{rounded.pill}"
    height: "26px"
    padding: "0 10px"
  chip-quick-reply-on:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
  list-row:
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "7px 8px 8px"
  list-row-selected:
    backgroundColor: "{colors.sel}"
  list-row-selected-focused:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-fg}"
  textarea-composer:
    backgroundColor: "{colors.field}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
  panel:
    backgroundColor: "{colors.pane}"
    rounded: "{rounded.lg}"
  panel-head:
    backgroundColor: "{colors.list}"
    padding: "10px 14px"
  panel-head-attn:
    backgroundColor: "{colors.attn-bg}"
  kbd:
    backgroundColor: "{colors.kbd}"
    textColor: "{colors.fg-2}"
    rounded: "{rounded.xs}"
    typography: "{typography.caption}"
    padding: "0 5px"
  notice-card:
    backgroundColor: "{colors.pane}"
    rounded: "{rounded.xl}"
    padding: "10px 12px 10px 10px"
  palette:
    backgroundColor: "{colors.pane}"
    rounded: "{rounded.xl}"
    width: "560px"
---

# Design System: Clearance

## Overview

**Creative North Star: "The Mail Inbox for Gates"**

Clearance plays the macOS productivity canon straight, at the craft level of Linear, Raycast, and Apple Mail: a floating window with a unified title bar, a 320px flat list on the left, the selected item on the right, a status bar below. No invented visual world; the system's job is to disappear so the three run states (needs you, working, done) are the only thing with color in the frame. The chosen direction was the category standard, picked by the user over the dealt direction (seed key 389f75b7).

Density is desktop-tool density: 13px body, 11px captions, 28px controls, 6-16px internal spacing, hairline 1px borders. Color is almost entirely cool neutral; the single blue accent is reserved for selection, focus, and the one primary action, and three semantic hues carry run state with a glyph and a word beside them every time. Depth is conveyed by tonal surface steps (desk, window chrome, list, pane) and one window shadow; nothing inside the window casts a hard shadow.

The build follows the system appearance with a manual toggle. Light values are normative in the frontmatter; dark values are carried in the sidecar and in the page's two dark `:root` blocks, token for token.

**Key Characteristics:**
- Cool neutral surfaces stepped by tone, one blue accent, three semantic state hues
- System font stack at 13px; system mono for issue keys, gate IDs, branches, timestamps
- Status always drawn as a 16px glyph plus a word, never by color alone
- Native selection grammar: blue when the list has focus, gray when it does not
- Hairline borders and small radii (4-12px); one shadow for floating surfaces only

## Colors

A cool gray tonal stack with one system-blue accent and three semantic hues, each hue paired with a tint for panel heads and badges.

### Primary
- **System Blue** (`accent`): the selected row when the run list has keyboard focus, focus rings (2px outline, 1px offset), the primary Send and Reply buttons, links, the active quick-reply chip border and text, and the notification app icon. Nothing else is blue.
- **Blue Tint** (`accent-bg`): background of a selected quick-reply chip only.
- **On Accent** (`accent-fg`): text and glyphs on blue.

### Secondary (semantic run states)
- **Needs-You Amber** (`attn`): the "needs you" status glyph, the Needs you group header and its count, the bold waiting time on a needs-you row, the ask verdict in triage tables, and the gate panel border mixed at 45% with the line color. **Amber Ink** (`attn-fg`) is the readable dark amber for text on the tint: gate IDs, "waiting 2h" in the gate head, reversal-cost emphasis. **Amber Tint** (`attn-bg`) is the gate panel head background.
- **Working Blue** (`work`): the working glyph (pulsing) and the live line in the activity feed. Deliberately a half-step away from the accent so a working row and a selected row never read as the same thing. **Working Tint** (`work-bg`) is defined and reserved for working panel heads.
- **Done Green** (`ok`): the done glyph, the status bar dot, and the fix verdict in triage. **Done Tint** (`ok-bg`) is defined and reserved.
- **Skipped Gray** (`skip`): the skipped stage glyph; identical to `fg-3` so a skipped stage reads as tertiary, not as a fourth state.

### Neutral
- **Desk** (`desk`): the page behind the window; the only surface darker than the window chrome in light mode.
- **Window Chrome** (`win`): title bar and status bar.
- **List** (`list`): the run list column, panel heads, question cards, blockquotes, screenshot frames: every inset surface inside the pane.
- **Pane** (`pane`): the window body, detail column, buttons, chips, notification and palette cards.
- **Field** (`field`): text inputs and the search control.
- **Key Cap** (`kbd`): keyboard shortcut caps.
- **Selection Gray** (`sel`): unfocused selection, row and button hover, the kind badge.
- **Line** (`line`): structural borders (window, title bar, split, panels, buttons, inputs). **Soft Line** (`line-soft`): internal dividers (rail, table rows, activity rows, composer top).
- **Ink** (`fg`), **Secondary Ink** (`fg-2`), **Tertiary Ink** (`fg-3`): three text levels. Primary text, supporting text (subtitles, notes, meta, section labels), and placeholders/hints/pending stages.

### Named Rules
**The Glyph and Word Rule.** A state is never carried by color alone. Every run state and stage state is a 16px glyph from the sprite (attn, work, done, pending, active, skipped) with its name in text beside it. Color is the third signal, not the first.

**The One Blue Rule.** The accent appears only as selection, focus, link, or the single primary action in view. Working state uses `work`, a distinct blue, so "selected" and "working" are never confused.

**The Tint Pairing Rule.** Each semantic hue ships as a trio: the hue for glyphs and short text, a dark ink for body text on the tint, and the tint for backgrounds. Never set the raw hue as body text on its own tint.

## Typography

**Display Font:** none; the system face carries every level.
**Body Font:** SF Pro Text via `-apple-system, BlinkMacSystemFont` (Helvetica Neue, Helvetica, Arial fallback)
**Label/Mono Font:** SF Mono via `ui-monospace` (Menlo, Consolas fallback)

**Character:** Native and quiet. One family, two weights that matter (400 body, 500 names and labels, 600 headings and emphasis), tabular numerals on every duration and count.

### Hierarchy
- **Title** (600, 19px, 1.25, balanced wrap): the selected run's title. The only size above 15px in the app.
- **Subtitle** (600, 15px): the empty-state heading and the palette input.
- **Body** (400, 13px, 1.45): default. The gate lede steps to 13.5px; it is the one paragraph the user came to read.
- **Body Dense** (400, 12.5px): stage labels (500), notes, table cells, activity rows, history, panel footers, chip labels (12px), muted row subtitles (12px).
- **Caption** (400, 11px): key caps, row numbers, timestamps, reversal costs, notification header. Captions at 11.5px appear in hints, status bar, screenshot captions, and triage "why" lines.
- **Section Label** (600, 11px, +0.04em, uppercase): list group headers (Needs you / Working / Done today), history heading, palette group heads, triage column heads. This is the macOS sidebar section-header device, used only to label a group of items below it.
- **Mono** (400-700, 11-12px): issue keys (`ALM-480`), gate IDs (700), branch names, activity timestamps, question letters, table row numbers.

### Named Rules
**The Tabular Time Rule.** Every elapsed time, waiting time, count, and timestamp sets `font-variant-numeric: tabular-nums` so columns of durations align and reflow does not jitter.

**The Key Is Mono Rule.** Anything the pipeline itself names as an identifier (issue key, gate ID, branch, file path, timestamp) is set in the mono face at caption size and secondary ink. Prose is never mono.

## Layout

A floating window (max 1360px, 24px desk padding, 11px radius) made of three fixed-height bands and a split: 52px title bar on a 1fr/auto/1fr grid (traffic lights, centered title with 11px subtitle, right toolbar), the split, and a 26px status bar. The split is `320px minmax(0, 1fr)`: the run list on the left (list surface, 1px right border, rows inset 6px with 1px gaps), the detail on the right (pane surface, scrolling independently).

Detail content sits in a 20px/28px/36px wrapper capped at 880px; gate prose caps at 68ch. The stage rail is an equal-column grid with 1px vertical separators, bounded above and below by soft lines. Panels stack with 20px between them. The composer is sticky to the bottom of the detail scroll area so the answer field is always in reach.

Spacing rhythm is 6 / 8 / 10 / 14 / 16 / 20 / 28px; 28px is the control height and the detail gutter. Controls are 28px tall (24px inside notification cards), chips 26px, badges 20px.

Under 760px the window loses its frame and desk, the title bar drops to 48px with the lights hidden and the search collapsed to an icon, the split becomes one column switched by `data-view="list|detail"` with a Back button, the rail wraps as a flex row showing only the active stage's label, and key caps and row numbers hide. Reduced motion disables every animation and transition.

## Elevation & Depth

Depth is tonal first. In light mode the stack reads desk (darkest) > window chrome > list > pane (lightest), so inset surfaces are a tone darker than the pane they sit in and the pane is the brightest thing on screen. In dark mode the order flips (pane darkest, chrome lightest) and the tokens flip with it. Borders are 1px `line` for structure and `line-soft` for internal dividers; there are no 2px borders.

### Shadow Vocabulary
- **Window shadow** (`box-shadow: 0 1px 2px rgba(20,22,30,.08), 0 18px 48px -18px rgba(20,22,30,.35)`): the app window, notification cards, the command palette, and the toast. Only surfaces that float over the window or the desk carry it.
- **Composer lift** (`box-shadow: 0 -8px 16px -12px rgba(20,22,30,.18)`): the sticky composer's upward fade so content scrolling beneath it reads as beneath.
- **Focus glow** (`box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)` with a 1px accent border): the focused textarea only. Buttons and rows use a 2px accent outline instead.

### Named Rules
**The Floating Only Rule.** Panels, rows, chips, and buttons are flat at rest and on hover; hover is a surface change to `sel`, never a lift. A shadow means the element floats over the window: notification, palette, toast, or the window itself.

## Shapes

Small radii that scale with the element: 4px key caps and gate-ID pills, 5px badges, 7px for controls, rows, inputs, question cards, and blockquotes, 9px for panels, 11px for the window, 12px for floating cards (notification, palette), 13px (full pill) for quick-reply chips. Status glyphs are circles on a 16px grid with 1.5px strokes; the traffic lights and status dot are true circles. Borders are 1px throughout; the gate panel's attention border is the amber mixed 45% into the line color, not a solid amber frame.

## Components

### Buttons
- **Shape:** gently rounded (7px), 28px tall, 0 10px padding, 500 weight, 7px icon gap.
- **Default:** pane background, 1px line border, primary ink. Hover: selection gray background. Disabled: 50% opacity.
- **Primary:** accent background and border, white text; hover darkens 5% via `filter: brightness(.95)`. One per view (Send, Reply). A key cap inside a primary button is white on 18% white.
- **Icon:** 28px square, transparent border, secondary ink; hover fills `sel` and lifts ink to primary.
- **Focus:** 2px accent outline, 1px offset, on `:focus-visible` only.

### Chips (quick replies)
- **Style:** 26px pill, pane background, 1px line border, 12px text, primary ink.
- **State:** hover fills `sel`; selected (`on`) sets border and text to accent on the blue tint. Chips are seeds for the composer, not filters.

### Cards / Containers (panels)
- **Corner Style:** 9px.
- **Background:** pane body; head on the list surface with a 10px 14px pad and soft bottom line. The gate (attention) variant uses the amber tint head, a 45% amber border, and a mono 700 gate-ID pill in amber ink on 18% amber.
- **Shadow Strategy:** none; see The Floating Only Rule.
- **Internal Padding:** body 14px 16px 16px; footer 10px 16px 12px with a soft top line.

### Inputs / Fields
- **Style:** 1px line border, field background, 7px radius, 7px 10px padding, 18px line height; textarea auto-grows from 34px to 160px. Placeholder in tertiary ink.
- **Focus:** accent border plus the 3px 22% accent glow; outline suppressed.
- **Search control:** 28px, 200px minimum, field background, tertiary-ink placeholder text with a trailing key cap; hover darkens the border to `fg-3`.
- **Text fields and selects:** 28px, 0 9px padding, 7px radius, the same focus glow as the textarea; `aria-invalid` turns the border amber. Checkboxes are native, 14px, `accent-color` set to the accent.

### Navigation (run list)
- **Rows:** 16px / 1fr / auto grid (glyph, key + name + subtitle, right-aligned wait), 7px radius, 7px 8px 8px padding, inset 6px from the list edge. Name at 500, mono key at 11px, subtitle and wait at 12px secondary ink; a needs-you wait is amber at 600.
- **Hover and unfocused selection:** selection gray. **Focused selection:** accent background, white text, secondary text at 82% white, glyph forced white.
- **Group headers:** sticky, section-label type, with a tabular count; the Needs you header is amber.
- **Row numbers:** 11px tertiary ink, revealed on list hover or focus (0.12s opacity).
- **Mobile:** single column with a Back button in the detail.

### Status Glyphs (signature)
Six 16px symbols in one inline sprite, drawn with `currentColor` so the parent's class sets the hue: `attn` (filled circle, exclamation), `work` (ring with clock hands, pulsing 1.6s between 100% and 45% opacity), `done` (filled circle, check), `pending` (dashed ring), `active` (half-filled ring), `skipped` (ring with dash). Default color is tertiary ink; `.attn/.work/.ok/.skip` set the semantic hue. The same six marks appear in list rows, panel heads, and the stage rail, so one glyph vocabulary carries the whole app.

### Stage Rail (signature)
Equal columns, one per stage, each a glyph + 12.5px 500 label with an optional 12px note in secondary ink beneath. Pending and skipped labels drop to tertiary ink; active to primary ink. Notes that are GitHub links underline in the line color so they read as links without taking the accent.

### Notification Card (signature)
macOS-style: 28px rounded app icon in accent blue, 11px header row (app name, time), 600 title, 12.5px secondary one-line body, and 24px action buttons (one primary). 12px radius, pane surface, line border, window shadow, slides in 24px over 0.28s on `cubic-bezier(.2,.8,.2,1)`. Stacked at top-right of the window, 340px max.

### Command Palette (signature)
560px card at 12px radius with the window shadow over an 18% dark scrim; 15px borderless input with a soft bottom line; 6px-padded result list of 7px-radius rows (16px glyph, label, mono key or 11.5px trailing hint) with hover and highlight on `sel`; section-label group heads in tertiary ink.

### New Run Sheet (signature)
A macOS sheet that hangs from the title bar: 540px card with square top corners and a 12px bottom radius, pane surface, line border, the window shadow, over the same 18% scrim as the palette; it drops 14px over 0.22s on `cubic-bezier(.2,.8,.2,1)`. A 13px 600 heading over a soft line, then a 92px / 1fr label-and-field grid (labels right-aligned in secondary ink, 12px gap) that stacks to one column under 760px.

- **Kind** is a segmented control: 7px-radius track on the list surface with 2px padding; the pressed segment is a pane-colored button with a 1px 12% shadow, the only shadow on a control.
- **Task** is a 28px text field, issue key first when there is one. (A Linear issue lookup is a follow-up; the prototype's combobox is not in the app.)
- **Repository** is a native select listing the repositories the desktop app has made worktrees in, newest first.
- **Worktree** and **Runs** are derived, read-only: the worktree path and base branch in mono secondary ink, the `claude` command as an 11.5px mono block on the list surface with a soft 1px border and 7px radius, the binary name at 500 weight in primary ink. The base branch shown is the one the run starts from.
- **Validation** is inline under the field in amber ink and never a dialog.
- **Actions** sit right-aligned: default Cancel, primary Start run with its ⌘↩ key cap. Escape closes the sheet.

### Structured questions
When a gate is an `AskUserQuestion`, each question renders as a 7px-radius block on the list surface: the question at 500 weight, its short header beneath in 11.5px tertiary ink (sentence case, never the uppercase section label), then the options as quick-reply chips; the chosen option's description appears under the chips in secondary ink. On an observed run the chips are disabled at 70% opacity, because the answer belongs to Claude Code.
## Do's and Don'ts

### Do:
- **Do** pair every state with a glyph from the sprite and a word; color is the third signal.
- **Do** keep the accent to selection, focus, links, and one primary button per view; use `work` for working state.
- **Do** step surfaces tonally (desk > chrome > list > pane in light) and divide with 1px `line` or `line-soft`; reserve the window shadow for floating surfaces.
- **Do** set every duration, count, and timestamp in tabular numerals, and every pipeline identifier in the mono face at 11-12px.
- **Do** keep controls at 28px, chips at 26px, radii between 4px and 12px scaled to the element, and body type at 13px.
- **Do** flip the list selection from `sel` to `accent` only when the list has focus.
- **Do** derive what can be derived (worktree, command, kind, repository) and show it read-only in the sheet instead of asking for it; the user types one thing.
- **Do** define every new color in all three `:root` blocks (light, dark via media query, dark via `data-theme`), and honor `prefers-reduced-motion`.

### Don't:
- **Don't** carry status by color alone, or introduce a fourth state hue; skipped is tertiary gray on purpose.
- **Don't** use the accent as a background for working or done surfaces, or as body text on its own tint; use the semantic ink (`attn-fg`) for text on tints.
- **Don't** add drop shadows, lifts, or transforms to panels, rows, chips, or buttons on hover; hover is a surface change to `sel`.
- **Don't** introduce a display face, a second sans, or any size above 19px; the title is the top of the ramp.
- **Don't** use the uppercase section label for anything other than a header over a group of items; it is never a kicker above a title or a tag on a card.
- **Don't** replace the sprite glyphs with glyph-font characters or emoji; the pipeline's marks are the product vocabulary and the sprite is their only rendering.
