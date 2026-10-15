// Реєструє контекстне меню, тримає смугу порядку ходу й пропонує гравцеві кинути ініціативу.
import OBR from "@owlbear-rodeo/sdk";
import { ID, STATE, ROLL, inQueue, mine } from "./state.js";

const BASE = import.meta.env.BASE_URL;
const url = (p) => new URL(BASE + p, window.location.origin).href;

const BAR = `${ID}/bar`;
const CELL = 66;     // звичайна комірка з проміжком
const BIG = 22;      // на скільки ширша комірка того, хто ходить
const GAP = 46;      // розділювач раундів
const HEIGHT = 196;  // смуга + ім'я + банер «Ваш хід»

let shown = 0;       // скільки комірок зараз показано; 0 — смуги немає
let asked = null;    // для якого бою вже відкривали вікно кидка

OBR.onReady(() => {
  OBR.contextMenu.create({
    id: `${ID}/menu`,
    icons: [
      {
        icon: url("icon.svg"),
        label: "Бій",
        filter: {
          every: [
            { key: "type", value: "IMAGE" },
            { key: "layer", value: "CHARACTER" },
          ],
        },
      },
    ],
    embed: { url: url("menu.html"), height: 260 },
  });

  OBR.room.getMetadata().then((m) => sync(m[STATE]));
  OBR.room.onMetadataChange((m) => sync(m[STATE]));
});

async function sync(state) {
  const s = { active: false, order: [], ...(state ?? {}) };
  const count = s.active ? inQueue(s.order).length : 0;

  // Бій почався, а мій герой ще не кидав — відкриваємо вікно кидка
  if (s.active && s.started && asked !== s.started && s.order.some((e) => mine(e) && e.init === null)) {
    asked = s.started;
    OBR.modal.open({ id: ROLL, url: url("roll.html"), width: 460, height: 520 }).catch(() => {});
  }

  if (!count) {
    if (shown) {
      await OBR.popover.close(BAR);
      shown = 0;
    }
    return;
  }

  // ширина залежить від кількості учасників, тож переоткриваємо при зміні
  if (count !== shown) {
    if (shown) await OBR.popover.close(BAR);
    await place(count);
    shown = count;
  }
}

async function place(count) {
  const viewWidth = await OBR.viewport.getWidth();
  const width = Math.min(count * CELL + BIG + (count > 1 ? GAP : 0) + 40, viewWidth);

  await OBR.popover.open({
    id: BAR,
    url: url("bar.html"),
    width,
    height: HEIGHT,
    anchorReference: "POSITION",
    anchorPosition: { top: 52, left: viewWidth / 2 },
    anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
    transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
    hidePaper: true,          // без рамки — сама смуга малює тло
    disableClickAway: true,   // не закривати кліком по мапі
    marginThreshold: 0,
  });
}
