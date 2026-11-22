import fs from "fs";
import { CopyError } from "./errors.mjs";

export const LIMITS = {
  maxBytes: 32 * 1024,
  maxChars: 2000,
  maxSentenceChars: 120,
  maxSentences: 18,
  maxChapters: 6,
  maxHeadingChars: 8,
  maxTitleChars: 18,
};

const LAYOUTS = ["title", "quote", "body", "list", "end"];

function chars(text) {
  return Array.from(text).length;
}

function cleanInline(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

function joinLines(lines) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((acc, line) => {
      if (!acc) return line;
      const cjk = (ch) => /[\u3400-\u9fff]/.test(ch || "");
      if (cjk(acc.at(-1)) || cjk(line[0])) return acc + line;
      return `${acc} ${line}`;
    }, "");
}

export function splitSentences(paragraph) {
  const bits = [];
  const primary = paragraph.split(/(?<=[。！？!?])\s*/u).map((part) => part.trim()).filter(Boolean);
  const pieces = primary.length ? primary : [paragraph.trim()];
  for (const piece of pieces) {
    if (!piece) continue;
    if (chars(piece) <= 90) {
      bits.push(piece);
      continue;
    }
    const secondary = piece.split(/(?<=[，,；;、])\s*/u).map((part) => part.trim()).filter(Boolean);
    for (const sentence of secondary) {
      if (chars(sentence) > LIMITS.maxSentenceChars) {
        throw new CopyError(`有一句话超过 ${LIMITS.maxSentenceChars} 字。请加上句号后再试：「${Array.from(sentence).slice(0, 24).join("")}…」`);
      }
      bits.push(sentence);
    }
  }
  return bits;
}

function headingText(raw, limit, label) {
  const text = cleanInline(raw);
  if (!text) throw new CopyError(`有一个空的${label}。`);
  if (chars(text) > limit) {
    throw new CopyError(`${label}「${text}」超过 ${limit} 个字。请缩短，导航和标题画面放不下。`);
  }
  return text;
}

function parseDocument(text) {
  const lines = text.split("\n");
  let title = null;
  const chapters = [];
  let chapter = { title: null, blocks: [] };
  let paragraph = [];
  let list = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    const joined = joinLines(paragraph);
    paragraph = [];
    if (joined) chapter.blocks.push({ type: "p", text: joined });
  }
  function flushList() {
    if (!list.length) return;
    chapter.blocks.push({ type: "list", items: list.slice() });
    list = [];
  }
  function flushBlocks() {
    flushParagraph();
    flushList();
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushBlocks();
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushBlocks();
      continue;
    }
    if (line.startsWith("![")) throw new CopyError("基础版不插入图片。请删掉 Markdown 图片。");
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushBlocks();
      const level = heading[1].length;
      if (level === 1) {
        if (title) throw new CopyError("只支持一个一级标题。");
        if (chapters.length || chapter.blocks.length || chapter.title) {
          throw new CopyError("一级标题只能放在正文前面。");
        }
        title = headingText(heading[2], LIMITS.maxTitleChars, "一级标题");
      } else {
        const name = headingText(heading[2], LIMITS.maxHeadingChars, "小标题");
        if (chapter.title && chapter.blocks.length === 0) {
          throw new CopyError(`章节「${chapter.title}」没有正文。`);
        }
        if (chapter.title || chapter.blocks.length) {
          chapters.push(chapter);
          chapter = { title: name, blocks: [] };
        } else {
          chapter.title = name;
        }
      }
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      flushParagraph();
      const item = cleanInline(line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, ""));
      if (!item) throw new CopyError("有一个空列表项。");
      list.push(item);
      continue;
    }
    flushList();
    paragraph.push(cleanInline(line.replace(/^>\s?/, "")));
  }
  flushBlocks();
  if (chapter.title && chapter.blocks.length === 0) {
    throw new CopyError(`章节「${chapter.title}」没有正文。`);
  }
  if (chapter.title || chapter.blocks.length) chapters.push(chapter);
  return { title, chapters };
}

function cuesFromBlocks(blocks) {
  const cues = [];
  for (const block of blocks) {
    if (block.type === "p") {
      for (const sentence of splitSentences(block.text)) {
        cues.push({ text: sentence, layout: null, listItems: null, listIndex: null });
      }
    } else {
      const items = block.items.flatMap((item) => splitSentences(item));
      items.forEach((sentence, listIndex) => {
        cues.push({ text: sentence, layout: "list", listItems: items, listIndex });
      });
    }
  }
  return cues;
}

function positionalGroups(cues) {
  if (cues.length === 1) return [{ title: "正文", cues }];
  if (cues.length === 2) {
    return [
      { title: "开场", cues: [cues[0]] },
      { title: "收束", cues: [cues[1]] },
    ];
  }
  return [
    { title: "开场", cues: [cues[0]] },
    { title: "正文", cues: cues.slice(1, -1) },
    { title: "收束", cues: [cues[cues.length - 1]] },
  ];
}

function assignLayouts(cues, title) {
  const last = cues.length - 1;
  cues.forEach((cue, index) => {
    if (cue.layout === "list") return;
    if (index === 0 && title) cue.layout = "title";
    else if (index === last) cue.layout = "end";
    else cue.layout = index % 2 === 0 ? "quote" : "body";
  });
  if (cues.length === 1 && cues[0].layout !== "list") {
    cues[0].layout = title ? "title" : "quote";
  }
}

export function storyboardFromText(text) {
  if (typeof text !== "string") throw new CopyError("文案必须是字符串。");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw new CopyError("文案含有控制字符，已拒绝。");
  }
  if (/[<>]/.test(text)) {
    throw new CopyError("文案含有 < 或 >。基础版把文案当纯文本，不解析 HTML 或脚本。请删掉这些符号后再试。");
  }
  if (/```/.test(text)) throw new CopyError("文案含有 Markdown 代码围栏。基础版不朗读代码块。请删掉后再试。");
  if (chars(text) > LIMITS.maxChars) {
    throw new CopyError(`文案有 ${chars(text)} 字，超过 ${LIMITS.maxChars} 字上限。`);
  }
  if (!text.trim()) throw new CopyError("文案是空的。");

  const doc = parseDocument(text);
  let groups = doc.chapters.map((chapter) => ({
    title: chapter.title,
    cues: cuesFromBlocks(chapter.blocks),
  }));
  groups = groups.filter((group) => group.cues.length);
  if (!groups.length) throw new CopyError("没有可朗读的正文。标题不会被单独朗读。");
  if (groups.length === 1 && !groups[0].title) groups = positionalGroups(groups[0].cues);
  else groups = groups.map((group, index) => ({ title: group.title || `第${index + 1}段`, cues: group.cues }));
  if (groups.length > LIMITS.maxChapters) {
    throw new CopyError(`有 ${groups.length} 个章节，基础版最多 ${LIMITS.maxChapters} 个。请合并小标题。`);
  }

  const cues = [];
  const chapters = groups.map((group, chapter) => {
    const startIndex = cues.length;
    group.cues.forEach((cue) => cues.push({ ...cue, chapter }));
    return { title: group.title, startIndex };
  });
  if (cues.length > LIMITS.maxSentences) {
    throw new CopyError(`可朗读的句子有 ${cues.length} 句，超过 ${LIMITS.maxSentences} 句上限。请删短。`);
  }
  assignLayouts(cues, doc.title);
  for (const cue of cues) {
    if (!LAYOUTS.includes(cue.layout)) throw new CopyError("内部分镜布局无效。");
    if (!cue.text.trim()) throw new CopyError("有一句空的口播。");
  }
  return { title: doc.title, chapters, cues };
}

export function readCopy(file) {
  const stat = fs.statSync(file);
  if (stat.size === 0) throw new CopyError("文案是空文件。");
  if (stat.size > LIMITS.maxBytes) {
    throw new CopyError(`文件有 ${stat.size} 字节，超过 ${LIMITS.maxBytes} 字节上限。`);
  }
  const buf = fs.readFileSync(file);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    throw new CopyError("文件不是合法的 UTF-8。请用 UTF-8 保存 txt 或 md。");
  }
  return storyboardFromText(text);
}
