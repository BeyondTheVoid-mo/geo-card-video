import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyBoards } from "../lib/boards.mjs";
import { assertAudibleWav } from "../lib/audio-check.mjs";
import { storyboardFromText } from "../lib/copy.mjs";
import { renderHtml } from "../lib/html.mjs";
import { resolveInput, resolveOutput } from "../lib/paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("example copy becomes three spoken sentences and no chart", () => {
  const story = storyboardFromText(fs.readFileSync(path.join(root, "input/example.md"), "utf8"));
  assert.equal(story.title, "把文章做成一条短视频");
  assert.deepEqual(story.chapters.map((chapter) => chapter.title), ["放进文件夹", "一条命令", "只排你写下的字"]);
  assert.deepEqual(story.cues.map((cue) => cue.text), [
    "把写好的文案保存成文本，放在 input 目录。",
    "运行生成命令后，程序会合成中文男声，并按语音时长排画面。",
    "基础版不会把句子改成数据图，也不会编造数字。",
  ]);
  assert.deepEqual(story.cues.map((cue) => cue.layout), ["title", "body", "end"]);
});

test("plain text is split by punctuation into positional chapters", () => {
  const story = storyboardFromText("清晨把窗户打开。\n风带着树叶的声音进来。\n今天先把这件事做完。\n");
  assert.equal(story.title, null);
  assert.deepEqual(story.chapters.map((chapter) => chapter.title), ["开场", "正文", "收束"]);
  assert.deepEqual(story.cues.map((cue) => cue.layout), ["quote", "body", "end"]);
});

test("html, code fences, empty files, and long sentences are rejected", () => {
  assert.throws(() => storyboardFromText("<script>alert(1)</script>"), /不解析 HTML/);
  assert.throws(() => storyboardFromText("```js\nalert(1)\n```"), /代码围栏/);
  assert.throws(() => storyboardFromText("   \n"), /空的/);
  assert.throws(() => storyboardFromText(`${"很长".repeat(80)}。`), /超过 120 字/);
});

test("boards cannot invent chart data or replace speech", () => {
  const story = storyboardFromText("清晨把窗户打开。今天先把这件事做完。");
  assert.throws(() => applyBoards(story, {
    cues: [
      { index: 0, layout: "chart", chapter: 0 },
      { index: 1, layout: "end", chapter: 1 },
    ],
  }), /不画数据图/);
  assert.throws(() => applyBoards(story, {
    cues: [
      { index: 0, layout: "quote", chapter: 0, source: "某论文" },
      { index: 1, layout: "end", chapter: 1 },
    ],
  }), /不能提供数字、来源或图表数据/);
  const refined = applyBoards(story, {
    chapters: ["窗边", "去做"],
    cues: [
      { index: 0, layout: "title", chapter: 0 },
      { index: 1, layout: "end", chapter: 1 },
    ],
  });
  assert.equal(refined.cues[0].text, "清晨把窗户打开。");
  assert.equal(refined.chapters[1].title, "去做");
});

test("generated page treats copy as data", () => {
  const html = renderHtml({
    title: "标题",
    duration: 2,
    chapters: [{ title: "正文", start: 0 }],
    cues: [{ start: 0, end: 2, text: "</script><script>alert(1)</script>", layout: "quote", chapter: 0, listItems: null, listIndex: null }],
  });
  const payload = html.match(/<script id="story" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(payload, /</);
  assert.match(payload, /\\u003c/);
  assert.doesNotMatch(html, /innerHTML/);
});

test("input and output paths stay inside the repository", () => {
  assert.throws(() => resolveInput(root, "/etc/passwd"), /必须放在 input/);
  assert.throws(() => resolveInput(root, "README.md"), /必须放在 input/);
  assert.throws(() => resolveOutput(root, "geo-60s.mp4"), /必须直接写到 output/);
  assert.equal(path.basename(resolveOutput(root, "output/example.mp4")), "example.mp4");
});

test("silent wav is rejected", () => {
  const file = path.join(os.tmpdir(), `silent-${process.pid}.wav`);
  const data = Buffer.alloc(4800 * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(96000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
  assert.throws(() => assertAudibleWav(file, "静音测试"), /不会输出无声视频/);
  fs.rmSync(file, { force: true });
});

test("tts failure does not publish an mp4", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-edge-"));
  const bin = path.join(dir, "fake-edge");
  fs.writeFileSync(bin, "#!/bin/sh\necho simulated synthesis failure >&2\nexit 3\n");
  fs.chmodSync(bin, 0o755);
  const input = path.join(root, "input/_tts_fail.txt");
  const output = path.join(root, "output/_tts_fail.mp4");
  fs.writeFileSync(input, "只是一句测试。\n");
  const result = spawnSync(process.execPath, ["generate.mjs", "input/_tts_fail.txt", "--out", "output/_tts_fail.mp4"], {
    cwd: root,
    env: { ...process.env, EDGE_TTS_BIN: bin },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /语音合成失败/);
  assert.equal(fs.existsSync(output), false);
  fs.rmSync(input, { force: true });
  fs.rmSync(path.join(root, "output/.work/_tts_fail"), { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});
