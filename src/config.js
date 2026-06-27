import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  base: process.env.VALORA_BASE || 'https://valora.gg/play',
  mode: process.env.MODE || 'observe',
  dryRun: String(process.env.DRY_RUN || 'true') === 'true',
  cluster: process.env.SOLANA_CLUSTER || 'mainnet-beta',

  wallets: {
    inline: process.env.WALLETS,
    file: process.env.WALLETS_FILE || 'data/wallets.json',
  },

  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    owners: (process.env.TELEGRAM_OWNER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number),
  },

  pacing: {
    actionMin: num(process.env.ACTION_MIN_DELAY, 800),
    actionMax: num(process.env.ACTION_MAX_DELAY, 2600),
    reconnectMin: num(process.env.RECONNECT_MIN_MS, 2000),
    reconnectMax: num(process.env.RECONNECT_MAX_MS, 15000),
  },

  twoCaptchaKey: process.env.TWOCAPTCHA_API_KEY || '',
};

export const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
