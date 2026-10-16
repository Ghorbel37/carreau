// Builds one of the two versions of the game from www/ into dist/<target>/.
//   node scripts/build.js web   → dist/web  (GitHub Pages: store promos, offline cache)
//   node scripts/build.js app   → dist/app  (Play Store via Capacitor: no promos, no service worker)
// VERSION (e.g. 1.1.12) and PLAY_LIVE=1 come from the environment.
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!['web', 'app'].includes(target)) {
  console.error('Usage: node scripts/build.js web|app');
  process.exit(1);
}
const version = process.env.VERSION || 'dev';
const playLive = process.env.PLAY_LIVE === '1';
const src = path.join(__dirname, '..', 'www');
const out = path.join(__dirname, '..', 'dist', target);

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });

fs.writeFileSync(path.join(out, 'version.js'),
  `window.CARREAU_VERSION = ${JSON.stringify(version)};\n` +
  `window.CARREAU_PLATFORM = ${JSON.stringify(target)};\n` +
  `window.CARREAU_PLAY_LIVE = ${playLive};\n`);

if (target === 'web') {
  // A new offline-cache name per build, so browsers pick up the new version.
  const sw = path.join(out, 'sw.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const CACHE = '[^']*'/, `const CACHE = 'carreau-${version}'`));
} else {
  // The app ships its files; no service worker or web manifest needed.
  ['sw.js', 'manifest.webmanifest'].forEach(f => fs.rmSync(path.join(out, f), { force: true }));
  const index = path.join(out, 'index.html');
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace(/\s*<link rel="manifest"[^>]*>/, ''));
}
console.log(`Built ${target} v${version} → ${path.relative(process.cwd(), out)}`);
