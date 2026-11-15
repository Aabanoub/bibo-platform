# 🌟 AbanoubApp — Personal AI Cockpit & Life OS

A private, modern web application and personal AI agent platform built for **Abanoub**. Designed for daily personal management, smart productivity, financial tracking, habits, and intelligent AI assistance — connected in real-time to **Supabase** and deployed on **Vercel**.

---

## ⚡ Highlights & Features

1. **🧠 Personal AI Assistant (`/chat`)**
   - Built with Google Gemini (`gemini-2.0-flash`).
   - Switchable Personas:
     - 💼 **Executive Assistant**: Prioritization, day planning, concise action items.
     - 💻 **Code Reviewer**: Engineering guidance, code reviews, bug finding.
     - 💡 **Creative Brainstormer**: Outside-the-box thinking and idea expansion.
     - 🎯 **Accountability Coach**: Honest goal tracking, habit checking, and motivation.
   - Message history persisted to Supabase with markdown rendering.

2. **📝 Second Brain & Notes (`/notes`)**
   - Create, tag, search, and pin notes.
   - Debounced **auto-save** so you never lose a thought.
   - Clean split-pane interface with dark mode.

3. **✅ Kanban Task Manager (`/tasks`)**
   - 3-column workflow: *To Do*, *In Progress*, and *Done*.
   - Priority badges (`Urgent`, `High`, `Medium`, `Low`) and overdue indicators.
   - Triggers real-time notifications on creation.

4. **💰 Personal Finance Tracker (`/finance`)**
   - Income & expense logging with categorized tagging.
   - Real-time monthly balance, total income, and expense summary.
   - Visual CSS spending breakdown for the current month.

5. **🔥 Habit Tracker & Streaks (`/habits`)**
   - Daily and weekly habit definitions with custom emoji icons and colors.
   - 7-day visual dot matrix and streak counter.
   - Instant daily check-off with Supabase logging.

6. **🔔 Real-time & Push Notifications**
   - **In-App Notification Center**: Bell icon with unread count badge and live Supabase Realtime subscription.
   - **Web Push Notifications**: Service Worker (`/sw.js`) and VAPID web-push for background desktop/mobile notifications.
   - **Automatic Daily Summary**: Vercel Cron triggers `/api/cron/daily-summary` every morning to analyze your tasks, habits, and finances, then generates an AI daily briefing!

---

## 🏗️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router, Server & Client Components) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS + Lucide React Icons |
| **Database & Auth** | Supabase (PostgreSQL with RLS + Realtime) |
| **AI Intelligence** | Google Gemini API (`@google/generative-ai`) |
| **Notifications** | Service Worker + Web Push API (`web-push`) |
| **Hosting & Crons** | Vercel (Edge & Serverless Functions + Vercel Cron) |

---

## 🚀 Getting Started

### 1. Supabase Setup
1. Create a free project at [Supabase](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Open `supabase/schema.sql` in this repo, copy all of it, paste it into the SQL editor, and click **Run**.
   - This sets up all tables, enums, indexes, row-level security (RLS), auto-user triggers, and realtime publications.
4. Go to **Project Settings** > **API** to copy:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon / public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`)

### 2. Gemini API Setup
1. Get a free API key at [Google AI Studio](https://aistudio.google.com/).
2. Keep this key handy as `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`).

### 3. VAPID Push Keys (Optional for Web Push)
Generate a VAPID keypair in your terminal:
```bash
npx web-push generate-vapid-keys
```
Copy the Public and Private keys into your environment variables.

### 4. Configure Environment Variables
Create a `.env.local` file in the project root:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# Web Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:your-email@example.com

# Vercel Cron Security
CRON_SECRET=generate-any-random-secret-string
```

### 5. Run Locally
```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Deploying to Vercel

1. Push this project to your GitHub repository.
2. In [Vercel](https://vercel.com):
   - Click **Add New** > **Project** and select your repository.
   - In **Environment Variables**, add all the keys from `.env.local`.
   - Click **Deploy**.
3. **Daily Cron Jobs**:
   - `vercel.json` automatically registers the daily summary cron job (`/api/cron/daily-summary`) to run every morning at 8:00 AM UTC.
   - Vercel automatically passes `Authorization: Bearer <CRON_SECRET>` to protect the endpoint.

---

## 📁 Project Structure

```
d:\AbanoubApp
├── public/
│   ├── manifest.json            # PWA manifest
│   └── sw.js                    # Web Push Service Worker
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/              # Gemini chat endpoint
│   │   │   ├── cron/            # Daily AI briefing cron job
│   │   │   └── notifications/   # Push subscription & dispatch
│   │   ├── chat/                # AI Assistant cockpit
│   │   ├── finance/             # Income & expense tracker
│   │   ├── habits/              # Habit tracking & streaks
│   │   ├── login/               # Supabase Auth (Sign in & Sign up)
│   │   ├── notes/               # Second Brain note editor
│   │   ├── tasks/               # Kanban task management
│   │   ├── globals.css          # Dark theme & Tailwind base
│   │   ├── layout.tsx           # App Shell & Navigation
│   │   └── page.tsx             # Main Overview Dashboard
│   ├── components/
│   │   ├── NotificationBell.tsx # Real-time notification center
│   │   └── Sidebar.tsx          # Responsive navigation sidebar
│   ├── lib/
│   │   ├── ai.ts                # AI SDK & briefing utilities
│   │   ├── notifications.ts     # Push & in-app notification helpers
│   │   ├── supabase.ts          # Browser Supabase client
│   │   └── supabase-server.ts   # Server Supabase client
│   ├── middleware.ts            # Route protection & session refresh
│   └── types/
│       └── index.ts             # Complete TypeScript database types
├── supabase/
│   └── schema.sql               # Complete PostgreSQL database schema
├── package.json
├── tailwind.config.ts
└── vercel.json                  # Vercel Cron configuration
```
