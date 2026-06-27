import { Client } from 'colyseus.js';
const TOKEN = process.env.VALORA_JWT;
const c = new Client('wss://valora.gg/play');
if (c.http) c.http.authToken = TOKEN;
const room = await c.joinOrCreate('map', { mapId: 'city', shardId: 'prime', token: TOKEN, spectate: false, queue: false });
console.log('joined', room.sessionId);
for (const t of ['hdv_config', 'hdv_listings', 'hdv_result', 'hdv_sold', 'econ_result']) {
  room.onMessage(t, (m) => console.log(t, '=', JSON.stringify(m).slice(0, 300)));
}
// browse fish_gudgeon to see token prices
room.send('hdv_browse', { itemId: 'fish_gudgeon', reqId: 1 });
await new Promise((r) => setTimeout(r, 2500));
// try listing 1 fish_gudgeon for token at a small unit price
room.send('hdv_list', { itemId: 'fish_gudgeon', qty: 1, unitPrice: 1, currency: 'token', reqId: 2 });
await new Promise((r) => setTimeout(r, 3000));
// also try gold listing for comparison
room.send('hdv_list', { itemId: 'fish_gudgeon', qty: 1, unitPrice: 5, currency: 'gold', reqId: 3 });
await new Promise((r) => setTimeout(r, 3000));
room.leave();
process.exit(0);
