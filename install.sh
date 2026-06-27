#!/usr/bin/env bash
# Valora Sentinel — one-line installer
#   curl -fsSL https://raw.githubusercontent.com/rygroup-dev/valora-bot/main/install.sh | bash
set -euo pipefail

REPO="https://github.com/rygroup-dev/valora-bot.git"
DIR="${VALORA_DIR:-$HOME/valora-bot}"

echo "🛡  Valora Sentinel installer"

command -v git >/dev/null 2>&1 || { echo "❌ git is required"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js (>=20) is required: https://nodejs.org"; exit 1; }

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js >= 20 required (found $(node -v))"; exit 1
fi

if [ -d "$DIR/.git" ]; then
  echo "📂 Updating existing install at $DIR"
  git -C "$DIR" pull --ff-only
else
  echo "📥 Cloning into $DIR"
  git clone "$REPO" "$DIR"
fi

cd "$DIR"
echo "📦 Installing dependencies…"
npm install --no-audit --no-fund

[ -f .env ] || { cp .env.example .env; echo "📝 Created .env"; }
[ -f data/wallets.json ] || { cp data/wallets.json.example data/wallets.json; echo "📝 Created data/wallets.json"; }

cat <<EOF

✅ Installed at: $DIR

Next steps:
  1. Edit  $DIR/data/wallets.json   — add your Solana wallet secret
  2. Edit  $DIR/.env                — set TELEGRAM_BOT_TOKEN + TELEGRAM_OWNER_IDS
  3. cd "$DIR" && npm run login     — verify wallet sign-in
  4. cd "$DIR" && npm start         — start the bot (observe mode by default)

Then open Telegram and send /menu.
EOF
