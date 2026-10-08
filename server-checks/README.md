# Server checks

Scripts that check what can only be seen on the live server. They're run by
hand over SSH, and this folder is removed once the results are in.

| Script | What it checks | What it changes |
|---|---|---|
| `run-checks.sh` | The service; the three scheduled jobs (cron, logs, what the data shows); Nginx (the visitor's address, the upload size limit, the webhook addresses); uploaded images; private files; the settings in `shared/.env`; Stripe (payment page settings, ways to pay, the webhook and its deliveries, payments that never confirmed a booking); Mailgun's login; Cellcast's key and sender name; saved blasts | Nothing, apart from 22 failed logins for two made-up `@example.com` accounts and three requests the site refuses |
| `jobs-test.sh` | Runs the reminders, blast and results jobs against made-up data and checks each did its work, then that Mailgun's bounce reports reach the site | Makes two members, two hidden events and a blast, all named "[Server check]", and deletes them at the end. Four emails go to `@example.com` addresses, which accept no mail. Nothing is texted. |

Neither prints a password or key.

## Running them

As the `deploy` user, after the push has deployed:

```bash
cd /var/www/fastmatch.com.au/current
sudo bash server-checks/run-checks.sh 2>&1 | tee ~/fastmatch-run-checks.txt
sudo bash server-checks/jobs-test.sh 2>&1 | tee ~/fastmatch-jobs-test.txt
```

The jobs test takes about 5 minutes: most of it is waiting for Mailgun's
bounce reports. If it's interrupted, this removes what it made:

```bash
sudo bash server-checks/jobs-test.sh --cleanup
```

Send back the two `.txt` files (or their contents). `[OK]` and `[PASS]` lines
are as they should be; `[CHECK]` and `[FAIL]` lines need a look.
