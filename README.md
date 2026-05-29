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

### Setup steps

#### 1. Set up Supabase (one-time)

1. Create a project at https://supabase.com (free tier is fine)
2. Open the **SQL Editor** in your project
3. Paste the contents of `migrations/001_init.sql` and run it
4. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY`

#### 2. Deploy backend to Vercel

1. Vercel → **Add New** → **Project** → import this repo
2. Leave Root Directory as default; Vercel auto-detects the `vercel.json`
3. **Environment Variables:**
   - `JWT_SECRET` — any long random string
   - `FRONTEND_URL` — your deployed frontend URL (e.g. `https://voice-ai-console-frontend.vercel.app`)
   - `SUPABASE_URL` — from step 1 above
   - `SUPABASE_SERVICE_ROLE_KEY` — from step 1 above
   - `NODE_ENV` — `production`
4. Deploy

After deploy, update the **frontend's** `VITE_API_URL` env var to `https://<your-backend>.vercel.app/api` and redeploy the frontend.

## Storage

All uploads (metadata + parsed rows + errors + the original raw file as
base64) are stored in a single Supabase Postgres table called `uploads`.
This means:

- ✅ Uploaded data persists across requests / function invocations
- ✅ Raw client input files are preserved (CSV text or Excel base64)
- ✅ Listing past uploads + the unified CSV export work end-to-end on Vercel
- ✅ Both CSV and Excel (.xlsx, .xls) files are accepted as input

Raw files larger than ~8 MB are stored with `raw_file_b64 = null` (parsed
rows are still saved). For very large files, swap inline storage for a
Supabase Storage bucket and store the bucket path instead.

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
