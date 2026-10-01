# Setting up reminders (once)

Phone reminders need three things that live outside the code: a key pair, the
`send-reminders` function in Supabase, and a job that calls it every 15 minutes.
No secret goes in git: the private parts go only into Supabase.

You'll need about 15 minutes, the Supabase dashboard, and the GitHub repository settings.

## 1. Make the keys

In a terminal in the project folder:

```
npm run vapid-keys
```

It prints three things. Keep the window open; you'll copy from it below.

- **VITE_VAPID_PUBLIC_KEY**: public, safe to share.
- **VAPID_KEYS**: a line of JSON with the private key. Secret.
- **CRON_SECRET**: a random string. Secret.

Run it only once. Running it again makes new keys, and phones already turned on
would need turning on again.

## 2. The public key, for the app

1. In `.env.local`, add a line: `VITE_VAPID_PUBLIC_KEY=` followed by the public key.
2. GitHub → the repository → Settings → Secrets and variables → Actions →
   New repository secret. Name `VITE_VAPID_PUBLIC_KEY`, value the public key.

## 3. The function's secrets

Supabase dashboard → your project → Edge Functions → Secrets. Add three:

| Name | Value |
|---|---|
| `VAPID_KEYS` | the whole JSON line from step 1 |
| `VAPID_CONTACT` | `mailto:` and your email, for example `mailto:raj@example.com` |
| `CRON_SECRET` | the random string from step 1 |

## 4. Deploy the function

1. Supabase dashboard → Edge Functions → Deploy a new function → Via Editor.
2. Name it `send-reminders`.
3. Replace the starter code in `index.ts` with the contents of
   `supabase/functions/send-reminders/index.ts`.
4. Add a file named `rules.ts`, and paste in `supabase/functions/send-reminders/rules.ts`.
5. Deploy.
6. In the function's settings, turn **Verify JWT** off. The function checks who's calling
   itself: the job's secret, or a real sign-in for "Send a test".

When either file changes later, open the function, paste the new contents, and deploy again.

## 5. The 15-minute job

1. Supabase dashboard → Database → Extensions. Turn on **pg_cron** and **pg_net**.
2. SQL editor: run this once, with your own values in place of the two `…`.
   Your project ref is in the dashboard address: `supabase.com/dashboard/project/<ref>`.

   ```sql
   select vault.create_secret('https://….supabase.co/functions/v1/send-reminders', 'reminders_function_url');
   select vault.create_secret('…CRON_SECRET from step 1…', 'reminders_cron_secret');
   ```

   Don't save this as a snippet: it has the secret in it.
3. SQL editor: apply `supabase/migrations/0015_reminder_job.sql`.

## 6. Check it

1. Push, so the app is rebuilt with the public key.
2. On each phone, open PRABAS (on iPhone, from the Home Screen), then Settings → Reminders
   → Turn on reminders → Send a test. A "PRABAS test" notification should arrive.
3. After 15 minutes, see whether the job ran (SQL editor):

   ```sql
   select status_code, content, created from net._http_response order by created desc limit 5;
   ```

   `200` with `{"sent":…,"checked":…}` means it's working.

## If something's wrong

- **"Reminders aren't set up for this version of the app yet":** the app was built without
  `VITE_VAPID_PUBLIC_KEY`. Check the GitHub secret, then push again.
- **A test says "No phones to send to yet":** turn reminders on for this phone first.
- **Status 401 from the job:** `reminders_cron_secret` and `CRON_SECRET` differ, or
  Verify JWT is still on for the function.
- **Status 500 mentioning VAPID:** `VAPID_KEYS` isn't the exact JSON line from step 1.
- **Changing a Vault secret:** `select vault.update_secret((select id from vault.secrets
  where name = 'reminders_cron_secret'), 'new value');`
