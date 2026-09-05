// Реєструє пункти контекстного меню.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./state.js";

const BASE = import.meta.env.BASE_URL;
const url = (p) => new URL(BASE + p, window.location.origin).href;

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
});
