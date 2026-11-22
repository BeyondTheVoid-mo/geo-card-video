# geo-card-video

GEO 竖屏卡片动画（1080×1920，30fps）。有两个版本：

- 无配音：`index.html` + `render.mjs`，默认输出 `geo-60s.mp4`（约 62 秒，片中用静音轨）
- 配音版：`vo.html` + `render-vo.mjs`，默认输出 `geo-60s-vo.mp4`（时长以 `vo.html` 的 `window.DURATION` 为准，当前旁白为 102.634 秒）

`package.json` 里没有自定义 npm scripts，请直接用下面的 `node` / `python3` 命令。

## 依赖

- Node.js 与 npm（`package.json` 依赖 `puppeteer-core`）
- ffmpeg
- Google Chrome，路径必须是 `/usr/bin/google-chrome`（`render.mjs` 和 `render-vo.mjs` 都写死了这个路径）

重新生成旁白还需要：

- Python 3 与 `edge-tts`（`audio/make_full.py`、`audio/make_samples.py`）
- `numpy`（仅 `audio/make_samples.py` 试音时用到）

## 安装

```bash
npm install
```

如需重新合成旁白：

```bash
pip install edge-tts numpy
```

## 导出视频

无配音版：

```bash
node render.mjs
# 指定输出文件：
node render.mjs path/to/out.mp4
# 导出预览帧到 previews/（第三个参数必须是 preview）：
node render.mjs unused preview
```

配音版会把 `audio/voiceover.wav` 与画面合成，该文件需要保留才能复现当前成片：

```bash
node render-vo.mjs
# 指定输出文件：
node render-vo.mjs path/to/out.mp4
# 导出预览帧到 vo-previews/：
node render-vo.mjs unused preview
```

## 旁白与时间轴

- `audio/timeline.md`：旁白稿与分镜时间轴
- `audio/voice_meta.json`：选用音色 `zh-CN-YunxiNeural`，rate `-8%`，pitch `-3Hz`，以及各段起止时间
- `audio/voiceover.wav`：配音版渲染用的最终音轨
- `audio/make_full.py`：用 edge-tts 分段合成、拼接并做响度归一，写出 `voiceover.wav` 和 `voice_meta.json`
- `audio/make_samples.py`：对比多种音色/语速的试听样本（不是成片渲染所必需）
- `audio/concat.txt`、`audio/sample_stats.json`：合成过程留下的拼接列表和试听统计

注意：本仓库的文件在仓库根目录，克隆后没有额外的 `geo-card-video/` 子目录。`make_full.py` 和 `make_samples.py` 里的输出目录仍写死为生成当时的 `/workspace/geo-card-video/audio`，`audio/concat.txt` 里也是这组绝对路径。复现当前配音版不需要重跑这两个脚本，直接使用已提交的 `audio/voiceover.wav`。若要重新合成旁白，先把脚本里的输出目录改成当前仓库的 `audio/` 再运行。重新跑 TTS 不一定能得到与现有 `voiceover.wav` 完全相同的音频。

## 不纳入版本库的内容

参考视频/截图、`node_modules`、`venv`、临时预览帧和导出成片已排除。详见 `.gitignore`。
