import "./style.css";
import OBR from "@owlbear-rodeo/sdk";
import { STATE, LINK, MINE, getState, setState, getSheets, d20, fmt, sortOrder, dexOf } from "./state.js";

const $ = (id) => document.getElementById(id);
let isGM = false;
let state = null;
let mySheets = [];   // коди листів, що належать цьому браузеру

OBR.onReady(init);

async function init() {
  isGM = (await OBR.player.getRole()) === "GM";
  $("gm-top").hidden = !isGM;

  mySheets = MINE ? [MINE] : [];

  const meta = await OBR.room.getMetadata();
  state = { ...(meta[STATE] ?? {}) };
  render();

  OBR.room.onMetadataChange((m) => {
    state = { ...(m[STATE] ?? {}) };
    render();
  });

  $("start").addEventListener("click", start);
  $("next").addEventListener("click", next);
  $("end").addEventListener("click", end);
  $("roll").addEventListener("click", rollMine);
}

// --- Майстер ---

async function start() {
  const s = await getState();
  if (!s.order.length) return;

  // ворогам кидаємо одразу, герої кидають самі
  const order = s.order.map((e) =>
    e.side === "foe" ? roll(e) : { ...e, init: null, roll: null }
  );

  await setState({ ...s, active: true, round: 1, turn: 0, order });
}

async function next() {
  const s = await getState();
  const ready = sortOrder(s.order.filter((e) => e.init !== null));
  if (!ready.length) return;

  let turn = s.turn + 1;
  let round = s.round;
  if (turn >= ready.length) {
    turn = 0;
    round += 1;
  }
  await setState({ ...s, turn, round });
}

async function end() {
  const s = await getState();
  await setState({ ...s, active: false, round: 0, turn: 0,
    order: s.order.map((e) => ({ ...e, init: null, roll: null })) });
}

// --- Гравець ---

async function rollMine() {
  const s = await getState();
  const sheets = await getSheets();
  const order = s.order.map((e) => {
    if (!mine(e) || e.init !== null) return e;
    const dex = sheets[e.sheetId] ? dexOf(sheets[e.sheetId]) : e.dex;
    return roll({ ...e, dex });
  });
  await setState({ ...s, order });
}

function mine(entry) {
  return entry.side === "hero" && mySheets.includes(entry.sheetId);
}

function roll(entry) {
  const r = d20();
  return { ...entry, roll: r, init: r + entry.dex };
}

// --- Малювання ---

function render() {
  const s = { active: false, round: 0, turn: 0, order: [], ...state };
  const order = sortOrder(s.order);
  const ready = order.filter((e) => e.init !== null);
  const waiting = order.filter((e) => e.init === null);

  $("round").textContent = s.active ? `Раунд ${s.round}` : "Бою немає";
  $("start").hidden = s.active;
  $("next").hidden = !s.active;
  $("end").hidden = !s.active;

  // кнопка кидка — якщо є мій герой, який ще не кидав
  const pending = s.order.filter((e) => mine(e) && e.init === null);
  $("roll").hidden = !(s.active && pending.length);
  $("hint").textContent =
    s.active && waiting.length
      ? `Чекаємо на кидки: ${waiting.length}`
      : "";

  const list = $("list");
  list.innerHTML = "";

  if (!order.length) {
    list.innerHTML = '<div class="empty">Додай учасників через ПКМ на токені</div>';
    return;
  }

  order.forEach((e) => {
    const pos = ready.indexOf(e);
    const isNow = s.active && pos === s.turn && pos !== -1;

    const row = document.createElement("div");
    row.className = "entry" + (isNow ? " now" : "") + (e.init === null ? " pale" : "");

    const num = document.createElement("div");
    num.className = "init";
    num.textContent = e.init ?? "—";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = e.name;

    const tag = document.createElement("span");
    tag.className = "side " + e.side;
    tag.textContent = e.side === "hero" ? "герой" : "ворог";

    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = e.roll !== null ? `${e.roll} ${fmt(e.dex)}` : "";

    name.append(tag);
    row.append(num, name, detail);

    // клік по рядку наводить камеру на токен
    row.addEventListener("click", () => focus(e.id));

    list.appendChild(row);
  });
}

async function focus(id) {
  try {
    const bounds = await OBR.scene.items.getItemBounds([id]);
    await OBR.viewport.animateToBounds(bounds);
  } catch {
    // токена вже нема на сцені — не біда
  }
}
