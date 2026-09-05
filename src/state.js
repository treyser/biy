// Спільна робота зі станом бою.
import OBR from "@owlbear-rodeo/sdk";

export const ID = "com.nikita.battle";
export const STATE = `${ID}/state`;   // стан бою — у метаданих кімнати
export const LINK = `${ID}/link`;     // привʼязка токена до листа — у метаданих токена

// ключ, під яким лист персонажа зберігає листи (те саме розширення, той самий домен)
export const SHEETS = "com.nikita.character-sheet/sheets";

// код власника листа — його ставить розширення листа, localStorage спільний на домен
export const MINE = localStorage.getItem("sheet-owner");

export const EMPTY = { active: false, round: 0, turn: 0, order: [] };

export async function getState() {
  const meta = await OBR.room.getMetadata();
  return { ...EMPTY, ...(meta[STATE] ?? {}) };
}

export async function setState(next) {
  await OBR.room.setMetadata({ [STATE]: next });
}

export async function getSheets() {
  const meta = await OBR.room.getMetadata();
  return meta[SHEETS] ?? {};
}

export const d20 = () => 1 + Math.floor(Math.random() * 20);

export const modOf = (score) => Math.floor((Number(score) - 10) / 2);
export const fmt = (n) => (n >= 0 ? "+" : "") + n;

// Спритність героя з його листа
export function dexOf(sheet) {
  return modOf(sheet?.stats?.dex ?? 10);
}

// Сортування: більша ініціатива вище, при рівних — більша Спритність,
// далі стабільно за іменем, щоб порядок не стрибав при кожному перемальовуванні.
export function sortOrder(order) {
  return [...order].sort((a, b) => {
    if (b.init !== a.init) return (b.init ?? -99) - (a.init ?? -99);
    if (b.dex !== a.dex) return b.dex - a.dex;
    return a.name.localeCompare(b.name, "uk");
  });
}
