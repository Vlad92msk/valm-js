// Rasterizes scripts/og.svg → public/og.png (1200×630) for social link previews.
// Run: yarn og
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const svgPath = new URL('./og.svg', import.meta.url);
const outPath = new URL('../public/og.png', import.meta.url);

const svg = readFileSync(svgPath);
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true },
});
const png = resvg.render().asPng();
writeFileSync(outPath, png);

console.log(`wrote ${fileURLToPath(outPath)} (${(png.length / 1024).toFixed(1)} KB)`);
