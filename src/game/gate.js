// Zone-gate check, mirroring the live client's gatePassesLive():
//   pass when our level meets the zone's minLevel and we are not blocked by an
//   active token-hold requirement.
// `result` is the server's gate_result:
//   { map, ok, minLevel, minHold, level, failLevel, failHold, tokenActive, fallback }
export function gatePasses(result, playerLevel = 1) {
  if (!result || result.fallback) return true; // no result (timeout) → let it try
  const minLevel = result.minLevel || 0;
  if (playerLevel < minLevel) return false;
  if (result.tokenActive && result.failHold) return false;
  return true;
}
