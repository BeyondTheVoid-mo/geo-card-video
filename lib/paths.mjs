import fs from "fs";
import path from "path";
import { CopyError } from "./errors.mjs";

function inside(parent, target) {
  const rel = path.relative(parent, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function resolveInput(root, inputArg) {
  const inputDir = path.resolve(root, "input");
  if (!fs.existsSync(inputDir)) throw new CopyError("缺少 input 目录。");
  const rootReal = fs.realpathSync(root);
  const inputReal = fs.realpathSync(inputDir);
  if (!inside(rootReal, inputReal)) throw new CopyError("input 目录位于仓库外面，已拒绝。");
  const requested = path.resolve(root, inputArg);
  if (!fs.existsSync(requested)) throw new CopyError(`找不到文案：${inputArg}`);
  const real = fs.realpathSync(requested);
  if (!inside(inputReal, real)) throw new CopyError("文案必须放在 input 目录里。");
  if (!fs.statSync(real).isFile()) throw new CopyError("文案必须是文件，不能是目录。");
  const ext = path.extname(real).toLowerCase();
  if (ext !== ".txt" && ext !== ".md") throw new CopyError("只支持 UTF-8 的 .txt 或 .md。");
  return real;
}

export function resolveOutput(root, outputArg) {
  const outputDir = path.resolve(root, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const rootReal = fs.realpathSync(root);
  const outputReal = fs.realpathSync(outputDir);
  if (!inside(rootReal, outputReal)) throw new CopyError("output 目录位于仓库外面，已拒绝。");
  const resolved = path.resolve(root, outputArg);
  if (path.dirname(resolved) !== outputDir) {
    throw new CopyError("输出文件必须直接写到 output 目录，例如 output/example.mp4。");
  }
  if (path.extname(resolved).toLowerCase() !== ".mp4") {
    throw new CopyError("输出文件必须以 .mp4 结尾。");
  }
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    throw new CopyError("输出路径是符号链接，已拒绝。");
  }
  return resolved;
}

export function resolveBoards(root, boardsArg) {
  const rootReal = fs.realpathSync(root);
  const requested = path.resolve(root, boardsArg);
  if (!fs.existsSync(requested)) throw new CopyError(`找不到分镜文件：${boardsArg}`);
  const real = fs.realpathSync(requested);
  if (!inside(rootReal, real)) throw new CopyError("分镜文件必须在仓库里面。");
  if (!fs.statSync(real).isFile()) throw new CopyError("分镜文件必须是文件。");
  if (path.extname(real).toLowerCase() !== ".json") throw new CopyError("分镜文件必须是 .json。");
  return real;
}
