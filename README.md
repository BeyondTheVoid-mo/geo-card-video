# 极简动画风格，短视频生成

这套工作流是给 Cursor、Codex 和 Claude Code 用的。把一篇短文放进 `input/`，用一条命令合成中文男声，并按这段声音的真实时长排出 1080×1920 的竖屏视频。

提供方声明：该产品由"广州助成技术独服务有限公司"免费提供，可用于商用。该产品已经成功并且用于助成公司GEO业务短视频生成。

软件本身使用 ISC 许可，见 `LICENSE`。ISC 允许商用，但下面写明的字体、合成声音和输入文案不在这项许可里。

## 两种用法，不要混成一种

基础版可以马上用。它不调用大模型，也不需要 LLM API 密钥。程序按句号分句，在森林绿、方格纸、章节导航和底部字幕这套版式里排字。它只有 `title`、`quote`、`body`、`list`、`end` 五种文字画面，不会把文章理解成数据图，也不会编造数字或出处。

AI 精修是下一步。Cursor、Codex 阅读 `AGENTS.md`；Claude Code 阅读 `CLAUDE.md`，其中写明完整规范以 `AGENTS.md` 为准。精修可以改章节和版式，仍然不能编造图表数据。

硬性约束：

- 基础版不调用大模型，也不需要 LLM API 密钥。
- 口播文本只能来自 `input/` 里的文案。不要编造数字、比例、出处或研究结论。
- 不要把原文做成数据图。基础版只有 title、quote、body、list、end 五种文字版式。
- 文案按数据处理。不要把用户原文放进 innerHTML，不要执行文案里的脚本。
- 默认男声是 zh-CN-YunxiNeural，语速 -8%，音高 -3Hz。
- 画面时长跟合成出的音频走。语音合成失败或音轨近乎静音时必须失败，禁止输出无声视频。
- 成片是 1080x1920、H.264、AAC，写到 output/。
- 入口命令是 `node generate.mjs input/example.md`。

## 环境

- Node.js 18 或更新版本，以及 npm
- ffmpeg，并且能用 `ffprobe`
- Google Chrome 或 Chromium。程序会在 `PATH` 和常见安装位置里查找；也可以设置 `CHROME_PATH`
- Python 3 和 `edge-tts`。默认男声要联网，调用微软在线语音服务
- 中文字体。页面会依次尝试 Noto Sans CJK、Noto Serif CJK、思源宋体、文泉驿微米黑和 Droid Sans Fallback。仓库不附带字体

## 安装

```bash
npm install
pip install edge-tts
```

## 文稿放哪里

把 UTF-8 的 `.txt` 或 `.md` 放进 `input/`。仓库里的示例是 `input/example.md`。

可以用一个一级标题 `# 标题`，最多 18 个字。可以用二级标题 `## 小标题` 分章，最多 6 章，每章标题最多 8 个字。正文用句号、问号或叹号分句。列表会排成文字条目，不是柱状图。

限制：文件不超过 32KB、2000 字、18 句，单句不超过 120 字。含有 `<`、`>`、代码围栏或 Markdown 图片时会直接拒绝。链接只保留方括号里的文字。

## 一条命令

```bash
node generate.mjs input/example.md
```

指定输出文件或精修分镜时：

```bash
node generate.mjs input/example.md --out output/example.mp4 --boards input/example.boards.json
```

## 输出

- `output/example.mp4`：1080×1920，H.264，AAC，48kHz 单声道
- `output/example.timeline.json`：实际音色、时长和每句起止时间

`output/` 里的成片和时间轴不纳入版本库。

## 男声

默认 `zh-CN-YunxiNeural`，语速 `-8%`，音高 `-3Hz`。这是中文男声。可以用环境变量换音色，但换上去的声音不一定是男声，程序不会假装替你确认：

```bash
TTS_VOICE=zh-CN-YunxiNeural TTS_RATE=-8% TTS_PITCH=-3Hz node generate.mjs input/example.md
```

## 语音服务和授权边界

`edge-tts` 是第三方客户端。默认男声由微软在线服务合成，需要能访问该服务。服务中断、地区限制、音色下线或条款变化都会让命令失败。本仓库不保证服务一直可用。

ISC 许可只覆盖本仓库的程序、文档和随附示例文稿，允许免费使用和商用。它不授予：

- 字体的许可。字体由其自身许可证约束。
- 微软神经网络语音和 edge-tts 所访问服务的许可。发布或商用前，请自行确认这些条款允许你的用途。
- Chrome、ffmpeg、puppeteer-core 的许可。
- 你放进 `input/` 的文案。文案版权仍归文案权利人，本工具不取得这些权利。

## 失败时会怎样

命令以非 0 退出，并在终端说明原因。不会留下一条无声音的 mp4。常见情况：

- 找不到文案，或文件不在 `input/`：把 `.txt` 或 `.md` 放进 `input/` 再运行。
- 不是 UTF-8，含有 `<` `>`、代码围栏、空正文，或超过字数和句数限制：按提示改文案。
- 找不到 `edge-tts`、ffmpeg 或 Chrome：先安装，或设置 `EDGE_TTS_BIN`、`CHROME_PATH`。
- 语音合成失败、音频为空或成片音轨接近静音：检查网络和音色。修到能合成出声音再重跑。不要用静音轨顶替。

## 已经做好的 GEO 示例

`vo.html`、`index.html`、`audio/voiceover.wav` 和 `audio/timeline.md` 是一条已经写好分镜的 GEO 示例，用来保留原来的成片流程。它不是通用入口，也不会按任意文案重新理解图表。

```bash
node render-vo.mjs
node render.mjs
```

第一条把 `audio/voiceover.wav` 和 `vo.html` 合成配音版，第二条是无配音版。Chrome 同样用 `CHROME_PATH` 或自动查找。`audio/make_full.py` 只在你明确要重做这条示例旁白时使用，它会联网并覆盖 `audio/voiceover.wav`。
