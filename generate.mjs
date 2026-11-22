#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyBoards, readBoards } from "./lib/boards.mjs";
import { readCopy } from "./lib/copy.mjs";
import { CopyError } from "./lib/errors.mjs";
import { renderHtml } from "./lib/html.mjs";
import { assertMp4 } from "./lib/audio-check.mjs";
import { resolveBoards, resolveInput, resolveOutput } from "./lib/paths.mjs";
import { renderVideo } from "./lib/render-video.mjs";
import { synthesizeTimeline, voiceConfig } from "./lib/tts.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const USAGE = `用法：node generate.mjs input/文案.md [--out output/文案.mp4] [--boards input/文案.boards.json]

把 UTF-8 的 .txt 或 .md 放进 input/。
默认中文男声 zh-CN-YunxiNeural，按合成音频的真实时长排版，输出 1080x1920 H.264/AAC 到 output/。
这是不调用大模型的基础版。Cursor、Codex、Claude Code 的精修步骤见 AGENTS.md。`;

function parseArgs(argv) {
  let inputArg = null;
  let outputArg = null;
  let boardsArg = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      outputArg = argv[index + 1];
      if (!outputArg) throw new CopyError(`缺少 --out 的文件名。\n${USAGE}`);
      index += 1;
    } else if (arg === "--boards") {
      boardsArg = argv[index + 1];
      if (!boardsArg) throw new CopyError(`缺少 --boards 的文件名。\n${USAGE}`);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      throw new CopyError(USAGE);
    } else if (arg.startsWith("-")) {
      throw new CopyError(`不能识别的参数 ${arg}\n${USAGE}`);
    } else if (!inputArg) {
      inputArg = arg;
    } else {
      throw new CopyError(`只能指定一个文案文件。\n${USAGE}`);
    }
  }
  if (!inputArg) throw new CopyError(USAGE);
  return { inputArg, outputArg, boardsArg };
}

function relative(file) {
  return path.relative(root, file) || path.basename(file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolveInput(root, args.inputArg);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = resolveOutput(root, args.outputArg || path.join("output", `${base}.mp4`));
  let story = readCopy(inputPath);
  if (args.boardsArg) story = applyBoards(story, readBoards(resolveBoards(root, args.boardsArg)));
  const voice = voiceConfig();
  const workDir = path.join(root, "output", ".work", base);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const spoken = await synthesizeTimeline(story.cues, workDir, voice);
  const chapters = story.chapters.map((chapter, index) => {
    const first = spoken.cues.find((cue) => cue.chapter === index);
    return { title: chapter.title, start: first ? first.start : 0 };
  });
  const model = {
    title: story.title,
    duration: spoken.duration,
    chapters,
    cues: spoken.cues.map((cue) => ({
      start: cue.start,
      end: cue.end,
      text: cue.text,
      layout: cue.layout,
      chapter: cue.chapter,
      listItems: cue.listItems,
      listIndex: cue.listIndex,
    })),
  };
  const htmlPath = path.join(workDir, "page.html");
  const tempMp4 = path.join(workDir, "out.mp4");
  const timelinePath = outputPath.replace(/\.mp4$/i, ".timeline.json");
  fs.writeFileSync(htmlPath, renderHtml(model), "utf8");
  let published = false;
  try {
    await renderVideo({ htmlPath, audioPath: spoken.wav, outPath: tempMp4, fps: 30 });
    const checked = await assertMp4(tempMp4);
    fs.copyFileSync(tempMp4, outputPath);
    published = true;
    fs.writeFileSync(timelinePath, `${JSON.stringify({
      source: relative(inputPath),
      output: relative(outputPath),
      voice: voice.voice,
      rate: voice.rate,
      pitch: voice.pitch,
      duration: checked.duration,
      audio: { maxVolume: checked.maxVolume, meanVolume: checked.meanVolume, sampleRate: checked.sampleRate, channels: checked.channels },
      chapters,
      cues: model.cues,
    }, null, 2)}\n`, "utf8");
    fs.rmSync(workDir, { recursive: true, force: true });
    console.log(`已写出 ${relative(outputPath)}`);
    console.log(`时长 ${checked.duration.toFixed(3)} 秒，音量峰值 ${checked.maxVolume} dB，平均 ${checked.meanVolume} dB`);
    console.log(`时间轴 ${relative(timelinePath)}`);
  } catch (error) {
    fs.rmSync(tempMp4, { force: true });
    if (published) {
      fs.rmSync(outputPath, { force: true });
      fs.rmSync(timelinePath, { force: true });
    }
    if (error && typeof error === "object") error.expose = true;
    throw error;
  }
}

main().catch((error) => {
  if (error && error.expose) console.error(error.message);
  else console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
