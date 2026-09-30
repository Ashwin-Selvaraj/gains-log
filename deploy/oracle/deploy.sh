#!/usr/bin/env bash
# Re-deploy after a git push. Run from the repo root on the server:
#   bash deploy/oracle/deploy.sh
set -euo pipefail

git pull --ff-only
npm ci
# V8's own default heap ceiling is auto-computed from physical RAM alone (it
# ignores swap), which on a 956MB box works out to ~470-490MB — too low for
# this project's type-check since viem and @aws-sdk/client-kms joined the
# dependency tree. Explicit override instead, sized against swap rather than
# physical RAM: the box has 4GB of mostly-idle swap, so let the build spill
# into it under memory pressure — slower, but it won't hit an OOM ceiling.
NODE_OPTIONS="--max-old-space-size=1536" npm run build
sudo systemctl restart gains-log
sudo systemctl status gains-log --no-pager -l
