// Frani Split — UCT ↔ base-unit conversion and even-split maths (BigInt).

export function toBaseUnits(whole, decimals = 18) {
  const s = String(whole).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid amount: ${whole}`);
  const [i, f = ''] = s.split('.');
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(i) * 10n ** BigInt(decimals) + BigInt(frac || '0')).toString();
}

export function fromBaseUnits(base, decimals = 18) {
  const v = BigInt(String(base));
  const unit = 10n ** BigInt(decimals);
  const whole = v / unit;
  const frac = (v % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// Split a total (base units) evenly across `n` shares, distributing the
// remainder one base-unit at a time to the earliest shares so the sum is
// exact. Returns an array of n base-unit strings.
export function evenShares(totalBase, n) {
  const total = BigInt(totalBase);
  const count = BigInt(n);
  if (count <= 0n) throw new Error('need at least one share');
  const base = total / count;
  let remainder = total % count;
  const shares = [];
  for (let k = 0n; k < count; k++) {
    const extra = remainder > 0n ? 1n : 0n;
    if (remainder > 0n) remainder -= 1n;
    shares.push((base + extra).toString());
  }
  return shares;
}

export function sumBase(list) {
  return list.reduce((acc, v) => acc + BigInt(v), 0n).toString();
}
