# `@anter/ai-chat-sdk`

[![npm version](https://img.shields.io/npm/v/@anter/ai-chat-sdk.svg)](https://www.npmjs.com/package/@anter/ai-chat-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An industry-agnostic, embeddable AI chat SDK for React applications. Drop a fully-featured chat UI into any product — regardless of domain — by wiring up your own backend through a simple adapter interface.

> ⚡ **See It Live in Action:** Want to test real-time streaming responses, artifact viewports, and slash commands before installing? **[Visit anter.ai to try the live demo →](https://anter.ai)**

---

## Screenshots

|                                                                       Empty state                                                                        |                                               Streaming response with sources                                                |                                          Artifact panel                                          |
| :------------------------------------------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------: |
| ![ChatShell empty state — sidebar with New Chat, Search, Chats, and Platform nav; centred prompt with slash-command hint](.github/assets/anter-ai-1.png) | ![ChatShell with an AI response citing 4 inline sources and a Sources pill below the message](.github/assets/anter-ai-2.png) | ![ChatShell with the Files artifact panel open on the right side](.github/assets/anter-ai-3.png) |

---

## Table of contents

- [Overview](#overview)
- [Why this SDK?](#why-this-sdk)
- [Requirements](#requirements)
- [Installation](#installation)
  - [Vendoring before npm publish](#vendoring-before-the-package-is-published-to-npm)
- [Usage](#usage)
- [Components](#components)
  - [ChatProvider](#chatprovider)
  - [ChatShell](#chatshell)
  - [ChatView](#chatview)
  - [ChatWidget](#chatwidget)
  - [ChatEmptyState](#chatemptystate)
  - [RecordPanel](#recordpanel)
- [The ChatAdapter interface](#the-chatadapter-interface)
- [SSE streaming protocol](#sse-streaming-protocol)
- [Run resilience: stop, reconnect, resume](#run-resilience-stop-reconnect-resume)
- [Inline content tags](#inline-content-tags)
- [Slash commands](#slash-commands)
- [Command palette (⌘K)](#command-palette-k)
- [Artifact registry](#artifact-registry)
- [Plugins](#plugins)
- [Context variables and `context_required`](#context-variables-and-context_required)
- [Headless hooks](#headless-hooks)
- [Artifacts](#artifacts)
- [Record tags](#record-tags)
- [AnterAdapter](#anteradapter)
- [Development](#development)
- [CSS architecture](#css-architecture)
- [Whitelabeling & Custom Theming](#whitelabeling--custom-theming)
- [ChatWidget: Stateless & Public-Site Mode](#chatwidget-stateless--public-site-mode)
- [TypeScript](#typescript)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The SDK separates **UI and state** from **backend communication**. You supply an adapter that knows how to talk to your API; the SDK handles streaming, session management, artifact display, slash commands, file uploads, and everything else.

It ships in layered entry points so you can take exactly what you need:

| Import path                             | What you get                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `@anter/ai-chat-sdk`                    | Everything: UI components + headless hooks + extensions                      |
| `@anter/ai-chat-sdk/ui`                 | UI components only (`ChatShell`, `ChatView`, `ChatWidget`, `RecordPanel`, …) |
| `@anter/ai-chat-sdk/headless`           | Hooks and context only, no UI (`useChat`, `useArtifacts`, `useSources`, …)   |
| `@anter/ai-chat-sdk/types`              | TypeScript type definitions only                                             |
| `@anter/ai-chat-sdk/styles.css`         | Full stylesheet (includes CSS reset/base)                                    |
| `@anter/ai-chat-sdk/styles-no-base.css` | Stylesheet without base resets                                               |

> **ESM only.** The package is built as ES modules. Configure your bundler accordingly (Vite, Next.js, Webpack 5+, etc. all support this out of the box).

---

## Why this SDK?

- **Domain-free** — no compliance, GRC, or industry-specific language in the core. Works equally for legal, finance, healthcare, customer support, or any other vertical.
- **Adapter-driven** — all backend calls flow through a single `ChatAdapter` interface. Swap backends without touching the UI.
- **SSE streaming** — responses stream token-by-token via Server-Sent Events using `eventsource-parser`.
- **Rich feature set out of the box** — artifacts, sources panel, file uploads, slash commands, ⌘K command palette, model selector, reasoning blocks, follow-up suggestions, inline citations, interactive context chips.
- **Consumer-owned content** — empty states, starter cards, tips, and placeholder text are all supplied by the embedding application. The SDK ships no domain-specific copy.
- **Headless-first** — every UI component is built on top of exported hooks, so you can replace individual surfaces while keeping the rest.

---

## Requirements

| Dependency | Version   |
| ---------- | --------- |
| React      | `^19.0.0` |
| React DOM  | `^19.0.0` |

The SDK treats React as a **peer dependency** — install it yourself in your application.

---

## Installation

This package lives inside the monorepo as a workspace package. From any workspace app:

```bash
pnpm add @anter/ai-chat-sdk
```

For external consumers, install straight from this repo — it is **not on npm yet**.
The `prepare` script builds `dist/` at install time, so there is no extra step:

```bash
npm install github:anter-ai/ai-chat-sdk
# or
pnpm add github:anter-ai/ai-chat-sdk
```

Pin to a commit for a reproducible install:

```bash
npm install github:anter-ai/ai-chat-sdk#<commit-sha>
```

> Building from source at install time needs a POSIX shell (`mkdir -p`, `cp`).
> On Windows, install under WSL until the package is published to npm.

### Vendoring before the package is published to npm

If you need to embed the SDK before it appears on the npm registry, copy the `src/` directory into your own monorepo as a local workspace package. The build tooling (`tsup`, `tsc`, CSS copy) is fully standalone — it has no private or internal dependencies.

**Step 1 — copy `src/` into your workspace:**

```bash
# From your monorepo root
mkdir -p packages/ai-chat-sdk
cp -r /path/to/ai-chat-sdk/src packages/ai-chat-sdk/src
```

Copy the build config files alongside it (`tsup.config.ts`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.cjs`, `package.json`, `eslint.config.mjs`). These files contain no private references and work as-is.

**Step 2 — add a workspace reference from your app:**

```json
// your-app/package.json
{
  "dependencies": {
    "@anter/ai-chat-sdk": "workspace:*"
  }
}
```

**Step 3 — add a sync script to pull in upstream changes:**

Create a `sync-upstream.sh` in your local copy. The key rule is: **only sync `src/`** — the config files are yours to own.

```bash
#!/usr/bin/env bash
set -euo pipefail

UPSTREAM="https://github.com/anter-ai/ai-chat-sdk.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP=$(mktemp -d)
trap "rm -rf '$TEMP'" EXIT

echo "Cloning upstream..."
git clone --depth 1 "$UPSTREAM" "$TEMP"

echo "Syncing src/..."
rsync -av --delete "$TEMP/src/" "$SCRIPT_DIR/src/"

UPSTREAM_VERSION=$(node -p "require('$TEMP/package.json').version")
echo "Done. Upstream version: $UPSTREAM_VERSION"
echo "Next steps:"
echo "  1. Review: git diff packages/ai-chat-sdk/src"
echo "  2. Rebuild: pnpm --filter @anter/ai-chat-sdk build"
echo "  3. Smoke test: pnpm --filter your-app build"
```

**The invariant to maintain:**

| Path                                                 | Owner          | Rule                                                         |
| ---------------------------------------------------- | -------------- | ------------------------------------------------------------ |
| `src/`                                               | Upstream       | Never edit locally — always contribute back first, then sync |
| `package.json`, `tsconfig.json`, `eslint.config.mjs` | Your workspace | Local adaptations — never overwritten by the sync script     |

To fix a bug or add a feature: open a PR on `anter-ai/ai-chat-sdk`, get it merged, then run `sync-upstream.sh`.

---

## Usage

### 1. Import styles

Import the stylesheet once at your app's root:

```typescript
import "@anter/ai-chat-sdk/styles.css";
```

If your app already has a CSS reset or base styles, use the no-base variant to avoid double-applying resets:

```typescript
import "@anter/ai-chat-sdk/styles-no-base.css";
```

### 2. Implement a `ChatAdapter`

The adapter bridges the SDK to your backend. Create a class that implements `ChatAdapter`:

```typescript
import type {
  ChatAdapter,
  SessionConfig,
  SessionPatch,
  MessagePayload,
  SendMessageOptions,
  SessionList,
  SessionWithMessages,
} from "@anter/ai-chat-sdk/types";

class MyAdapter implements ChatAdapter {
  async createSession(config: SessionConfig): Promise<string> {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contextId: config.contextId,
        model: config.model,
      }),
    });
    const { sessionId } = await res.json();
    return sessionId;
  }

  async loadSession(sessionId: string): Promise<SessionWithMessages> {
    const res = await fetch(`/api/sessions/${sessionId}`);
    return res.json();
  }

  async listSessions(): Promise<SessionList> {
    const res = await fetch("/api/sessions");
    return res.json();
  }

  async updateSession(sessionId: string, patch: SessionPatch): Promise<void> {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
  }

  async sendMessage(
    payload: MessagePayload,
    options?: SendMessageOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(payload),
      // Forward the abort signal so the Stop button can terminate the network stream.
      signal: options?.signal,
    });
    if (!res.body) throw new Error("Missing response body");
    return res.body;
  }
}
```

### 3. Wrap with `ChatProvider`

```tsx
import { ChatProvider } from "@anter/ai-chat-sdk";
import { MyAdapter } from "./my-adapter";

const adapter = new MyAdapter();

export function App() {
  return (
    <ChatProvider
      organizationId="org-123"
      adapter={adapter}
      config={{
        enableArtifacts: true,
        enableSlashCommands: true,
        theme: "system",
      }}
    >
      <YourApp />
    </ChatProvider>
  );
}
```

### 4. Render a chat surface

**Full-page chat shell:**

```tsx
import { ChatShell } from "@anter/ai-chat-sdk";

export function ChatPage() {
  return <ChatShell />;
}
```

**Floating corner widget:**

```tsx
import { ChatWidget } from "@anter/ai-chat-sdk";
import { useRouter } from "next/navigation";

export function FloatingChat() {
  const router = useRouter();
  return (
    <ChatWidget
      position="bottom-right"
      fullChatUrl={(sessionId) => `/chat${sessionId ? `/${sessionId}` : ""}`}
      onNavigate={(url) => router.push(url)}
    />
  );
}
```

---

## Components

### `<ChatProvider>`

The root context provider. Must wrap all other SDK components.

```tsx
<ChatProvider
  organizationId="org-123"
  adapter={adapter}
  config={{ ... }}
  strings={{ ... }}
>
  {children}
</ChatProvider>
```

| Prop             | Type                   | Required | Description                                           |
| ---------------- | ---------------------- | -------- | ----------------------------------------------------- |
| `organizationId` | `string`               | Yes      | Tenant identifier passed to the adapter on every call |
| `adapter`        | `ChatAdapter`          | Yes      | Your adapter instance                                 |
| `config`         | `ChatConfig`           | No       | Feature flags and UI defaults (see below)             |
| `strings`        | `Partial<ChatStrings>` | No       | Override any UI copy (see below)                      |

> **`organizationId` when there is no per-org routing:** If your application does not have per-tenant URLs (e.g. a platform admin console, a single-tenant deployment, or a white-label product with no org scoping), pass any stable string that your backend will recognise — the value is forwarded to your adapter on every call and is otherwise opaque to the SDK. Common choices are `"default"`, your product slug, or an internal platform identifier.
>
> ```tsx
> // Multi-tenant — org is in the URL
> <ChatProvider organizationId={params.orgId} adapter={adapter}>
>
> // Single-tenant or admin context — use a stable constant
> <ChatProvider organizationId="platform-admin" adapter={adapter}>
> ```

**`config` options:**

| Option                     | Type                            | Default               | Description                                                                                                           |
| -------------------------- | ------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `enableArtifacts`          | `boolean`                       | `true`                | Show the artifact panel when the AI generates a document                                                              |
| `enableModelSelector`      | `boolean`                       | `true`                | Show a model picker in the composer toolbar                                                                           |
| `enableFileUpload`         | `boolean`                       | `false`               | Allow users to attach files to messages                                                                               |
| `enableSlashCommands`      | `boolean`                       | `true`                | Show the `/` slash command menu                                                                                       |
| `enableCommandPalette`     | `boolean`                       | `true`                | Enable the ⌘K command palette                                                                                         |
| `enableSlashFocusShortcut` | `boolean`                       | `true`                | Focus the composer when the user presses `/` anywhere on the page                                                     |
| `enableResumeRetry`        | `boolean`                       | `true`                | Show the composer Resume/Retry control for crashed runs (see [Run resilience](#run-resilience-stop-reconnect-resume)) |
| `enableTools`              | `boolean`                       | `true`                | Show the Tools button and tools menu in the composer toolbar                                                          |
| `enableVoiceInput`         | `boolean`                       | `true`                | Show the voice input (microphone) button in the composer toolbar                                                      |
| `enableSendButton`         | `boolean`                       | `true`                | Show the on-screen Send button in the composer toolbar (useful on mobile where Enter is inefficient)                  |
| `defaultModel`             | `string`                        | `"claude-sonnet-4-6"` | Pre-selected model in the model picker                                                                                |
| `theme`                    | `"light" \| "dark" \| "system"` | `"system"`            | Color theme applied via `data-theme` attribute                                                                        |
| `themeOptions`             | `ChatThemeSpecification`        | `{}`                  | Per-mode brand token overrides (see [Whitelabeling & Custom Theming](#whitelabeling--custom-theming))                 |

**`strings` overrides** — all keys optional, defaults shown:

| Key                             | Default                                           |
| ------------------------------- | ------------------------------------------------- |
| `composerPlaceholder`           | `"Ask a question..."`                             |
| `footerDisclaimer`              | `"AI responses can contain mistakes."`            |
| `newConversation`               | `"New conversation"`                              |
| `sendMessage`                   | `"Send message"`                                  |
| `retry`                         | `"Retry"`                                         |
| `thinking`                      | `"Thinking..."`                                   |
| `exportArtifact`                | `"Save to workspace"`                             |
| `exportArtifactSub`             | `"Attach to your workspace"`                      |
| `openFullChat`                  | `"Open full chat"`                                |
| `cancel`                        | `"Cancel"`                                        |
| `artifactPanelClose`            | `"Close artifact panel"`                          |
| `approvalTitle`                 | `"Approval required"`                             |
| `approvalApprove`               | `"Approve"`                                       |
| `approvalDeny`                  | `"Deny"`                                          |
| `approvalConfirmDeny`           | `"Confirm deny"`                                  |
| `approvalDenyReasonPlaceholder` | `"Optional reason — sent to the agent"`           |
| `approvalWaiting`               | `"Waiting for approval through another channel…"` |
| `approvalApproved`              | `"Approved"`                                      |
| `approvalDenied`                | `"Denied"`                                        |
| `approvalExpired`               | `"Expired"`                                       |
| `approvalCanceled`              | `"Canceled"`                                      |

---

### `<ChatShell>`

A full-page chat interface with a collapsible sidebar, resizable panels for sources/files/artifacts, conversation history, and a command palette.

```tsx
<ChatShell
  emptyState={<MyEmptyState />}
  tips={[
    {
      id: "tip-1",
      type: "info",
      title: "Press / for slash commands",
      dismissible: true,
    },
  ]}
  initialSessionId="session-abc"
  onSessionChange={(id) => router.replace(`/chat/${id ?? ""}`)}
  onExportArtifact={async (artifactId) => {
    await myApi.save(artifactId);
  }}
  onRecordClick={({ subject, subjectId }) => router.push(`/records/${subject}/${subjectId}`)}
  recordPanel={<MyRecordPanel />}
  className="my-shell"
/>
```

| Prop                  | Type                                    | Description                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emptyState`          | `React.ReactNode`                       | Rendered when there are no messages. Defaults to `<ChatEmptyState />`                                                                                                                                                        |
| `tips`                | `ComposerAnnouncement[]`                | Tip banners shown randomly in the composer on mount                                                                                                                                                                          |
| `initialSessionId`    | `string`                                | Session to load on mount. Triggers `adapter.loadSession`                                                                                                                                                                     |
| `onSessionChange`     | `(id?: string) => void`                 | Fires whenever the active session changes (new or cleared)                                                                                                                                                                   |
| `onExportArtifact`    | `(artifactId: string) => Promise<void>` | Artifact export callback. When omitted, the export button is hidden                                                                                                                                                          |
| `onRecordClick`       | `(record: RecordTag) => void`           | Called when the user clicks an inline record chip                                                                                                                                                                            |
| `recordPanel`         | `React.ReactNode`                       | Custom panel content rendered in the right resizable pane (replaces the artifact panel when provided)                                                                                                                        |
| `renderMessageFooter` | `(message) => React.ReactNode`          | Host-supplied footer rendered below each assistant message                                                                                                                                                                   |
| `hideMessageActions`  | `boolean`                               | Hide the built-in message hover actions (copy, retry)                                                                                                                                                                        |
| `sidebarLinks`        | `SidebarNavLink[]`                      | Custom nav items appended to the sidebar rail — each carries `{ id, label, icon?, onClick }`                                                                                                                                 |
| `onArtifactsClick`    | `() => void`                            | Overrides the built-in Artifacts sidebar item's local panel toggle                                                                                                                                                           |
| `hideArtifactsLink`   | `boolean`                               | Hide the built-in Artifacts sidebar item                                                                                                                                                                                     |
| `className`           | `string`                                | Additional CSS class on the shell root element                                                                                                                                                                               |
| `style`               | `React.CSSProperties`                   | Inline styles merged onto the shell root. Pass `{ height: "100%" }` when a bounded parent provides the height                                                                                                                |
| `viewportOffset`      | `{ top?: number; bottom?: number }`     | Pixels of host-app chrome (header/footer) rendered outside the shell — subtracted from the viewport when computing the shell's height. Equivalent to setting `--ais-chrome-offset-top` / `--ais-chrome-offset-bottom` in CSS |

> **Height requirement:** `ChatShell` manages its own internal scroll and resizable panel layout. It must be rendered inside a container with an explicit, bounded height — a flex parent with `flex: 1` or `height: 100%`. Without a bounded height the resizable panels have nothing to fill and will collapse.
>
> ```tsx
> // ✅ Correct — parent provides explicit height
> <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
>   <ChatShell />
> </div>
>
> // ✅ Also correct — flex child expanding to fill available space
> <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
>   <ChatShell />
> </main>
>
> // ❌ Incorrect — no bounded height, panels collapse
> <div>
>   <ChatShell />
> </div>
> ```
>
> If you are embedding `ChatShell` inside a page layout that already provides a scrollable `overflow-y: auto` container, wrap it with `overflow: hidden` on the parent so `ChatShell`'s internal scroll takes over from the page scroll.

> **Mobile height contract (important):** on mobile, `100vh` is **not** the visible viewport — iOS Safari resolves it to the _largest_ viewport (browser chrome hidden), so anything sized with `100vh` pushes the composer below the fold while the address bar is showing. The shell protects itself in three layers:
>
> 1. **It never exceeds the visible viewport.** The shell's height defaults to `--ais-available-height` = dynamic viewport height (`100dvh`) minus the declared host chrome, and is hard-capped with `max-height: min(100%, var(--ais-available-height))` — so even a mis-sized parent cannot push the composer below the fold.
> 2. **Declare your app chrome.** If your app renders a header (and/or footer) outside the shell, tell the shell how many pixels it consumes:
>
>    ```tsx
>    // host app with a 52px header above the shell
>    <ChatShell viewportOffset={{ top: 52 }} />
>    ```
>
>    or equivalently in CSS: `.my-shell { --ais-chrome-offset-top: 52px; }`. Skip this only when the parent chain is itself bounded by the _dynamic_ viewport (see below) — then `style={{ height: "100%" }}` is enough.
>
> 3. **Browsers without `dvh`** get a JavaScript fallback: the shell tracks `window.visualViewport` and mirrors its height into `--ais-viewport-height` automatically.
>
> Host-side rule of thumb: never size the ancestor chain of `ChatShell` with `100vh`. Use `100dvh` (with a `100vh` fallback for older browsers) or a flex chain rooted at a `height: 100dvh` element, then give the shell `style={{ height: "100%" }}`.

**`ComposerAnnouncement` shape:**

```typescript
interface ComposerAnnouncement {
  id: string;
  type: "info" | "warning" | "success" | "announcement";
  title: string;
  icon?: string; // Optional emoji or short icon label
  action?: {
    label: string;
    onClick: () => void;
  }; // Optional CTA button
  position?: "top" | "bottom"; // Defaults to "bottom"
  dismissible?: boolean; // Adds a dismiss button to the banner
  onDismiss?: () => void; // Called when the user dismisses the banner
}
```

---

### `<ChatView>`

A standalone, full-featured chat pane designed to be embedded seamlessly into your existing layouts. It drops the built-in sidebar from `ChatShell` while preserving the resizable artifact/file drawers, making it the perfect primitive for dashboards, sliding panels, or inline content areas.

```tsx
<div style={{ height: "600px", border: "1px solid #ccc" }}>
  <ChatView
    emptyState={<MyEmptyState />}
    initialSessionId="session-abc"
    onSessionChange={(id) => router.replace(`/chat/${id ?? ""}`)}
    onExportArtifact={async (artifactId) => {
      await myApi.save(artifactId);
    }}
  />
</div>
```

| Prop                  | Type                                    | Description                                                                                           |
| --------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `emptyState`          | `React.ReactNode`                       | Rendered when there are no messages. Defaults to `<ChatEmptyState />`                                 |
| `tips`                | `ComposerAnnouncement[]`                | Tip banners shown randomly in the composer on mount                                                   |
| `initialSessionId`    | `string`                                | Session to load on mount. Triggers `adapter.loadSession`                                              |
| `onSessionChange`     | `(id?: string) => void`                 | Fires whenever the active session changes (new or cleared)                                            |
| `onExportArtifact`    | `(artifactId: string) => Promise<void>` | Artifact export callback. When omitted, the export button is hidden                                   |
| `onRecordClick`       | `(record: RecordTag) => void`           | Called when the user clicks an inline record chip                                                     |
| `recordPanel`         | `React.ReactNode`                       | Custom panel content rendered in the right resizable pane (replaces the artifact panel when provided) |
| `renderMessageFooter` | `(message) => React.ReactNode`          | Host-supplied footer rendered below each assistant message                                            |
| `hideMessageActions`  | `boolean`                               | Hide the built-in message hover actions (copy, retry)                                                 |
| `className`           | `string`                                | Additional CSS class on the root element                                                              |
| `style`               | `React.CSSProperties`                   | Inline styles merged onto the root element                                                            |

> **Height requirement:** Just like `ChatShell`, `ChatView` requires an explicit bounded height from its parent container in order to correctly manage scrolling and resizing panels.

---

### `<ChatWidget>`

A floating popover widget anchored to a corner of the screen. Uses a Radix UI `Popover` internally.

```tsx
<ChatWidget
  position="bottom-right"
  initialOpen={false}
  fullChatUrl={(sessionId) => `/chat/${sessionId ?? ""}`}
  onNavigate={(url) => router.push(url)}
  title="AI Assistant"
  subtitle="Powered by your platform"
  emptyState={<MyWelcomeScreen />}
  onExportArtifact={async (id) => {
    await myApi.save(id);
  }}
/>
```

| Prop               | Type                                                                 | Default                      | Description                                                                          |
| ------------------ | -------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| `position`         | `"bottom-right" \| "bottom-left"`                                    | `"bottom-right"`             | Corner to anchor the widget trigger button                                           |
| `initialOpen`      | `boolean`                                                            | `false`                      | Whether the popover opens on mount                                                   |
| `fullChatUrl`      | `(sessionId: string \| null) => string`                              | —                            | Builds the URL for "Open full chat". `sessionId` is `null` when no session is active |
| `onNavigate`       | `(url: string) => void`                                              | —                            | Navigation callback. Pass your router's push function here                           |
| `title`            | `string`                                                             | `orgLabel ?? "AI Assistant"` | Header title. Falls back to `orgLabel` set by the adapter, then `"AI Assistant"`     |
| `subtitle`         | `string`                                                             | —                            | Optional header subtitle line                                                        |
| `emptyState`       | `React.ReactNode`                                                    | —                            | Content shown before the first message                                               |
| `onExportArtifact` | `(artifactId: string) => Promise<void>`                              | —                            | Artifact export callback; hides export button when omitted                           |
| `trigger`          | `React.ReactNode \| ((props: { open: boolean }) => React.ReactNode)` | —                            | Custom trigger element or render function to replace default floating bubble button  |

#### Customizing the Widget Trigger

You can completely customize or replace the default floating bubble button using the `trigger` prop. This prop accepts either a static React element or a render function that receives the current popover `open` state.

**Example 1: Using a static React element**

```tsx
<ChatWidget
  fullChatUrl={(id) => `/chat/${id}`}
  onNavigate={(url) => router.push(url)}
  trigger={
    <button className="custom-chat-button">
      <span>Chat with AI</span>
    </button>
  }
/>
```

**Example 2: Using a render function (state-aware trigger)**

```tsx
<ChatWidget
  fullChatUrl={(id) => `/chat/${id}`}
  onNavigate={(url) => router.push(url)}
  trigger={({ open }) => (
    <button className={`custom-chat-button ${open ? "is-active" : ""}`}>
      {open ? "Close Chat" : "Open Chat"}
    </button>
  )}
/>
```

> [!NOTE]
> The custom trigger is wrapped in Radix UI's `<Popover.Trigger asChild>`. Ensure your custom trigger element accepts refs and forwards standard event handlers/props correctly (e.g. standard HTML buttons work automatically).

**Example 3: CSS customizations**

If you prefer to style or disable the default trigger's disk-like orbit animation or green notification indicator using custom CSS, you can target the respective class names in your stylesheet:

```css
/* Disable the rotating disk-like orbit hover animation */
.ais-widget-trigger-orbit {
  display: none !important;
}

/* Hide the active status ping dot */
.ais-widget-trigger-ping {
  display: none !important;
}

/* Customize the button's background and hover state */
.ais-widget-trigger {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  box-shadow: 0 10px 20px rgba(79, 70, 229, 0.3) !important;
}
```

---

### `<ChatSidepanel>`

A compact, dense side panel chat container designed for integration in split-screen grids or sidebar interfaces. It inherits its height from its parent (`height: 100%`) and internally runs its own state scope.

```tsx
import { ChatSidepanel } from "@anter/ai-chat-sdk";

<ChatSidepanel
  title="AI Sidekick"
  subtitle="Context-aware assistant"
  onClose={() => setIsPanelOpen(false)}
  fullChatUrl={(sessionId) => `/chat/${sessionId ?? ""}`}
  onNavigate={(url) => router.push(url)}
  onExportArtifact={async (id) => {
    await myApi.save(id);
  }}
  emptyState={<MyWelcomeScreen />}
/>;
```

| Prop               | Type                                    | Default                      | Description                                                           |
| ------------------ | --------------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `title`            | `string`                                | `orgLabel ?? "AI Assistant"` | Header title. Falls back to `orgLabel` set by the provider.           |
| `subtitle`         | `string`                                | —                            | Optional header subtitle line                                         |
| `onClose`          | `() => void`                            | —                            | Click handler for the `X` button; hides the close button when omitted |
| `fullChatUrl`      | `(sessionId: string \| null) => string` | —                            | Builds the URL for "Open full chat" navigation.                       |
| `onNavigate`       | `(url: string) => void`                 | —                            | Navigation callback triggered on click of full chat link.             |
| `onExportArtifact` | `(artifactId: string) => Promise<void>` | —                            | Callback to save an artifact; hides export action when omitted.       |
| `emptyState`       | `React.ReactNode`                       | —                            | Custom component shown when conversation is empty.                    |
| `className`        | `string`                                | —                            | Optional styling override class name                                  |

---

### `<ChatSidepanelLayout>`

A pre-configured viewport splitter that wraps host content and splits the viewport horizontally using resizable panels. Under viewport widths `<= 1024px`, it automatically transitions to a slide-in overlay drawer with a backdrop.

```tsx
import { ChatSidepanelLayout, ChatSidepanel } from "@anter/ai-chat-sdk";

<ChatSidepanelLayout
  isOpen={isPanelOpen}
  onClose={() => setIsPanelOpen(false)}
  defaultWidth={30}
  minWidth={20}
  maxWidth={50}
  storageKey="my-sidepanel-layout"
  sidepanel={
    <ChatSidepanel
      onClose={() => setIsPanelOpen(false)}
      fullChatUrl={(id) => `/chat/${id}`}
      onNavigate={(url) => router.push(url)}
    />
  }
>
  <div style={{ height: "100%", padding: "20px" }}>
    <h1>My Application Content</h1>
    <button onClick={() => setIsPanelOpen(true)}>Open Assistant</button>
  </div>
</ChatSidepanelLayout>;
```

| Prop           | Type              | Default                  | Description                                                                     |
| -------------- | ----------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `children`     | `React.ReactNode` | —                        | The main host application content (left pane)                                   |
| `sidepanel`    | `React.ReactNode` | —                        | The side panel content, typically `<ChatSidepanel>` (right pane)                |
| `isOpen`       | `boolean`         | —                        | Controls panel expansion state                                                  |
| `onClose`      | `() => void`      | —                        | Invoked when the panel is collapsed via layout actions or mobile backdrop click |
| `defaultWidth` | `number`          | `30`                     | Percentage-based (0-100) default width of the panel                             |
| `minWidth`     | `number`          | `20`                     | Percentage-based (0-100) minimum width of the panel                             |
| `maxWidth`     | `number`          | `50`                     | Percentage-based (0-100) maximum width of the panel                             |
| `storageKey`   | `string`          | `"ais-sidepanel-layout"` | LocalStorage key to save the user's customized panel width                      |
| `className`    | `string`          | —                        | Optional CSS class name for the wrapper                                         |

> [!NOTE]
> Ensure that both `<ChatSidepanelLayout>` and `<ChatSidepanel>` are placed inside a parent `<ChatProvider>` to inherit the required theming variables. Both panels assume their parent restricts height appropriately (e.g. `height: 100%` or bounded viewport height).

---

### `<ChatEmptyState>`

The default empty state shown when no messages exist. Pass it via `emptyState` on `ChatShell` / `ChatWidget`, or render it standalone in a custom shell.

```tsx
import { ChatEmptyState, type StarterCard } from "@anter/ai-chat-sdk";
import { Shield, FileSearch } from "lucide-react";

const STARTER_CARDS: StarterCard[] = [
  {
    icon: <Shield size={18} />,
    iconColor: "#6366f1",
    title: "Security review",
    description: "Analyze a document for risks",
    prompt: "Please review this document for security risks.",
  },
  {
    icon: <FileSearch size={18} />,
    iconColor: "#0ea5e9",
    title: "Summarize a policy",
    description: "Get a plain-language summary",
    prompt: "Summarize this policy in plain language.",
  },
];

<ChatEmptyState
  heading="What can I help you with?"
  subheading="Powered by your AI platform"
  starterCards={STARTER_CARDS}
  onSendMessage={(prompt) => sendMessage(prompt)}
/>;
```

| Prop            | Type                        | Default                                   | Description                                                         |
| --------------- | --------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `heading`       | `string`                    | `"What would you like to work on today?"` | Main heading (rendered with a gradient style)                       |
| `subheading`    | `string`                    | —                                         | Optional secondary line below the heading                           |
| `starterCards`  | `StarterCard[]`             | `[]`                                      | Grid of clickable prompt suggestion cards                           |
| `compact`       | `boolean`                   | `false`                                   | Optional compact layout variant for small viewports / mobile shells |
| `onSendMessage` | `(message: string) => void` | —                                         | Called with the card's `prompt` when clicked                        |

**`StarterCard` shape:**

```typescript
interface StarterCard {
  icon: React.ReactNode; // Any React element — typically a Lucide icon
  iconColor: string; // CSS color used for the icon and its background tint
  title: string;
  description: string;
  prompt: string; // The message sent when the card is clicked
}
```

---

### `<RecordPanel>`

An iframe-based side panel for displaying an external record alongside the chat. Pass it to `ChatShell` via the `recordPanel` prop to replace the artifact panel.

```tsx
import { RecordPanel } from "@anter/ai-chat-sdk";

function MyShell() {
  const [activeRecord, setActiveRecord] = useState(null);

  return (
    <ChatShell
      onRecordClick={(record) => setActiveRecord(record)}
      recordPanel={
        activeRecord ? (
          <RecordPanel
            subject={activeRecord.subject}
            iframeSrc={`/records/${activeRecord.subjectId}/embed`}
            externalHref={`/records/${activeRecord.subjectId}`}
            onClose={() => setActiveRecord(null)}
          />
        ) : undefined
      }
    />
  );
}
```

| Prop           | Type         | Description                                                                     |
| -------------- | ------------ | ------------------------------------------------------------------------------- |
| `subject`      | `string`     | Display label for the panel header (kebab-case is auto-formatted to Title Case) |
| `iframeSrc`    | `string`     | URL of the page to embed in the iframe                                          |
| `externalHref` | `string`     | Optional "Open in new tab" link shown in the header                             |
| `onClose`      | `() => void` | Called when the user closes the panel (or presses Escape)                       |

The iframe uses `sandbox="allow-scripts allow-same-origin allow-popups"`.

---

## The `ChatAdapter` Interface

All backend communication flows through one interface. Implement it to connect any backend.

```typescript
interface ChatAdapter {
  // Required
  createSession(config: SessionConfig): Promise<string>;
  loadSession(sessionId: string): Promise<SessionWithMessages>;
  listSessions(params?: ListParams): Promise<SessionList>;
  updateSession(sessionId: string, patch: SessionPatch): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  sendMessage(
    payload: MessagePayload,
    options?: SendMessageOptions,
  ): Promise<ReadableStream<Uint8Array>>;

  // Optional — files & commands
  loadSlashCommands?(): Promise<void>;
  uploadFile?(
    sessionId: string,
    file: File,
    options?: UploadFileOptions,
  ): Promise<ChatSessionFileRef>;
  listSessionFiles?(sessionId: string): Promise<ChatSessionFileRef[]>;
  deleteSessionFile?(sessionId: string, fileId: string): Promise<void>;
  downloadFile?(sessionId: string, fileId: string): Promise<Blob>;

  // Optional — approvals & run lifecycle (see "Run resilience" below)
  resolveToolApproval?(input: ResolveToolApprovalInput): Promise<void>;
  cancelRun?(input: CancelRunInput): Promise<void>;
  getExecutionStream?(
    executionId: string,
    resumeFrom?: number,
    options?: SendMessageOptions,
  ): Promise<ReadableStream<Uint8Array>>;
  resumeExecution?(
    executionId: string,
    options?: SendMessageOptions,
  ): Promise<ReadableStream<Uint8Array>>;
}
```

`SendMessageOptions` carries `{ signal?: AbortSignal }` — forward it to your `fetch` call so the Stop button can actually terminate the network stream.

**Method details:**

| Method                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSession`       | Return a session ID string. Creating the session in the backend is optional — the ID just needs to be stable for subsequent calls                                                                                                                                                                                                                                                                                                                                                                                                      |
| `loadSession`         | Return the full `SessionWithMessages` shape including all messages and any artifacts. May also carry the resume hint for the session's latest run (`resumeState`, `resumableExecutionId`) — see [Run resilience](#run-resilience-stop-reconnect-resume)                                                                                                                                                                                                                                                                                |
| `listSessions`        | Return a paginated `SessionList`. The SDK passes `{ page: 1, limit: 50 }` by default                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `sendMessage`         | Must return a `ReadableStream<Uint8Array>` of SSE text. Forward `options.signal` to your fetch call. See [SSE Streaming Protocol](#sse-streaming-protocol)                                                                                                                                                                                                                                                                                                                                                                             |
| `cancelRun`           | Cancel the in-flight run server-side (the Stop button). Receives `{ sessionId, executionId }` — the `executionId` is captured from the stream's `started` event. When absent, Stop only aborts the client stream; the server notices the disconnect and cancels (or detaches) on its own                                                                                                                                                                                                                                               |
| `getExecutionStream`  | Reattach to a live run's stream after a dropped connection, replaying from chunk `resumeFrom`. When implemented, the SDK automatically reconnects mid-run instead of surfacing a network error. See [Run resilience](#run-resilience-stop-reconnect-resume)                                                                                                                                                                                                                                                                            |
| `resumeExecution`     | Continue a **crashed** run from its last server-side checkpoint (the composer's Resume button), streaming the remainder. Distinct from `getExecutionStream`, which only reattaches to a run that is still executing. Must reject (non-2xx) when the run turns out not to be resumable, so the UI can fall back to a fresh retry                                                                                                                                                                                                        |
| `loadSlashCommands`   | Called once on `ChatStateProvider` mount. Use it to fetch and register slash commands                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `uploadFile`          | Required when `enableFileUpload: true`. File upload is disabled at the UI level if this method is absent                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `listSessionFiles`    | Called when the files panel opens or the session changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `deleteSessionFile`   | Called when the user removes a file from the session                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `downloadFile`        | Preferred over `ChatSessionFileRef.downloadUrl`. When implemented, the files panel fetches bytes through it (your backend handles auth) and saves a `Blob`, so no direct/presigned URL is exposed to the browser. Falls back to opening `downloadUrl` when absent                                                                                                                                                                                                                                                                      |
| `resolveToolApproval` | Resolves a human-in-the-loop tool approval surfaced by a `tool_approval_request` stream event (the run is paused server-side until resolved). When implemented, approval cards render Approve/Deny actions; when absent, cards are passive ("waiting for approval") and resolution must come from another channel via `tool_approval_resolved`. `ResolveToolApprovalInput` carries `{ sessionId, approval, decision: "approved" \| "denied", reason? }`; the `approval` includes backend routing context (`executionId`, `toolCallId`) |

**`SessionConfig` shape:**

```typescript
interface SessionConfig {
  organizationId: string;
  contextId?: string; // The active context ID at the time the session is created
  model?: string;
  title?: string;
}
```

**`MessagePayload` shape:**

```typescript
interface MessagePayload {
  organizationId: string;
  sessionId: string;
  message: string;
  attachedFileIds?: string[];
  contextVariables?: Record<string, string>;
  // contextVariables may include:
  //   contextId     — set when setActiveContext() has been called
  //   slashCommand  — the slashCommandId of a matched slash command
  //   sessionId     — always included
  //   ...plus any extraContextVariables passed by the host app
}
```

---

## SSE Streaming Protocol

`sendMessage` must return a `ReadableStream<Uint8Array>` carrying Server-Sent Events. The SDK parses them using `eventsource-parser`.

### Event format

Each event follows the SSE wire format:

```
event: content
data: {"content":"Hello, "}

event: content
data: {"content":"world!"}

event: done
data: {"isComplete":true}
```

The SDK also accepts events where the type is embedded in the JSON payload (not the `event:` line):

```
data: {"event":"content","content":"Hello"}
data: {"type":"done","isComplete":true}
data: {"payload":{"event":"step","...":"..."}}
```

All three patterns are resolved by `resolveEventType` — you can use whichever format your backend produces.

The `[DONE]` sentinel (used by some OpenAI-compatible APIs) is also handled:

```
data: [DONE]
```

### Supported event types

| Event                    | Expected payload                                                                                    | Description                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `started`                | `{ executionId?: string }`                                                                          | Emitted at the start of a run. The `executionId` is what powers Stop (`cancelRun`) and mid-run reconnect (`getExecutionStream`) — send it if your backend supports either          |
| `content`                | `{ content: string }` or `{ payload: { text: string } }`                                            | A streamed text chunk — appended to the current message                                                                                                                            |
| `done`                   | `{ isComplete: true, artifactIds?: string[], suggestions?: string[], sources?: MessageSource[] }`   | Stream complete — triggers post-processing (citations, record tags, suggestions)                                                                                                   |
| `error`                  | `{ error: string }`                                                                                 | Fatal error — shown in the message bubble with a Retry button                                                                                                                      |
| `artifact`               | `{ payload: Artifact }`                                                                             | A server-generated artifact to store and show in the artifact panel                                                                                                                |
| `step`                   | `{ step: AgentStepEvent }`                                                                          | An agent reasoning or tool step (rendered in the collapsible step timeline above the message)                                                                                      |
| `plan`                   | `{ plan: { phases: AgentPlanPhase[] } }`                                                            | Agent plan phases displayed above the message while streaming                                                                                                                      |
| `context_required`       | `{ payload: { contextKey, questionIntro, choices[] } }`                                             | Pauses the conversation and renders interactive choice chips (see [Context variables and context_required](#context-variables-and-context_required))                               |
| `context_resolved`       | `{ payload: { key: "contextId", value: string } }`                                                  | Server resolved a required context value — updates `activeContextId` in the provider                                                                                               |
| `tool_approval_request`  | `{ payload: { approvalId, toolCallId, toolName, args?, riskCategory?, expiresAt?, executionId? } }` | A HITL tool approval — the run is paused server-side. Renders an interactive approval card on the streaming message (actionable when the adapter implements `resolveToolApproval`) |
| `tool_approval_resolved` | `{ payload: { approvalId, decision: "approved" \| "denied" \| "timeout" \| "canceled", reason? } }` | Resolves the approval card (from any channel); a deny `reason` is displayed on the card. `timeout` renders as expired                                                              |

> **Heartbeats:** SSE comment lines (`: ping\n\n`) are ignored by the parser and never reach the UI — send one every 15–30 seconds during long silent stretches (tool execution, sub-agent work) so proxies and load balancers with idle timeouts don't kill the connection mid-run.

### Minimal streaming server example (Node.js / Bun)

```typescript
// In your API route handler:
export async function POST(req: Request) {
  const body = await req.json();
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: object) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      // Optional but recommended: lets the SDK stop/reconnect to this run.
      send("started", { executionId: "exec-123" });
      // Optional heartbeat during silent stretches (ignored by the parser):
      // controller.enqueue(enc.encode(`: ping\n\n`));

      send("content", { content: "Hello, " });
      send("content", { content: "world!" });
      send("done", { isComplete: true });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
```

### Agent step events

When the `step` event is sent, the SDK accumulates steps into a collapsible **ReasoningBlock** rendered above the message content. This lets you expose agent tool calls, retrieval steps, and internal reasoning without cluttering the main message text.

```typescript
interface AgentStepEvent {
  type: "reasoning" | "tool_call" | "tool_result" | "handoff" | "retrieval";
  label: string;
  detail?: string;
  status: "in_progress" | "done" | "error";
  step_id: string;
  duration_ms?: number;
  tokens_used?: number;
}
```

---

## Run resilience: stop, reconnect, resume

A long-running agent turn can outlive a single HTTP connection — a proxy or load balancer may drop the socket while the run keeps executing server-side. The SDK has a layered recovery model; each layer activates when the adapter implements the corresponding optional method.

### The `executionId` lifecycle

Everything hinges on the backend emitting a `started` SSE event carrying the run's `executionId` at the top of each stream. The SDK captures it and uses it for all three controls below. Without it, none of them can act on the server-side run.

### Stop (`cancelRun`)

When the user clicks Stop, the SDK calls `adapter.cancelRun({ sessionId, executionId })` (best-effort), then aborts the local stream via the `AbortSignal` it passed to `sendMessage`. When `cancelRun` is absent, only the local stream is aborted — the server sees the disconnect and handles it however it chooses (cancel, or detach and keep running).

### Automatic mid-run reconnect (`getExecutionStream`)

If the stream ends **without a terminal frame** (`done` / `error` / `[DONE]`) or the read fails outright (a killed socket surfaces in the browser as a `TypeError: network error`), the SDK treats the connection — not the run — as dead:

1. It calls `adapter.getExecutionStream(executionId, 0, { signal })` to reattach.
2. The replay stream re-sends the turn's frames from chunk `0`, so the SDK resets the message bubble (content, steps, artifact ids) and rebuilds it from the replay. Pending tool-approval cards are preserved and deduped by `approvalId`.
3. If the reattached stream also drops, it retries — bounded at **5 reconnect attempts** per turn, so a genuinely stuck run cannot loop forever.

When reconnect is impossible (no `executionId` arrived, the adapter doesn't implement `getExecutionStream`, or attempts are exhausted), the message settles with a friendly "connection was lost" error and an inline Retry control — never the raw browser network error.

Backend expectations for `getExecutionStream`:

- The run must **detach** on client disconnect (keep executing, keep persisting stream chunks).
- A replay endpoint must re-send persisted chunks from `resumeFrom` and then continue live, e.g. `GET /executions/:id/stream?resumeFrom=N`.
- Emit heartbeat comments while the run is silent (see the note in the SSE section).

### Resume after a crash (`resumeExecution` + `resumeState`)

Reconnect covers a dead _connection_; resume covers a dead _run_. When `loadSession` returns a session whose latest run crashed, the backend can hint the recovery path via two fields on `SessionWithMessages`:

```typescript
type ResumeState = "live" | "resumable" | "retry" | null;

interface Session {
  // ...
  activeExecutionId?: string | null; // "live"  — a run is still in flight
  resumeState?: ResumeState;
  resumableExecutionId?: string | null; // "resumable" — continue from checkpoint
}
```

- `"resumable"` — the composer shows a **Resume** control; clicking it calls `adapter.resumeExecution(resumableExecutionId)` and streams the remainder from the last server-side checkpoint. If the backend answers non-2xx (no longer resumable), the UI falls back to re-sending the last turn.
- `"retry"` — the composer shows a **Retry** control that re-sends the last user message.
- `"live"` / `null` — no manual control is shown.

The whole affordance is gated by `config.enableResumeRetry` (default `true`) and requires the adapter to implement `resumeExecution`.

### Adapter support matrix

| Adapter implements   | User experience on a dropped connection                |
| -------------------- | ------------------------------------------------------ |
| Neither              | Friendly "connection was lost" error with inline Retry |
| `getExecutionStream` | Seamless automatic reattach mid-run (up to 5 attempts) |
| + `cancelRun`        | Stop also cancels the run server-side                  |
| + `resumeExecution`  | Crashed runs offer checkpoint Resume on session reload |

---

## Inline content tags

The SDK parses several custom XML-like tags that can appear in streamed assistant content. These are stripped from the rendered markdown and converted to structured UI elements.

### `<artifact>` — inline artifact extraction

An `<artifact>` tag in message content creates an artifact without needing a separate SSE `artifact` event. This is the fallback path when the backend embeds content directly in the text stream.

```
<artifact type="markdown" title="Security Policy">
# Information Security Policy
...
</artifact>
```

Attributes:

| Attribute | Description                                                              |
| --------- | ------------------------------------------------------------------------ |
| `type`    | Artifact type: `markdown`, `html`, `code`, `table`, or any custom string |
| `title`   | Display title in the artifact panel header                               |

The tag is stripped from the rendered message and the artifact appears as a chip below the message bubble.

### `<cite>` — inline citations

Citation tags are stripped and replaced with clickable `[N]` superscript markers. Clicking a marker opens the sources panel scrolled to that source.

```
The policy requires annual reviews<cite source_id="doc-001">annual reviews</cite>.
```

The `source_id` must match an `id` in the `sources` array on the `done` event. Up to 10 citations are supported; unresolvable IDs are silently dropped.

### `<record>` — inline record references

Record tags are stripped and rendered as clickable chips below the message bubble. Multiple IDs can be comma-separated in `subjectId`.

```
See the related control<record subject="control" subjectId="ctrl-101,ctrl-102" />.
```

### `<suggestions>` — follow-up suggestions

A JSON array of suggested follow-up questions, stripped from the content and rendered as clickable chips below the message.

```
<suggestions>["What are the next steps?", "Show me the related policies"]</suggestions>
```

On the happy path, the backend strips this tag before sending content to the client. The SDK also handles the fallback case where it arrives as raw text.

---

## Slash commands

The slash command registry is a module-level singleton — register commands once and they appear in the `/` menu for all SDK instances on the page.

```typescript
import { registerSlashCommand, getSlashCommandRegistry } from "@anter/ai-chat-sdk";

registerSlashCommand({
  name: "/analyze",
  description: "Run a deep analysis on your document",
  slashCommandId: "analyze",
  exampleUsage: "/analyze my-document.pdf",
  onSelect: ({ setValue, submit }) => {
    setValue("/analyze ");
    // Don't call submit() here if you want the user to type additional arguments
  },
});
```

**`RegisteredSlashCommand` shape:**

```typescript
interface RegisteredSlashCommand {
  name: string; // Must start with /
  description: string;
  slashCommandId: string;
  exampleUsage?: string;
  onSelect: (api: { setValue: (v: string) => void; submit: (v?: string) => void }) => void;
}
```

The built-in `/help` command is always present. It renders a table of all registered commands inline without calling the backend.

`registerSlashCommand` is idempotent — registering a command whose `name` already exists is a no-op.

**Loading commands from an API** — implement `loadSlashCommands()` on your adapter:

```typescript
async loadSlashCommands(): Promise<void> {
  const res = await fetch('/api/commands');
  const commands = await res.json();
  commands.forEach((cmd) =>
    registerSlashCommand({
      name: cmd.name,
      description: cmd.description,
      slashCommandId: cmd.id,
      exampleUsage: cmd.exampleUsage,
      onSelect: ({ setValue, submit }) => { setValue(cmd.name); submit(cmd.name); },
    }),
  );
}
```

---

## Command palette (⌘K)

The command palette surfaces arbitrary actions registered with `registerCommand`. Register inside a React component and clean up on unmount.

```typescript
import { registerCommand, unregisterCommand } from "@anter/ai-chat-sdk";
import { useEffect } from "react";

function MyFeature({ onExport }: { onExport: () => void }) {
  useEffect(() => {
    registerCommand({
      id: "myapp:export",
      label: "Export current session",
      description: "Download the conversation as Markdown",
      onExecute: onExport,
    });
    return () => unregisterCommand("myapp:export");
  }, [onExport]);
}
```

**`RegisteredCommand` shape:**

```typescript
interface RegisteredCommand {
  id: string; // Stable, unique — use a namespaced prefix (e.g. 'myapp:')
  label: string; // Primary text in the palette list
  description?: string; // Secondary text shown below the label
  onExecute: () => void;
}
```

Re-registering with the same `id` replaces the existing entry in-place (safe for React Strict Mode double-mounts).

The SDK registers two built-in commands under the `shell:` namespace:

- `shell:new-conversation` — clears messages and starts a fresh session
- `shell:view-recents` — opens the conversation history view

Use a different prefix (e.g. `myapp:`, `plugin:`, `host:`) to avoid conflicts.

---

## Artifact registry

Register custom renderers for non-standard artifact types. The registry maps artifact type strings to render functions.

```typescript
import { registerArtifact } from '@anter/ai-chat-sdk';

registerArtifact('mermaid', {
  detect: (content) => content.trim().startsWith('graph') || content.trim().startsWith('sequenceDiagram'),
  render: (content) => <MermaidDiagram source={content} />,
  exportFormats: ['svg', 'png'],
});
```

**`ArtifactRendererConfig` shape:**

```typescript
interface ArtifactRendererConfig {
  detect: (content: string) => boolean; // Returns true if this renderer handles the content
  render: (content: string) => ReactNode;
  exportFormats?: string[]; // Shown as download options in the artifact panel
}
```

Built-in renderers handle `markdown`, `html`, `code`, `table`, and `docx`. Custom registrations are checked first when the artifact type matches.

---

## Plugins

Plugins let the host application inject React UI into named **slots** inside the SDK's surfaces — without requiring the SDK to know anything about the domain content being injected. The SDK defines _where_ slots exist; the host supplies _what_ renders in them.

Plugins are passed as the `plugins` prop on `<ChatProvider>` and are available throughout the SDK tree via `useChatContext()`.

```typescript
import type { ChatPlugins } from "@anter/ai-chat-sdk";
```

### Available slots

| Slot                   | Location                                | Description                                       |
| ---------------------- | --------------------------------------- | ------------------------------------------------- |
| `composerActions`      | Composer footer, after the Tools button | Additional action buttons in the composer toolbar |
| `composerTopBanner`    | Above composer input                    | Host-controlled banner slot rendered above input  |
| `composerBottomBanner` | Below composer input                    | Host-controlled banner slot rendered below input  |

Banners render as cards **stacked behind the composer**: the composer keeps its full rounded corners and each banner tucks under it, peeking out above (top slot) or below (bottom slot) with its own rounded outer corners.

### Injecting a composer action

Pass any React node as `composerActions`. Use the `ais-composer-footer-btn` CSS class if you want your button to match the built-in Tools button style.

```tsx
import { ChatProvider } from "@anter/ai-chat-sdk";

function MyApp() {
  return (
    <ChatProvider
      adapter={adapter}
      organizationId={organizationId}
      plugins={{
        composerActions: <MyExtensionsButton />,
        composerTopBanner: {
          id: "notify-response",
          type: "announcement",
          title: "Want to be notified when the AI responds?",
          action: { label: "Notify", onClick: openNotificationPrompt },
          dismissible: true,
        },
      }}
    >
      <ChatShell />
    </ChatProvider>
  );
}
```

The button renders in the composer footer left group, to the right of the built-in Tools button:

```
[ + ]  [ Tools ]  [ MyExtensionsButton ]          [ 🎤 ]
```

### Persistent context variables

When a plugin needs to inject state into every message send — for example, a toggle that changes the backend's behaviour — use `setPersistentContextVariable` from `useChatContext()`.

Persistent variables are merged into `payload.contextVariables` on every `sendMessage` call. They sit at the lowest priority: `activeContextId`, `slashCommand`, and per-message `extraContextVariables` all override them if the same key is used.

```
persistentContextVariables   (lowest — background state)
  ↓ overridden by
activeContextId              (framework/context selection)
  ↓ overridden by
slashCommand                 (matched slash command id)
  ↓ overridden by
extraContextVariables        (highest — explicit per-message overrides)
```

```tsx
// Inside any component that is a descendant of ChatProvider
import { useChatContext } from "@anter/ai-chat-sdk";

function MyToggle() {
  const { setPersistentContextVariable } = useChatContext();
  const [enabled, setEnabled] = useState(false);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    // Pass undefined to clear the key from contextVariables
    setPersistentContextVariable("myMode", next ? "true" : undefined);
  };

  return <button onClick={toggle}>{enabled ? "Disable" : "Enable"} My Mode</button>;
}
```

### Full example — Extensions menu

Here is a complete host-application plugin that adds an Extensions dropdown to the composer with two items: a persistent mode toggle and an import action.

```tsx
// host-app/extensions-menu.tsx
"use client";

import { useState } from "react";
import { useChatContext } from "@anter/ai-chat-sdk";

interface ExtensionsMenuProps {
  onImportQuestionnaire?: () => void;
}

export function ExtensionsMenu({ onImportQuestionnaire }: ExtensionsMenuProps) {
  const { setPersistentContextVariable } = useChatContext();
  const [rfpModeEnabled, setRfpModeEnabled] = useState(false);

  const toggleRfpMode = () => {
    const next = !rfpModeEnabled;
    setRfpModeEnabled(next);
    setPersistentContextVariable("rfpMode", next ? "true" : undefined);
  };

  return (
    <div className="extensions-dropdown">
      <button type="button" className="ais-composer-footer-btn">
        Extensions
      </button>
      {/* your dropdown implementation */}
      <ul>
        <li>
          <button type="button" onClick={toggleRfpMode}>
            RFP Mode — {rfpModeEnabled ? "On" : "Off"}
          </button>
        </li>
        {onImportQuestionnaire && (
          <li>
            <button type="button" onClick={onImportQuestionnaire}>
              Import questionnaire
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
```

```tsx
// host-app/chat-wrapper.tsx
import { ChatProvider, ChatShell } from "@anter/ai-chat-sdk";
import { ExtensionsMenu } from "./extensions-menu";

export function ChatWrapper({ organizationId, onImportQuestionnaire }) {
  return (
    <ChatProvider
      adapter={adapter}
      organizationId={organizationId}
      plugins={{
        composerActions: <ExtensionsMenu onImportQuestionnaire={onImportQuestionnaire} />,
      }}
    >
      <ChatShell />
    </ChatProvider>
  );
}
```

When the user enables RFP Mode and sends a message, the adapter receives:

```typescript
payload.contextVariables ===
  {
    rfpMode: "true", // from setPersistentContextVariable
    contextId: "proj-123", // from setActiveContext (if set)
  };
```

When toggled off, `rfpMode` is cleared from `contextVariables` automatically.

### Adding more slots

`ChatPlugins` is a typed interface — adding a slot means adding a field to it. If you need a slot that doesn't exist yet, open a PR against the SDK rather than working around it; slots must be position-descriptive and domain-agnostic (e.g. `headerActions`, `emptyStateFooter`) to preserve the agnostic contract.

---

## Context variables and `context_required`

### Sending context variables

Context variables are arbitrary key-value pairs merged into `payload.contextVariables` on every `sendMessage` call. There are three sources:

- **Persistent** — set via `setPersistentContextVariable` (see [Plugins](#plugins)); merged first, lowest priority
- **Automatic** — `contextId` (from `setActiveContext`) and `slashCommand` (matched command id)
- **Per-message** — passed as the 4th argument to `sendMessage`; highest priority, overrides all others

Your adapter receives the merged result in `payload.contextVariables`. To pass additional variables for a single message from any component:

```typescript
const { sendMessage } = useChat();

// Pass extra context variables alongside the message
sendMessage("Analyze this contract", undefined, undefined, {
  documentId: "doc-abc",
  mode: "strict",
});
```

### Setting the active context

```tsx
import { useChatContext } from "@anter/ai-chat-sdk/headless";

function ProjectPicker({ projects }) {
  const { setActiveContext, activeContextId, activeContextLabel } = useChatContext();

  return (
    <select
      value={activeContextId ?? ""}
      onChange={(e) => {
        const project = projects.find((p) => p.id === e.target.value);
        setActiveContext(project?.id, project?.name);
      }}
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
```

The `activeContextLabel` (second argument to `setActiveContext`) is displayed as a tag in the composer. The `activeContextId` is sent to the backend as `contextVariables.contextId`.

### `context_required` — interactive choice chips

When the backend cannot proceed without a required value, it emits a `context_required` SSE event instead of streaming a response. The SDK renders the `questionIntro` as the assistant's message and displays the `choices` as interactive button chips.

```typescript
// Backend sends:
{
  event: 'context_required',
  payload: {
    contextKey: 'projectId',
    questionIntro: 'Which project would you like to analyze?',
    choices: [
      { label: 'Project Alpha', value: 'proj-001' },
      { label: 'Project Beta',  value: 'proj-002' },
    ],
  },
}
```

When the user clicks a chip, the SDK sends the `label` as the next user message. The backend can then respond with a `context_resolved` event to update the active context, or simply continue the conversation.

---

## Headless hooks

Use the headless layer to build fully custom UIs while keeping all state management.

### Setup

Both `ChatProvider` (config + adapter) and `ChatStateProvider` (conversation state) must be in the tree. `ChatStateProvider` is the inner provider that owns message state — `ChatShell` and `ChatWidget` create it for you, but headless usage requires it explicitly.

```tsx
import { ChatProvider } from "@anter/ai-chat-sdk";
import { ChatStateProvider, useChat } from "@anter/ai-chat-sdk/headless";

function MyCustomChat() {
  return (
    <ChatProvider organizationId="org-123" adapter={adapter}>
      <ChatStateProvider>
        <MyCustomChatInner />
      </ChatStateProvider>
    </ChatProvider>
  );
}

function MyCustomChatInner() {
  const { messages, sendMessage, isStreaming, clearMessages } = useChat();
  return (
    <div>
      {messages.map((m) => (
        <p key={m.id}>{m.content}</p>
      ))}
      <button onClick={() => sendMessage("Hello")} disabled={isStreaming}>
        Send
      </button>
    </div>
  );
}
```

### Available hooks

#### `useChat()`

The primary chat state hook. Must be used inside `ChatStateProvider`.

```typescript
interface UseChatReturn {
  messages: ChatMessage[];
  streamingState: StreamingState;
  isStreaming: boolean; // Shorthand for streamingState.isStreaming
  isLoading: boolean; // True while waiting for the first chunk
  error?: string;
  currentSessionId?: string;
  currentSessionTitle?: string;
  adapter: ChatAdapter;
  sendMessage: (
    message: string,
    attachedFileIds?: string[],
    overrideSessionId?: string,
    extraContextVariables?: Record<string, string>,
  ) => Promise<void>;
  // Stop the in-flight response: cancels server-side via adapter.cancelRun
  // (when implemented), then aborts the local stream.
  stopStreaming: () => void;
  clearMessages: () => void; // Resets to a new conversation
  retryLastMessage: () => Promise<void>;
  // Retry from a specific user message: removes it and everything after it,
  // then re-sends the same content (no duplication).
  retryMessage: (messageId: string) => Promise<void>;
  // Resume affordance for the last crashed run (see Run resilience):
  // "resumable" → Resume, "retry" → Retry, "live"/null → no control.
  resumeState: ResumeState;
  resumeRun: () => Promise<void>; // Run the Resume/Retry action
  loadSession: (session: SessionWithMessages) => void;
  // HITL tool approvals (see resolveToolApproval on the adapter)
  canResolveToolApprovals: boolean;
  resolveToolApproval: (
    approval: ToolApproval,
    decision: "approved" | "denied",
    reason?: string,
  ) => Promise<void>;
}
```

#### `useArtifacts()`

```typescript
interface UseArtifactsReturn {
  artifacts: Map<string, Artifact>;
  panelState: ArtifactPanelState;
  activeArtifact?: Artifact;
  openArtifact: (artifactId: string) => void;
  closePanel: () => void;
  setActiveTab: (tab: "preview" | "source" | "export") => void;
  registerArtifacts: (artifacts: Artifact[]) => void;
  markSaved: (artifactId: string, record: LinkedRecord) => void;
}
```

#### `useSources()`

```typescript
interface UseSourcesReturn {
  activeSources: MessageSource[];
  activeMessageId?: string;
  panelState: SourcesPanelState;
  openSources: (messageId: string, sources: MessageSource[], scrollToIndex?: number) => void;
  closeSources: () => void;
}
```

#### `useSessionFiles()`

Only meaningful when `enableFileUpload: true` and the adapter implements `listSessionFiles`.

```typescript
interface UseSessionFilesReturn {
  files: ChatSessionFileRef[];
  isLoading: boolean;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  refresh: () => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  downloadFile: (file: ChatSessionFileRef) => Promise<void>;
}
```

#### `useConversationHistory()`

Fetches the session list from the adapter and provides refresh/delete.

```typescript
// Returns:
{
  sessions: Session[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}
```

#### `useChatContext()`

Direct access to the provider's shared state.

```typescript
// Key fields:
{
  adapter: ChatAdapter;
  organizationId: string;
  config: Required<ChatConfig>;
  strings: ChatStrings;
  plugins: ChatPlugins;
  currentSession?: Session;
  activeContextId?: string;
  activeContextLabel?: string;
  setActiveContext: (id: string | undefined, label?: string) => void;
  topBanner: ComposerAnnouncement | null;
  setTopBanner: (a: ComposerAnnouncement | null) => void;
  bottomBanner: ComposerAnnouncement | null;
  setBottomBanner: (a: ComposerAnnouncement | null) => void;
  // Backward-compatible alias to bottomBanner
  announcement: ComposerAnnouncement | null;
  // Backward-compatible alias to setBottomBanner
  setAnnouncement: (a: ComposerAnnouncement | null) => void;
  persistentContextVariables: Record<string, string>;
  setPersistentContextVariable: (key: string, value: string | undefined) => void;
}
```

#### `useStickyBottom()`

Utility hook that keeps a scrollable container pinned to the bottom as new content arrives. Returns a ref to attach to the scroll container.

### Message roles

`ChatMessage.role` can be:

| Role          | Rendered as                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `"user"`      | Right-aligned bubble                                                                                                                      |
| `"assistant"` | Left-aligned bubble with markdown rendering, source chips, artifact chips, reasoning block                                                |
| `"command"`   | A small pill showing the slash command name (e.g. `/analyze`). No bubble content — the assistant's response follows as a separate message |

---

## Artifacts

When the backend emits an `artifact` SSE event or the response contains inline `<artifact>` tags, the SDK stores the artifact and surfaces it in the artifact panel.

### Artifact shape

```typescript
interface Artifact {
  artifactId: string;
  type: "markdown" | "html" | "code" | "table" | "docx" | string;
  title: string;
  content: string;
  exportFormats: string[]; // Controls download buttons: 'markdown', 'pdf', 'docx', etc.
  language?: string; // For code artifacts — syntax highlighting hint
  downloadUrl?: string; // Presigned URL for server-generated files (DOCX, PDF)
  previewType?: ArtifactType; // Type of previewContent when it differs from content
  previewContent?: string; // Alternate render payload (e.g. HTML preview of a DOCX)
  citations?: Citation[];
  savedRecord?: LinkedRecord; // Set after markSaved() is called
}
```

### Artifact panel tabs

The tabs shown in the artifact panel depend on the artifact type:

| Type       | Tabs                                        |
| ---------- | ------------------------------------------- |
| `markdown` | Preview, Markdown (source), Export          |
| `html`     | Preview, HTML (source), Export              |
| `code`     | Code (source), Export                       |
| `table`    | Preview, Export                             |
| `docx`     | Preview (if previewContent present), Export |

The Export tab always shows a client-side Markdown download if `"markdown"` is in `exportFormats`. A DOCX download link is shown when `downloadUrl` is set. The "Save to workspace" button appears when `onExportArtifact` is provided.

### Marking an artifact as saved

After saving an artifact to your system, call `markSaved` to update the UI (hides the export button, shows a saved indicator on the chip):

```typescript
const { markSaved } = useArtifacts();

async function handleExport(artifactId: string) {
  const saved = await myApi.saveDocument(artifactId);
  markSaved(artifactId, {
    entityType: "document",
    entityId: saved.id,
    entityUrl: `/documents/${saved.id}`,
    savedAt: new Date().toISOString(),
  });
}
```

---

## Record tags

The backend embeds structured record references in message content using a custom tag:

```
See the linked control<record subject="control" subjectId="ctrl-101" />.
```

Multiple IDs can be comma-separated:

```
<record subject="evidence-task" subjectId="ev-001,ev-002,ev-003" />
```

The SDK:

1. Strips the tag from rendered markdown
2. Parses `subjectId` into `ids: string[]`
3. Renders a clickable `RecordChip` below the message bubble

**`RecordTag` shape:**

```typescript
interface RecordTag {
  subject: string; // Kebab-case identifier (e.g. "evidence-task", "control")
  subjectId: string; // Raw comma-separated string from the attribute
  ids: string[]; // Parsed individual IDs
}
```

Handle clicks in `ChatShell`:

```tsx
<ChatShell
  onRecordClick={({ subject, subjectId, ids }) => {
    router.push(`/records/${subject}/${ids[0]}`);
  }}
/>
```

The `subject` value is converted from kebab-case to Title Case for display (e.g. `"evidence-task"` → `"Evidence Task"`).

---

## AnterAdapter

The `AnterAdapter` is the official Anter backend adapter for this SDK. It lives in the sibling [`@anter/anter-adapter`](../packages/anter-adapter) package to keep this SDK generic and domain-agnostic.

It implements the full run-lifecycle contract out of the box: `sendMessage` forwards the Stop button's abort signal, `cancelRun` cancels the execution server-side, and `getExecutionStream` reattaches to a live run after a dropped connection via the Anter agent-runner replay endpoint (`GET /v1/external/agent-runner/executions/:id/stream?resumeFrom=N`) — so long-running turns survive proxy idle timeouts automatically.

```typescript
import { AnterAdapter } from "@anter/anter-adapter";

const adapter = new AnterAdapter({
  baseUrl: "/api/chat",
  organizationId: "org-123",
  projectId: "proj-456", // Optional — targets a specific project's agent
  agentId: "agent-789", // Optional — pairs with projectId
  getAuthHeaders: async () => {
    const token = await getApiToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
```

### Wiring `getAuthHeaders` to your host app's auth

`getAuthHeaders` is called before every API request. The simplest framework-agnostic pattern is to expose a module-level setter and getter so the adapter can reach the host app's token provider without importing auth libraries directly:

```typescript
// lib/api-token.ts
let tokenProvider: (() => Promise<string | null>) | null = null;

export function setApiTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn;
}

export function getApiToken(): Promise<string | null> {
  return tokenProvider ? tokenProvider().catch(() => null) : Promise.resolve(null);
}
```

```typescript
// auth/provider.tsx — call this once when auth initialises
import { setApiTokenProvider } from "../lib/api-token";

// Example: MSAL (Azure AD)
setApiTokenProvider(() => acquireAccessToken(msalInstance, account));

// Example: Supabase
setApiTokenProvider(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

// Example: static dev token
setApiTokenProvider(async () => process.env.DEV_TOKEN ?? null);
```

```typescript
// chat/adapter.ts
import { AnterAdapter } from "@anter/anter-adapter";
import { getApiToken } from "../lib/api-token";

export const adapter = new AnterAdapter({
  baseUrl: "/api/chat",
  organizationId: "org-123",
  getAuthHeaders: async () => {
    const token = await getApiToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
```

This pattern works in any framework (Next.js, Vite, Remix, plain React) without importing auth libraries into the adapter file. The same pattern applies when writing a custom `ChatAdapter` from scratch.

See the [`@anter/anter-adapter` README](../packages/anter-adapter/README.md) for full documentation including constructor options, auth wiring patterns, routing details, and Anter-specific methods.

---

## Development

### Build

```bash
cd packages/ai-chat-sdk
pnpm build       # Production build (clean → tsup → tsc declarations → copy CSS)
pnpm dev         # Watch mode via tsup
```

### Test

```bash
pnpm test
pnpm test:watch
```

### Type check and lint

```bash
pnpm type-check
pnpm lint
pnpm check-all   # format + lint + types + build in sequence
```

### Adding a new feature

1. **Types** — define interfaces in `src/headless/types/`
2. **Logic** — add state and side-effects in a hook under `src/headless/hooks/`
3. **UI** — build the component in `src/ui/<feature>/`
4. **Exports** — add to `src/index.ts` (UI) and/or `src/headless/index.ts` (hooks/types)
5. **Tests** — add a `*.spec.ts` / `*.spec.tsx` file adjacent to the source

### Build output

| Entry point                      | Source                                                    |
| -------------------------------- | --------------------------------------------------------- |
| `dist/index.js`                  | `src/index.ts` — all exports (UI + headless + extensions) |
| `dist/headless/index.js`         | `src/headless/index.ts` — hooks and types only            |
| `dist/styles/styles.css`         | `src/styles/styles.css`                                   |
| `dist/styles/styles-no-base.css` | `src/styles/styles-no-base.css`                           |

Type declarations are generated separately by `tsc -p tsconfig.build.json` and placed alongside each `.js` file.

---

## CSS architecture

All SDK styles use the `ais-` prefix to avoid collisions with host application styles. No CSS-in-JS, no Tailwind runtime dependency in the consumer's bundle — styles are pre-built and static.

**Theme scoping:**

`ChatProvider` renders a `<div data-chat-provider="ai-chat-sdk" data-theme="light|dark|system">` wrapper. All theme tokens are scoped to `[data-chat-provider]`, so the SDK's dark mode cannot leak into the host application and vice versa.

**Tailwind users:**

Import `styles-no-base.css` instead of `styles.css` to avoid a double CSS reset. The component styles are identical; only the base/reset block differs.

**Panel layout persistence:**

`ChatShell` saves resizable panel sizes to `localStorage` under the keys `ais-chat-layout-*` and `ais-shell-layout`. This is automatic and requires no configuration.

---

## Whitelabeling & Custom Theming

The SDK fully supports whitelabeling to seamlessly match the parent/host application's color theme, typography, and brand styles. You can customize colors, spacing, borders, panel widths, and message bubbles by passing a typed `themeOptions` configuration block inside `ChatConfig` to `ChatProvider`.

Under the hood, the SDK converts the JavaScript theme configuration properties into standard CSS custom properties (CSS variables) dynamically, scope-safely applying them globally to all elements carrying `data-chat-provider="ai-chat-sdk"` (which includes standard chat layouts and Radix portal-rendered overlays like dropdowns, modals, and tooltips).

### Example implementation

```tsx
import { ChatProvider, ChatShell } from "@anter/ai-chat-sdk";
import { MyAdapter } from "./my-adapter";

const adapter = new MyAdapter();

export function WhitelabeledChat() {
  return (
    <ChatProvider
      organizationId="my-org"
      adapter={adapter}
      config={{
        theme: "system",
        themeOptions: {
          light: {
            accent: "#8b5cf6", // Vibrant purple primary accent
            accentHover: "#7c3aed",
            accentForeground: "#ffffff",
            radiusMd: "12px",
            sidebarBg: "#f5f3ff",
          },
          dark: {
            accent: "#a78bfa", // Soft purple primary accent for dark mode
            accentHover: "#8b5cf6",
            accentForeground: "#000000",
            radiusMd: "12px",
            sidebarBg: "#0f0c1b",
          },
        },
      }}
    >
      <ChatShell />
    </ChatProvider>
  );
}
```

### Available theme tokens

Below is the list of JavaScript keys supported in the `ChatTheme` interface, their mapped CSS custom properties, and their roles in the UI:

| JavaScript Key     | CSS Variable               | Purpose & UI Role                                                                               |
| :----------------- | :------------------------- | :---------------------------------------------------------------------------------------------- |
| `bg`               | `--chat-bg`                | Main background color for the chat viewport and messaging space.                                |
| `sidebarBg`        | `--chat-sidebar-bg`        | Background color for the collapsible conversation history sidebar.                              |
| `artifactBg`       | `--artifact-bg`            | Background color for the right-hand side document preview (artifact) panel.                     |
| `border`           | `--chat-border`            | Color of layout borders (dividers between columns, input borders, tag card boundaries).         |
| `accent`           | `--chat-accent`            | Primary brand/focus color (used for send buttons, selection states, active tabs, action links). |
| `accentHover`      | `--chat-accent-hover`      | Hover color applied to active/interactive brand elements.                                       |
| `accentForeground` | `--chat-accent-foreground` | Color of icons and text placed directly on top of accent-colored backgrounds.                   |
| `messageUserBg`    | `--message-user-bg`        | Background color of user speech bubble blocks.                                                  |
| `messageUserText`  | `--message-user-text`      | Color of text inside user speech bubble blocks.                                                 |
| `messageAiBg`      | `--message-ai-bg`          | Background color of assistant message blocks (defaults to transparent).                         |
| `messageAiText`    | `--message-ai-text`        | Color of text inside assistant message blocks.                                                  |
| `muted`            | `--chat-muted`             | Secondary/muted color used for times, sub-headings, disabled icons, and minor details.          |
| `radiusSm`         | `--chat-radius-sm`         | Small border radius applied to small components like action buttons and badge chips.            |
| `radiusMd`         | `--chat-radius-md`         | Medium border radius applied to message bubbles and clickable suggestion starter cards.         |
| `radiusLg`         | `--chat-radius-lg`         | Large border radius applied to major components such as the main composer input container.      |
| `sidebarWidth`     | `--chat-sidebar-width`     | Base width of the left collapsible sidebar panel (e.g. `"288px"`).                              |
| `artifactWidth`    | `--chat-artifact-width`    | Base/collapsed width of the right resizable panel area (e.g. `"400px"`).                        |

---

## ChatWidget: Stateless & Public-Site Mode

Deploying the `ChatWidget` on a public-facing branded site or marketing landing page often requires a widget-only embed. This deployment mode operates with:

1. **Widget-Only Navigation**: Stubbing out or hiding navigation redirects since a dedicated full-chat view or route is not available.
2. **Stateless/Ephemeral Conversations**: Single-session interactions with no persistence, no user authentication, and no session history loading.
3. **Secure API Secrets at the Edge**: Intercepting chat streams through an edge proxy to inject project-level credentials so sensitive API keys are never exposed to client browsers.
4. **Non-Disruptive Styling**: Importing isolated styles that do not reset the global CSS baseline of your landing page, and scoping your brand's style custom properties.

### 1. Widget-Only Navigation

Because `ChatWidget` is designed to support switching between standard widget view and full conversation view, it requires `fullChatUrl` and `onNavigate` props. To restrict interaction purely to the widget:

- Return `"#"` from the `fullChatUrl` callback. This now automatically hides the "Open full chat" icon button.
- Provide a no-op function for the `onNavigate` callback.

```tsx
import { ChatProvider, ChatWidget } from "@anter/ai-chat-sdk";
import { MyAdapter } from "./my-adapter";

export default function App() {
  return (
    <ChatProvider organizationId="your-org-id" adapter={new MyAdapter()}>
      <ChatWidget
        title="AI Assistant"
        subtitle="Ask us anything"
        position="bottom-right"
        // Gracefully satisfy widget props for widget-only mode
        fullChatUrl={() => "#"}
        onNavigate={() => undefined}
      />
    </ChatProvider>
  );
}
```

#### Hiding the "Open full chat" Button

The "Open full chat" icon button is hidden automatically whenever `fullChatUrl` resolves to `"#"` (or an empty string) for the current session.

### 2. Ephemeral Chat Adapter Template

Since public landing widgets do not manage user accounts or persist chat history locally, you can stub out session management in your `ChatAdapter`. The chat widget will run successfully in a single, local ephemeral session:

```typescript
import type {
  ChatAdapter,
  ListParams,
  MessagePayload,
  SessionConfig,
  SessionList,
  SessionPatch,
  SessionWithMessages,
} from "@anter/ai-chat-sdk/types";

export class EphemeralChatAdapter implements ChatAdapter {
  private readonly streamUrl = "/api/v1/chat-stream";

  async sendMessage(payload: MessagePayload): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(this.streamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: payload.message,
        organizationId: payload.organizationId,
      }),
    });

    if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
    if (!res.body) throw new Error("Missing response body");

    return res.body;
  }

  // ─── Ephemeral Session Stubs ──────────────────────────────────────────────

  async createSession(_config: SessionConfig): Promise<string> {
    // Generate a temporary local ID
    return `session-${Date.now()}`;
  }

  async loadSession(sessionId: string): Promise<SessionWithMessages> {
    // Return empty initial state for a fresh ephemeral session
    return {
      sessionId,
      title: "",
      updatedAt: new Date().toISOString(),
      messages: [],
    };
  }

  async listSessions(_params?: ListParams): Promise<SessionList> {
    // Return empty lists so no session sidebar or history is rendered
    return { sessions: [], total: 0, page: 0 };
  }

  async updateSession(_sessionId: string, _patch: SessionPatch): Promise<void> {
    // No-op (no backend update needed)
  }

  async deleteSession(_sessionId: string): Promise<void> {
    // No-op
  }
}
```

### 3. Secure Browser Integration via Edge Proxy

To prevent leaking sensitive backend credentials (such as API keys or project IDs) into the client browser bundle, route API calls through a local endpoint (e.g. `/api/*`) and inject authorization headers at your hosting provider's edge or during local server proxying.

#### Cloudflare Pages Worker (`_worker.js`)

If deploying to Cloudflare Pages, use an edge worker proxy to rewrite incoming requests, securely inject environment variables, and forward requests to the Anter API:

```javascript
// public/_worker.js
const DEFAULT_BACKEND_API_URL = "https://api.anter.ai";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy /api/* requests to the real API backend
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      const backendBaseUrl = (env.BACKEND_API_URL || DEFAULT_BACKEND_API_URL).trim();
      const targetPath = url.pathname.replace(/^\/api/, "") || "/";
      const targetUrl = new URL(targetPath + url.search, backendBaseUrl);

      const headers = new Headers(request.headers);
      headers.delete("host");

      // Inject server-side secret credentials securely
      if (env.CF_PROJECT_ID) headers.set("x-project-id", env.CF_PROJECT_ID);
      if (env.CF_API_KEY) headers.set("x-api-key", env.CF_API_KEY);

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers,
          body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
          redirect: "manual",
        });

        // Forward response along with CORS headers
        const proxied = new Response(response.body, response);
        proxied.headers.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN || "*");
        return proxied;
      } catch (error) {
        return new Response(JSON.stringify({ error: "Proxy error", message: String(error) }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Default: fall back to serving static assets
    return env.ASSETS.fetch(request);
  },
};
```

#### Vite Local Dev Proxy (`vite.config.js`)

To mirror this exact Edge Proxy behavior in local development without running a Cloudflare worker, configure the Vite dev server proxy to rewrite paths and inject your local `.env` development keys:

```javascript
// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load local environment variables (Node-side only, never bundled in client)
  const env = loadEnv(mode, process.cwd(), "");
  const backendOrigin = (env.BACKEND_API_URL || "https://api.anter.ai").replace(/\/$/, "");

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Forward /api/* -> BACKEND_API_URL and inject local secrets
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (env.CF_PROJECT_ID) proxyReq.setHeader("x-project-id", env.CF_PROJECT_ID);
              if (env.CF_API_KEY) proxyReq.setHeader("x-api-key", env.CF_API_KEY);
            });
          },
        },
      },
    },
  };
});
```

### 4. Non-Disruptive Stylesheet Integration

When embedding a widget, you must prevent the SDK stylesheet from overwriting your main site's carefully designed base typography, headers, list item alignments, or button resets.

#### Importing component styles without global resets

Import `styles-no-base.css` in your React app entrypoint (instead of standard `styles.css`). This contains all component styles for the widget but leaves the global HTML baseline reset untouched:

```typescript
// src/main.tsx
import "./index.css"; // Your marketing site stylesheet
import "@anter/ai-chat-sdk/styles-no-base.css"; // Isolated Chat Widget styles
import App from "./App";
```

#### Scoped CSS Variable Brand Customization

Scope all theme overrides to `[data-chat-provider]` to completely isolate the widget's brand colors from the rest of your page:

```css
/* index.css */

[data-chat-provider] {
  /* Mapped brand colors */
  --chat-accent: #10b981; /* Custom brand primary */
  --chat-accent-hover: #059669;
  --chat-accent-foreground: #ffffff;

  /* Theme backgrounds */
  --chat-bg: #faf8f2;
  --chat-sidebar-bg: #f1ede2;
  --artifact-bg: #fffdf7;
  --chat-border: #e8e2d3;

  /* Message bubbles matching marketing colors */
  --message-user-bg: #fffdf7;
  --message-user-text: #1a1814;
  --message-ai-bg: transparent;
  --message-ai-text: #1a1814;

  --chat-muted: #6a6358;
}
```

---

## TypeScript

All public types are exported from the `types` entry point:

```typescript
import type {
  // Adapter
  ChatAdapter,
  SessionConfig,
  SessionPatch,
  MessagePayload,
  SendMessageOptions,
  CancelRunInput,
  ResolveToolApprovalInput,
  SessionList,
  ChatSessionFileRef,
  UploadFileOptions,
  // Config
  ChatConfig,
  ChatStrings,
  ChatPlugins,
  // Session
  Session,
  SessionWithMessages,
  ResumeState,
  // Chat / messages
  ChatMessage,
  MessageRole,
  ToolApproval,
  ToolApprovalStatus,
  MessageSource,
  AgentStepEvent,
  AgentStepType,
  AgentStepStatus,
  AgentPlanPhase,
  StreamingState,
  ComposerAnnouncement,
  ContextRequiredPayload,
  ContextRequiredChoice,
  // Artifacts
  Artifact,
  ArtifactType,
  ArtifactTab,
  ArtifactPanelState,
  Citation,
  LinkedRecord,
  // Extensions (re-exported from main entry)
  // StarterCard (from UI entry)
} from "@anter/ai-chat-sdk/types";

// StarterCard and RecordTag are exported from the main entry:
import type { StarterCard, RecordTag } from "@anter/ai-chat-sdk";
```

---

## Contributing

We welcome contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for details on our development workflow, code of conduct, and how to submit pull requests.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
