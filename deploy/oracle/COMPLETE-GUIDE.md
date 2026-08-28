# Gains Log — Complete Oracle Cloud Deployment Guide

Everything from an empty Oracle Cloud account to a live HTTPS app on your
phone's home screen. This reflects an actual deployment — every gotcha listed
in Part 11 is a real problem that came up and how it was solved, not a
hypothetical.

---

## Part 1 — Create the network (VCN)

A VCN (Virtual Cloud Network) is the private network your instance lives in.

1. OCI Console → ☰ menu → **Networking → Virtual Cloud Networks**
2. **Start VCN Wizard** → **Create VCN with Internet Connectivity** → Start VCN Wizard
3. Fill in:
   - **VCN Name**: anything, e.g. `gains-vcn`
   - **Compartment**: your root compartment (or one you've made)
   - Leave the CIDR blocks at their defaults (`10.0.0.0/16`, public subnet `10.0.0.0/24`, private subnet `10.0.1.0/24`) unless you have a reason to change them
4. **Next** → **Create**

This wizard creates, in one step: the VCN itself, a public and private subnet,
an **Internet Gateway**, a **NAT Gateway**, route tables, and a default
**Security List** for each subnet. That default Security List only allows
inbound SSH (port 22) — everything else gets added in Part 7.

**Write down which Security List is attached to your public subnet** —
Networking → Virtual Cloud Networks → your VCN → **Subnets** → click the
public subnet → note the Security List name/OCID shown there. This matters a
lot later (see Part 7 and Part 11).

---

## Part 2 — Create the compute instance

1. ☰ menu → **Compute → Instances → Create Instance**
2. **Name**: anything, e.g. `gains-log-prod`
3. **Placement**: leave default, or pick an availability domain
4. **Image and shape**:
   - Image: **Ubuntu** (22.04 or newer)
   - Shape: click **Change shape**
     - **AMD Micro** (`VM.Standard.E2.1.Micro`) — 1 OCPU / 1GB RAM, Always Free
     - **Ampere A1** (`VM.Standard.A1.Flex`) — if you have unused Always Free
       Ampere quota, configure 2+ OCPU / 4GB+ RAM here instead. Same cost
       (free), meaningfully less memory pressure during builds — worth
       checking before defaulting to the Micro shape.
5. **Networking**: select the VCN and **public subnet** from Part 1. Leave
   "Assign a public IPv4 address" checked.
6. **Add SSH keys**: either paste a public key you already have
   (`~/.ssh/id_rsa.pub` or similar) or let Oracle generate a key pair and
   download the private key — you'll need it to connect.
7. **Create**

Wait for the instance state to show **Running**, then note its **Public IPv4
address** from the instance detail page (also visible from the server itself
later via `curl -s ifconfig.me`).

If the public IP isn't reserved as static, consider reserving it if this
deployment is meant to be permanent — Oracle's default ephemeral IP survives
reboots but changes on a stop/start, which would silently break your DNS.

---

## Part 3 — Connect and prepare the server

```bash
ssh -i /path/to/private_key ubuntu@<your-public-ip>
```

Update the system:

```bash
sudo apt update && sudo apt upgrade -y
```

This may show an interactive `needrestart` prompt listing daemons using
outdated libraries — type `1-21` (or whatever range excludes "none of the
above") and press Enter to restart them all; this is safe, including for
`ssh.service`, which doesn't drop your current session. To skip this prompt
entirely on future runs: `export NEEDRESTART_MODE=a` before `apt upgrade`.

**Swap file** — a 1GB instance will get `next build` OOM-killed without this:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # confirm Swap: 4.0Gi
```

**Node.js**, via NodeSource rather than nvm — systemd services can't find an
nvm-installed binary without extra PATH configuration, and NodeSource installs
to the fixed path `/usr/bin/npm` that the systemd unit in Part 5 expects:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node -v   # expect v22.x
```

---

## Part 4 — Deploy the application

```bash
git clone https://github.com/Ashwin-Selvaraj/gains-log.git
cd gains-log
cp .env.example .env
nano .env
```

Set in `.env`:
- `DATABASE_URL` — your Neon **pooled** connection string (has `-pooler` in
  the host)
- `ANTHROPIC_API_KEY`

Install and build:

```bash
npm ci
```

If this fails with `npm error code ETIMEDOUT`, it's a network hiccup reaching
the registry — clean up and retry with more patience baked in:

```bash
rm -rf node_modules
npm config set fetch-timeout 600000
npm config set fetch-retries 5
npm config set fetch-retry-mintimeout 20000
export NODE_OPTIONS="--dns-result-order=ipv4first"
npm ci
```

Then build, capped so it can't outgrow the box's memory:

```bash
NODE_OPTIONS="--max-old-space-size=768 --dns-result-order=ipv4first" npm run build
```

Watch for `🚀 Your database is now in sync with your Prisma schema` — that
confirms it reached Neon and created the tables. Then seed the starter data:

```bash
npm run db:seed
```

Expect a list of 7 plan days and 5 meal presets created.

---

## Part 5 — Run it as a service (systemd)

```bash
sudo cp deploy/oracle/gains-log.service /etc/systemd/system/
```

Edit `User=` and `WorkingDirectory=` in that file first if your username or
clone path aren't `ubuntu` / `/home/ubuntu/gains-log`:

```bash
sudo nano /etc/systemd/system/gains-log.service
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gains-log
sudo systemctl status gains-log --no-pager
curl -I http://localhost:3000   # expect HTTP/1.1 200
```

The unit deliberately has no `EnvironmentFile=` — Next.js loads `.env` from
its working directory itself. systemd's own env-file parsing does not strip
quotes from `KEY="value"` lines, which would leave `DATABASE_URL` with literal
quote characters in it and break Prisma's URL parsing.

---

## Part 6 — DNS

In your DNS provider (Cloudflare, in this case):

| Field | Value |
|---|---|
| Type | `A` |
| Name | your subdomain, e.g. `gains` |
| IPv4 address | the instance's public IP |
| **Proxy status** | **DNS only** (grey cloud) |
| TTL | Auto |

**The grey cloud matters.** If Cloudflare's proxy is left on (orange cloud),
public DNS always returns Cloudflare's own edge IPs instead of your server's —
which breaks Caddy's automatic certificate request (see Part 11). Keep it
DNS-only for a personal single-user app; Cloudflare's proxy/CDN features need
extra configuration to combine with Caddy's automatic HTTPS, and aren't
needed here.

Verify propagation before continuing — bypass any local DNS cache by querying
a public resolver directly:

```bash
curl -s 'https://cloudflare-dns.com/dns-query?name=gains.yourdomain.com&type=A' -H 'accept: application/dns-json'
```

Look for `"data":"<your instance's IP>"` in the response.

---

## Part 7 — Firewall: both layers

Oracle has **two independent firewalls**. Missing either leaves the app
unreachable with no obvious error — this is the single most common thing
that goes wrong on Oracle specifically, and it's exactly what happened in this
deployment (see Part 11).

### 7a. OS-level (on the instance itself)

```bash
sudo iptables -L INPUT -n --line-numbers
```

Oracle's Ubuntu images ship rules that drop everything except SSH by default,
ending in a numbered `REJECT`. Insert the new rules **above** it — if your
`REJECT` is at line 5 (adjust to match what you actually see):

```bash
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
```

(The second command targets line 6 because the first insert pushed `REJECT`
down by one — run them in that order.)

Verify, then persist across reboots:

```bash
sudo iptables -L INPUT -n --line-numbers
sudo netfilter-persistent save
```

If `netfilter-persistent` isn't found: `sudo apt install -y iptables-persistent`
first, then retry.

If `ufw` is active instead of raw iptables (`sudo ufw status`), use:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 7b. Cloud-level (the OCI Security List) — read this carefully

**Verify you're editing the Security List actually attached to your public
subnet, not just any list in the VCN.** Some VCNs have more than one Security
List, and it's easy to add rules to the wrong one — they save fine, look
correct, and do nothing, because traffic is actually being filtered by a
different list entirely.

To confirm: **Networking → Virtual Cloud Networks → your VCN → Subnets →
public-subnet** — the **Security Lists** section on that page names the list
that's actually in effect. Click into *that* list, not one you might have
bookmarked or found first.

Add two ingress rules there:

| Source CIDR | IP Protocol | Destination Port Range |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

**Also check for a Network Security Group (NSG).** NSGs apply *in addition
to* the Security List, on the instance's VNIC rather than the subnet.
Instance detail page → **Primary VNIC** section → **Network Security
Groups** — if anything is listed there (not just the generic help text), it
needs the same two ingress rules added too, or it'll silently block traffic
the Security List allows.

---

## Part 8 — HTTPS via Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Edit `deploy/oracle/Caddyfile`, replacing the placeholder with your real
subdomain:

```bash
nano deploy/oracle/Caddyfile
```

```
gains.yourdomain.com {
        reverse_proxy localhost:3000
}
```

Then:

```bash
sudo cp deploy/oracle/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Watch it request the certificate:

```bash
sudo journalctl -u caddy --no-pager -n 30
```

Look for `certificate obtained successfully`. If you instead see
`Timeout during connect (likely firewall problem)`, Part 7 isn't fully done
yet — go back and check both the OS firewall and, especially, which Security
List is actually attached to the subnet.

---

## Part 9 — Verify end to end

From your **laptop**, not the server:

```bash
curl -I https://gains.yourdomain.com
```

Expect `HTTP/2 200`. Then open that URL on your phone (Safari for iOS,
Chrome for Android) and **Add to Home Screen** — this only works over real
HTTPS, which is the entire reason Part 8 isn't optional even for personal use.

Useful checks along the way:

```bash
sudo ss -tlnp | grep -E ':(80|443)'      # Caddy bound to *:80 / *:443, not 127.0.0.1
curl -v http://<public-ip>                # raw IP test, isolates DNS/TLS from firewall
pm2 list                                  # check for anything else already running here
```

---

## Part 10 — Redeploying after changes

```bash
cd ~/gains-log
bash deploy/oracle/deploy.sh
```

Pulls, reinstalls dependencies, rebuilds with the memory cap, restarts the
service.

To pick up a pending kernel update (check with `uname -r` vs. what's
installed):

```bash
sudo reboot
```

The swap file (`/etc/fstab`), the systemd service (`enable`d), and Caddy all
come back automatically — reconnect via SSH after a minute and re-run the
Part 9 checks.

---

## Part 11 — Troubleshooting: real issues from this deployment

**`npm ci` fails with `ETIMEDOUT`.** Network blip reaching the registry, or
the box's IPv6 route to it is slow/unroutable while IPv4 works fine — common
on cloud VMs. Fix in Part 4 (clean reinstall + longer timeouts +
`--dns-result-order=ipv4first`).

**Build fails or the process just vanishes.** No swap file, or it isn't
active — `next build` needs more memory than a 1GB instance has alone. Check
`free -h` shows `Swap: 4.0Gi`, not `0B`.

**Caddy logs `Timeout during connect (likely firewall problem)` for both
`http-01` and `tls-alpn-01` challenges**, even after "opening" ports 80/443.
In order of likelihood:
1. The Security List you edited isn't the one actually attached to the
   public subnet (see Part 7b) — **this was the actual cause in this
   deployment**. Verify via the subnet's own page, not just any list you find.
2. An NSG on the instance's VNIC is blocking it independently of the Security
   List.
3. The OS-level iptables/ufw rules weren't added, or were inserted below the
   catch-all `REJECT` instead of above it.

Diagnose by testing the raw IP from an external machine:
`curl -v http://<public-ip>`. A hang for the full timeout (not
`Connection refused`, which returns instantly) means a cloud-level firewall
is silently dropping the packet — points at #1 or #2 above, not Caddy or DNS.

**`getent hosts yourdomain` shows Cloudflare's IPs (`2606:4700:...`), not your
server's.** Cloudflare's proxy (orange cloud) is on for that record — DNS
always returns Cloudflare's edge IP while proxied, regardless of what origin
IP is configured behind it. Toggle it to **DNS only** (grey cloud) in
Cloudflare's dashboard.

**`prisma: not found` during the build's `prebuild` step.** Not a separate
bug — it's downstream of an `npm ci` that didn't fully complete (see the
`ETIMEDOUT` entry above). `prisma` is a devDependency; if the install got cut
off, its CLI binary was never installed.

**SSH session drops with `Connection reset by peer` / `Broken pipe` right
after editing a Security List.** Expected, harmless — OCI briefly
reprograms the network path when a Security List changes, which can drop
existing connections. The instance keeps running; just reconnect.

**`pm2 list` shows other apps.** Not a conflict unless they're actively
`running` (not `stopped`) and bound to port 3000 — PM2 and the systemd
service here are independent process managers that can coexist on the same
box for different apps.

**`needrestart` interactive prompt during `apt upgrade`.** Type a range like
`1-21` to restart everything listed (safe, including `ssh.service` — it
doesn't drop your current session). Set `export NEEDRESTART_MODE=a` beforehand
to skip the prompt on future runs.

---

## Appendix — Always Free vs. the 30-day Trial

Oracle Cloud accounts bundle two separate things:

- **30-day Free Trial**: $300 in credits, usable on any service, expires
  after 30 days or when the credits run out, whichever comes first.
- **Always Free**: a fixed set of resources (including small compute shapes)
  that stay free indefinitely, no time limit, as long as you stay within
  their limits.

Check which one this instance is on: OCI Console → **Billing & Cost
Management → Cost Analysis**, or **Governance & Administration → Tenancy
Details**. If the instance was provisioned as an Always Free shape, nothing
changes after 30 days. If it's running on trial credits instead, it stops
once they're exhausted unless you upgrade to a paid account.
