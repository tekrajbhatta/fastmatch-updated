# Importing the old site's members

Two steps: turn the old site's database dump into a CSV file on your own
computer, then import that file on the server.

The CSV holds about 50,000 people's names, emails, mobiles and dates of birth,
so it never goes into git: everything in `data/` is ignored. It reaches the
server by `scp`, and is deleted there afterwards.

## What happens to each old member

Decided 9 Nov 2026 (rules in `oldSite.ts` and `src/lib/importRow.ts`):

| Old site | New site |
|---|---|
| Deleted on the old site | Not imported |
| Email bounced on the old site | Not imported |
| Not a valid email address, or a domain that can't receive mail | Not imported (it would bounce) |
| Password | Not carried over. They use "Forgot password?" (the login page says so) |
| Email confirmed there ("conf", or later unsubscribed) | Email confirmed |
| Email never confirmed there | Email not confirmed (blasts skip it until they confirm) |
| Australian mobile | Kept as 04…, confirmed |
| No mobile, or a number that isn't an Australian mobile | No mobile (added later in Edit profile, confirmed before booking) |
| City is one of the site's | That city |
| Any other city, or "Unknown" | No city (chosen later in Edit profile) |
| Event news and offers | On, except for members who unsubscribed there: off (Australia's Spam Act requires an unsubscribe to be honoured) |
| Contact method | As they chose it there ("none" = Do not contact) |
| Joined | When they registered there; the import day if that's missing |
| Terms & Conditions | Not accepted: asked before their first booking |

Nothing is emailed or texted to anyone by the import.

## 1. On your computer: make the CSV

From the project folder:

```bash
npx tsx members-import/convert-old-members.ts ../old-site-db/fastmatch.sql --check-domains
```

This writes `members-import/data/members.csv`, `skipped.csv` (everyone left out,
with the reason) and `summary.txt`. `--check-domains` looks up each email domain
(DNS only, nothing is sent) and leaves out addresses whose domain can't receive
mail. Run it twice: a domain that doesn't answer is asked again, and left out if
it fails again.

To also leave out addresses an email-checking service marked undeliverable, put
them in a file (one per line, or any CSV containing them) and add
`--exclude that-file.csv`.

## 2. On the server

The code (including the database change it needs) must already be deployed.

The `deploy` user can't write in `shared/`, and only the site's own user
(`fastmatch`) can read the site's settings (`shared/.env`, which holds the
database login). So the file goes up to the `deploy` user's home folder, is
moved into a folder only `fastmatch` can open, and the import runs as
`fastmatch`, the same way the nightly jobs run.

```bash
# from your computer: copy the file up (not into git)
scp members-import/data/members.csv deploy@170.64.189.54:members.csv

# on the server
ssh deploy@170.64.189.54
sudo install -d -o fastmatch -g fastmatch -m 700 /var/www/fastmatch.com.au/shared/member-import
sudo install -o fastmatch -g fastmatch -m 600 ~/members.csv /var/www/fastmatch.com.au/shared/member-import/members.csv
rm ~/members.csv
```

The deploy backed up the database just before it went live. Check that
backup is there, from today:

```bash
sudo ls -lt /var/backups/fastmatch | head -3
```

Then check, and import:

```bash
cd /var/www/fastmatch.com.au/current
sudo -u fastmatch -H npm run import-members -- /var/www/fastmatch.com.au/shared/member-import/members.csv --dry-run
sudo -u fastmatch -H npm run import-members -- /var/www/fastmatch.com.au/shared/member-import/members.csv
```

The dry run reads every row and says how many would be imported, saving
nothing. The real run saves 500 at a time and takes well under a minute.
Anyone already on the site (the same email address) is left as they are, so
if the connection drops, running it again simply carries on.

Afterwards, check the admin's Members page shows the new total, then delete the
folder (the file, and the list of skipped rows if there is one):

```bash
sudo rm -rf /var/www/fastmatch.com.au/shared/member-import
```
