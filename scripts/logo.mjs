/* eslint-disable no-console -- a script reports to its terminal */
// Prepares the IRCA logo for every app that shows it. Run with `npm run gen:logo`.
//
// The source is a 447px JPEG of the mark on pure white (assets/logo). Three
// things are wrong with using it directly:
//
//  - The white square shows as a patch against the off-white paper. Compositing
//    it over a coloured canvas does nothing, because a JPEG has no alpha: the
//    white is opaque pixels, not absence. The white has to be keyed out.
//  - It carries a wide white margin, so the mark renders smaller than the box
//    it occupies and is awkward to align.
//  - JPEG is the wrong codec for a logo: ringing around the lettering, at a
//    larger size than WebP needs.
//
// So: trim the margin, key the white to transparent with a soft ramp so the
// anti-aliased edges stay smooth, and emit WebP with alpha. Transparent means
// the one file works on the paper, on a white card and on the dark panel.
//
// The portal also gets a dark-theme copy. The mark's lettering is near-black,
// which all but disappears on the dark panel, so in that copy the grey and
// black are lifted to the paper colour while the orange — the part that
// carries the brand — is left exactly as it is.
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...parts) => join(root, ...parts);

const SRC = at('assets/logo/irca-source.jpg');

// Pixels at or above OPAQUE_AT are background and go fully transparent; at or
// below SOLID_AT they are mark and stay. Between the two the alpha ramps, which
// is what keeps the curved lettering from going jagged.
const OPAQUE_AT = 250;
const SOLID_AT = 238;

/** The paper colour the dark theme uses for text (--fg in globals.css). */
const DARK_THEME_INK = { r: 242, g: 239, b: 233 };

const trimmed = await sharp(SRC).trim({ threshold: 12 }).toBuffer();

const { data, info } = await sharp(trimmed)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  // How close to white this pixel is, judged by its darkest channel: a
  // saturated orange has a low blue channel and so survives, while a grey that
  // is merely light does not get punched out unless it is nearly white.
  const darkest = Math.min(data[i], data[i + 1], data[i + 2]);
  if (darkest >= OPAQUE_AT) data[i + 3] = 0;
  else if (darkest > SOLID_AT) {
    data[i + 3] = Math.round(255 * (1 - (darkest - SOLID_AT) / (OPAQUE_AT - SOLID_AT)));
  }
}

const keyed = await sharp(data, { raw: info }).png().toBuffer();

// Square it off with a little breathing room, so the mark can be centred in a
// circle or a rounded box without measuring it every time.
const side = Math.max(info.width, info.height);
const pad = Math.round(side * 0.05);
const canvas = side + pad * 2;

const square = (buffer) =>
  sharp(buffer).resize(canvas, canvas, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

/** The same mark with its near-black lettering lifted, for a dark panel. */
async function forDarkPanel(buffer) {
  const { data: pixels, info: shape } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const colourful = Math.max(r, g, b) - Math.min(r, g, b);
    // Grey or black, rather than the orange: repaint it in the theme's ink.
    if (colourful < 40 && Math.max(r, g, b) < 170) {
      pixels[i] = DARK_THEME_INK.r;
      pixels[i + 1] = DARK_THEME_INK.g;
      pixels[i + 2] = DARK_THEME_INK.b;
    }
  }
  return sharp(pixels, { raw: shape }).png().toBuffer();
}

const written = [];

async function webp(buffer, path) {
  await sharp(buffer).webp({ quality: 84, alphaQuality: 100 }).toFile(at(path));
  written.push(path);
}

/** Browser tab and Android home screen. PNG on white, because an icon with a
 *  transparent ground disappears against a dark tab strip. */
async function icon(path) {
  await sharp(keyed)
    .resize(176, 176, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 255, g: 255, b: 255 } })
    .png({ compressionLevel: 9 })
    .toFile(at(path));
  written.push(path);
}

const light = await square(keyed).toBuffer();
const dark = await square(await forDarkPanel(light)).toBuffer();

await webp(light, 'apps/registration/public/logo/irca.webp');
await icon('apps/registration/src/app/icon.png');
await webp(light, 'apps/portal/public/logo/irca.webp');
await webp(dark, 'apps/portal/public/logo/irca-dark.webp');
await icon('apps/portal/src/app/icon.png');

for (const path of written) {
  console.log(path.padEnd(42), statSync(at(path)).size.toString().padStart(7), 'bytes');
}
console.log(`mark is ${canvas}x${canvas} after trimming (source was 447x447)`);
