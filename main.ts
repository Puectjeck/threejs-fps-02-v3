// main.ts — hands the game in: copies game/ and screenshots/ from this
// repository into the output directory and writes the dossier the judge
// reads, using the kit's own library so the bytes match the gate's rebuild.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-threejs.ts';

const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(out, { recursive: true });
cpSync(join(import.meta.dirname, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(import.meta.dirname, 'screenshots'), join(out, 'screenshots'), { recursive: true });
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
}));
console.log(`NEON BREACH: PROTOCOL handed in to ${out}`);
