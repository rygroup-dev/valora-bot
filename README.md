# 🛡 Valora Sentinel

**A smart, profitable, anti-ban automation bot for [Valora](https://valora.gg).**
Signs in with your Solana wallet, joins the best server your token-hold qualifies
for, and farms the game economy autonomously — combat, gathering, quests,
crafting, gear upgrades and the on-chain marketplace — all controlled from a
clean Telegram interface.

> ⚠️ **Use at your own risk.** Automating an online game may violate its terms of
> service. This project is for educational purposes. You are responsible for how
> you use it.

---

## ✨ Features

- **Solana wallet sign-in** — passwordless authentication using your wallet key
  (ed25519 challenge signing). JWT session is cached and auto-refreshed.
- **Smart server routing** — automatically detects how many gate tokens your
  wallet holds and joins the highest-tier server you qualify for (e.g. the
  *priority* shard at 30,000+ hold), falling back to standard shards otherwise.
- **Economy-first brain** — a priority scheduler picks the most valuable, safest
  activity each tick: survival → banking → stat allocation → gear upgrade →
  combat / crafting / gathering → quests.
- **Character progression** — auto-allocates stat points on level-up and
  auto-equips stronger gear so your character keeps getting stronger.
- **On-chain marketplace** — supports the in-game token economy (auction house,
  gold↔token, fees) with strict confirmation gates.
- **Multi-account fleet** — run a **main** account plus any number of **sub**
  accounts, each a fully isolated agent (own wallet → own sign-in → own session).
  Generate, fund, launch and sweep sub accounts entirely from Telegram. Subs play
  on standard servers (100-token gate) with the *same* smart/profitable brain as
  main, while main keeps the priority server (30k gate). New subs **auto-create
  their in-game character** — the fleet is hands-off after one command.
- **Telegram control** — full English UI with inline buttons, live notifications
  (level-ups, gold gains, fights, disconnects), and a plain-language guide.
- **Anti-ban & safety-first** — human-like pacing/jitter, exponential backoff,
  automatic reconnects, a global kill-switch, and a single-instance guard so the
  bot can never accidentally run doubled.
- **Zero-mistake design** — test-driven (220+ tests), optimistic-locked saves,
  a dependency-free Solana client with **Token-2022 transfers verified against
  on-chain ground truth**, and **mandatory Telegram approval for any action that
  moves on-chain value or spends gold**.

---

## 🚀 Install

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/rygroup-dev/valora-bot/main/install.sh | bash
```

This clones the repo into `~/valora-bot`, installs dependencies, and creates your
config files from the templates.

### Update an existing clone

```bash
cd ~/valora-bot && git pull --ff-only && npm ci && npm test
```

This pulls the latest bot code, installs the exact locked dependency versions,
and verifies the install before you run it.

### Manual

```bash
git clone https://github.com/rygroup-dev/valora-bot.git
cd valora-bot
npm ci
cp .env.example .env
cp data/wallets.json.example data/wallets.json
```

---

## ⚙️ Configure

**1. Add your wallet(s)** — edit `data/wallets.json`:

```json
[{ "label": "main", "key": "YOUR_BASE58_SECRET_KEY" }]
```

The `key` accepts a base58 secret key or a JSON byte array. Need a fresh wallet?

```bash
node scripts/new-wallet.js main
```

Your wallet must hold the game's gate token (the minimum to play) before it can
sign in. Hold the priority threshold to auto-join the priority server.

**2. Set up Telegram** — create a bot with [@BotFather](https://t.me/BotFather),
then in `.env`:

```ini
TELEGRAM_BOT_TOKEN=123456:your-bot-token
TELEGRAM_OWNER_IDS=your-numeric-chat-id
```

(Message the bot once and it will tell you your chat id, or use
[@userinfobot](https://t.me/userinfobot).)

**3. Verify sign-in** (no gameplay):

```bash
npm run login
```

---

## ▶️ Run

```bash
npm start
```

The bot starts in **observe mode** (read-only) with **dry-run** on, so it does
nothing destructive until you say so. Open Telegram and send `/menu`.

### Run as a service (recommended)

```bash
sudo cp valora-bot.service /etc/systemd/system/
sudo systemctl enable --now valora-bot
journalctl -u valora-bot -f
```

---

## 🎛 Telegram commands

| Command | What it does |
|---|---|
| `/menu` | Open the control panel |
| `/help` | Full plain-language guide |
| `/status` | What each bot is doing right now |
| `/balance` | Gold, server tier and wallet |
| `/go` | Start farming (active mode) |
| `/observe` | Watch only (read-only) |
| `/dryrun` | Toggle safe-test mode (simulate actions) |
| `/log` | Recent activity & events |
| `/stop` | Emergency stop (kill-switch) |
| `/resume` | Resume after a stop |
| `/travel <map>` | Send an agent to another map (e.g. `/travel mine1`) |

### 🧬 Multi-account fleet (Telegram)

Run one **main** account that funds and manages many **sub** accounts. Every
sub plays on a standard server (just needs the 100-token gate) with the same
brain as main. All money commands move **real on-chain value** and ask for
**Approve / Decline** first.

| Command | What it does |
|---|---|
| `/subacc <label> [amount]` | One-shot: generate a sub wallet, send it `amount` $VALORA from main (default 110), wait for it to confirm, then launch it live on a standard server (it auto-creates its character) |
| `/genwallet <label>` | Just generate + save a new sub wallet (no funding) |
| `/sendval <label> <amount>` | Send $VALORA **main → sub** (auto-creates the sub's token account) |
| `/sendsol <label> <amount>` | Send SOL **main → sub** (needed before a sub can `/sweep`, to pay its own tx fee) |
| `/sweep <label> [leave]` | Sweep $VALORA **sub → main**, leaving `leave` behind (default 100 so the sub keeps playing; `0` drains a retired sub) |

**Typical flow:** `/subacc trader1` → approve → done. To pull profit back later:
`/sendsol trader1 0.002` (one-time, so it can pay the fee) then
`/sweep trader1`.

> **Requirements:** your **main** wallet needs enough $VALORA to fund each sub
> (≥100 each) plus a little SOL to pay the transfer + token-account-creation fees.

All gameplay commands accept an optional wallet label (e.g. `/status main`,
`/log trader1`); the default is **all** wallets.

**Recommended first run:** keep *Safe-test mode* ON, tap *Start farming*, watch
the *Activity log*. When you're happy, turn *Safe-test mode* OFF to play for real.

---

## 🔒 Safety model

- **`MODE=observe`** by default — connects and watches, sends no writes.
- **`DRY_RUN=true`** by default — risky writes are logged, not sent.
- **Confirmation gate** — token transfers, withdrawals, marketplace buys, trades,
  destroys and stat resets all require explicit Telegram approval.
- **Single-instance lock** — prevents two copies running at once.
- **Kill-switch** — `/stop` halts everything immediately.

Never commit your `.env` or `data/wallets.json` — they are git-ignored by default.

---

## 🧱 Architecture

```
src/
  config.js            environment + constants
  util/                logger, jitter/backoff, shard routing, single-instance lock
  wallet/              key loading, message/tx signing, multi-wallet store
  auth/                wallet sign-in, JWT cache & refresh
  net/                 REST client, room client (reconnect bus), Solana RPC,
                       dependency-free on-chain client (SOL + Token-2022 transfers)
  game/                world model, combat, jobs, economy, progression
  brain/               ROI-gated activity scheduler
  safety/              modes, dry-run, kill-switch, confirmation gates
  state/              save manager (optimistic lock), key-value store
  multi/               account-fleet manager (generate / fund / sweep / launch subs)
  telegram/            owner-only control UI + notifications
  Agent.js             one wallet's full runtime
  index.js             boot
```

## 🧪 Tests

```bash
npm test
```

---

## 📄 License

MIT
