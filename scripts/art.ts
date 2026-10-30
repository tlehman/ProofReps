// Renders every image the app ships from one composition: a turnstile ⊢ and a
// flexed biceps (art/arm.svg, from Noto Emoji, Apache-2.0), in headless Chrome.
//   app/assets/icon.png, favicon.png       Expo's icon and favicon
//   app/public/icons/*                      PWA, Apple touch and maskable icons
//   app/public/og.png                       the 1200×630 link preview card
// Run after changing anything in art/: bun scripts/art.ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome } from "./headless-lean";

const ROOT = join(import.meta.dir, "..");
const CHROME = findChrome();
const arm = readFileSync(join(ROOT, "art/arm.svg"), "utf8")
  .replace(/<\?xml[^>]*>/, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");

const GRADIENT = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b3bc4"/><stop offset="1" stop-color="#1a1446"/></linearGradient>`;

// The mark on a 1024 canvas. `scale` shrinks it toward the center (maskable
// icons must keep everything inside the middle 80%).
const mark = (scale: number) => `
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <g stroke="#ffffff" stroke-width="84" stroke-linecap="round" fill="none">
      <path d="M150 292 V732"/><path d="M150 512 H405"/>
    </g>
    <g transform="translate(440 262) scale(3.95)">${arm}</g>
  </g>`;

const icon = (opts: { bg: boolean; scale: number; radius?: number }) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>${GRADIENT}</defs>
  ${opts.bg ? `<rect width="1024" height="1024" rx="${opts.radius ?? 0}" fill="url(#bg)"/>` : ""}
  ${mark(opts.scale)}
</svg>`;

const og = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>${GRADIENT}</defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(70 115) scale(0.39)">
    <rect width="1024" height="1024" rx="230" fill="#14102e" opacity="0.35"/>
    ${mark(0.86)}
  </g>
  <g font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" fill="#ffffff">
    <text x="510" y="280" font-size="112" font-weight="800" letter-spacing="-2">ProofReps</text>
    <text x="514" y="352" font-size="38" font-weight="500" opacity="0.92">Daily reps in Lean 4</text>
    <text x="514" y="400" font-size="38" font-weight="500" opacity="0.92">and formal methods</text>
    <text x="514" y="490" font-size="27" font-weight="600" fill="#ffca28">Checked by real Lean, in your browser</text>
  </g>
</svg>`;

const tmp = mkdtempSync(join(tmpdir(), "proofreps-art-"));
function render(svg: string, out: string, w: number, h: number, transparent = false) {
  const html = join(tmp, "page.html");
  writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`);
  const args = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${join(tmp, "profile")}`, `--window-size=${w},${h}`, `--screenshot=${out}`];
  if (transparent) args.push("--default-background-color=00000000");
  const r = Bun.spawnSync([...args, `file://${html}`], { stdout: "ignore", stderr: "ignore" });
  if (r.exitCode !== 0) throw new Error(`chrome failed for ${out}`);
  console.log(`${out.replace(ROOT + "/", "")}  ${w}×${h}`);
}

mkdirSync(join(ROOT, "app/public/icons"), { recursive: true });
const full = icon({ bg: true, scale: 0.86 });
const rounded = icon({ bg: true, scale: 0.86, radius: 230 });
render(full, join(ROOT, "app/assets/icon.png"), 1024, 1024);
render(rounded, join(ROOT, "app/assets/favicon.png"), 64, 64, true);
render(full, join(ROOT, "app/public/icons/apple-touch-icon.png"), 180, 180);
render(rounded, join(ROOT, "app/public/icons/icon-192.png"), 192, 192, true);
render(rounded, join(ROOT, "app/public/icons/icon-512.png"), 512, 512, true);
render(icon({ bg: true, scale: 0.66 }), join(ROOT, "app/public/icons/maskable-512.png"), 512, 512);
render(og, join(ROOT, "app/public/og.png"), 1200, 630);
writeFileSync(join(ROOT, "app/public/icons/icon.svg"), rounded);
console.log("app/public/icons/icon.svg");
rmSync(tmp, { recursive: true, force: true });
