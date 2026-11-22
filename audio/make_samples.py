#!/usr/bin/env python3
import asyncio, os, json, wave, struct, math
from pathlib import Path
import edge_tts
import numpy as np

OUT = Path(__file__).resolve().parent
SAMPLE = "以前你搜一个问题，屏幕上会排出十条蓝链接。现在，生成式搜索直接合成一段答案。十条变成一条。你不在答案里，就等于不存在。"

VOICES = [
    ("zh-CN-YunyangNeural", "-8%", "+0Hz"),
    ("zh-CN-YunyangNeural", "-12%", "+0Hz"),
    ("zh-CN-YunxiNeural", "-10%", "+0Hz"),
    ("zh-CN-YunxiNeural", "-10%", "-3Hz"),
    ("zh-CN-YunjianNeural", "-10%", "+0Hz"),
    ("zh-CN-YunjianNeural", "-8%", "-2Hz"),
]

async def gen_one(voice, rate, pitch, dest_mp3):
    comm = edge_tts.Communicate(SAMPLE, voice=voice, rate=rate, pitch=pitch)
    await comm.save(str(dest_mp3))

def mp3_to_wav(mp3, wav):
    os.system(f'ffmpeg -y -i "{mp3}" -ac 1 -ar 16000 "{wav}" >/dev/null 2>&1')

def f0_stats(wav_path):
    with wave.open(str(wav_path)) as w:
        sr = w.getframerate()
        nch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if sw == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    else:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    if nch == 2:
        data = data.reshape(-1, 2).mean(1)
    data /= 32768.0
    hop = int(sr * 0.01)
    win = int(sr * 0.04)
    minf, maxf = 80, 300
    minlag, maxlag = int(sr / maxf), int(sr / minf)
    f0s, rmses = [], []
    for i in range(0, len(data) - win, hop):
        fr = data[i:i + win]
        rms = float(np.sqrt(np.mean(fr ** 2)))
        if rms < 0.02:
            continue
        fr = fr - fr.mean()
        corr = np.correlate(fr, fr, mode="full")[win - 1 :]
        if corr[0] <= 1e-9:
            continue
        seg = corr[minlag:maxlag]
        k = int(np.argmax(seg))
        if seg[k] / corr[0] < 0.35:
            continue
        f0s.append(sr / (k + minlag))
        rmses.append(rms)
    if not f0s:
        return {}
    arr = np.array(f0s)
    return {
        "n": int(len(arr)),
        "median": float(np.median(arr)),
        "mean": float(np.mean(arr)),
        "p25": float(np.percentile(arr, 25)),
        "p75": float(np.percentile(arr, 75)),
        "voiced_rms_med": float(np.median(rmses)),
        "duration": len(data) / sr,
    }

async def main():
    results = []
    for voice, rate, pitch in VOICES:
        tag = f"{voice.replace('zh-CN-', '')}_{rate}_{pitch}".replace("%", "p").replace("+", "p")
        mp3 = OUT / f"sample_{tag}.mp3"
        wav = OUT / f"sample_{tag}.wav"
        print("generating", tag)
        await gen_one(voice, rate, pitch, mp3)
        mp3_to_wav(mp3, wav)
        st = f0_stats(wav)
        st.update(voice=voice, rate=rate, pitch=pitch, tag=tag)
        print(json.dumps({k: (round(v, 2) if isinstance(v, float) else v) for k, v in st.items()}, ensure_ascii=False))
        results.append(st)
    (OUT / "sample_stats.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

asyncio.run(main())
