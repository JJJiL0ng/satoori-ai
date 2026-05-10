# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`ichackerthon` is a Next.js 14 (App Router) app that hosts a Korean dialect "속마음 번역기" (inner-thoughts translator). It translates between Gyeongsang dialect (사투리) and Seoul standard Korean while inferring the speaker's actual emotion/intent via Gemini. The repo also wires up two parallel data backends (Firebase Firestore, Postgres+pgvector via Prisma) for hackathon-style experimentation — they are independent and chosen per feature.

## Commands

```bash
# Dev / build
npm run dev          # next dev (http://localhost:3000)
npm run build        # next build
npm run start        # production server
npm run lint         # next lint (ESLint w/ next/core-web-vitals)

# Database (Prisma → Postgres+pgvector)
docker compose up -d # start local Postgres (pgvector/pgvector:pg16) on :5432
npm run db:migrate   # prisma migrate dev — apply + create migrations
npm run db:generate  # prisma generate (also runs as postinstall)
npm run db:studio    # prisma studio UI
npm run db:reset     # destructive: drops + reapplies all migrations
```

There is no test framework configured — do not invent test commands.

## Architecture

### Three independent service surfaces
The codebase has three separately-initialized integrations. Don't conflate them; each route/feature picks one.

1. **Gemini** (`src/lib/gemini.ts`): server-only singleton via `getClient()` with a cached `GoogleGenerativeAI` instance. Exposes `getGeminiFlash()` (`gemini-2.5-flash`) and `getGeminiPro()` (`gemini-2.5-pro`). Reads `GEMINI_API_KEY`.
2. **Firebase Admin** (`src/lib/firebase/admin.ts`): server-only Firestore via `getAdminDb()`. Lazy-initializes from `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` (note the `\\n` → `\n` unescape in admin.ts:16). Client-side Firestore lives in `src/lib/firebase/client.ts` and uses the `NEXT_PUBLIC_FIREBASE_*` vars.
3. **Prisma + Postgres** (`src/lib/prisma.ts`): global-cached `PrismaClient` (Next dev hot-reload pattern). Schema enables the `pgvector` extension (`prisma/schema.prisma`) but defines no models yet — adding models is expected work.

All three modules import `"server-only"` (except Firebase client) and must stay out of client bundles. The `postinstall` hook runs `prisma generate`, so a stale `@prisma/client` after pulling schema changes usually means re-running `npm install` or `npm run db:generate`.

### API routes (App Router, all `runtime = "nodejs"`, `dynamic = "force-dynamic"`)
- `src/app/api/translate/route.ts` — the core feature. Sends a Korean-language system prompt + `direction` (`satoori-to-seoul` | `seoul-to-satoori`) to Gemini Flash with `responseMimeType: "application/json"`, then defensively re-parses the response (`extractJson`) because models occasionally wrap JSON in code fences. Returns `{ translated, realMeaning, emotion, tip }`.
- `src/app/api/gemini/route.ts` — generic prompt passthrough (debug/scaffold).
- `src/app/api/items/route.ts` — Firestore CRUD example against an `items` collection.

When adding a Gemini route, mirror the `extractJson` safety in `translate/route.ts:56` — `responseMimeType: "application/json"` is not a hard guarantee.

### UI
shadcn/ui (style `new-york`, base color `zinc`) configured via `components.json`. Primitives live in `src/components/ui/`; feature components sit at `src/components/`. Path alias `@/*` → `src/*`. The home page at `src/app/page.tsx` is a thin wrapper around `TranslatorChat` (a `"use client"` component that POSTs to `/api/translate`).

## Conventions

- **Server-only modules**: any file touching `GEMINI_API_KEY`, Firebase Admin creds, or Prisma must start with `import "server-only";` (see existing libs).
- **Korean-language prompts**: the translate prompt is intentionally Korean and tuned for Gyeongsang dialect nuance — when editing, preserve the JSON-only output instruction and the `realMeaning`/`emotion`/`tip` schema, since the client renders these fields directly.
- **Env files**: `.env.example` documents all required vars. `.env`, `.env.local` are gitignored and present locally.
