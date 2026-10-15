// Вікно рятівних кидків від смерті. Кубик гравець кидає справжній, а тут лише позначає результат:
// бачать усі, позначати можуть сам гравець і майстер.
import OBR from "@owlbear-rodeo/sdk";
import "./style.css";
import { STATE, OPTS, ATM, dying, dsOf, markSave, patchEntry, mine } from "./state.js";

const $ = (id) => document.getElementById(id);
const STATES = { stable: "Стабілізований", dead: "Загинув", up: "Опритомнів!" };
let gm = false;
let pics = {};
let last = new Map();   // що було намальовано — щоб анімувати лише нові позначки

OBR.onReady(async () => {
  gm = (await OBR.player.getRole()) === "GM";
  const draw = async (m) => {
    const s = m[STATE] ?? {};
    const rows = dying(s.order);
    for (const e of rows) {
      if (pics[e.id] !== undefined) continue;
      try { const [it] = await OBR.scene.items.getItems([e.id]); pics[e.id] = it?.image?.url ?? ""; } catch { pics[e.id] = ""; }
    }
    render(rows);
  };
  OBR.room.onMetadataChange(draw);
  draw(await OBR.room.getMetadata());
  setInterval(async () => draw(await OBR.room.getMetadata()), 1000);   // щоб «чим скінчилось» зникало вчасно
});

function render(rows) {
  const box = $("rows");
  const seen = new Set();
  for (const e of rows) {
    seen.add(e.id);
    const d = dsOf(e);
    const end = d.end ?? "";
    let row = box.querySelector(`[data-id="${e.id}"]`);
    if (!row) {
      row = document.createElement("div");
      row.dataset.id = e.id;
      row.innerHTML = `<div class="dspic"></div><div><div class="dsname"></div><div class="dsstate"></div>
        <div class="dstrack"><div class="ok">Успіхи <i></i><i></i><i></i></div><div class="no">Провали <i></i><i></i><i></i></div></div>
        <div class="dsbtns"></div></div>`;
      box.append(row);
    }
    row.className = `dsrow ${end || (d.stable ? "stable" : "")}`;
    if (pics[e.id]) row.querySelector(".dspic").style.backgroundImage = `url("${pics[e.id]}")`;
    row.querySelector(".dsname").textContent = e.name;
    row.querySelector(".dsstate").textContent = STATES[end] ?? (d.stable ? STATES.stable : "При смерті");
    const was = last.get(e.id) ?? { ok: 0, fail: 0 };
    row.querySelectorAll(".ok i").forEach((i, n) => { i.classList.toggle("on", n < d.ok); if (n >= was.ok && n < d.ok) pop(i); });
    row.querySelectorAll(".no i").forEach((i, n) => { i.classList.toggle("on", n < d.fail); if (n >= was.fail && n < d.fail) pop(i); });
    last.set(e.id, { ok: d.ok, fail: d.fail });

    // кнопки — лише власникові героя й майстрові, і лише поки доля не вирішена
    const btns = row.querySelector(".dsbtns");
    const can = (gm || mine(e)) && !end && e.down;
    const key = can ? `${gm}|${d.stable}` : "";
    if (btns.dataset.key !== key) {
      btns.dataset.key = key;
      btns.replaceChildren();
      if (can) {
        if (!d.stable) {
          btns.append(btn("✓ Успіх (10+)", "okb", () => save(e.id, "ok")));
          btns.append(btn("✕ Провал", "nob", () => save(e.id, "fail")));
          btns.append(btn("1 — два провали", "nob", () => save(e.id, "fail2")));
          btns.append(btn("20 — встає!", "nat", () => save(e.id, "twenty")));
        } else {
          btns.append(btn("Отримав шкоду — провал", "nob", () => save(e.id, "fail")));
        }
        if (gm && !d.stable) btns.append(btn("Стабілізувати", "", () => save(e.id, "stable")));
      }
    }
  }
  for (const row of [...box.children]) if (!seen.has(row.dataset.id)) row.remove();
}

function pop(i) { i.classList.remove("pop"); void i.offsetWidth; i.classList.add("pop"); }

function btn(text, cls, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  b.onclick = fn;
  return b;
}

async function save(id, kind) {
  let after = null;
  await patchEntry(id, (x) => (after = markSave(x, kind)));
  // загибель героя — подія для всіх: титр і запис у корабельний журнал
  if (after?.ds?.end === "dead") {
    const opts = (await OBR.room.getMetadata())[OPTS] ?? {};
    if (opts.atm !== false) {
      setTimeout(() => OBR.broadcast.sendMessage(ATM.TITLE, { big: after.name, small: "Пав у бою" }, { destination: "ALL" }).catch(() => {}), 3500);
      OBR.broadcast.sendMessage(ATM.LOG_ADD, { k: "g", t: `${after.name} загинув у бою.`, w: "Майстер" }, { destination: "ALL" }).catch(() => {});
    }
  }
}
