# Chatly Design System — "Aurora Ink"

This document outlines the visual identity, tokens, component primitives, motion guidelines, best practices, and instructions for extending Chatly.

---

## 1. Brand Identity

- **Name**: Chatly (accessed via `BRAND.name` in `@/lib/brand.ts`)
- **Tagline**: Describe it. Build it. Ship it.
- **Mark**: An original SVG rounded speech bubble with a star/spark tail drawn with a vibrant gradient stroke (`--accent-a` to `--accent-b`).
- **Typography**:
  - Display / Headings: **Sora** (`font-display`, `-0.01em` tracking)
  - UI Text: **Inter** (`font-sans`, line-height `1.6`)
  - Bengali Characters: **Noto Sans Bengali** (`font-bengali`, line-height `1.75`)
  - Code: **JetBrains Mono** (`font-mono`)

---

## 2. Token Architecture

### Color Palette ("Aurora Ink")

#### Dark Mode (`.dark` / `data-theme="dark"`)
- `--bg`: `#0A0A10` (deep ink)
- `--surface`: `#12121B`
- `--surface-2`: `#1A1A26`
- `--surface-3`: `#232331`
- `--border`: `rgba(255,255,255,0.08)`
- `--border-strong`: `rgba(255,255,255,0.16)`
- `--text`: `#F3F3F8`
- `--muted`: `#9696AB`
- `--faint`: `#6B6B80`

#### Light Mode (`data-theme="light"`)
- `--bg`: `#F7F7FA`
- `--surface`: `#FFFFFF`
- `--surface-2`: `#F0F0F6`
- `--surface-3`: `#E8E8F0`
- `--border`: `rgba(15,15,30,0.08)`
- `--border-strong`: `rgba(15,15,30,0.16)`
- `--text`: `#14141F`
- `--muted`: `#5F5F73`
- `--faint`: `#8C8CA0`

---

## 3. Accent Palettes (`data-accent`)

Chatly supports 5 selectable palettes applied dynamically via `html[data-accent="..."]`:

1. **Aurora** (`aurora`, default): Violet `#7C5CFF` to Cyan `#22D3EE` (Mid: `#5295FF`)
2. **Ember** (`ember`): Rose `#FB5C7C` to Amber `#FFB020` (Mid: `#FD864E`)
3. **Forest** (`forest`): Emerald `#10B981` to Lime `#A3E635` (Mid: `#59CF5C`)
4. **Ocean** (`ocean`): Blue `#3B82F6` to Teal `#14B8A6` (Mid: `#289DCE`)
5. **Mono** (`mono`): Zinc `#E4E4E7` / Dark `#18181B` monochrome scale

---

## 4. How to Add a New Accent Palette

To add a new palette (e.g., `sunset`):

1. **Add variables to `app/globals.css`**:
   ```css
   html[data-accent="sunset"], :root[data-accent="sunset"] {
     --accent-a: #FF5E62;
     --accent-b: #FF9966;
     --accent: #FF7B64;
     --accent-fg: #FFFFFF;
   }
   ```
2. **Update type in `lib/appearance.ts`**:
   ```ts
   export type AccentPalette = 'aurora' | 'ember' | 'forest' | 'ocean' | 'mono' | 'sunset';
   ```
3. **Add swatch option in `SettingsModal.tsx`**:
   ```tsx
   { id: 'sunset', label: 'Sunset', a: '#FF5E62', b: '#FF9966' }
   ```

---

## 5. Primitives (`@/components/ui`)

All primitives are typed, accessible, and theme-aware:

- `Button`: Primary gradient with press scale `0.97`, secondary, ghost, danger. Includes `loading` state with `SparkLoader`.
- `IconButton`: Minimum 44px touch target on mobile.
- `Card`: Surface + 1px border with optional `glass` overlay.
- `Sheet`: Bottom sheet modal with drag handle and drag-to-dismiss.
- `Dialog`: Centered modal with backdrop blur.
- `Tabs` / `Segmented`: Animated indicator.
- `Switch`: Spring thumb animation (`var(--ease-spring)`).
- `Input` / `Textarea` / `Select`: Clean floating-label-free inputs with focus rings (`var(--ring)`).
- `ToastProvider` / `useToast`: Stacked mobile toasts with haptic feedback.
- `Badge` / `Pill`: Tone variants (`success`, `warning`, `danger`, `info`, `accent`, `neutral`).
- `EmptyState`: Hero view with drifting background orbs and suggestion cards.
- `SparkLoader`: 16-20px rotating star loader.

---

## 6. Motion Guidelines

- **Properties**: Animate ONLY `transform` and `opacity` (and text shimmer keyframes). Never animate `width`, `height`, or `margin`.
- **Easings**:
  - Smooth: `cubic-bezier(.2, .8, .2, 1)` (`var(--ease)`)
  - Spring: `cubic-bezier(.34, 1.56, .64, 1)` (`var(--ease-spring)`)
- **Durations**:
  - Fast: `120ms` (`--d-fast`)
  - Base: `200ms` (`--d-base`)
  - Slow: `340ms` (`--d-slow`)
- **Accessibility**: Under `prefers-reduced-motion` or `data-reduce-motion="on"`, all durations collapse to `0.01ms` and infinite animations pause.

---

## 7. Do's and Don'ts

### Do
- Do import app name and branding from `@/lib/brand`.
- Do use CSS tokens (`var(--surface)`, `var(--text)`, `var(--accent)`) instead of hardcoded hex codes.
- Do trigger haptics via `haptic('light')` for primary user actions.
- Do enforce 44px minimum touch targets on mobile.

### Don't
- Don't hardcode color hex codes in JSX files.
- Don't bypass the type-checker.
- Don't animate heavy layout properties (`width`, `height`, `left`, `top`).
- Don't create mock/fake behavior when a feature cannot run; show an honest empty or configuration state.
