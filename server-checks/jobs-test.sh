#!/usr/bin/env bash
# Runs the three scheduled jobs against made-up data, checks each did its
# work, then deletes the data (see README.md in this folder). On the server:
#
#   cd /var/www/fastmatch.com.au/current
#   sudo bash server-checks/jobs-test.sh 2>&1 | tee ~/fastmatch-jobs-test.txt
#
# If a run is interrupted, this removes what it left:
#   sudo bash server-checks/jobs-test.sh --cleanup

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${APP_USER:-fastmatch}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run it with sudo: sudo bash server-checks/jobs-test.sh"
  exit 1
fi

cd "$APP_DIR" || exit 1
# As the site's own user, with its settings, exactly as cron runs the jobs.
sudo -u "$APP_USER" -H -- "$APP_DIR/node_modules/.bin/tsx" server-checks/jobs-test.ts "$@"
