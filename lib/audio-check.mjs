import fs from "fs";
import { run } from "./proc.mjs";

export function maxAbsPcm16(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`不是 WAV 文件：${file}`);
  }
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      let max = 0;
      const end = Math.min(buf.length, offset + 8 + size);
      for (let i = offset + 8; i + 1 < end; i += 2) {
        const value = Math.abs(buf.readInt16LE(i));
        if (value > max) max = value;
      }
      return max;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV 缺少 data 块，无法确认有没有声音。");
}

export function assertAudibleWav(file, label) {
  const max = maxAbsPcm16(file);
  if (max < 800) {
    throw new Error(`${label}：音量峰值过低（${max}/32767）。已停止，不会输出无声视频。`);
  }
  return max;
}

export async function wavDuration(file) {
  const { out } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nokey=1:noprint_wrappers=1",
    file,
  ]);
  const duration = Number(out.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`音频时长无效：${file}`);
  }
  return duration;
}

export async function assertMp4(file) {
  const { out } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_streams",
    "-show_format",
    file,
  ]);
  const data = JSON.parse(out);
  const video = (data.streams || []).find((stream) => stream.codec_type === "video");
  const audio = (data.streams || []).find((stream) => stream.codec_type === "audio");
  if (!video || Number(video.width) !== 1080 || Number(video.height) !== 1920 || video.codec_name !== "h264") {
    throw new Error("成片不是 1080x1920 的 H.264 视频。已停止。");
  }
  if (!audio || audio.codec_name !== "aac") {
    throw new Error("成片没有 AAC 音轨。已停止，不会把无声视频当作成功。");
  }
  const duration = Number(data.format && data.format.duration);
  if (!(duration > 0.5)) throw new Error("成片时长无效。已停止。");
  const detected = await run("ffmpeg", [
    "-hide_banner",
    "-i", file,
    "-map", "0:a:0",
    "-af", "volumedetect",
    "-f", "null",
    "-",
  ]);
  const max = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(detected.err);
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(detected.err);
  const maxVolume = max ? Number(max[1]) : NaN;
  const meanVolume = mean ? Number(mean[1]) : NaN;
  if (!(maxVolume > -40) || !(meanVolume > -55)) {
    throw new Error(
      `成片音轨接近静音（max ${max && max[1]} dB，mean ${mean && mean[1]} dB）。已停止，不会留下无声视频。`,
    );
  }
  return { duration, maxVolume, meanVolume, sampleRate: audio.sample_rate, channels: audio.channels };
}
