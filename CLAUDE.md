# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Robbit Akademiyasi — a live quiz platform (Quizizz/Kahoot style) for the Uzbek-language education market. Teachers upload a PDF → Claude AI generates questions → students join a live game via a 6-digit PIN. UI text and code comments are in Uzbek; keep that convention.

## Commands

Backend (`cd backend`):
```bash
npm run dev              # tsx watch src/index.ts → http://localhost:4000
npm run build            # tsc → dist/
npm start                # node dist/index.js (production)
npx prisma migrate dev   # create/apply migration after editing schema.prisma
npx prisma generate      # regenerate client after schema change
npx prisma studio        # DB browser
```

Frontend (`cd frontend`):
```bash
npm run dev              # vite → http://localhost:5173 (host:true, open on LAN)
npm run build            # tsc -b && vite build → dist/
npm run preview          # serve built output
```

Deploy: `.\deploy-quiz.ps1` from repo root — builds both, bundles `backend/dist` + `frontend/dist` (as `public/`) + prisma + `.env.production`, ships a tarball over SSH, runs `prisma migrate deploy`, and (re)starts PM2 app `robbit-quiz`. There is no test suite and no linter configured.

## Architecture

Two-package repo: `backend/` (Express + Socket.io + Prisma) and `frontend/` (React + Vite + Tailwind). No root workspace — install/run each separately.

**Dev vs. prod topology.** In dev the frontend runs on :5173 and Vite proxies `/api` and `/uploads` to the backend on :4000; the socket client (`frontend/src/socket.ts`) connects to `hostname:4000` directly. In production a single Express process serves the built frontend as static files from `../public` with an SPA fallback (see `backend/src/index.ts`), so everything is same-origin on one port. Frontend code therefore always calls relative `/api/...` paths.

**Live game state is in-memory, not in the DB.** `backend/src/socket/game.ts` holds all running games in a module-level `Map<pin, GameState>`. This is the single largest and most important file. Consequences:
- PM2 runs **one** instance in `fork` mode (`ecosystem.config.cjs`) — do not scale to multiple instances or cluster mode; game state would split across processes.
- Only completed games are persisted, via `GameRecord` / `GamePlayerRecord`, for the reports feature.
- Socket events follow a `host:*` / `player:*` / `test:*` naming convention (e.g. `host:create`, `host:start`, `host:next`, `player:join`, `player:answer`, `test:answer`). Host disconnect has a grace timer so the host can refresh the page mid-game without ending it.

**Two game modes** (`GameState.mode`):
- `LIVE` — host-driven; everyone sees the same question, host advances slides, real-time leaderboard, time-based scoring (correct = 500–1000 pts by speed).
- `TEST` — self-paced; each player walks through `questionIndices` at their own speed (`TestRunner.tsx` on the client), scored as percent correct.

**Slides are a universal, polymorphic unit.** A `Slide` has `kind` = `CONTENT | QUESTION` and, for questions, a `type` (SINGLE, MULTIPLE, TRUE_FALSE, DROPDOWN, POLL, OPEN, FILL_BLANK, MATCH, REORDER). The type-specific payload lives in `data`, **stored as a JSON string** in SQLite and parsed/serialized at the route boundary (`routes/quizzes.ts` `parseSlide`/`buildSlideCreate`). The shape of `data` per type is defined in `frontend/src/types.ts` (`SlideData`) — treat that as the contract. When adding a question type you must touch: `types.ts`, the editor (`QuizEditor.tsx`), the live/test renderers (`buildSlide`/`correctSummary`/answer-scoring in `game.ts`, plus `TestRunner.tsx`), and possibly the importers.

**Quiz update replaces slides wholesale.** `PUT /api/quizzes/:id` does `deleteMany` then re-`create`s all slides from the request, reassigning `order` by array index. Slide IDs are not stable across saves — don't rely on them client-side after a save.

**Question ingestion has two paths:**
- PDF → AI: `routes/pdf.ts` → `services/claude.ts`. Uses the Anthropic SDK with model `claude-opus-4-8` and a forced tool call (`tool_choice` on `save_questions`) to get structured JSON back. The PDF is sent as a base64 `document` content block.
- Excel import: `routes/excel.ts` maps a Quizizz/Wayground export template to internal `QType`s. Returns parsed slides to the client (not persisted directly).

**Auth.** Teacher-only auth via JWT (`backend/src/auth.ts`, 7-day tokens). `requireAuth` middleware guards `/api/quizzes` and friends; token stored in localStorage as `robbit_token` and attached by `frontend/src/api.ts`. Google OAuth (`/api/auth/google`) verifies a Google credential and upserts a `Teacher` (password optional). Frontend auth state lives in `frontend/src/auth.tsx` (`useAuth`), and protected routes use the `Protected` wrapper in `App.tsx`. Students joining a game are **not** authenticated — they go through Socket.io and the public route.

**ESM note.** Backend is `"type": "module"` TypeScript; intra-project imports use explicit `.js` extensions (e.g. `import { config } from "./config.js"`) even though the source is `.ts`. Keep that.

## Config

Backend env (`backend/.env`, see `.env.example`): `PORT`, `DATABASE_URL` (SQLite file in dev, Postgres URL in prod — change the `provider` in `schema.prisma` for prod), `JWT_SECRET`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`. `NODE_ENV=production` flips on static-serving + same-origin behavior.

## Design system

`DESIGN.md` defines the "Nihol Learning" brand: child-friendly, large touch targets (min 48px), rounded corners everywhere, Quicksand (headings) + Nunito Sans (body), pastel palette (blue primary / mint secondary / yellow tertiary). Tokens are wired into `frontend/tailwind.config.js` and `index.css`. Follow it for any new UI.
