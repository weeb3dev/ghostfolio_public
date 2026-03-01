---
name: Markdown Chat Rendering
overview: Render agent responses as formatted markdown instead of raw text by leveraging the already-installed ngx-markdown library, and add scoped styles so headings, lists, tables, and code blocks look polished inside chat bubbles.
todos:
  - id: add-markdown-module
    content: Add MarkdownModule import to the chat component TypeScript
    status: completed
  - id: swap-template-rendering
    content: Replace {{ msg.content }} with <markdown [data]> for assistant messages in the template
    status: completed
  - id: add-markdown-styles
    content: Add scoped SCSS styles for rendered markdown inside assistant chat bubbles (headings, lists, tables, code, links)
    status: completed
isProject: false
---

# Markdown Chat Rendering

## Root Cause

In [agent-chat-page.component.html](apps/client/src/app/pages/agent-chat/agent-chat-page.component.html) line 76, assistant messages are rendered with Angular text interpolation:

```html
<div class="message-content">{{ msg.content }}</div>
```

This outputs raw text. All markdown syntax (`#`, `**`, `-`, `|`, etc.) displays as literal characters.

## Approach

`ngx-markdown` (v21.1.0) is already installed and globally provided via `provideMarkdown()` in [main.ts](apps/client/src/main.ts) line 85. The changelog page already uses it. We just need to wire it into the chat component.

## Changes (3 files)

### 1. Template -- swap text interpolation for `<markdown>` component

In [agent-chat-page.component.html](apps/client/src/app/pages/agent-chat/agent-chat-page.component.html), replace line 76:

```html
<!-- Before -->
<div class="message-content">{{ msg.content }}</div>

<!-- After: use <markdown> for assistant messages, keep plain text for user -->
@if (msg.role === 'assistant') {
  <div class="message-content markdown-body">
    <markdown [data]="msg.content"></markdown>
  </div>
} @else {
  <div class="message-content">{{ msg.content }}</div>
}
```

User messages stay as plain text (they're short, no markdown). Assistant messages get full markdown rendering.

### 2. Component TypeScript -- add MarkdownModule to imports

In [agent-chat-page.component.ts](apps/client/src/app/pages/agent-chat/agent-chat-page.component.ts), add `MarkdownModule` to the component's `imports` array:

```typescript
import { MarkdownModule } from 'ngx-markdown';
// ...
imports: [
  CommonModule,
  FormsModule,
  IonIcon,
  MarkdownModule,
  MatButtonModule,
  MatCardModule,
  MatProgressSpinnerModule,
  MatSidenavModule
],
```

### 3. SCSS -- style rendered markdown inside chat bubbles

In [agent-chat-page.component.scss](apps/client/src/app/pages/agent-chat/agent-chat-page.component.scss), add scoped styles for the `.markdown-body` class using `::ng-deep` (same pattern as the changelog page). Key elements to style:

- **Headings** (h1-h4): scale down font sizes to fit inside bubbles, remove excessive margins
- **Lists** (ul/ol): proper indentation and spacing
- **Tables**: bordered, alternating row colors, scrollable on overflow
- **Code blocks**: distinct background, rounded corners, horizontal scroll
- **Inline code**: subtle background highlight
- **Bold/italic**: inherit font color (important in dark mode)
- **Paragraphs**: tighter margins than default browser styles
- **Links**: use the primary teal color

All styles scoped under `.message.assistant .markdown-body ::ng-deep` to avoid leaking.
