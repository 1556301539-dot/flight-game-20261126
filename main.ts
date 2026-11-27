// main.ts — the hand-in program for Ember Watch (Node 22, standard
// library only). It takes the game in game/ and the screenshots in
// screenshots/, copies them to the output directory, and writes the dossier
// the judge reads, using the vendored make.fun library. Run it anywhere
// with MAKEFUN_OUTPUT_DIR set; inside the grader /output is the target.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where the repository lives, and where the hand-in goes.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function countFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    total += statSync(full).isDirectory() ? countFiles(full) : 1;
  }
  return total;
}

function handIn() {
  const gameDir = join(repoRoot, 'game');
  const shotsDir = join(repoRoot, 'screenshots');
  const gameOut = join(outputDir, 'game');
  const shotsOut = join(outputDir, 'screenshots');

  mkdirSync(outputDir, { recursive: true });
  cpSync(gameDir, gameOut, { recursive: true });
  mkdirSync(shotsOut, { recursive: true });
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, shotsOut, { recursive: true });
  }

  // The scorer's own caps, so a local run refuses what the gate refuses:
  // at most 4 screenshots of 256 KiB, at most 993 game files totalling
  // 48 MiB, no game path over 1,000 bytes, dossier text capped at 160 KiB.
  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);

  const shotCount = existsSync(shotsOut) ? readdirSync(shotsOut).length : 0;
  console.log(
    'handed in ' + countFiles(gameOut) + ' game files and ' + shotCount +
    ' screenshots; dossier.json is ' + Buffer.byteLength(dossier) + ' bytes',
  );
}

handIn();
