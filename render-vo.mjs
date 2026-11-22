import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, "vo.html");
const AUDIO = path.join(__dirname, "audio/voiceover.wav");
const OUT = process.argv[2] || path.join(__dirname, "geo-60s-vo.mp4");
const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;
const MODE = process.argv[3] || "render"; // render | preview
const PREVIEW_TIMES = [
  0.3, 1.2, 3.5, 6.5, 8.2, 10.2, 12.5, 14.5,
  16.5, 19.5, 24.5, 28.5, 32.5,
  36.5, 39.0, 41.8, 44.5, 47.5, 51.5,
  55.5, 58.5, 61.5, 64.5, 67.0, 70.5, 75.0,
  80.0, 82.5, 85.2, 87.2, 90.2,
  94.0, 97.2, 100.0, 102.2
];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
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
const DURATION = await page.evaluate(() => window.DURATION || 102.634);
const TOTAL = Math.ceil(DURATION * FPS);

if (MODE === "preview") {
  const dir = path.join(__dirname, "vo-previews");
  await mkdir(dir, { recursive: true });
  for (const t of PREVIEW_TIMES) {
    await page.evaluate((t) => window.seek(t), t);
    await new Promise((r) => setTimeout(r, 30));
    const dest = path.join(dir, `t${t.toFixed(1).replace(".", "-")}.png`);
    await page.screenshot({ path: dest, type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    console.log("preview", dest);
  }
  await browser.close();
  process.exit(0);
}

console.log(`Rendering ${TOTAL} frames (${DURATION}s) to ${OUT}`);

const ff = spawn("ffmpeg", [
  "-y",
  "-f", "image2pipe",
  "-framerate", String(FPS),
  "-i", "pipe:0",
  "-i", AUDIO,
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-preset", "medium",
  "-crf", "16",
  "-c:a", "aac",
  "-b:a", "192k",
  "-ac", "1",
  "-ar", "48000",
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
  if (!ok) await new Promise((res) => ff.stdin.once("drain", res));
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
