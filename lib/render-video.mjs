import { spawn } from "child_process";
import puppeteer from "puppeteer-core";
import { resolveChrome } from "./chrome.mjs";

export async function renderVideo({ htmlPath, audioPath, outPath, fps = 30 }) {
  const browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--font-render-hinting=none",
      "--disable-gpu",
      "--window-size=1080,1920",
      "--force-device-scale-factor=1",
    ],
  });
  let ff;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForFunction(() => typeof window.seek === "function" && window.DURATION > 0);
    const duration = await page.evaluate(() => window.DURATION);
    const total = Math.ceil(duration * fps);
    console.log(`正在渲染 ${total} 帧，时长 ${duration.toFixed(2)} 秒`);
    let ffErr = "";
    ff = spawn("ffmpeg", [
      "-y",
      "-f", "image2pipe",
      "-framerate", String(fps),
      "-i", "pipe:0",
      "-i", audioPath,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "veryfast",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ac", "1",
      "-ar", "48000",
      "-movflags", "+faststart",
      outPath,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    ff.stderr.on("data", (chunk) => {
      ffErr = (ffErr + chunk).slice(-8000);
    });
    ff.stdin.on("error", () => {});
    const closed = new Promise((resolve, reject) => {
      ff.on("error", reject);
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg 合成失败，退出码 ${code}\n${ffErr}`));
      });
    });
    for (let index = 0; index < total; index += 1) {
      await page.evaluate((time) => window.seek(time), index / fps);
      const frame = await page.screenshot({
        type: "jpeg",
        quality: 82,
        clip: { x: 0, y: 0, width: 1080, height: 1920 },
      });
      if (!ff.stdin.write(frame)) await new Promise((resume) => ff.stdin.once("drain", resume));
      if (index % 30 === 0) console.log(`渲染帧 ${index}/${total}`);
    }
    ff.stdin.end();
    await closed;
  } finally {
    if (ff && ff.exitCode === null && !ff.killed) ff.kill("SIGKILL");
    await browser.close();
  }
}
