---
name: Legacy Calendar
description: A premium, private friend-group calendar for deep-night coordination.
colors:
    primary: '#34d399'
    primary-contrast: '#03140d'
    canvas: '#000000'
    raised: '#0f1110'
    overlay: '#151817'
    line: '#252927'
    line-strong: '#3c413f'
    fg: '#f8fbf9'
    muted: '#9da3a0'
    subtle: '#747a77'
typography:
    display:
        fontFamily: 'Outfit, Inter, sans-serif'
        fontWeight: '600'
    body:
        fontFamily: 'Inter, sans-serif'
        fontSize: '15px'
        lineHeight: '1.5'
rounded:
    control: '12px'
    row: '16px'
    card: '24px'
    sheet: '24px 24px 0 0'
spacing:
    xs: '4px'
    sm: '8px'
    md: '16px'
    lg: '24px'
components:
    button-primary:
        backgroundColor: '{colors.primary}'
        textColor: '{colors.primary-contrast}'
        rounded: '{rounded.control}'
        height: '44px'
    sheet:
        backgroundColor: '{colors.raised}'
        rounded: '{rounded.sheet}'
        border: '{colors.line}'
---

# Design System: Legacy Calendar

## 1. Overview

**Creative North Star: "Obsidian Focus"**

Legacy Calendar is an uncompromisingly dark, high-utility tool for an intimate friend group. It is used mostly on phones, at night, often from the installed PWA. The design is quiet but confident: absolute black, one emerald accent, and the events' own colors carrying the life of the interface.

**Key characteristics**

- **Pure black foundation.** The page is `#000000` for OLED. Surfaces step up in small, tinted increments.
- **Event colors are the palette.** UI chrome stays neutral; each event's chosen color tints its rows, chips and dots.
- **Native-feeling on mobile.** Dialogs are bottom sheets with a grab handle and drag-to-dismiss; dates use native pickers.

Source of truth for tokens: `src/style.css` (`@theme`) and `src/theme/oled.ts` (PrimeVue preset). Keep them in sync.

## 2. Colors

One neutral scale, faintly tinted toward the accent hue (OKLCH hue 165, chroma ≤ 0.008), backs `surface-*`, `zinc-*` and the semantic roles. `zinc-*` is remapped onto it on purpose, so every gray in the app agrees.

### Semantic roles (Tailwind utilities)

| Role        | Utility                   | Value     | Use                            |
| ----------- | ------------------------- | --------- | ------------------------------ |
| Canvas      | `bg-canvas`               | `#000000` | Page background                |
| Raised      | `bg-raised`               | `#0f1110` | Grouped lists, sheets, rows    |
| Overlay     | `bg-overlay`              | `#151817` | Popovers, inputs, toasts       |
| Line        | `border-line`             | `#252927` | Hairline borders and dividers  |
| Line strong | `border-line-strong`      | `#3c413f` | Hover and selected borders     |
| Foreground  | `text-fg`                 | `#f8fbf9` | Primary text (20:1 on black)   |
| Muted       | `text-muted`              | `#9da3a0` | Secondary text (8:1)           |
| Subtle      | `text-subtle`             | `#747a77` | Tertiary metadata only (4.6:1) |
| Accent      | `bg-accent` `text-accent` | `#34d399` | Primary actions, today, focus  |

### Status colors

- **Going / live / money:** emerald 300–400 on a 10–14% emerald tint.
- **Invited / soon / deadline:** amber 200–300 on a 12% amber tint.
- **Declined / destructive:** rose 300–400.

### Named rules

**The Void Rule.** Root backgrounds are absolute `#000000`.

**The One Accent Rule.** Emerald is the only UI accent and stays under roughly 10% of any screen. Variety comes from event colors.

**The Tint, Don't Stripe Rule.** Event identity is a color dot or a 7–20% tint of the event color (`color-mix(in oklab, var(--event-color) 7%, var(--color-raised))`). Never a colored side stripe.

## 3. Typography

**Display:** Outfit 600. **Body:** Inter 400/500/600.

| Token             | Size / line | Use                                 |
| ----------------- | ----------- | ----------------------------------- |
| `text-display-lg` | 32 / 38     | Page titles on desktop              |
| `text-display`    | 26 / 32     | Page titles on mobile, event titles |
| `text-headline`   | 20 / 26     | Section titles, sheet headings      |
| `text-title`      | 17 / 22     | Row titles                          |
| `text-body`       | 15 / 22     | Body copy                           |
| `text-meta`       | 13 / 18     | Metadata, labels                    |

- `eyebrow` (12px, 600, uppercase, 0.06em) labels a section. Use at most one per section, never inside rows.
- Use `tabular` for times, counts and money.
- Form inputs are 16px so iOS does not zoom on focus.
- Copy is sentence case and plain ("Invite only", "Replies closed", "Waiting for a reply"). No em dashes.

## 4. Elevation and shape

Depth comes from tone and hairlines, not shadows. Shadows are reserved for floating things (toasts, popovers, the create button).

- Controls: 12px radius, 44px tall.
- Rows and grouped lists: 16px radius (`rounded-2xl`), inset dividers (`divide-line`).
- Feature cards (the "next up" hero): 24px radius.
- Mobile sheets: 24px top corners, grab handle, full width.

## 5. Components and patterns

- **EventListItem** is the one event row used by the calendar agenda, Upcoming and the day overview: time column, color dot, title, place, weather, attendees, RSVP badge.
- **RSVP encoding** is consistent everywhere: filled chip or dot means going or hosting; an outlined chip or hollow dot means invited without an answer; strikethrough means declined. Badges: Hosting, Going, Invited, Declined.
- **Grouped list** (iOS inset style) for facts and settings: `border-line bg-raised divide-line divide-y rounded-2xl border`, each row with a 36px icon tile.
- **Quick actions** row on the event sheet: equal tiles with icon and label (Chat, Directions, Share, Activity, Edit).
- **Sheets:** every non-maximized PrimeVue dialog becomes a bottom sheet under 640px (`style.css`) and can be dragged down by its header (`useSheetGestures`). Primary actions sit in the sheet footer, full width on phones.
- **Mobile calendar:** compact month grid with event dots plus the selected day's agenda below, a floating create button, swipe between months. Desktop keeps the full grid with chips and "N more".

## 6. Motion

- Ease out with `--ease-out-expo` (enter) and `--ease-out-quart` (small state changes); `--ease-in-quart` for exits.
- Enter 200–420ms, exit 90–220ms. Exits are always faster than entrances.
- Animate `opacity` and `transform` only. Presses scale to 0.97 (`pressable`).
- `prefers-reduced-motion` collapses all durations.

## 7. Do's and Don'ts

### Do

- Use the semantic utilities (`bg-raised`, `text-muted`, `border-line`) instead of raw grays.
- Show the user's RSVP state wherever an event appears.
- Prefer inline and progressive disclosure ("+ End time") over extra dialogs.

### Don't

- Don't use light mode.
- Don't add glows, cursor-following spotlights, gradient text or glass cards.
- Don't use colored side stripes on cards, rows or toasts.
- Don't stack tiny uppercase labels; one eyebrow per section is enough.
