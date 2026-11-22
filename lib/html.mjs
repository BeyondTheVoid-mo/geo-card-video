const CSS = `
:root{
  --ink:#242422; --green:#2F503F; --green-deep:#243F33; --sage:#2E3D36;
  --muted:#8F8F8D; --card:#FBFBF9; --paper:#F5F5F3;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:#F5F5F3}
#stage{
  position:relative;width:1080px;height:1920px;background:#F5F5F3;color:var(--ink);overflow:hidden;
  background-image:
    linear-gradient(to right, rgba(36,36,34,0.07) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(36,36,34,0.07) 1px, transparent 1px);
  background-size:24px 24px;
}
.wash{position:absolute;inset:0;pointer-events:none;z-index:1;
  background:
    radial-gradient(ellipse at 50% 38%, rgba(249,249,247,0) 28%, rgba(228,228,224,0.38) 100%),
    linear-gradient(to bottom, rgba(232,232,228,0.28) 0%, rgba(255,255,255,0) 14%, rgba(255,255,255,0) 58%, rgba(210,212,207,0.62) 100%);
}
.decor{position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden}
.blob{position:absolute;border-radius:50%;background:rgba(70,72,68,0.07);filter:blur(28px)}
#nav{position:absolute;top:188px;left:90px;width:900px;height:64px;z-index:8;opacity:0}
#progress{position:absolute;left:0;top:0;height:5px;width:0;background:var(--green);border-radius:1px}
.nav-items{position:absolute;left:0;right:0;top:22px;display:flex;justify-content:space-between;gap:18px}
.nav-items span{font-family:"Noto Sans CJK SC","Noto Sans CJK","WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif;font-size:22px;line-height:1;color:var(--muted);white-space:nowrap}
.nav-items span.on{color:#1A1A18;font-weight:700}
#chap-title{position:absolute;top:286px;left:90px;right:90px;z-index:8;opacity:0;
  font-family:"Noto Sans CJK SC","WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif;font-weight:700;font-size:24px;color:var(--sage)}
#viz{position:absolute;top:360px;left:0;width:1080px;height:1120px;z-index:6}
.scene{position:absolute;inset:0;opacity:0}
.serif{font-family:"Noto Serif CJK SC","Noto Serif CJK","Source Han Serif SC","Songti SC","WenQuanYi Micro Hei","Droid Sans Fallback",serif}
.sans{font-family:"Noto Sans CJK SC","Noto Sans CJK","WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif}
.rule{position:absolute;left:90px;top:80px;width:72px;height:6px;background:var(--green)}
#scene-title .huge,#scene-end .huge{position:absolute;left:90px;right:90px;top:120px;font-weight:700;line-height:1.18;color:#262628}
#scene-title .sub{position:absolute;left:90px;right:90px;top:520px;font-weight:700;line-height:1.4;color:var(--sage)}
#scene-quote .mark{position:absolute;left:86px;top:20px;font-size:140px;line-height:1;color:var(--green);opacity:0.85}
#scene-quote .txt{position:absolute;left:100px;right:100px;top:180px;font-weight:700;line-height:1.35;text-align:center}
#scene-body .card{position:absolute;left:90px;right:90px;top:90px;background:var(--card);border-radius:22px;
  box-shadow:0 16px 36px rgba(40,44,36,0.09),0 3px 10px rgba(40,44,36,0.04);padding:64px 56px;font-weight:700;line-height:1.45}
#list-rows{position:absolute;left:90px;right:90px;top:40px}
.list-row{display:flex;align-items:flex-start;gap:28px;padding:28px 8px;border-bottom:1px solid rgba(40,40,38,0.12);opacity:0.45}
.list-row.on{opacity:1}
.list-row .idx{width:72px;flex:none;font-weight:700;font-size:28px;color:var(--green);padding-top:8px}
.list-row .tx{flex:1;font-weight:700;font-size:42px;line-height:1.35;color:#242422}
.list-row.on .tx{color:var(--green-deep)}
#caption-wrap{position:absolute;left:72px;right:72px;top:1520px;height:240px;z-index:9;display:flex;align-items:flex-start;justify-content:center}
.cap{font-family:"Noto Sans CJK SC","WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif;font-weight:700;line-height:1.25;text-align:center;color:var(--ink)}
`;

export function renderHtml(model) {
  const json = JSON.stringify(model).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>短视频</title>
<style>${CSS}</style>
</head>
<body>
<div id="stage">
  <div class="wash"></div>
  <div class="decor">
    <div class="blob" style="left:820px;top:80px;width:220px;height:220px"></div>
    <div class="blob" style="left:-40px;top:980px;width:200px;height:200px"></div>
    <div class="blob" style="left:900px;top:1280px;width:180px;height:180px"></div>
  </div>
  <nav id="nav"><div id="progress"></div><div class="nav-items" id="nav-items"></div></nav>
  <div id="chap-title"></div>
  <div id="viz">
    <section id="scene-title" class="scene"><div class="rule"></div><div class="huge serif" id="title-text"></div><div class="sub serif" id="title-sub"></div></section>
    <section id="scene-quote" class="scene"><div class="mark serif">“</div><div class="txt serif" id="quote-text"></div></section>
    <section id="scene-body" class="scene"><div class="card serif" id="body-text"></div></section>
    <section id="scene-list" class="scene"><div id="list-rows"></div></section>
    <section id="scene-end" class="scene"><div class="rule"></div><div class="huge serif" id="end-text"></div></section>
  </div>
  <div id="caption-wrap"><div class="cap" id="caption"></div></div>
</div>
<script id="story" type="application/json">${json}</script>
<script>
const DATA = JSON.parse(document.getElementById("story").textContent);
const nav = document.getElementById("nav");
const navItems = document.getElementById("nav-items");
const progress = document.getElementById("progress");
const chap = document.getElementById("chap-title");
const caption = document.getElementById("caption");
const scenes = {
  title: document.getElementById("scene-title"),
  quote: document.getElementById("scene-quote"),
  body: document.getElementById("scene-body"),
  list: document.getElementById("scene-list"),
  end: document.getElementById("scene-end"),
};
DATA.chapters.forEach((chapter) => {
  const span = document.createElement("span");
  span.textContent = chapter.title;
  navItems.appendChild(span);
});
let lastIndex = -1;
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function ramp(value, start, end){
  if (end <= start) return value >= end ? 1 : 0;
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}
function px(text, base){
  const count = Array.from(text || "").length;
  if (count <= 16) return base;
  if (count <= 32) return Math.round(base * 0.82);
  if (count <= 60) return Math.round(base * 0.68);
  return Math.round(base * 0.56);
}
function cueAt(time){
  let chosen = 0;
  DATA.cues.forEach((cue, index) => { if (time >= cue.start) chosen = index; });
  return chosen;
}
function fill(cue){
  if (cue.layout === "title"){
    const title = DATA.title || cue.text;
    const titleEl = document.getElementById("title-text");
    titleEl.textContent = title;
    titleEl.style.fontSize = px(title, 84) + "px";
    const sub = document.getElementById("title-sub");
    sub.textContent = DATA.title ? cue.text : "";
    sub.style.fontSize = px(cue.text, 40) + "px";
  } else if (cue.layout === "quote"){
    const el = document.getElementById("quote-text");
    el.textContent = cue.text;
    el.style.fontSize = px(cue.text, 68) + "px";
  } else if (cue.layout === "body"){
    const el = document.getElementById("body-text");
    el.textContent = cue.text;
    el.style.fontSize = px(cue.text, 52) + "px";
  } else if (cue.layout === "list"){
    const rows = document.getElementById("list-rows");
    rows.replaceChildren();
    (cue.listItems || [cue.text]).forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "list-row" + (index === cue.listIndex ? " on" : "");
      const idx = document.createElement("span");
      idx.className = "idx sans";
      idx.textContent = String(index + 1).padStart(2, "0");
      const tx = document.createElement("span");
      tx.className = "tx serif";
      tx.textContent = item;
      row.append(idx, tx);
      rows.appendChild(row);
    });
  } else if (cue.layout === "end"){
    const el = document.getElementById("end-text");
    el.textContent = cue.text;
    el.style.fontSize = px(cue.text, 72) + "px";
  }
  caption.textContent = cue.text;
  caption.style.fontSize = (Array.from(cue.text).length > 22 ? 36 : 48) + "px";
}
function seek(time){
  time = clamp(time, 0, DATA.duration);
  const index = cueAt(time);
  const cue = DATA.cues[index];
  if (index !== lastIndex){
    lastIndex = index;
    fill(cue);
  }
  const appear = ramp(time, Math.max(0, cue.start), cue.start + 0.35);
  Object.entries(scenes).forEach(([name, el]) => {
    el.style.opacity = name === cue.layout ? String(appear) : "0";
  });
  nav.style.opacity = String(ramp(time, 0.05, 0.35));
  progress.style.width = (clamp(time / DATA.duration, 0, 1) * 900) + "px";
  const labels = navItems.querySelectorAll("span");
  labels.forEach((label, chapter) => label.classList.toggle("on", chapter === cue.chapter));
  const chapter = DATA.chapters[cue.chapter];
  chap.textContent = chapter ? chapter.title : "";
  chap.style.opacity = String(appear);
  caption.style.opacity = String(appear);
}
window.seek = seek;
window.DURATION = DATA.duration;
seek(0);
</script>
</body>
</html>
`;
}
