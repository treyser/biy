// Реєструє контекстне меню і тримає смугу порядку ходу.
import OBR from "@owlbear-rodeo/sdk";
import { ID, STATE } from "./state.js";

const BASE = import.meta.env.BASE_URL;
const url = (p) => new URL(BASE + p, window.location.origin).href;

const BAR = `${ID}/bar`;
const CELL = 58;   // ширина комірки з проміжком
const HEIGHT = 78; // висота смуги з місцем на підняту комірку

let shown = 0;     // скільки комірок зараз показано; 0 — смуги немає

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
  const count = s.active ? s.order.filter((e) => e.init !== null).length : 0;

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
  const width = Math.min(count * CELL + 16, viewWidth);

  await OBR.popover.open({
    id: BAR,
    url: url("bar.html"),
    width,
    height: HEIGHT,
    anchorReference: "POSITION",
    anchorPosition: { top: 56, left: viewWidth / 2 },
    anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
    transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
    hidePaper: true,          // без рамки — сама смуга малює тло
    disableClickAway: true,   // не закривати кліком по мапі
    marginThreshold: 0,
  });
}
