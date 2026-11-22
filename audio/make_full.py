#!/usr/bin/env python3
"""Generate full GEO voiceover with word timings, concat, loudnorm."""
import asyncio, json, os, subprocess, struct, wave
from pathlib import Path
import edge_tts

OUT = Path("/workspace/geo-card-video/audio")
VOICE = "zh-CN-YunxiNeural"
RATE = "-8%"
PITCH = "-3Hz"

# Tightened narration, facts unchanged
SECTIONS = [
    {
        "id": "open",
        "chapter": 0,
        "text": "以前你搜一个问题，屏幕上会排出十条蓝链接。现在，生成式搜索直接合成一段答案。十条变成一条。你不在答案里，就等于不存在。",
    },
    {
        "id": "old",
        "chapter": 1,
        "text": "普林斯顿与德里理工等研究者，把这条新赛道叫做GEO，生成式引擎优化。他们用大约一万条问题做对照实验。关键词堆砌几乎不加分，有时还更差。把语气写得更权威，也没有明显加分。",
    },
    {
        "id": "method",
        "chapter": 2,
        "text": "真正有效的是三件实事：补上可靠出处，补上原文引语，补上具体数字。可见度相对提升大约三到四成，最多约百分之四十。改动不大，被写进答案的机会却明显增加。",
    },
    {
        "id": "who",
        "chapter": 3,
        "text": "更关键的是谁受益。排在第五的来源，补上出处后，可见度相对提高了百分之一百一十五。已经第一的网站，再用同一方法，甚至可能下降三成。传统搜索看外链和域名，小站点很难翻身。生成式引擎看的是，这段话能不能被写进答案。",
    },
    {
        "id": "fit",
        "chapter": 4,
        "text": "方法还得按行下药。法律政务和观点题更吃数据，事实题更吃出处，人物与历史更吃引语。一套模板用到底，会用错力气。",
    },
    {
        "id": "end",
        "chapter": 5,
        "text": "搜索从给列表，变成给答案。把能被引用的内容写清楚，比把关键词堆满更值钱。",
    },
]

HEAD_SIL = 0.45  # seconds
GAP_SIL = 0.38
TAIL_SIL = 0.90

async def synth_section(text, dest_mp3):
    comm = edge_tts.Communicate(text, voice=VOICE, rate=RATE, pitch=PITCH)
    audio = b""
    words = []
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            words.append({
                "text": chunk["text"],
                "offset": chunk["offset"] / 1e7,
                "duration": chunk["duration"] / 1e7,
            })
    dest_mp3.write_bytes(audio)
    return words

def mp3_to_wav(mp3, wav, sr=48000):
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(mp3),
        "-ac", "1", "-ar", str(sr),
        str(wav)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def wav_duration(path):
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()

def make_silence(path, seconds, sr=48000):
    n = int(round(seconds * sr))
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"\x00\x00" * n)

async def main():
    parts = []
    meta_sections = []
    # head silence
    head = OUT / "sil_head.wav"
    make_silence(head, HEAD_SIL)
    parts.append(head)
    cursor = HEAD_SIL

    for i, sec in enumerate(SECTIONS):
        mp3 = OUT / f"sec_{i}_{sec['id']}.mp3"
        wav = OUT / f"sec_{i}_{sec['id']}.wav"
        print(f"synth {i} {sec['id']} ...")
        words = await synth_section(sec["text"], mp3)
        mp3_to_wav(mp3, wav)
        dur = wav_duration(wav)
        words_abs = [
            {
                "text": w["text"],
                "start": round(cursor + w["offset"], 4),
                "end": round(cursor + w["offset"] + w["duration"], 4),
            }
            for w in words
        ]
        meta_sections.append({
            **sec,
            "start": round(cursor, 4),
            "end": round(cursor + dur, 4),
            "duration": round(dur, 4),
            "words": words_abs,
        })
        print(f"  {dur:.2f}s  {len(words)} words  {cursor:.2f}-{cursor+dur:.2f}")
        parts.append(wav)
        cursor += dur
        if i < len(SECTIONS) - 1:
            gap = OUT / f"sil_gap_{i}.wav"
            make_silence(gap, GAP_SIL)
            parts.append(gap)
            cursor += GAP_SIL

    tail = OUT / "sil_tail.wav"
    make_silence(tail, TAIL_SIL)
    parts.append(tail)
    cursor += TAIL_SIL

    # concat
    concat_list = OUT / "concat.txt"
    concat_list.write_text("".join(f"file '{p}'\n" for p in parts), encoding="utf-8")
    raw = OUT / "voiceover_raw.wav"
    subprocess.check_call([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
        "-c", "copy", str(raw)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # two-pass loudnorm to -13 LUFS, TP -1.5
    probe = subprocess.check_output([
        "ffmpeg", "-i", str(raw),
        "-af", "loudnorm=I=-13:TP=-1.5:LRA=8:print_format=json",
        "-f", "null", "-"
    ], stderr=subprocess.STDOUT).decode("utf-8", "replace")
    # extract json block
    start = probe.rfind("{")
    end = probe.rfind("}")
    meas = json.loads(probe[start:end+1])
    print("loudnorm measured", meas)
    out = OUT / "voiceover.wav"
    af = (
        f"loudnorm=I=-13:TP=-1.5:LRA=8:"
        f"measured_I={meas['input_i']}:"
        f"measured_TP={meas['input_tp']}:"
        f"measured_LRA={meas['input_lra']}:"
        f"measured_thresh={meas['input_thresh']}:"
        f"offset={meas['target_offset']}:"
        f"linear=true:print_format=summary"
    )
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(raw), "-af", af,
        "-ac", "1", "-ar", "48000", str(out)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # also mp3 preview
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(out), "-b:a", "192k", str(OUT / "voiceover.mp3")
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    dur = wav_duration(out)
    meta = {
        "voice": VOICE,
        "rate": RATE,
        "pitch": PITCH,
        "duration": round(dur, 4),
        "loudness_target_lufs": -13,
        "sections": meta_sections,
    }
    (OUT / "voice_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print("FINAL duration", dur)
    # print word stream compact
    for s in meta_sections:
        print(f"\n=== {s['id']} {s['start']:.2f}-{s['end']:.2f} ===")
        for w in s["words"]:
            print(f"  {w['start']:7.3f} {w['end']:7.3f}  {w['text']}")

asyncio.run(main())
