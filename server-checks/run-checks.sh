#!/usr/bin/env bash
# FastMatch server checks (see README.md in this folder). On the server:
#
#   cd /var/www/fastmatch.com.au/current
#   sudo bash server-checks/run-checks.sh 2>&1 | tee ~/fastmatch-run-checks.txt
#
# It changes nothing, apart from 22 failed logins for two made-up
# @example.com accounts (the visitor-address test, item 54) and three requests
# the site refuses. It never prints a password or key.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${BASE_DIR:-/var/www/fastmatch.com.au}"
APP_USER="${APP_USER:-fastmatch}"
SERVICE="${SERVICE:-fastmatch}"
LOG_DIR="${LOG_DIR:-/var/log/fastmatch}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run it with sudo: sudo bash server-checks/run-checks.sh"
  exit 1
fi

section() { printf '\n==================== %s ====================\n' "$1"; }
ok()      { printf '[OK]    %s\n' "$*"; }
look()    { printf '[CHECK] %s\n' "$*"; }
info()    { printf '[INFO]  %s\n' "$*"; }
# Anything that looks like a password or key, in lines copied from cron, logs
# or Nginx, is replaced with *** before it's printed.
mask()    { sed -E 's#(://[^:/@ ]+:)[^@ ]+@#\1***@#g; s/((sk|rk|pk)_(live|test))_[A-Za-z0-9]+/\1_***/g; s/whsec_[A-Za-z0-9]+/whsec_***/g; s/((KEY|SECRET|PASS|PASSWORD|TOKEN)[A-Za-z_]*[=:][[:space:]]*)[^[:space:]"]+/\1***/g'; }
indent()  { mask | sed 's/^/        | /'; }
as_app()  { sudo -u "$APP_USER" -H -- "$@"; }
# One setting from the site's .env (only the ones that aren't secret are asked for).
env_value() { grep -E "^[[:space:]]*$1=" "$APP_DIR/.env" 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']$//"; }

APP_URL="$(env_value APP_URL)"; APP_URL="${APP_URL%/}"
HOST="${APP_URL#*://}"; HOST="${HOST%%/*}"

# ------------------------------------------------------------------ the server
section "1. The server"
info "Now: $(date '+%F %T %Z') (Sydney: $(TZ=Australia/Sydney date '+%F %T %Z'))"
info "The server clock's time zone: $(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null)"
info "Site folder: $APP_DIR (-> $(readlink -f "$APP_DIR"))"
info "Deployed version: $(as_app git -C "$APP_DIR" log -1 --format='%h, %cd: %s' --date=format:'%F %R' 2>/dev/null | cut -c1-160)"
if systemctl is-active --quiet "$SERVICE"; then
  ok "The site's service ($SERVICE) is running, since $(systemctl show -p ActiveEnterTimestamp --value "$SERVICE")"
else
  look "The site's service ($SERVICE) isn't running"
fi
info "Node $(as_app node -v 2>/dev/null); $(df -h "$BASE_DIR" | awk 'NR == 2 { print $4 " of " $2 " disk free" }')"

# ------------------------------------------------------------------ cron
section "2. Scheduled jobs (cron)"
CRON="$(crontab -l -u "$APP_USER" 2>/dev/null | grep -vE '^[[:space:]]*(#|$)')"
SYSTEM_CRON="$(grep -hsE 'fastmatch|calculate-?[mM]atches|process-?[cC]ampaign-?[sS]ends|send-?[rR]eminders' /etc/crontab /etc/cron.d/* 2>/dev/null | grep -vE '^[[:space:]]*#')"
if [ -n "$CRON" ]; then info "The $APP_USER user's crontab:"; printf '%s\n' "$CRON" | indent; else info "The $APP_USER user has no crontab."; fi
if [ -n "$SYSTEM_CRON" ]; then info "In /etc/crontab or /etc/cron.d:"; printf '%s\n' "$SYSTEM_CRON" | indent; fi
TIMERS="$(systemctl list-timers --all --no-pager 2>/dev/null | grep -iE 'fastmatch|matches|remind|campaign')"
if [ -n "$TIMERS" ]; then info "systemd timers:"; printf '%s\n' "$TIMERS" | indent; fi

ALL_CRON="$(printf '%s\n%s\n' "$CRON" "$SYSTEM_CRON")"
for job in "calculate-matches calculateMatches results" "process-campaign-sends processCampaignSends blast" "send-reminders sendReminders reminders"; do
  set -- $job
  line="$(printf '%s\n' "$ALL_CRON" | grep -m 1 -E "$1|$2")"
  if [ -z "$line" ]; then look "No schedule found for the $3 job ($1)"; continue; fi
  schedule="$(awk '{ if ($1 ~ /^@/) print $1; else print $1, $2, $3, $4, $5 }' <<<"$line")"
  info "The $3 job ($1) runs at: $schedule"
  if [ "$3" = results ]; then
    hour="$(awk '{ print $2 }' <<<"$schedule")"
    if [ "$schedule" = "@hourly" ] || [ "$hour" = "*" ]; then
      ok "The results job runs every hour, so each event's results go out within the hour after midnight in its own city"
    else
      look "The results job runs only at hour(s) \"$hour\" (Sydney time): events in cities behind Sydney (Adelaide, Brisbane, Darwin, Perth) have their midnight later, so their results wait until the next day's run. It should run every hour."
    fi
  fi
done

if [ -d "$LOG_DIR" ]; then
  now=$(date +%s)
  for f in "$LOG_DIR"/*.log; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"
    age=$(( (now - $(stat -c %Y "$f")) / 60 ))
    info "$name: last written $age min ago"
    tail -n 6 "$f" | indent
    case "$name" in
      *campaign*) [ "$age" -le 10 ] && ok "$name is written every few minutes, so the blast job is running" || look "$name hasn't been written for $age min, but the blast job should run every 2 minutes" ;;
      *remind*)   [ "$age" -le 70 ] && ok "$name was written within the hour, so the reminders job is running" || look "$name hasn't been written for $age min, but the reminders job should run every hour" ;;
      *match*)    [ "$age" -le 1500 ] && ok "$name was written within the last day" || look "$name hasn't been written for $age min" ;;
    esac
    errors=$(tail -n 300 "$f" | grep -ciE 'error|exception|this batch failed|failed:')
    if [ "$errors" -gt 0 ]; then
      look "$name: $errors line(s) in its last 300 mention an error; the latest:"
      tail -n 300 "$f" | grep -iE 'error|exception|this batch failed|failed:' | tail -n 3 | cut -c1-300 | indent
    fi
  done
else
  look "No log folder at $LOG_DIR"
fi
ls /etc/logrotate.d 2>/dev/null | grep -qi fastmatch && ok "The job logs are rotated (/etc/logrotate.d)" || info "No logrotate rule mentions fastmatch"

# ------------------------------------------------------------------ nginx
section "3. Nginx"
if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then ok "Nginx's settings are valid ($(nginx -v 2>&1 | sed 's/^nginx version: //'))"
  else look "nginx -t reports a problem: $(nginx -t 2>&1 | tail -n 2 | tr '\n' ' ')"; fi
  info "The settings that matter for these checks (file: setting):"
  nginx -T 2>/dev/null | awk '
    /^# configuration file / { file = $4; sub(/:$/, "", file); next }
    { line = $0; sub(/^[ \t]+/, "", line) }
    line ~ /^#/ { next }
    line ~ /^(server_name|listen|location|proxy_pass|proxy_set_header|real_ip_header|set_real_ip_from|real_ip_recursive|client_max_body_size|proxy_buffering|proxy_request_buffering|access_log)[ \t]/ { print file ": " line }' | indent
else
  look "nginx isn't installed here, or isn't on the PATH"
fi

# ------------------------------------------------------------------ from outside
section "4. The site from outside (through Nginx)"
if [ -z "$APP_URL" ]; then
  look "APP_URL isn't set, so the site can't be tried from outside"
else
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$APP_URL/events")
  [ "$code" = 200 ] && ok "$APP_URL/events answers (200)" || look "$APP_URL/events answered $code"
  redirect=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "http://$HOST/events")
  case "$redirect" in 301\ https://*|308\ https://*) ok "http:// is sent on to https:// ($redirect)" ;; *) look "http://$HOST/events gave: $redirect" ;; esac

  out=$(curl -s -w ' %{http_code}' --max-time 20 -X POST -H 'content-type: application/json' -d '{}' "$APP_URL/api/stripe/webhook")
  case "$out" in *"Invalid webhook signature"*" 400") ok "Stripe's webhook address is reachable, and refuses a request Stripe didn't sign (400)" ;; *) look "Stripe's webhook address answered: $out" ;; esac

  out=$(curl -s -w ' %{http_code}' --max-time 20 -X POST -H 'content-type: application/json' -d '{}' "$APP_URL/api/webhooks/email-bounce")
  case "$out" in
    *" 401") ok "Mailgun's bounce address is reachable, has its signing key, and refuses unsigned reports (401)" ;;
    *" 503") look "Mailgun's bounce address says bounce reports aren't set up: MAILGUN_WEBHOOK_SIGNING_KEY is missing (503)" ;;
    *) look "Mailgun's bounce address answered: $out" ;;
  esac

  # Who has been calling the two webhook addresses, and what they were told
  # (Nginx's access logs: Stripe's and Mailgun's own requests show their names).
  for hook in /api/stripe/webhook /api/webhooks/email-bounce; do
    calls="$(grep -hs "POST $hook" /var/log/nginx/*access.log.1 /var/log/nginx/*access.log 2>/dev/null | grep -v 'curl/' | tail -n 5)"
    if [ -n "$calls" ]; then info "The latest requests to $hook (not counting these checks):"; printf '%s\n' "$calls" | cut -c1-260 | indent
    else info "No request to $hook in Nginx's recent access logs (apart from these checks)"; fi
  done

  # A 9.5 MB request without logging in: 403 means it reached the site (which
  # refused it, rightly); 413 means Nginx stopped it first.
  code=$(head -c 9500000 /dev/zero | curl -s -o /dev/null -w '%{http_code}' --max-time 60 -X POST -H 'content-type: application/octet-stream' --data-binary @- "$APP_URL/api/admin/uploads")
  case "$code" in
    403|401) ok "A 9.5 MB upload gets through Nginx to the site, so photos up to the site's 10 MB limit can be uploaded" ;;
    413) look "Nginx refuses a 9.5 MB upload (413): photos bigger than Nginx's limit (1 MB unless client_max_body_size is set) can't be uploaded" ;;
    *) look "The 9.5 MB upload test got $code" ;;
  esac

  # ---------------------------------------------------------------- item 54
  section "5. The visitor's address (item 54)"
  login_codes() { # $1: the start of a made-up address to claim on each try, or nothing
    local email="servercheck-ip-$RANDOM$RANDOM@example.com" codes="" i header
    for i in $(seq 1 11); do
      if [ -n "$1" ]; then header="X-Forwarded-For: $1$i"; else header="X-Servercheck: plain"; fi
      codes+="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'content-type: application/json' -H "$header" \
        -d "{\"email\":\"$email\",\"password\":\"servercheck-wrong-password\"}" "$APP_URL/api/auth/login") "
    done
    printf '%s' "$codes"
  }
  plain="$(login_codes "")"
  spoofed="$(login_codes "198.51.100.")"
  info "11 wrong passwords for a made-up account: $plain"
  info "The same, each try claiming a different made-up address: $spoofed"
  [ "$(awk '{ print $NF }' <<<"$plain")" = 429 ] || look "The login limit didn't stop the 11th wrong password"
  if [ "$(awk '{ print $NF }' <<<"$spoofed")" = 429 ]; then
    ok "The site ignored the made-up addresses: its per-address limits can't be dodged that way"
  else
    look "The site believed the made-up addresses: anyone can dodge the per-address limits (logins, sign-ups, Contact Us) by claiming a new address each time"
  fi
  info "(Run again within 15 minutes, the login lines may show 429 sooner; that's expected.)"
fi

# ------------------------------------------------------------------ item 55
section "6. Uploaded images (item 55)"
UPLOADS="$(env_value UPLOAD_DIR)"
if [ -z "$UPLOADS" ]; then
  look "UPLOAD_DIR isn't set in .env: uploads go inside the release folder and are lost on the next deploy"
else
  info "UPLOAD_DIR = $UPLOADS"
  case "$(readlink -f "$UPLOADS")" in
    "$(readlink -f "$BASE_DIR/releases")"/*) look "UPLOAD_DIR is inside a release folder: uploads are lost on the next deploy" ;;
    *) ok "UPLOAD_DIR is outside the release folders, so uploads survive deploys" ;;
  esac
  if [ -d "$UPLOADS" ]; then
    info "$(stat -c '%U:%G %A' "$UPLOADS"), $(find "$UPLOADS" -maxdepth 1 -type f | wc -l) file(s), $(du -sh "$UPLOADS" | cut -f1)"
    if as_app test -w "$UPLOADS"; then ok "The site's user can save new uploads there"; else look "The site's user ($APP_USER) can't save files in $UPLOADS"; fi
  else
    look "The folder $UPLOADS doesn't exist"
  fi
fi
stranded=0
for d in "$BASE_DIR"/releases/*/uploads; do
  [ -d "$d" ] || continue
  n=$(find "$d" -type f | wc -l)
  [ "$n" -gt 0 ] && { look "$n upload(s) left inside a release folder: $d"; stranded=$((stranded + n)); }
done
[ "$stranded" -eq 0 ] && ok "No uploads are left inside release folders"

# ------------------------------------------------------------------ private files
section "7. Private files"
for f in "$BASE_DIR/shared/.env" "$BASE_DIR/shared/.my.cnf"; do
  [ -e "$f" ] || continue
  perms="$(stat -c '%a, owner %U' "$f")"
  case "$perms" in 600*|400*) ok "$(basename "$f") can only be read by its owner ($perms)" ;; *) look "$(basename "$f") can be read by others ($perms)" ;; esac
done
BACKUPS=/var/backups/fastmatch
if [ -d "$BACKUPS" ]; then
  info "The deploy's database backups: $BACKUPS ($(stat -c '%a, owner %U' "$BACKUPS"), $(find "$BACKUPS" -maxdepth 1 -type f | wc -l) file(s))"
  # A folder others can't open keeps every backup in it private, the next deploy's too.
  mode="$(stat -c '%a' "$BACKUPS")"
  if [ "${mode: -1}" = 0 ]; then ok "Others can't open the backups folder, so the backups in it are private"; BACKUPS=""; fi
fi
for f in $(find "$BASE_DIR/shared" $BACKUPS -maxdepth 1 -type f \( -name '*.sql*' -o -name '*.env*' -o -name '*.gz' \) -perm -o=r 2>/dev/null); do
  look "$f can be read by any user on the server"
done

# ------------------------------------------------------------------ the site's own checks
section "8. The site's own checks (run as $APP_USER)"
cd "$APP_DIR" && as_app "$APP_DIR/node_modules/.bin/tsx" server-checks/app-checks.ts

printf '\nDone. Please send me everything above: it contains no passwords or keys.\n'
