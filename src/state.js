// Спільна робота зі станом бою.
import OBR from "@owlbear-rodeo/sdk";

export const ID = "com.nikita.battle";
export const STATE = `${ID}/state`;   // стан бою — у метаданих кімнати
export const LINK = `${ID}/link`;     // привʼязка токена до листа — у метаданих токена
export const ROLL = `${ID}/roll`;     // вікно кидка ініціативи
export const OPTS = `${ID}/opts`;     // налаштування бою (зв'язок з Атмосферою) — у метаданих кімнати

// ключ, під яким лист персонажа зберігає листи (те саме розширення, той самий домен)
export const SHEETS = "com.nikita.character-sheet/sheets";

// «Атмосфера»: титр, музика, корабельний журнал
export const ATM = {
  TITLE: "com.nikita.atmosphere/title",
  MUSIC: "com.nikita.atmosphere/music",
  LOG_ADD: "com.nikita.atmosphere/log-add",
};

// код власника листа — його ставить розширення листа, localStorage спільний на домен
export const MINE = (() => { try { return localStorage.getItem("sheet-owner"); } catch { return null; } })();

export const EMPTY = { active: false, round: 0, turn: 0, order: [] };

// Здоров'я без цифр: лише як виглядає учасник. 0 — цілий, 4 — ледве живий.
export const HEALTH = [
  { name: "Неушкоджений", short: "цілий" },
  { name: "Подряпаний", short: "подряпаний" },
  { name: "Поранений", short: "поранений" },
  { name: "Тяжко поранений", short: "тяжко поранений" },
  { name: "Ледве живий", short: "ледве живий" },
];
// Окремі стани: непритомний (герой при 0 — його хід лишається для рятівних кидків) і мертвий (хід пропускається)
export const DOWN = { down: "Непритомний", dead: "Мертвий" };

// Стани з правил 5e (назви за українським SRD) + концентрація
export const CONDS = [
  { k: "blinded", name: "Засліплений", icon: "🕶" },
  { k: "charmed", name: "Зачарований", icon: "💗" },
  { k: "deafened", name: "Оглушений", icon: "🔇" },
  { k: "frightened", name: "Наляканий", icon: "😱" },
  { k: "grappled", name: "Схоплений", icon: "✊" },
  { k: "incapacitated", name: "Недієздатний", icon: "⛔" },
  { k: "invisible", name: "Невидимий", icon: "👻" },
  { k: "paralyzed", name: "Паралізований", icon: "⚡" },
  { k: "petrified", name: "Скам'янілий", icon: "🗿" },
  { k: "poisoned", name: "Отруєний", icon: "🧪" },
  { k: "prone", name: "Збитий з ніг", icon: "⤵" },
  { k: "restrained", name: "Обплутаний", icon: "⛓" },
  { k: "stunned", name: "Приголомшений", icon: "💫" },
  { k: "exhaustion", name: "Виснаження", icon: "🥱" },
  { k: "concentration", name: "Концентрація", icon: "🔮" },
  { k: "blessed", name: "Благословенний", icon: "✨" },
];
export const cond = (k) => CONDS.find((c) => c.k === k) ?? { k, name: k, icon: "•" };

export async function getState() {
  const meta = await OBR.room.getMetadata();
  return { ...EMPTY, ...(meta[STATE] ?? {}) };
}

export async function setState(next) {
  await OBR.room.setMetadata({ [STATE]: next });
}

// Змінити одного учасника, не чіпаючи решту
export async function patchEntry(id, fn) {
  const s = await getState();
  await setState({ ...s, order: s.order.map((e) => (e.id === id ? fn({ ...e }) : e)) });
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

// Хто бере участь у черзі: кинув ініціативу й не мертвий
export const inQueue = (order) => sortOrder(order.filter((e) => e.init !== null && !e.dead));

// Чий зараз хід (запис) — за id, щоб смерть чи вихід когось не зсували чергу
export function current(s) {
  const q = inQueue(s.order ?? []);
  if (!q.length) return null;
  return q.find((e) => e.id === s.now) ?? q[Math.min(s.turn ?? 0, q.length - 1)];
}

// Наступний хід: пропускаємо мертвих; на межі черги — новий раунд, стани з таймером тануть
export function advance(s) {
  const q = inQueue(s.order);
  if (!q.length) return s;
  const cur = current(s);
  let i = cur ? q.indexOf(cur) + 1 : 0;
  let round = s.round;
  let order = s.order;
  if (i >= q.length) {
    i = 0;
    round += 1;
    order = order.map((e) => ({
      ...e,
      conds: (e.conds ?? []).map((c) => (c.r == null ? c : { ...c, r: c.r - 1 })).filter((c) => c.r == null || c.r > 0),
    }));
  }
  return { ...s, order, round, turn: i, now: q[i].id };
}

export const mine = (entry) => entry.side === "hero" && !!MINE && entry.sheetId === MINE;

// Як учасника бачать інші: здоров'я словами
export function healthLabel(e) {
  if (e.dead) return DOWN.dead;
  if (e.down) return DOWN.down;
  return HEALTH[e.health ?? 0].name;
}
