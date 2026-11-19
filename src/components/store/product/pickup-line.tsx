"use client";

import { useEffect, useState } from "react";
import { pickupSentence, pickupWindow } from "@/lib/hours";

// Se calcula en el navegador para que diga la hora real del local, no la de cuando se armó la página.
export function PickupLine({ fallback }: { fallback: string }) {
  const [text, setText] = useState(fallback);
  useEffect(() => {
    const update = () => setText(pickupSentence(pickupWindow()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{text}</>;
}
