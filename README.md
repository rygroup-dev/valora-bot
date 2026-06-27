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
- **Multi-wallet** — run several wallets at once, each as an isolated agent.
- **Telegram control** — full English UI with inline buttons, live notifications
  (level-ups, gold gains, fights, disconnects), and a plain-language guide.
- **Anti-ban & safety-first** — human-like pacing/jitter, exponential backoff,
  automatic reconnects, a global kill-switch, and a single-instance guard so the
  bot can never accidentally run doubled.
- **Zero-mistake design** — test-driven (120+ tests), optimistic-locked saves,
  idempotent token transactions, and **mandatory Telegram approval for any action
  that spends tokens or gold**.

---

## 🚀 Install

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/rygroup-dev/valora-bot/main/install.sh | bash
```

This clones the repo into `~/valora-bot`, installs dependencies, and creates your
config files from the templates.

### Manual

```bash
git clone https://github.com/rygroup-dev/valora-bot.git
cd valora-bot
npm install
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

All commands accept an optional wallet label (e.g. `/status main`); the default
is **all** wallets. Any action that moves on-chain value asks you to **Approve**
or **Decline** first.

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
  net/                 REST client, room client (reconnect bus), Solana RPC
  game/                world model, combat, jobs, economy, progression
  brain/               ROI-gated activity scheduler
  safety/              modes, dry-run, kill-switch, confirmation gates
  state/              save manager (optimistic lock), key-value store
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
