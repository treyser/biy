import "./style.css";
import OBR from "@owlbear-rodeo/sdk";
import {
  STATE, OPTS, ROLL, ATM, MINE, HEALTH, DOWN, CONDS, cond,
  getState, setState, patchEntry, d20, fmt, sortOrder, inQueue, current, advance, mine, healthLabel,
} from "./state.js";

const $ = (id) => document.getElementById(id);
const url = (p) => new URL(import.meta.env.BASE_URL + p, window.location.origin).href;
let isGM = false;
let state = null;
let opts = { atm: true, boss: false };
let open = null;        // id учасника, чий редактор розгорнуто
let portraits = {};

OBR.onReady(init);

async function init() {
  isGM = (await OBR.player.getRole()) === "GM";
  $("gm-top").hidden = !isGM;
  $("gm-opts").hidden = !isGM;

  const meta = await OBR.room.getMetadata();
  state = { ...(meta[STATE] ?? {}) };
  opts = { ...opts, ...(meta[OPTS] ?? {}) };
  await loadPortraits();
  render();

  OBR.room.onMetadataChange(async (m) => {
    state = { ...(m[STATE] ?? {}) };
    opts = { ...opts, ...(m[OPTS] ?? {}) };
    await loadPortraits();
    render();
  });

  $("start").addEventListener("click", start);
  $("next").addEventListener("click", next);
  $("end").addEventListener("click", end);
  $("roll").addEventListener("click", () => OBR.modal.open({ id: ROLL, url: url("roll.html"), width: 460, height: 520 }));
  $("opt-atm").addEventListener("change", () => OBR.room.setMetadata({ [OPTS]: { ...opts, atm: $("opt-atm").checked } }));
  $("opt-boss").addEventListener("change", () => OBR.room.setMetadata({ [OPTS]: { ...opts, boss: $("opt-boss").checked } }));
}

// --- Майстер ---

async function start() {
  const s = await getState();
  if (!s.order.length) return;
  // ворогам кидаємо одразу, герої кидають самі
  const order = s.order.map((e) =>
    e.side === "foe" ? roll(e) : { ...e, init: null, roll: null }
  );
  await setState({ ...s, active: true, round: 1, turn: 0, now: null, started: Date.now(), order });
  if (opts.atm) await atmosphereStart();
}

async function next() {
  await setState(advance(await getState()));
}

async function end() {
  const s = await getState();
  const fallen = s.order.filter((e) => e.side === "foe" && e.dead).map((e) => e.name);
  await setState({ ...s, active: false, round: 0, turn: 0, now: null,
    order: s.order.map((e) => ({ ...e, init: null, roll: null })) });
  if (opts.atm) await atmosphereEnd(s.round, fallen);
}

function roll(entry) {
  const r = d20();
  return { ...entry, roll: r, init: r + entry.dex + (entry.bonus ?? 0) };
}

// --- «Атмосфера»: титр і бойова музика на початку, звичайна музика й запис у журнал наприкінці ---

async function atmosphereStart() {
  try {
    await OBR.broadcast.sendMessage(ATM.TITLE, { big: opts.boss ? "Бій не на життя" : "До бою!", small: "Раунд перший" }, { destination: "ALL" });
    const m = (await OBR.room.getMetadata())[ATM.MUSIC] ?? {};
    await OBR.room.setMetadata({ [ATM.MUSIC]: { ...m, before: m.override ?? null, override: opts.boss ? "boss" : "battle" } });
  } catch (err) { console.error("Бій → Атмосфера:", err); }
}

async function atmosphereEnd(rounds, fallen) {
  try {
    const m = (await OBR.room.getMetadata())[ATM.MUSIC] ?? {};
    if (m.override === "battle" || m.override === "boss") {
      const { before, ...rest } = m;
      await OBR.room.setMetadata({ [ATM.MUSIC]: { ...rest, override: before ?? null } });
    }
    const r = rounds === 1 ? "1 раунд" : rounds < 5 ? `${rounds} раунди` : `${rounds} раундів`;
    const n = fallen.length;
    const t = `Бій завершено за ${r}.` + (n ? ` Переможено ворогів: ${n}.` : "");
    await OBR.broadcast.sendMessage(ATM.LOG_ADD, { k: "g", t, w: "Майстер" }, { destination: "ALL" });
  } catch (err) { console.error("Бій → Атмосфера:", err); }
}

// --- Малювання ---

async function loadPortraits() {
  const ids = (state.order ?? []).map((e) => e.id);
  portraits = {};
  if (!ids.length || !(await OBR.scene.isReady())) return;
  for (const item of await OBR.scene.items.getItems(ids)) if (item.image?.url) portraits[item.id] = item.image.url;
}

function render() {
  const s = { active: false, round: 0, turn: 0, order: [], ...state };
  const order = sortOrder(s.order);
  const now = s.active ? current(s) : null;
  const waiting = order.filter((e) => e.init === null);

  $("round").textContent = s.active ? `Раунд ${s.round}` : "Бою немає";
  $("sub").textContent = now ? ` · ходить ${now.name}` : "";
  $("start").hidden = s.active;
  $("next").hidden = !s.active;
  $("end").hidden = !s.active;
  $("opt-atm").checked = opts.atm !== false;
  $("opt-boss").checked = Boolean(opts.boss);

  const pending = s.order.filter((e) => mine(e) && e.init === null);
  $("roll").hidden = !(s.active && pending.length);
  $("hint").textContent = s.active && waiting.length ? `Чекаємо на кидки: ${waiting.map((e) => e.name).join(", ")}` : "";

  const list = $("list");
  list.replaceChildren();
  if (!order.length) {
    list.innerHTML = '<div class="empty">Додай учасників через ПКМ на токені</div>';
    return;
  }

  for (const e of order) {
    const canEdit = isGM || mine(e);
    const row = document.createElement("div");
    row.className = `entry ${e.side}` + (now && now.id === e.id ? " now" : "") + (e.init === null ? " pale" : "") + (e.dead ? " dead" : "") + (e.down ? " down" : "");

    const num = document.createElement("div");
    num.className = "init";
    num.textContent = e.init ?? "—";

    const pic = document.createElement("div");
    pic.className = "pic";
    if (portraits[e.id]) pic.style.backgroundImage = `url("${portraits[e.id]}")`;
    else pic.textContent = e.name.slice(0, 2).toUpperCase();

    const mid = document.createElement("div");
    mid.className = "mid";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = e.name;
    const hp = document.createElement("div");
    hp.className = `hp h${e.dead ? "x" : e.down ? "d" : e.health ?? 0}`;
    hp.textContent = healthLabel(e);
    const conds = document.createElement("div");
    conds.className = "conds";
    for (const c of e.conds ?? []) {
      const i = document.createElement("span");
      i.title = cond(c.k).name + (c.r ? ` — ще ${c.r} р.` : "");
      i.textContent = cond(c.k).icon + (c.r ? c.r : "");
      conds.append(i);
    }
    mid.append(name, hp, conds);

    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = isGM && e.roll != null ? `${e.roll}${fmt(e.dex + (e.bonus ?? 0))}` : "";

    row.append(num, pic, mid, detail);
    row.addEventListener("click", () => {
      focus(e.id);
      if (canEdit) { open = open === e.id ? null : e.id; render(); }
    });
    list.append(row);
    if (open === e.id && canEdit) list.append(editor(e));
  }
}

// Редактор учасника: здоров'я, стани, бонус ініціативи
function editor(e) {
  const box = document.createElement("div");
  box.className = "editor";

  const hp = document.createElement("div");
  hp.className = "chips";
  HEALTH.forEach((h, i) => {
    const b = chip(h.name, !e.dead && !e.down && (e.health ?? 0) === i, () => patchEntry(e.id, (x) => ({ ...x, health: i, down: false, dead: false })));
    b.classList.add(`h${i}`);
    hp.append(b);
  });
  if (e.side === "hero") hp.append(chip(DOWN.down, e.down, () => patchEntry(e.id, (x) => ({ ...x, down: !x.down, dead: false }))));
  hp.append(chip(DOWN.dead, e.dead, () => patchEntry(e.id, (x) => ({ ...x, dead: !x.dead, down: false }))));

  const lbl = (t) => Object.assign(document.createElement("div"), { className: "lbl", textContent: t });

  const have = document.createElement("div");
  have.className = "chips";
  for (const c of e.conds ?? []) {
    have.append(chip(`${cond(c.k).icon} ${cond(c.k).name}${c.r ? ` · ${c.r} р.` : ""} ✕`, true, () =>
      patchEntry(e.id, (x) => ({ ...x, conds: (x.conds ?? []).filter((y) => y.k !== c.k) }))));
  }

  const add = document.createElement("div");
  add.className = "addcond";
  const sel = document.createElement("select");
  for (const c of CONDS) sel.append(new Option(`${c.icon} ${c.name}`, c.k));
  const rounds = document.createElement("input");
  rounds.type = "number";
  rounds.min = "1";
  rounds.placeholder = "раундів";
  rounds.title = "Скільки раундів триває; порожньо — доки не знімеш";
  const plus = document.createElement("button");
  plus.type = "button";
  plus.textContent = "Додати";
  plus.onclick = (ev) => {
    ev.stopPropagation();
    const r = Number(rounds.value) > 0 ? Math.round(Number(rounds.value)) : null;
    patchEntry(e.id, (x) => ({ ...x, conds: [...(x.conds ?? []).filter((y) => y.k !== sel.value), { k: sel.value, r }] }));
  };
  add.append(sel, rounds, plus);
  for (const el of [sel, rounds]) el.addEventListener("click", (ev) => ev.stopPropagation());

  box.append(lbl("Як виглядає"), hp, lbl("Стани"), have, add);

  if (isGM) {
    const extra = document.createElement("div");
    extra.className = "addcond";
    const bonus = document.createElement("input");
    bonus.type = "number";
    bonus.value = String(e.bonus ?? 0);
    bonus.title = "Додатковий бонус до ініціативи";
    bonus.addEventListener("click", (ev) => ev.stopPropagation());
    bonus.addEventListener("change", () => patchEntry(e.id, (x) => ({ ...x, bonus: Number(bonus.value) || 0 })));
    const reroll = document.createElement("button");
    reroll.type = "button";
    reroll.textContent = "Перекинути ініціативу";
    reroll.onclick = (ev) => { ev.stopPropagation(); patchEntry(e.id, (x) => roll(x)); };
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "ghost danger";
    drop.textContent = "Прибрати з бою";
    drop.onclick = async (ev) => {
      ev.stopPropagation();
      const s = await getState();
      open = null;
      await setState({ ...s, order: s.order.filter((x) => x.id !== e.id) });
    };
    extra.append(Object.assign(document.createElement("span"), { className: "lbl", textContent: "Бонус" }), bonus, reroll, drop);
    box.append(extra);
  }
  box.addEventListener("click", (ev) => ev.stopPropagation());
  return box;
}

function chip(text, on, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip" + (on ? " on" : "");
  b.textContent = text;
  b.onclick = (ev) => { ev.stopPropagation(); fn(); };
  return b;
}

async function focus(id) {
  try {
    const bounds = await OBR.scene.items.getItemBounds([id]);
    await OBR.viewport.animateToBounds(bounds);
  } catch {
    // токена вже нема на сцені — не біда
  }
}
