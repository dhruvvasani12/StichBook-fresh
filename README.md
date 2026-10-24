# StitchBook Fresh Starter (No OCR)

## Included
- Supabase email/password login and logout
- Worker/admin screens
- Daily work entry, machine photos (2–12), history
- Fabric calculation: work count × 6 metres
- Private Storage bucket and signed photo links
- OCR has been removed completely

## A. Create a new GitHub repository
1. GitHub → New repository → name `StitchBook-Fresh`.
2. Choose Public for straightforward GitHub Pages use on a free personal account.
3. Create it. Do not change or delete the old repository.

## B. Create a fresh Supabase project
1. Create a new Supabase project.
2. Find the Project URL and publishable key (or legacy anon/public key) in project API settings.
3. Put those values in `config.js`.
4. Never put a service-role/secret key in frontend code.

## C. Set up database
1. Supabase → SQL Editor.
2. Copy all of `supabase-schema.sql` and run it.
3. It creates the tables, policies and private `machine-photos` bucket. It does not delete tables.

## D. Add project files
In the new GitHub repository, use Add file → Create new file for each file: `index.html`, `styles.css`, `config.js`, `app.js`, `supabase-schema.sql`, and `README.md`. Paste the complete contents and commit. Never paste Git diff markers such as `@@` or leading `+` signs.

## E. Enable Pages
Repository → Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save. Wait for the Pages URL.

## F. Create users
1. Supabase → Authentication → Users → Add user. Create the admin and worker email/password accounts.
2. Copy each Auth user's UUID.
3. In SQL Editor, run one insert for each user, replacing values:
```sql
insert into public.profiles(id,full_name,worker_code,role)
values('AUTH_USER_UUID','Admin Name','ADMIN001','admin');
```
For workers, set role to `worker`, and use their real Auth UUID. Profile ID must exactly match the Auth user UUID.

## G. Test
Sign in as a worker, save a test record with two images, then confirm worker history and admin history. Admin and worker can be tested in separate browser/private windows.

## Important notes
- Work count is treated as the number of frames; fabric length = work count × 6 metres.
- If photo upload fails after the record is created, the app displays the record ID. Check history before retrying to avoid duplicates.
- This is a starter for a small team. Protect admin access, keep backups, and never expose secret/service-role keys.
