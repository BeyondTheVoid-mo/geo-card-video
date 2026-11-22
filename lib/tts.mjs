import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { CopyError } from "./errors.mjs";
import { run } from "./proc.mjs";
import { assertAudibleWav, wavDuration } from "./audio-check.mjs";

function token(name, value) {
  if (!/^[\w.+%-]{1,40}$/.test(value)) {
    throw new CopyError(`${name} 含有不能使用的字符。当前值已被拒绝。`);
  }
  return value;
}

export function voiceConfig() {
  return {
    voice: token("TTS_VOICE", process.env.TTS_VOICE || "zh-CN-YunxiNeural"),
    rate: token("TTS_RATE", process.env.TTS_RATE || "-8%"),
    pitch: token("TTS_PITCH", process.env.TTS_PITCH || "-3Hz"),
  };
}

function canImportEdgeTts() {
  const probe = spawnSync("python3", ["-c", "import edge_tts"], { stdio: "ignore" });
  return probe.status === 0;
}

export function resolveEdgeTts() {
  if (process.env.EDGE_TTS_BIN) {
    return { cmd: process.env.EDGE_TTS_BIN, prefix: [] };
  }
  const found = spawnSync("which", ["edge-tts"], { encoding: "utf8" });
  if (found.status === 0 && found.stdout.trim()) {
    return { cmd: found.stdout.trim(), prefix: [] };
  }
  const local = path.join(os.homedir(), ".local", "bin", "edge-tts");
  if (fs.existsSync(local)) return { cmd: local, prefix: [] };
  if (canImportEdgeTts()) return { cmd: "python3", prefix: ["-m", "edge_tts"] };
  throw new CopyError(
    "找不到 edge-tts。请先执行 pip install edge-tts。语音合成要联网访问微软语音服务；失败时不会输出无声视频。",
  );
}

async function silence(dest, seconds) {
  await run("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "anullsrc=r=48000:cl=mono",
    "-t", String(seconds),
    "-ac", "1",
    "-ar", "48000",
    "-c:a", "pcm_s16le",
    dest,
  ]);
}

async function synthesizeOne(text, destMp3, voice, edge) {
  const textFile = `${destMp3}.txt`;
  fs.writeFileSync(textFile, text, "utf8");
  try {
    await run(edge.cmd, [
      ...edge.prefix,
      "--voice", voice.voice,
      `--rate=${voice.rate}`,
      `--pitch=${voice.pitch}`,
      "--file", textFile,
      "--write-media", destMp3,
      "--no-progress",
    ], { timeoutMs: 90000 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CopyError(
      `语音合成失败。没有生成可用的声音，因此不会输出无声视频。请检查网络能否访问微软语音服务、edge-tts 是否已安装，以及音色 ${voice.voice} 是否可用。\n${detail}`,
    );
  } finally {
    fs.rmSync(textFile, { force: true });
  }
  if (!fs.existsSync(destMp3) || fs.statSync(destMp3).size < 128) {
    throw new CopyError("语音合成失败。edge-tts 没有写出音频文件，已停止。");
  }
}

async function toWav(mp3, wav) {
  try {
    await run("ffmpeg", ["-y", "-i", mp3, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", wav]);
  } catch (error) {
    throw new CopyError(`语音文件无法转成 WAV，已停止。\n${error.message}`);
  }
}

export async function synthesizeTimeline(cues, workDir, voice) {
  fs.mkdirSync(workDir, { recursive: true });
  const edge = resolveEdgeTts();
  const pieces = [];
  const timed = [];
  let cursor = 0;

  const head = path.join(workDir, "sil_head.wav");
  await silence(head, 0.4);
  const headDur = await wavDuration(head);
  pieces.push(head);
  cursor += headDur;

  for (let index = 0; index < cues.length; index += 1) {
    const mp3 = path.join(workDir, `seg_${index}.mp3`);
    const wav = path.join(workDir, `seg_${index}.wav`);
    console.log(`正在合成 ${index + 1}/${cues.length}：${cues[index].text}`);
    await synthesizeOne(cues[index].text, mp3, voice, edge);
    await toWav(mp3, wav);
    assertAudibleWav(wav, `第 ${index + 1} 句没有合成出有效声音`);
    const duration = await wavDuration(wav);
    timed.push({
      ...cues[index],
      start: round(cursor),
      end: round(cursor + duration),
    });
    pieces.push(wav);
    cursor += duration;
    if (index < cues.length - 1) {
      const gap = path.join(workDir, `gap_${index}.wav`);
      await silence(gap, 0.28);
      const gapDur = await wavDuration(gap);
      pieces.push(gap);
      cursor += gapDur;
    }
  }

  const tail = path.join(workDir, "sil_tail.wav");
  await silence(tail, 0.65);
  const tailDur = await wavDuration(tail);
  pieces.push(tail);
  cursor += tailDur;

  const list = path.join(workDir, "concat.txt");
  fs.writeFileSync(list, pieces.map((file) => `file '${path.basename(file)}'\n`).join(""), "utf8");
  const voiceWav = path.join(workDir, "voice.wav");
  try {
    await run("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "voice.wav",
    ], { cwd: workDir });
  } catch (error) {
    throw new CopyError(`旁白拼接失败，已停止。\n${error.message}`);
  }
  assertAudibleWav(voiceWav, "拼接后的音轨是静音");
  const duration = await wavDuration(voiceWav);
  return { cues: timed, duration: round(duration), wav: voiceWav };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
