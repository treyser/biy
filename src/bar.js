import "./style.css";
import OBR from "@owlbear-rodeo/sdk";
import { STATE, sortOrder } from "./state.js";

const strip = document.getElementById("strip");
let portraits = {};  // id токена → url картинки

OBR.onReady(async () => {
  const meta = await OBR.room.getMetadata();
  await draw(meta[STATE]);
  OBR.room.onMetadataChange((m) => draw(m[STATE]));
});

async function draw(state) {
  const s = { active: false, turn: 0, round: 0, order: [], ...(state ?? {}) };
  const ready = sortOrder(s.order.filter((e) => e.init !== null));

  strip.innerHTML = "";
  if (!s.active || !ready.length) return;

  await loadPortraits(ready.map((e) => e.id));

  ready.forEach((e, i) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell " + e.side + (i === s.turn ? " now" : "");
    cell.title = `${e.name} — ${e.init}`;

    const img = portraits[e.id];
    if (img) {
      const pic = document.createElement("img");
      pic.src = img;
      pic.alt = "";
      cell.appendChild(pic);
    } else {
      const initials = document.createElement("span");
      initials.className = "initials";
      initials.textContent = e.name.slice(0, 2).toUpperCase();
      cell.appendChild(initials);
    }

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = e.init;
    cell.appendChild(num);

    cell.addEventListener("click", () => focus(e.id));
    strip.appendChild(cell);
  });
}

// картинки токенів беремо зі сцени
async function loadPortraits(ids) {
  const items = await OBR.scene.items.getItems(ids);
  portraits = {};
  for (const item of items) {
    if (item.image?.url) portraits[item.id] = item.image.url;
  }
}

async function focus(id) {
  try {
    const bounds = await OBR.scene.items.getItemBounds([id]);
    await OBR.viewport.animateToBounds(bounds);
  } catch {
    // токена вже нема
  }
}
