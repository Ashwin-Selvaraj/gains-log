# Deploying to an Oracle Cloud instance

An alternative to Vercel for people who want their own box. More steps, same
result: one HTTPS URL, installable on your phone. Written against a 1 OCPU / 1GB
"Micro" free-tier shape — if you have Ampere A1 (Always Free) quota unused,
resizing to 2GB+ RAM there removes most of the memory caution below and is
still free.

**Already have an instance running?** This file (below) is the app-deployment
half only. For the full path — creating the VCN and instance from an empty
account through to a working HTTPS URL, plus a troubleshooting section built
from an actual live deployment — see
[`COMPLETE-GUIDE.md`](COMPLETE-GUIDE.md) in this same folder.

I can't run any of this for you — I don't have shell access to the server.
Everything here is meant to be pasted into your own SSH session. If a step
errors, paste the output back and I'll help debug it.

---

## 0. Before you start

**Database latency.** This box is in Mumbai; if your Neon project is still in
`us-east-2` (Ohio), every query pays the same ~250–300ms round trip your laptop
did in local dev — just from the server now. Neon has a Singapore region
(`ap-southeast-1`), a fraction of that distance from Mumbai. If your data is
still just the seeded plan and presets, migrating costs little: create a new
Neon project in Singapore, `npm run db:push` against it, `npm run db:seed`,
swap `DATABASE_URL`. Say the word and I'll walk through it.

**Domain.** Point your subdomain's A record at this instance's public IP before
starting Caddy below — it needs to resolve for the certificate request to work.

---

## 1. Server prep

```bash
sudo apt update && sudo apt upgrade -y
```

**Swap.** At 956Mi total RAM, `next build` can exceed available memory and get
OOM-killed. A swap file is the fix — the build gets slower under memory
pressure rather than dying outright.

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # should now show ~4.0G under Swap
```

**Node.js.** Installed via NodeSource rather than nvm on purpose: systemd
services don't source your shell profile, so an nvm-installed `npm` sits at a
path systemd can't find without extra config. NodeSource puts it at the fixed
path `/usr/bin/npm` that the unit file below expects.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node -v   # expect v22.x
```

---

## 2. Clone and configure

```bash
git clone https://github.com/Ashwin-Selvaraj/gains-log.git
cd gains-log
cp .env.example .env
nano .env   # set DATABASE_URL (your Neon connection string) and ANTHROPIC_API_KEY
```

---

## 3. First build

```bash
npm ci
NODE_OPTIONS="--max-old-space-size=768" npm run build
```

The memory cap makes the build fail cleanly if it would have exceeded what the
box has, rather than thrashing swap for several minutes. If it does fail, the
swap file is the thing to double-check first (`free -h`).

`npm run build` also runs `prisma db push` against `DATABASE_URL` — this is
what creates the tables on Neon the first time.

Seed the presets and starter plan once:

```bash
npm run db:seed
```

---

## 4. Run it as a service

`deploy/oracle/gains-log.service` is a systemd unit for this. Edit `User=` and
`WorkingDirectory=` inside it if your username or clone path differ from
`ubuntu` / `/home/ubuntu/gains-log`, then:

```bash
sudo cp deploy/oracle/gains-log.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gains-log
sudo systemctl status gains-log --no-pager
curl -I http://localhost:3000   # expect HTTP/1.1 200
```

It deliberately has no `EnvironmentFile=` line — Next.js loads `.env` from the
working directory itself. systemd's own env-file parsing does not strip quotes
from `KEY="value"` lines, which would leave `DATABASE_URL` with literal quote
characters in it and break Prisma's URL parsing.

---

## 5. Reverse proxy + HTTPS (Caddy)

Caddy requests and renews the Let's Encrypt certificate automatically from the
domain name in its config — nothing to type into a wizard.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Edit `deploy/oracle/Caddyfile`, replacing `gains.yourdomain.com` with your real
subdomain, then:

```bash
sudo cp deploy/oracle/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

## 6. Open the firewall — both layers

Oracle has **two** independent firewalls; missing either one leaves the site
unreachable with no obvious error. This is the single most common thing that
goes wrong on Oracle specifically.

**a) The OS firewall on the instance itself.** Oracle's Ubuntu images ship
iptables rules that drop everything except SSH by default. Check first:

```bash
sudo iptables -L INPUT -n --line-numbers
```

If you see numbered rules ending in a `REJECT`/`DROP`, insert the new rules
just above it (adjust the line number to match what you see):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

If `ufw` is active instead (`sudo ufw status`), use that instead:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

**b) The cloud-level firewall.** In the OCI Console: **Networking → Virtual
Cloud Networks → (your VCN) → Security Lists** (or **Network Security Groups**
if the instance uses one) → **Add Ingress Rules**:

| Source CIDR | Protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

Both layers have to allow it — one without the other still fails silently.

---

## 7. Verify

```bash
curl -I https://gains.yourdomain.com   # from your laptop, not the server
```

Expect `HTTP/2 200`. Then on your phone: open the URL in Safari (iOS) or
Chrome (Android) and Add to Home Screen — this only works over real HTTPS,
which is why the Caddy step isn't optional even for personal use.

---

## Redeploying after changes

```bash
bash deploy/oracle/deploy.sh
```

Pulls, reinstalls dependencies, rebuilds with the memory cap, and restarts the
service.
