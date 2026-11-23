# Setting up sharing (Supabase)

Sharing, view-only links and "Shared with me" use a free [Supabase](https://supabase.com) project that you own. Everything else in Study Hall works without it. Setup takes about 15 minutes, once.

## 1. Create the project

1. Sign up at supabase.com and click **New project**. Any name and region; save the database password somewhere safe (Study Hall doesn't need it).
2. When it's ready, open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](../supabase/schema.sql), and press **Run**. This creates the tables, the access rules, the file storage and live updates. It's safe to run again after updates.

## 2. Sign-in codes by email

Study Hall signs people in with a 6-digit code sent by email (no passwords).

1. **Authentication → Sign In / Providers → Email**: make sure **Email** is enabled.
2. **Authentication → Emails → Templates → Magic Link**: replace the body with something that shows the code, for example:
   ```html
   <h2>Your Study Hall sign-in code</h2>
   <p>Enter this code in Study Hall: <b style="font-size:22px">{{ .Token }}</b></p>
   <p>It expires in an hour. If you didn't ask for it, ignore this email.</p>
   ```
   Do the same for **Confirm signup** (first-time sign-ins use it).
3. **Custom email sender (required):** Supabase's built-in sender only emails members of your Supabase team (and only a couple per hour), so classmates would never get their code. Under **Authentication → Emails → SMTP Settings**, turn on **Custom SMTP** and enter a sender. Free options:
   - **Gmail** (no domain needed): turn on 2-step verification, create an [app password](https://myaccount.google.com/apppasswords), then use host `smtp.gmail.com`, port `465`, your Gmail address as the username, and the app password. Fine for a class (Gmail allows about 500 emails a day).
   - **Brevo** (free 300 emails/day) or **Resend** (free 3,000/month; needs a domain you own) for more users.
4. **Authentication → Rate Limits**: raise "emails sent per hour" if a whole class will sign in at once.

## 3. Connect Study Hall

**Project Settings → API Keys** shows two values. Send these (or put them in [`src/js/cloud/config.js`](../src/js/cloud/config.js)):

- **Project URL**: `https://<something>.supabase.co`
- **Publishable key** (`sb_publishable_...`; older projects call it the **anon** key)

The publishable key is designed to be public: it is built into every copy of the app and grants nothing by itself. The database rules decide what each signed-in person can see.

> Never share the **secret** / **service_role** key. It bypasses every rule. Study Hall never needs it.

After the values are in `config.js`, the next release turns sharing on for everyone.

## How it works

| | Who | Can do |
|---|---|---|
| Owner | whoever shared the notebook | everything; invite and remove people; turn the link on or off; stop sharing |
| Can edit | people the owner invited | read and change pages, photos and recordings |
| Can view | people the owner invited | read, study, export, ask the AI; no changes |
| View-only link | anyone with the link, no account | read the notes in a browser while the link is on |

- Notebooks are copied to Supabase only when their owner presses **Share**. Notebooks that aren't shared never leave the device.
- Every device keeps its own full copy, so shared notebooks work offline; changes are sent a second after they're saved and arrive live on other people's open pages. If two people save the same page at the same moment, the later save wins.
- Invitations are by email address. Study Hall doesn't send them itself; it gives the owner a message to pass on.
- **Stop sharing** deletes the online copy (pages and files) and disables the link. Everyone keeps the copy already on their device.
- The access rules live in the database ([`supabase/schema.sql`](../supabase/schema.sql), row-level security), so they hold even for someone who extracts the app's connection details.

## Costs

The free plan covers a class or two (at the time of writing: 500 MB database, 1 GB of files, 50,000 monthly users; see [supabase.com/pricing](https://supabase.com/pricing)). Free projects are paused after a week with no activity; opening the dashboard resumes them. For steady use by many people, the Pro plan ($25/month) removes the pause and raises the limits.
