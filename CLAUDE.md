# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup        # First-time setup: install deps, generate Prisma client, run migrations
npm run dev          # Start dev server (Turbopack + node-compat shim) at localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest test runner
npm run db:reset     # Reset SQLite database (destructive)
```

All dev/build commands require `NODE_OPTIONS="--require ./node-compat.cjs"` (already in package.json scripts) for Turbopack compatibility.

## Environment

Optional: add `ANTHROPIC_API_KEY=...` to `.env`. Without it, the app uses `MockLanguageModel`, which simulates AI behavior with predefined static responses — useful for development without an API key.

## Architecture

**UIGen** is a Next.js 15 App Router application where users describe React components in a chat interface and Claude generates them in real time, with a live preview.

### Data flow

```
User message → /api/chat (POST)
  → Claude via Vercel AI SDK (streaming)
  → Tool calls: str_replace_editor / file_manager
  → VirtualFileSystem (in-memory, no disk I/O)
  → FileSystemContext broadcasts changes
  → PreviewFrame re-renders live preview
  → Database save (authenticated users only)
```

### Key modules

**`src/app/api/chat/route.ts`** — Core API endpoint. Receives messages + current file state, calls Claude with two tools (`str_replace_editor` for file CRUD, `file_manager` for rename/delete), streams results back. Saves projects to DB for authenticated users.

**`src/lib/file-system.ts`** — `VirtualFileSystem` class: all file operations are in-memory. No real disk writes. Serializes/deserializes to JSON for database storage.

**`src/lib/provider.ts`** — `getLanguageModel()` returns real Claude Haiku 4.5 (with API key) or `MockLanguageModel` (without). The mock simulates a 4-step generation workflow.

**`src/lib/tools/`** — Tool implementations given to Claude:
- `str_replace_editor`: `view`, `create`, `str_replace`, `insert`, `undo_edit`
- `file_manager`: `rename`, `delete`

**`src/lib/contexts/`** — Two React contexts:
- `chat-context.tsx` — Wraps Vercel AI SDK's `useChat()`, handles streaming and tool-call results
- `file-system-context.tsx` — Owns the `VirtualFileSystem` instance; propagates file changes to editor and preview

**`src/lib/auth.ts` + `src/middleware.ts`** — JWT sessions via `jose`. Session cookie gates API routes. Server actions in `src/actions/` handle sign-up/in/out and project CRUD.

**`src/lib/transform/jsx-transformer.ts`** — Transforms AI-generated JSX for runtime execution in the preview iframe using `@babel/standalone`.

**`src/lib/prompts/generation.tsx`** — System prompt sent to Claude for component generation.

**`src/lib/anon-work-tracker.ts`** — Persists anonymous users' work to localStorage until they sign up.

### Database

Prisma with SQLite (`prisma/dev.db`). Two models: `User` (email + bcrypt password) and `Project` (stores messages and file tree as JSON strings; `userId` nullable for anonymous projects). Prisma client generated to `src/generated/prisma`.

### Page structure

- `/` — Redirects authenticated users to their latest project; creates a new one otherwise
- `/[projectId]` — Protected workspace: 3-panel layout (Chat | Code editor + file tree | Live preview)

### UI stack

Radix UI primitives + Tailwind CSS v4 (config in `src/app/globals.css`). Monaco editor (`@monaco-editor/react`) for code editing. `react-resizable-panels` for draggable panel dividers. shadcn/ui components in `src/components/ui/` (style: `new-york`).
