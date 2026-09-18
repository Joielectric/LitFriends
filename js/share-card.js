// The picture social sites show when a page here is linked.
//
// Facebook, X, Discord, Bluesky, Reddit and iMessage all read the same Open
// Graph tags, and all of them want a finished raster image at a URL. None of
// them runs the page's JavaScript, so the card cannot be drawn at view time —
// it is composed here, in the Content Manager, and the finished picture is
// uploaded and remembered on the profile.
//
// 1200x630 is the size every platform crops from. Anything important stays
// inside the middle band, because Twitter's summary_large_image and Facebook's
// feed crop the top and bottom differently.
//
//   drawShareCard(canvas, { banner, avatar, logo, name, tagline, ... })
//
// The look follows the site: the banner under the same wash the page lays over
// it, the name in Cinzel, the tagline in Cormorant Garamond italic, and the
// logo in the bottom right corner.

export const CARD_W = 1200;
export const CARD_H = 630;

const MARGIN = 76;

/** Loads an image for the canvas, or resolves null if it will not load.
 *
 *  crossOrigin matters: an image from another origin without CORS headers
 *  taints the canvas, and a tainted canvas refuses toBlob(). Asking for it
 *  anonymously means a same-origin upload always works, and a hotlinked
 *  picture either serves CORS headers or is skipped rather than silently
 *  poisoning the export. */
export function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    // Only cross-origin sources need the attribute, and setting it on a
    // same-origin URL costs nothing.
    if (/^https?:\/\//i.test(src) && !src.startsWith(location.origin)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The fonts must be in the face set before the first fillText, or the canvas
 *  quietly draws the fallback and the card comes out wrong. */
export async function ensureFonts() {
  if (!document.fonts) return;
  const wanted = [
    '600 76px Cinzel', '600 20px Cinzel',
    'italic 400 42px "Cormorant Garamond"', '400 30px "Cormorant Garamond"',
  ];
  await Promise.all(wanted.map((f) => document.fonts.load(f).catch(() => {})));
  await document.fonts.ready;
}

/** Scale to fill the box and crop the overflow — CSS background-size: cover. */
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Letter-spaced text. Canvas letterSpacing is not everywhere yet, so step the
 *  string glyph by glyph and return where it ended. */
function tracked(ctx, text, x, y, tracking) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return cx - tracking;
}

/** Width of a string once it has been letter-spaced, which is what tracked()
 *  will actually draw — measureText alone under-reports it and the line spills
 *  past the margin. */
function trackedWidth(ctx, text, tracking) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return w - tracking;
}

function wrapLines(ctx, text, maxWidth, tracking = 0) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (trackedWidth(ctx, trial, tracking) <= maxWidth || !cur) cur = trial;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return Number.isFinite(n) && full.length === 6
    ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    : { r: 91, g: 141, b: 232 };
};

/** Draws the card. Everything is optional: a profile with no banner still gets
 *  a usable card, it just sits on the accent colour instead of a picture. */
export async function drawShareCard(canvas, opts = {}) {
  const {
    banner, avatar, logo,
    name = '', tagline = '', eyebrow = 'EROTIC AUDIO',
    accent = '#5b8de8',
    washTop = 'rgba(21,26,42,0.60)',
    washBottom = 'rgba(8,11,20,0.94)',
  } = opts;

  await ensureFonts();
  const [bgImg, avImg, logoImg] = await Promise.all([
    loadImage(banner), loadImage(avatar), loadImage(logo),
  ]);

  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const { r, g, b } = hexToRgb(accent);
  const accentRgb = `${r},${g},${b}`;

  // ── Background ──
  ctx.fillStyle = '#0b0e18';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (bgImg) drawCover(ctx, bgImg, 0, 0, CARD_W, CARD_H);

  // The same wash the live page lays over its banner, so the card and the page
  // it opens read as one thing.
  const wash = ctx.createLinearGradient(0, 0, 0, CARD_H);
  wash.addColorStop(0, washTop);
  wash.addColorStop(1, washBottom);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // A pool of shadow under the text, so words stay readable whatever the
  // picture happens to be doing behind them.
  const pool = ctx.createRadialGradient(CARD_W * 0.28, CARD_H * 0.55, 40, CARD_W * 0.28, CARD_H * 0.55, 620);
  pool.addColorStop(0, 'rgba(0,0,0,0.62)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // ── Avatar ──
  // With one, the card reads as a person; without, the words take the width.
  const AV = 286;
  let textX = MARGIN;
  if (avImg) {
    const ax = MARGIN + 12;
    const ay = (CARD_H - AV) / 2;
    ctx.save();
    ctx.shadowColor = `rgba(${accentRgb},0.55)`;
    ctx.shadowBlur = 46;
    ctx.beginPath();
    ctx.arc(ax + AV / 2, ay + AV / 2, AV / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0e18';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + AV / 2, ay + AV / 2, AV / 2, 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, avImg, ax, ay, AV, AV);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(ax + AV / 2, ay + AV / 2, AV / 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${accentRgb},0.75)`;
    ctx.lineWidth = 3;
    ctx.stroke();

    textX = ax + AV + 62;
  }

  const LOGO_W = 150;
  const textW = CARD_W - textX - MARGIN;
  // The logo sits low and right, so only the lines that reach down there have
  // to give way to it — the name keeps the full width.
  const lowW = logoImg ? CARD_W - MARGIN - LOGO_W - 34 - textX : textW;
  ctx.textBaseline = 'alphabetic';

  // ── Eyebrow ──
  let y = avImg ? 196 : 158;
  if (eyebrow) {
    ctx.font = '600 20px Cinzel, serif';
    ctx.fillStyle = `rgb(${accentRgb})`;
    tracked(ctx, eyebrow.toUpperCase(), textX, y, 6);
    y += 56;
  }

  // ── Name ──
  // A long name steps down a size rather than wrapping into three cramped
  // lines. Two is the most the card has room for under the eyebrow.
  const nameText = String(name || '').toUpperCase();
  let nameSize = 76;
  let nameLines = [];
  for (;;) {
    ctx.font = `600 ${nameSize}px Cinzel, serif`;
    nameLines = wrapLines(ctx, nameText, textW, nameSize * 0.09);
    if (nameLines.length <= 2 || nameSize <= 38) break;
    nameSize -= 4;
  }
  ctx.fillStyle = '#eef4ff';
  for (const line of nameLines.slice(0, 2)) {
    tracked(ctx, line, textX, y + nameSize * 0.78, nameSize * 0.09);
    y += nameSize + 12;
  }

  // ── Divider ──
  y += 22;
  ctx.fillStyle = `rgba(${accentRgb},0.85)`;
  ctx.fillRect(textX, y, 84, 2);
  y += 30;

  // ── Catchphrase ──
  if (tagline) {
    // A catchphrase reads best on one line, so step the size down looking for
    // one before accepting a wrap. Below 28px it stops being worth it and two
    // lines are the better trade.
    const fit = (size) => {
      ctx.font = `italic 400 ${size}px "Cormorant Garamond", Georgia, serif`;
      return wrapLines(ctx, tagline, lowW);
    };
    let phraseSize = 42;
    let lines = fit(phraseSize);
    while (lines.length > 1 && phraseSize > 28) {
      phraseSize -= 2;
      lines = fit(phraseSize);
    }
    if (lines.length > 1) lines = fit((phraseSize = 34));

    ctx.fillStyle = 'rgba(214,223,240,0.96)';
    for (const line of lines.slice(0, 3)) {
      y += phraseSize;
      ctx.fillText(line, textX, y);
      y += 12;
    }
  }

  // ── Logo, bottom right ──
  if (logoImg) {
    const lw = LOGO_W;
    const lh = Math.round(lw * logoImg.height / logoImg.width);
    const lx = CARD_W - MARGIN - lw;
    const ly = CARD_H - 60 - lh;
    ctx.save();
    // A halo, so a dark mark keeps its edge against a dark background.
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 30;
    ctx.drawImage(logoImg, lx, ly, lw, lh);
    ctx.restore();
    ctx.drawImage(logoImg, lx, ly, lw, lh);
  }

  return canvas;
}

/** JPEG rather than WebP: every scraper renders it, and several still will not
 *  render WebP. Quality is high because the card is mostly type. */
export function cardToBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the card'))),
        'image/jpeg',
        0.92,
      );
    } catch (err) {
      // A cross-origin picture without CORS headers taints the canvas and the
      // export throws here rather than when it was drawn.
      reject(new Error(
        'One of the pictures is hosted somewhere that will not allow it to be ' +
        'exported. Upload the avatar and banner to this site and try again.',
      ));
    }
  });
}
