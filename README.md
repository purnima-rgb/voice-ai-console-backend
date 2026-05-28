# voice-ai-console-backend

Express + TypeScript API for the [Voice AI Console](https://github.com/purnima-rgb/voice-ai-console-frontend). Handles authentication, CSV upload + validation, and unified Voice AI CSV export.

## Local development

```bash
npm install
npm run dev
```

Starts the API at **http://localhost:3001**.

## Deploy to Vercel

This repo is configured to deploy as a Vercel **serverless function**:

- `api/index.ts` — Vercel entry point (re-exports the Express app)
- `src/app.ts` — Express app factory (exported, not started)
- `src/index.ts` — Local-dev entry point (calls `app.listen()`)
- `vercel.json` — routes every request to `api/index.ts`

Steps:
1. Vercel → **Add New** → **Project** → import this repo
2. Set **Root Directory** to the repo root (default)
3. Vercel auto-detects the `vercel.json`
4. Set environment variables:
   - `JWT_SECRET` — any long random string
   - `FRONTEND_URL` — your deployed frontend URL (e.g. `https://voice-ai-console-frontend.vercel.app`)
   - `NODE_ENV` — `production`
5. Deploy

After deploy, update the **frontend's** `VITE_API_URL` env var to `https://<your-backend>.vercel.app/api` and redeploy the frontend.

## ⚠️ Important: Vercel serverless storage limitation

**This app uses local-disk storage** (multer writes uploads to `uploads/`, JSON files in `data/`). Vercel serverless functions have an **ephemeral filesystem** — files written during a request **do not persist** across requests.

What works on Vercel:
- ✅ Login / authentication
- ✅ Health check (`/health`)
- ✅ CSV upload + validation (returns valid/invalid row counts in the response)
- ✅ Error report download (within the same request lifecycle)

What does NOT work on Vercel without changes:
- ❌ Listing previously uploaded data
- ❌ Downloading unified CSV after uploads
- ❌ Upload history (`/api/data/upload-history`)
- ❌ Stats persistence (`/api/data/stats`)

To make it fully production-ready, swap the file-based `storageService` for one of:
- **Vercel Postgres / KV / Blob** (same platform, easiest)
- **Supabase** (Postgres + Storage, free tier)
- **AWS S3 + DynamoDB / MongoDB Atlas**

Or deploy this backend to **Railway / Render / Fly.io** instead — those preserve filesystem behavior across requests.

## API endpoints

### Auth
- `POST /api/auth/login` — returns JWT
- `GET /api/auth/me` — returns current user

### Upload (multipart/form-data, field name `file`)
- `POST /api/upload/student-list` — admin, data_manager
- `POST /api/upload/grade-sheet` — admin, data_manager
- `POST /api/upload/calling-data` — all roles
- `GET /api/upload/error-report/:uploadId` — download error CSV

### Data
- `GET /api/data/student-list?university=&program=`
- `GET /api/data/grade-sheet?university=&program=`
- `GET /api/data/calling-data`
- `GET /api/data/unified-csv` — download merged Voice AI CSV
- `GET /api/data/upload-history`
- `GET /api/data/stats`

## Demo users (hardcoded in `src/services/authService.ts`)

| Email | Password | Role |
|---|---|---|
| `admin@voiceai.com` | `Admin@123` | System Administrator |
| `manager@voiceai.com` | `Manager@123` | Data Manager |
| `agent@voiceai.com` | `Agent@123` | Support Agent |
