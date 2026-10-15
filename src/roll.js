// Кидок ініціативи гравця: d20 крутиться, падає, до нього додається Спритність (і бонус).
// Можна вписати й свій кидок фізичним кубиком.
import "./style.css";
import OBR from "@owlbear-rodeo/sdk";
import { ROLL, getState, patchEntry, getSheets, dexOf, d20, fmt, mine } from "./state.js";

const $ = (id) => document.getElementById(id);
let hero = null;
let busy = false;

OBR.onReady(async () => {
  $("close").onclick = () => OBR.modal.close(ROLL);
  $("go").onclick = () => throwDie(d20(), true);
  $("ownok").onclick = () => {
    const v = Math.round(Number($("own").value));
    if (v >= 1 && v <= 20) throwDie(v, false);
    else $("own").focus();
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") OBR.modal.close(ROLL);
    if (e.key === "Enter" && document.activeElement !== $("own")) $("go").click();
  });
  await pick();
});

// Перший мій герой, який ще не кидав
async function pick() {
  const s = await getState();
  hero = s.order.find((e) => mine(e) && e.init === null) ?? null;
  if (!hero) {
    $("name").textContent = "Тобі кидати нічого";
    $("actions").hidden = true;
    return;
  }
  const sheets = await getSheets();
  if (sheets[hero.sheetId]) hero.dex = dexOf(sheets[hero.sheetId]);
  $("name").textContent = `${hero.name} · Спритність ${fmt(hero.dex)}`;
  $("bonus").value = String(hero.bonus ?? 0);
  $("actions").hidden = false;
  $("sum").innerHTML = "&nbsp;";
  $("die").classList.remove("landed", "crit", "fumble");
}

function throwDie(result, animate) {
  if (busy || !hero) return;
  busy = true;
  const die = $("die");
  const face = $("face");
  die.classList.remove("landed", "crit", "fumble");
  die.classList.add("spin");
  const t0 = performance.now();
  const ms = animate ? 1300 : 350;
  const tick = () => {
    const p = (performance.now() - t0) / ms;
    if (p < 1) {
      face.textContent = String(d20());
      setTimeout(tick, 40 + p * 120);   // числа сповільнюються, як кубик, що зупиняється
      return;
    }
    face.textContent = String(result);
    die.classList.remove("spin");
    die.classList.add("landed");
    if (result === 20) die.classList.add("crit");
    if (result === 1) die.classList.add("fumble");
    land(result);
  };
  tick();
}

async function land(result) {
  const bonus = Number($("bonus").value) || 0;
  const total = result + hero.dex + bonus;
  $("sum").innerHTML = `${result} ${fmt(hero.dex)}${bonus ? ` ${fmt(bonus)}` : ""} = <b>${total}</b>`;
  await patchEntry(hero.id, (x) => ({ ...x, roll: result, dex: hero.dex, bonus, init: total }));
  busy = false;
  // ще один мій герой? — до нього; інакше закриваємось
  setTimeout(async () => {
    const s = await getState();
    if (s.order.some((e) => mine(e) && e.init === null)) await pick();
    else OBR.modal.close(ROLL);
  }, 2200);
}
