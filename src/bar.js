// Смуга порядку ходу в дусі BG3: той, хто ходить, — першим і більшим, далі черга,
// розділювач нового раунду, після нього ті, хто вже походив. Під портретом — здоров'я без цифр і стани.
import "./style.css";
import OBR from "@owlbear-rodeo/sdk";
import { STATE, ROLL, inQueue, current, mine, cond, healthLabel } from "./state.js";

const $ = (id) => document.getElementById(id);
const url = (p) => new URL(import.meta.env.BASE_URL + p, window.location.origin).href;
let portraits = {};
let lastNow = null;

OBR.onReady(async () => {
  const meta = await OBR.room.getMetadata();
  await draw(meta[STATE]);
  OBR.room.onMetadataChange((m) => draw(m[STATE]));
  $("banner").onclick = () => {
    if ($("banner").dataset.kind === "roll") OBR.modal.open({ id: ROLL, url: url("roll.html"), width: 460, height: 520 });
  };
});

async function draw(state) {
  const s = { active: false, turn: 0, round: 0, order: [], ...(state ?? {}) };
  const q = inQueue(s.order);
  const strip = $("strip");
  strip.replaceChildren();
  if (!s.active || !q.length) { $("who").textContent = ""; $("banner").hidden = true; return; }

  await loadPortraits(q.map((e) => e.id));
  const now = current(s);
  const at = Math.max(0, q.indexOf(now));
  const ahead = q.slice(at);          // той, хто ходить, і ті, хто ще ходитиме цього раунду
  const done = q.slice(0, at);        // уже походили — наступного раунду

  ahead.forEach((e, i) => strip.append(cell(e, i === 0, false)));
  if (q.length > 1) {
    const div = document.createElement("div");
    div.className = "divider";
    div.innerHTML = `<span>Раунд</span><b>${s.round + 1}</b>`;
    strip.append(div);
  }
  done.forEach((e) => strip.append(cell(e, false, true)));

  // зсув черги, коли хід перейшов
  if (lastNow && lastNow !== now.id) {
    strip.classList.remove("shift");
    void strip.offsetWidth;
    strip.classList.add("shift");
  }
  lastNow = now.id;

  $("who").textContent = `${now.name} · раунд ${s.round}`;

  // банер для цього гравця: його хід або треба кинути ініціативу
  const myTurn = mine(now);
  const myPending = s.order.some((e) => mine(e) && e.init === null);
  const banner = $("banner");
  banner.hidden = !(myTurn || myPending);
  banner.dataset.kind = myTurn ? "turn" : "roll";
  banner.textContent = myTurn ? `Ваш хід, ${now.name}!` : "🎲 Кинь ініціативу";
  banner.classList.toggle("turn", myTurn);
}

function cell(e, isNow, past) {
  const c = document.createElement("button");
  c.type = "button";
  c.className = `cell ${e.side}` + (isNow ? " now" : "") + (past ? " past" : "") + (e.down ? " down" : "");
  c.title = `${e.name} — ${healthLabel(e)} · ініціатива ${e.init}`;

  const frame = document.createElement("div");
  frame.className = "frame";
  if (portraits[e.id]) {
    const img = document.createElement("img");
    img.src = portraits[e.id];
    img.alt = "";
    frame.append(img);
  } else {
    frame.append(Object.assign(document.createElement("span"), { className: "initials", textContent: e.name.slice(0, 2).toUpperCase() }));
  }
  const num = Object.assign(document.createElement("span"), { className: "num", textContent: e.init });
  frame.append(num);

  // стани — значки в куточку портрета
  if (e.conds?.length) {
    const cs = document.createElement("div");
    cs.className = "cs";
    for (const x of e.conds.slice(0, 4)) {
      const i = document.createElement("span");
      i.textContent = cond(x.k).icon;
      if (x.r) i.dataset.r = x.r;
      cs.append(i);
    }
    frame.append(cs);
  }
  if (e.down) frame.append(Object.assign(document.createElement("span"), { className: "downmark", textContent: "✚" }));

  // здоров'я: п'ять поділок без цифр
  const hp = document.createElement("div");
  hp.className = `hpbar h${e.down ? "d" : e.health ?? 0}`;
  const left = e.down ? 0 : 5 - (e.health ?? 0);
  for (let i = 0; i < 5; i++) hp.append(Object.assign(document.createElement("i"), { className: i < left ? "on" : "" }));

  c.append(frame, hp);
  c.addEventListener("click", () => focus(e.id));
  return c;
}

async function loadPortraits(ids) {
  portraits = {};
  if (!(await OBR.scene.isReady())) return;
  for (const item of await OBR.scene.items.getItems(ids)) if (item.image?.url) portraits[item.id] = item.image.url;
}

async function focus(id) {
  try {
    const bounds = await OBR.scene.items.getItemBounds([id]);
    await OBR.viewport.animateToBounds(bounds);
  } catch {
    // токена вже нема
  }
}
