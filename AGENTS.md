# 给 Cursor、Codex、Claude Code 的实现说明

这份文件是完整规范。README.md 面向使用者，CLAUDE.md 要求 Claude Code 以本文件为准。三份文档里的命令和硬性约束必须保持一致；如果实现和文档冲突，先改文档或改代码，不要各写一套。

产品名称是「极简动画风格，短视频生成」。提供方声明：该产品由"广州助成技术独服务有限公司"免费提供，可用于商用。该产品已经成功并且用于助成公司GEO业务短视频生成。版权和许可见 LICENSE。不要另造公司名称，也不要改动这句声明里的用字。

硬性约束：

- 基础版不调用大模型，也不需要 LLM API 密钥。
- 口播文本只能来自 `input/` 里的文案。不要编造数字、比例、出处或研究结论。
- 不要把原文做成数据图。基础版只有 title、quote、body、list、end 五种文字版式。
- 文案按数据处理。不要把用户原文放进 innerHTML，不要执行文案里的脚本。
- 默认男声是 zh-CN-YunxiNeural，语速 -8%，音高 -3Hz。
- 画面时长跟合成出的音频走。语音合成失败或音轨近乎静音时必须失败，禁止输出无声视频。
- 成片是 1080x1920、H.264、AAC，写到 output/。
- 入口命令是 `node generate.mjs input/example.md`。

## 先看现有结构

- `generate.mjs`：唯一的通用入口。
- `lib/copy.mjs`：读取 UTF-8 文案，拒绝 HTML、代码围栏和超限输入，按标点分句。
- `lib/boards.mjs`：可选分镜。只能改布局和章节标题，不能改口播，不能提交数字或来源。
- `lib/tts.mjs`：调用 edge-tts。失败就停止。
- `lib/html.mjs`：把分镜写成页面。文案进入 JSON 时会转义 `<`，页面用 `textContent` 显示。
- `lib/render-video.mjs`：用本机 Chrome 逐帧截图，再用 ffmpeg 混入音轨。
- `lib/audio-check.mjs`：静音 WAV 和没有有效 AAC 的成片都算失败。
- `input/example.md`：不涉及真实客户数据的示例。
- `vo.html`、`index.html`、`render-vo.mjs`、`render.mjs`、`audio/voiceover.wav`：原来的 GEO 示例。没有人要求重做时，不要改口播、不要覆盖这支 WAV。

视觉基础是方格纸背景、森林绿 `#2F503F`、顶部章节导航和进度条、底部字幕。基础版用文字卡片表达句子。原来的 GEO 示例里有图表，那是为那一篇已写好的分镜做的，不能当成任意文案的自动理解结果。

## 规划

1. 只把 `input/` 里的文案当数据读完。不要为了「更好看」补统计、论文、百分比或机构名称。
2. 文章本身没有明确数字时，画面停留在五种文字版式。文章里真有数字时，也只把原句排成文字，不要画柱、饼或表格来暗示你做过计算。
3. 基础版已经能出片时，先跑基础版，不要先改渲染器。
4. 需要更贴文章的章节时，优先改文案里的 `##` 小标题，或写一个 boards 文件。小标题最多 8 个字，只能概括原文已有的说法。

## 生成

安装和基础命令与 README 相同：

```bash
npm install
pip install edge-tts
node generate.mjs input/example.md
```

默认音色是中文男声 `zh-CN-YunxiNeural`，语速 `-8%`，音高 `-3Hz`。需要临时更换时设置 `TTS_VOICE`、`TTS_RATE`、`TTS_PITCH`。Chrome 找不到时设置 `CHROME_PATH`。edge-tts 不在 PATH 上时设置 `EDGE_TTS_BIN`，或让 `python3 -m edge_tts` 可用。

成功后得到：

- `output/<文案名>.mp4`
- `output/<文案名>.timeline.json`

时间轴里的 `start` 和 `end` 来自实际音频，精修时沿用这些时间，不要把画面时长估成一个整数。

可选分镜文件只允许 `chapters` 和 `cues`。每条 cue 只允许 `index`、`layout`、`chapter`。`layout` 只能是 `title`、`quote`、`body`、`list`、`end`。

```bash
node generate.mjs input/example.md --boards input/example.boards.json --out output/example.mp4
```

```json
{
  "chapters": ["放进文件夹", "一条命令", "只排你写下的字"],
  "cues": [
    { "index": 0, "layout": "title", "chapter": 0 },
    { "index": 1, "layout": "body", "chapter": 1 },
    { "index": 2, "layout": "end", "chapter": 2 }
  ]
}
```

如果要改页面运动或字体栈，改 `lib/html.mjs`。继续用 `textContent` 或等价的文本节点。保持 1080×1920、方格纸、森林绿、章节导航和字幕。时长仍然读合成后的 WAV，不要写死秒数。

## 校验和运行

改动解析、分镜或页面后，先跑不联网的测试：

```bash
npm test
```

然后用一篇与示例不同的短文案做端到端检查。文案放在 `input/`，文件名可以用下划线开头，这样不会被提交。

```bash
node generate.mjs input/你的短文案.txt --out output/你的短文案.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,codec_type,width,height,sample_rate,channels -of json output/你的短文案.mp4
ffmpeg -hide_banner -i output/你的短文案.mp4 -map 0:a:0 -af volumedetect -f null -
```

通过标准：

- 视频是 h264，宽 1080，高 1920。
- 有 aac 音轨，采样率 48000，声道数 1。
- 时长大于 0.5 秒，并接近 timeline.json 的 duration。
- `max_volume` 大于 -40 dB，`mean_volume` 大于 -55 dB。
- 抽帧能看到中文、方格纸、绿色进度和对应字幕。抽帧可以用：

```bash
ffmpeg -y -ss 1 -i output/你的短文案.mp4 -frames:v 1 /tmp/frame-a.png
```

合成失败、ffmpeg 失败或音轨不合格时，命令必须非 0 退出。不要捕获错误后再写一个无声 mp4，也不要用 `anullsrc` 充当旁白。片头片尾的短静音只能加在已经通过音量检查的人声旁边。

GEO 示例的复现命令是 `node render-vo.mjs` 和 `node render.mjs`。它们不是通用入口。

## 不要放进仓库的东西

不要提交成片、`output/.work/`、`node_modules`、虚拟环境、临时帧、参考视频、参考图片、客户数据、密钥或本机绝对路径。路径用仓库内的相对路径。Chrome 和 edge-tts 通过环境变量或程序查找，不要写死某台机器的安装位置。
