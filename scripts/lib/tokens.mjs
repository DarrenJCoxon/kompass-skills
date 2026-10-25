// Turns a design-system tokens.json (the Kompass Education format) into CSS custom properties.
// The JSON stays the one source of truth; nothing here holds a design value of its own.
import { readFileSync } from 'node:fs';

export function tokensCss(jsonPath) {
  const t = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const colours = new Map((t.color?.tokens ?? []).map((c) => [c.name, c.value]));
  const resolveRef = (v) => { let s = String(v); for (let n = 0; n < 5 && /^\{.+\}$/.test(s); n++) s = colours.get(s.slice(1, -1)) ?? s; return s; };
  const vars = [];
  for (const [name, value] of colours) vars.push([name, resolveRef(value)]);
  for (const [name, value] of Object.entries(t.type?.families ?? {})) vars.push([`font-${name}`, value]);
  for (const group of ['spacing', 'radius', 'size', 'opacity', 'shadow']) for (const tok of t[group]?.tokens ?? []) vars.push([tok.name, tok.value]);
  return `/* Generated from ${t.name ?? 'design'} tokens.json by Kompass Skills. Do not edit; change the JSON. */\n:root {\n${vars.map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n}\n`;
}
