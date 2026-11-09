# Vice City Central

A premium, fan-made GTA VI community website built with Next.js App Router, React, TypeScript, custom CSS and Supabase.

> This is an unofficial fan project. It is not affiliated with, endorsed by, or sponsored by Rockstar Games or Take-Two Interactive. Grand Theft Auto and related marks belong to their respective owners. Use only media you have permission to publish.

## What's included

- Premium Vice City-inspired homepage and responsive navigation
- Community feed with category filters and search
- Supabase email/password sign-up and sign-in
- Cookie-based Supabase SSR session refresh for Next.js 16
- Automatic public profile creation when a member registers
- Live community feed backed by PostgreSQL
- Persistent post publishing, likes and bookmarks
- Database tables and Row Level Security policies for profiles, posts, comments, likes and bookmarks
- Original CSS/SVG skyline artwork (no Rockstar game assets bundled)

## Requirements

- Node.js 20.9 or newer
- npm
- VS Code or another code editor
- A Supabase account and project

## Phase 2 setup — connect Supabase

### 1. Create a Supabase project

1. Open [Supabase](https://supabase.com/) and sign in.
2. Create a new project named `vice-city-central`.
3. Choose a strong database password and save it somewhere secure.
4. Wait until the project finishes provisioning.

### 2. Create the database tables and security policies

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Choose **New query**.
4. Open `supabase/schema.sql` from this project and copy its complete contents.
5. Paste the SQL into the Supabase editor and click **Run**.
6. Confirm that the `profiles`, `posts`, `comments`, `post_likes` and `bookmarks` tables appear under **Table Editor**.

The SQL enables Row Level Security (RLS). Do not disable RLS and do not add a service-role key to the browser app.

### 3. Configure email authentication and redirects

1. In Supabase, open **Authentication → Providers → Email** and make sure email/password sign-in is enabled.
2. Open **Authentication → URL Configuration**.
3. Set the local Site URL to `http://localhost:3000`.
4. Add `http://localhost:3000/auth/callback` to the allowed Redirect URLs.
5. Keep email confirmation enabled for safer account registration. New members will receive a confirmation email before they can sign in.

When you deploy, add your real domain and its `/auth/callback` URL as well.

### 4. Add the project keys to the app

1. In the Supabase dashboard, open **Project Settings → API** (or the project's **Connect** dialog).
2. Copy the **Project URL**.
3. Copy the **Publishable key** (`sb_publishable_...`). It is designed for use in a browser when Row Level Security is correctly enabled.
4. In the root of this Next.js project, create a file named `.env.local`.
5. Add these two lines, replacing the example values:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
   ```

Never use a `service_role` or secret key in a `NEXT_PUBLIC_` variable, and never commit `.env.local` to GitHub.

### 5. Install packages and restart Next.js

Open the project folder in VS Code, then run:

```bash
npm install
npm run typecheck
npm run dev
```

Open `http://localhost:3000`.

If the development server was already running when you created `.env.local`, stop it with `Ctrl + C` and run `npm run dev` again. Next.js reads environment variables when the server starts.

### 6. Test the connection

1. Click **Join the crew**.
2. Register with a username, email and password (at least 8 characters).
3. Open the confirmation email and click its link.
4. Return to Vice City Central and sign in.
5. Create a discussion. It should appear in the feed and remain there after refreshing the page.
6. Like or bookmark a post, refresh, and confirm your reaction is still saved.

If sign-up succeeds but no email arrives, check your spam folder and the Supabase Auth email configuration. Supabase's default email service has sending limits; configure custom SMTP before opening registration to the public.

## Project structure

```text
vice-city-central/
├── public/
│   └── vice-city-skyline.svg
├── src/
│   ├── app/
│   │   ├── auth/callback/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── auth-modal.tsx
│   │   └── community-home.tsx
│   ├── lib/supabase/
│   │   ├── client.ts
│   │   ├── config.ts
│   │   ├── proxy.ts
│   │   └── server.ts
│   └── proxy.ts
├── supabase/
│   └── schema.sql
├── .env.example
├── .gitignore
└── package.json
```

## Current implementation status

### Phase 1 — Frontend foundation

- [x] Premium responsive homepage
- [x] Community feed, categories and search
- [x] Demo poll and sample discussion content

### Phase 2 — Accounts and database

- [x] Supabase browser/server client setup
- [x] Next.js 16 proxy session refresh
- [x] Email/password sign-up and sign-in UI
- [x] Email confirmation callback route
- [x] Automatic profile creation trigger
- [x] PostgreSQL schema and Row Level Security policies
- [x] Live feed and persistent post publishing
- [x] Persistent likes and bookmarks
- [ ] Run the SQL in your Supabase project and add local environment keys
- [ ] Verify signup, email confirmation and first post against your project

### Phase 3 — Community features

- [ ] Comment threads and replies
- [ ] Profile page and avatar uploads
- [ ] Polls with persistent voting
- [ ] Following, notifications and saved-discussion page
- [ ] Search and sorting improvements

### Phase 4 — Trust and safety

- [ ] Report posts, comments and profiles
- [ ] Moderator dashboard and review queue
- [ ] Rate limits and spam controls
- [ ] Community guidelines and privacy policy

### Phase 5 — Launch

- [ ] Production environment variables and domain redirects
- [ ] SEO, analytics, performance and accessibility checks
- [ ] GitHub repository and Vercel deployment
- [ ] Custom domain and launch checklist

## Security notes

- The frontend uses only the Supabase publishable key.
- Row Level Security restricts profile updates, post ownership, comments, likes and bookmarks.
- Bookmarks are private to the member who saved them.
- Public profile names and published posts are readable by visitors.
- Do not store passwords yourself; Supabase Auth handles password authentication.
- Before a public launch, add moderation workflows, abuse reporting, rate limits and custom SMTP.
