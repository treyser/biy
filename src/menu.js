import "./style.css";
import OBR from "@owlbear-rodeo/sdk";
import { LINK, STATE, getState, setState, getSheets, dexOf } from "./state.js";

const $ = (id) => document.getElementById(id);
let targets = [];

OBR.onReady(init);

async function init() {
  targets = (await OBR.player.getSelection()) ?? [];
  if (!targets.length) return;

  const items = await OBR.scene.items.getItems(targets);
  const token = items[0];
  $("who").textContent =
    targets.length > 1 ? `Вибрано токенів: ${targets.length}` : token?.text?.plainText || token?.name || "Токен";

  // список листів, які вже є в кімнаті
  const sheets = await getSheets();
  for (const [id, sheet] of Object.entries(sheets)) {
    $("sheet").appendChild(new Option(sheet.name?.trim() || "Без імені", id));
  }
  $("sheet").value = token?.metadata[LINK] ?? "";

  $("sheet").addEventListener("change", link);
  $("add").addEventListener("click", add);
  $("drop").addEventListener("click", drop);

  await refresh();
}

async function link() {
  const value = $("sheet").value;
  await OBR.scene.items.updateItems(targets, (items) => {
    for (const i of items) {
      if (value) i.metadata[LINK] = value;
      else delete i.metadata[LINK];
    }
  });
  $("hint").textContent = value ? "Привʼязано" : "Привʼязку знято";
}

async function add() {
  const state = await getState();
  const items = await OBR.scene.items.getItems(targets);
  const sheets = await getSheets();
  const order = [...state.order];

  for (const item of items) {
    if (order.some((e) => e.id === item.id)) continue;
    const sheetId = item.metadata[LINK];
    const sheet = sheetId ? sheets[sheetId] : null;
    order.push({
      id: item.id,
      sheetId: sheetId ?? null,
      name: sheet?.name?.trim() || item.text?.plainText || item.name || "Учасник",
      side: sheetId ? "hero" : "foe",
      dex: sheet ? dexOf(sheet) : 0,
      init: null,
      roll: null,
    });
  }

  await setState({ ...state, order });
  await refresh();
}

async function drop() {
  const state = await getState();
  const order = state.order.filter((e) => !targets.includes(e.id));
  await setState({ ...state, order });
  await refresh();
}

async function refresh() {
  const state = await getState();
  const inFight = state.order.filter((e) => targets.includes(e.id)).length;
  $("hint").textContent = inFight
    ? `У бою${inFight > 1 ? `: ${inFight}` : ""}`
    : "Не в бою";
}
