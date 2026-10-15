// Реєструє контекстне меню, тримає смугу порядку ходу й пропонує гравцеві кинути ініціативу.
import OBR, { buildEffect } from "@owlbear-rodeo/sdk";
import { ID, STATE, ROLL, DS, SHOW_END, inQueue, mine, dying, dsOf } from "./state.js";

const BASE = import.meta.env.BASE_URL;
const url = (p) => new URL(BASE + p, window.location.origin).href;

const BAR = `${ID}/bar`;
const CELL = 66;     // звичайна комірка з проміжком
const BIG = 22;      // на скільки ширша комірка того, хто ходить
const GAP = 46;      // розділювач раундів
const HEIGHT = 196;  // смуга + ім'я + банер «Ваш хід»

let shown = 0;       // скільки комірок зараз показано; 0 — смуги немає
let asked = null;    // для якого бою вже відкривали вікно кидка
let dsRows = 0;      // скільки героїв показує вікно рятівних кидків
let dsTimer = null;
let fx = "";         // який ефект «при смерті» зараз на моєму екрані

// Мій герой при смерті: світ сірішає, краї темно-червоні й пульсують у такт серцю
const DYING = `
uniform shader scene;
uniform mat3 view;
uniform vec2 size;
uniform float time;
uniform float k;
uniform float pulse;
half4 main(float2 coord) {
  vec2 screen = (vec3(coord, 1) * view).xy;
  vec4 c = scene.eval(screen);
  vec2 uv = screen / size;
  float t = mod(time, 3600.0);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 rgb = mix(c.rgb, vec3(l) * vec3(1.0, 0.93, 0.9), 0.85 * k);
  rgb *= 1.0 - 0.18 * k;
  float ph = fract(t * 0.95);
  float beat = (exp(-ph * 18.0) + 0.6 * exp(-max(ph - 0.22, 0.0) * 18.0) * step(0.22, ph)) * pulse;
  float d = length((uv - 0.5) * vec2(size.x / size.y, 1.0));
  float vig = smoothstep(0.25, 0.95, d) * (0.6 + 0.35 * beat) * k;
  rgb = mix(rgb, vec3(0.22, 0.0, 0.02), clamp(vig, 0.0, 0.92));
  return half4(rgb * c.a, c.a);
}`;
const FX = `${ID}/dying`;

// Серцебиття — справжній запис з «Атмосфери» (той самий сайт), грає по колу
let ctx = null, heartBuf = null, heart = null, heartGain = null, heartWant = false, heartBusy = false;
async function heartbeat(on) {
  heartWant = on;
  if (heartBusy) return;
  heartBusy = true;
  try {
    if (on && !heart) {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      heartBuf ??= await fetch(new URL("/atmosfera/audio/sfx-heart.mp3", window.location.origin))
        .then((r) => r.arrayBuffer()).then((b) => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no)));
      heart = ctx.createBufferSource();
      heart.buffer = heartBuf;
      heart.loop = true;
      heartGain = ctx.createGain();
      heartGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      heartGain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 1.5);
      heart.connect(heartGain).connect(ctx.destination);
      heart.start();
    } else if (!on && heart) {
      const h = heart, g = heartGain;
      heart = null;
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.5);
      setTimeout(() => { try { h.stop(); } catch { /* */ } }, 2700);
    }
  } catch (err) { console.error("Серцебиття:", err); }
  heartBusy = false;
  if (heartWant !== Boolean(heart)) heartbeat(heartWant);
}

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
  deathWindow(s).catch((err) => console.error("Рятівні кидки:", err));
  myFate(s).catch((err) => console.error("Ефект при смерті:", err));

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

// Вікно рятівних кидків: відкрите, поки хтось бореться за життя, і ще трохи — щоб показати, чим скінчилось
async function deathWindow(s) {
  const rows = s.active ? dying(s.order) : [];
  clearTimeout(dsTimer);
  // коли мине час показу результату — перевірити ще раз
  const ends = rows.filter((e) => e.ds?.end).map((e) => e.ds.at + SHOW_END - Date.now());
  if (ends.length) dsTimer = setTimeout(async () => sync((await OBR.room.getMetadata())[STATE]), Math.max(200, Math.min(...ends) + 100));
  const n = Math.min(rows.length, 3);
  if (n === dsRows) return;
  if (dsRows) await OBR.popover.close(DS).catch(() => {});
  dsRows = n;
  if (!n) return;
  const [w, h] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  await OBR.popover.open({
    id: DS,
    url: url("death.html"),
    width: Math.min(480, w - 40),
    height: n * 150 + 14,
    anchorReference: "POSITION",
    anchorPosition: { top: h - 24, left: w / 2 },
    anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
    transformOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 0,
  });
}

// Мій герой при смерті — екран і серцебиття лише в мене
async function myFate(s) {
  const me = s.active ? (s.order ?? []).find((e) => mine(e) && e.down) : null;
  const want = me ? (dsOf(me).stable ? "stable" : "dying") : "";
  heartbeat(want === "dying");
  if (want === fx) return;
  fx = want;
  if (!(await OBR.scene.isReady())) return;
  const old = await OBR.scene.local.getItems((i) => i.metadata?.[FX]);
  if (old.length) await OBR.scene.local.deleteItems(old.map((i) => i.id));
  if (!want) return;
  await OBR.scene.local.addItems([
    buildEffect()
      .effectType("VIEWPORT")
      .sksl(DYING)
      .uniforms([{ name: "k", value: want === "dying" ? 1 : 0.6 }, { name: "pulse", value: want === "dying" ? 1 : 0 }])
      .layer("POST_PROCESS")
      .locked(true)
      .disableHit(true)
      .metadata({ [FX]: true })
      .build(),
  ]);
}
