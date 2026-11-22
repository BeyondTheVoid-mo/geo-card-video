import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { resolveChrome } from "./lib/chrome.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, "index.html");
const OUT = process.argv[2] || path.join(__dirname, "geo-60s.mp4");
const FPS = 30;
let DURATION = 62;
let TOTAL = Math.round(DURATION * FPS);
const WIDTH = 1080;
const HEIGHT = 1920;
const PREVIEWS = (process.argv[3] === "preview");
const PREVIEW_TIMES = [0, 2.2, 7.0, 9.5, 10.9, 16.5, 28.5, 40.5, 48, 51.5, 56.5, 58.5, 61.2];

const browser = await puppeteer.launch({
  executablePath: resolveChrome(),
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--font-render-hinting=none",
    "--disable-gpu",
    `--window-size=${WIDTH},${HEIGHT}`,
    "--force-device-scale-factor=1",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
await page.goto("file://" + HTML, { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForFunction(() => typeof window.seek === "function");
DURATION = await page.evaluate(() => window.DURATION || 62);
TOTAL = Math.round(DURATION * FPS);


if (PREVIEWS) {
  const dir = path.join(__dirname, "previews");
  await mkdir(dir, { recursive: true });
  for (const t of PREVIEW_TIMES) {
    await page.evaluate((t) => window.seek(t), t);
    await new Promise((r) => setTimeout(r, 40));
    const dest = path.join(dir, `t${t.toFixed(1).replace(".", "-")}.png`);
    await page.screenshot({ path: dest, type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    console.log("preview", dest);
  }
  await browser.close();
  process.exit(0);
}

console.log(`Rendering ${TOTAL} frames to ${OUT}`);

const ff = spawn("ffmpeg", [
  "-y",
  "-f", "image2pipe",
  "-framerate", String(FPS),
  "-i", "pipe:0",
  "-f", "lavfi",
  "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-preset", "medium",
  "-crf", "16",
  "-c:a", "aac",
  "-b:a", "96k",
  "-shortest",
  "-movflags", "+faststart",
  OUT,
], { stdio: ["pipe", "inherit", "inherit"] });

let failed = false;
ff.on("error", (e) => { console.error(e); failed = true; });

for (let i = 0; i < TOTAL; i++) {
  const t = i / FPS;
  await page.evaluate((t) => window.seek(t), t);
  const buf = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });
  const ok = ff.stdin.write(buf);
  if (!ok) {
    await new Promise((res) => ff.stdin.once("drain", res));
  }
  if (i % 60 === 0) console.log(`frame ${i}/${TOTAL} t=${t.toFixed(2)}s bytes=${buf.length}`);
}

ff.stdin.end();
const code = await new Promise((resolve) => ff.on("close", resolve));
await browser.close();
if (code !== 0 || failed) {
  console.error("ffmpeg exited", code);
  process.exit(code || 1);
}
console.log("done", OUT);
