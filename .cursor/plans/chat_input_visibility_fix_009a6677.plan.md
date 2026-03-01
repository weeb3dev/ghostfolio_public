---
name: Chat Input Visibility Fix
overview: Improve the chat input box visibility in dark mode by adding stronger borders, a focus glow, and better background contrast so it no longer blends into the page.
todos:
  - id: update-input-scss
    content: Update .input-wrapper and .input-container styles in agent-chat-page.component.scss with stronger border, box-shadow, focus-within glow, and transition
    status: completed
  - id: verify-light-dark
    content: Visually verify changes look good in both light and dark mode
    status: completed
isProject: false
---

# Chat Input Visibility Fix

## Problem

In dark mode the input area is nearly invisible. The root cause is minimal contrast between three adjacent dark surfaces:

- `.input-wrapper` background: `rgb(48, 48, 48)` (from `--palette-background-background-dark`)
- `.input-container` background: `rgb(66, 66, 66)` (from `--palette-background-card-dark`)
- Border: `rgba(255, 255, 255, 0.12)` -- barely perceptible

This produces a ~7% luminance difference with a ghost border. The input box disappears.

## Single file change

All changes are in [agent-chat-page.component.scss](apps/client/src/app/pages/agent-chat/agent-chat-page.component.scss).

## Changes

### 1. Stronger resting border on `.input-wrapper`

Replace the current `1px solid var(--palette-foreground-divider, ...)` with a **1.5px** border at higher opacity (`0.24` instead of `0.12`), giving the pill shape a visible outline in dark mode without looking heavy in light mode.

```scss
.input-wrapper {
  border: 1.5px solid rgba(var(--palette-foreground-divider, 0, 0, 0), 0.24);
}
```

### 2. Add subtle elevation via box-shadow

A soft shadow below the input pill creates depth separation from the background:

```scss
.input-wrapper {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
```

### 3. Focus-within glow using the primary (teal) color

When the user clicks into the textarea, the wrapper should light up with a teal border + glow ring. This signals interactivity clearly:

```scss
.input-wrapper:focus-within {
  border-color: rgba(var(--palette-primary-500, 54, 207, 204), 0.6);
  box-shadow: 0 0 0 3px rgba(var(--palette-primary-500, 54, 207, 204), 0.15),
              0 2px 8px rgba(0, 0, 0, 0.15);
}
```

### 4. Bump the input-container top border opacity

Same treatment as the wrapper border -- make the horizontal divider line above the input slightly more visible:

```scss
.input-container {
  border-top: 1px solid rgba(var(--palette-foreground-divider, 0, 0, 0), 0.2);
}
```

### 5. Add smooth transition for the focus state

```scss
.input-wrapper {
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
```

## Visual result

- **At rest**: Input pill has a clearly visible border and soft shadow, standing out from the dark page
- **On focus**: Teal glow ring draws the eye immediately to the active input
- **Light mode**: Changes are subtle and complementary -- slightly stronger border and shadow don't look out of place

## What stays the same

- Sidebar layout (+ New Chat, conversation list) -- untouched
- Input pill shape (1.5rem border-radius) -- kept
- Placeholder text, send button, disclaimer -- no changes
- All existing CSS variables -- reused, not overridden

