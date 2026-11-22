import fs from "fs";
import { CopyError } from "./errors.mjs";

const LAYOUTS = new Set(["title", "quote", "body", "list", "end"]);
const CUE_KEYS = new Set(["index", "layout", "chapter"]);
const FORBIDDEN = new Set(["text", "caption", "number", "value", "source", "chart", "series", "data"]);

function chars(text) {
  return Array.from(text).length;
}

export function readBoards(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new CopyError("分镜文件不是合法 JSON。");
  }
  return parsed;
}

export function applyBoards(story, boards) {
  if (!boards || typeof boards !== "object" || Array.isArray(boards)) {
    throw new CopyError("分镜文件必须是 JSON 对象。");
  }
  for (const key of Object.keys(boards)) {
    if (key !== "chapters" && key !== "cues") {
      throw new CopyError(`分镜文件不能包含「${key}」。只允许 chapters 和 cues。`);
    }
  }
  const cues = story.cues.map((cue) => ({
    ...cue,
    listItems: cue.listItems ? cue.listItems.slice() : null,
  }));
  const chapters = story.chapters.map((chapter) => ({ ...chapter }));
  if (boards.chapters) {
    if (!Array.isArray(boards.chapters) || boards.chapters.length !== chapters.length) {
      throw new CopyError(`chapters 必须是 ${chapters.length} 个标题，与文案章节数一致。要改章节数量，请改文案里的小标题。`);
    }
    boards.chapters.forEach((title, index) => {
      if (typeof title !== "string" || !title.trim()) throw new CopyError("章节标题必须是非空字符串。");
      if (/[<>]/.test(title)) throw new CopyError("章节标题不能包含 < 或 >。");
      if (chars(title.trim()) > 8) throw new CopyError("章节标题最多 8 个字。");
      chapters[index].title = title.trim();
    });
  }
  if (boards.cues) {
    if (!Array.isArray(boards.cues) || boards.cues.length !== cues.length) {
      throw new CopyError(`cues 必须是 ${cues.length} 条，与可朗读句子数一致。口播句子只能来自文案。`);
    }
    boards.cues.forEach((cue, index) => {
      if (!cue || typeof cue !== "object" || Array.isArray(cue)) {
        throw new CopyError(`第 ${index + 1} 条分镜不是对象。`);
      }
      for (const key of Object.keys(cue)) {
        if (FORBIDDEN.has(key)) {
          throw new CopyError("分镜不能改口播文字，也不能提供数字、来源或图表数据。");
        }
        if (!CUE_KEYS.has(key)) throw new CopyError(`分镜字段「${key}」不能用。`);
      }
      if (cue.index !== index) throw new CopyError(`第 ${index + 1} 条分镜的 index 必须是 ${index}。`);
      if (!LAYOUTS.has(cue.layout)) {
        throw new CopyError(`布局「${cue.layout}」不能用。只允许 title、quote、body、list、end。基础版不画数据图。`);
      }
      if (!Number.isInteger(cue.chapter) || cue.chapter < 0 || cue.chapter >= chapters.length) {
        throw new CopyError(`第 ${index + 1} 条分镜的 chapter 超出范围。`);
      }
      cues[index].layout = cue.layout;
      cues[index].chapter = cue.chapter;
      if (cue.layout === "list" && !cues[index].listItems) {
        cues[index].listItems = [cues[index].text];
        cues[index].listIndex = 0;
      }
    });
  }
  for (let index = 0; index < chapters.length; index += 1) {
    if (!cues.some((cue) => cue.chapter === index)) {
      throw new CopyError(`章节 ${index}（${chapters[index].title}）没有任何句子。`);
    }
  }
  return { title: story.title, chapters, cues };
}
