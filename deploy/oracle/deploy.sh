#!/usr/bin/env bash
# Re-deploy after a git push. Run from the repo root on the server:
#   bash deploy/oracle/deploy.sh
set -euo pipefail

git pull --ff-only
npm ci
# Capped so the build can't grab more than the box has and start swapping
# everything else out from under it.
NODE_OPTIONS="--max-old-space-size=768" npm run build
sudo systemctl restart gains-log
sudo systemctl status gains-log --no-pager -l
