// Horario del local en Río Tercero (America/Argentina/Cordoba, UTC-3 todo el año).
// Lunes a viernes 09:30 a 19:00. Sábados 10:00 a 12:30 y 16:00 a 20:00. Domingos cerrado.

type Span = [number, number];

const schedule: Record<number, Span[]> = {
  1: [[570, 1140]],
  2: [[570, 1140]],
  3: [[570, 1140]],
  4: [[570, 1140]],
  5: [[570, 1140]],
  6: [
    [600, 750],
    [960, 1200],
  ],
  0: [],
};

const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function cordobaNow(date = new Date()) {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return { day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

function clock(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export type PickupWindow =
  | { kind: "open"; closesAt: string }
  | { kind: "later-today"; opensAt: string; closesAt: string }
  | { kind: "next-day"; day: string; opensAt: string };

/** Cuándo se puede retirar: abierto ahora, más tarde hoy o el próximo día hábil. */
export function pickupWindow(date = new Date()): PickupWindow {
  const { day, minutes } = cordobaNow(date);
  for (const [start, end] of schedule[day]) {
    if (minutes >= start && minutes < end - 15) return { kind: "open", closesAt: clock(end) };
    if (minutes < start) return { kind: "later-today", opensAt: clock(start), closesAt: clock(end) };
  }
  for (let offset = 1; offset <= 7; offset += 1) {
    const next = (day + offset) % 7;
    const spans = schedule[next];
    if (spans.length) {
      return { kind: "next-day", day: offset === 1 ? "mañana" : `el ${dayNames[next]}`, opensAt: clock(spans[0][0]) };
    }
  }
  return { kind: "next-day", day: "el lunes", opensAt: "09:30" };
}

export function pickupSentence(window: PickupWindow) {
  if (window.kind === "open") return `Retirás hoy hasta las ${window.closesAt}`;
  if (window.kind === "later-today") return `Retirás hoy desde las ${window.opensAt}`;
  return `Retirás ${window.day} desde las ${window.opensAt}`;
}
