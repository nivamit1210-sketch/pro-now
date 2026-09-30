import { useEffect, useRef } from "react";

import type { WorldMoveCommand } from "./types";

const DEAD_ZONE = 8;

function normalized(x: number, z: number, sprint = false): WorldMoveCommand {
  const length = Math.hypot(x, z);
  if (length === 0) return { x: 0, z: 0, sprint };
  const scale = Math.min(1, 1 / length);
  return { x: x * scale, z: z * scale, sprint };
}

export function movementFromKeyboard(keys: ReadonlySet<string>): WorldMoveCommand {
  const has = (key: string) => keys.has(key) || keys.has(key.toLowerCase());
  const x = (has("ArrowRight") || has("d") ? 1 : 0) - (has("ArrowLeft") || has("a") ? 1 : 0);
  const z = (has("ArrowDown") || has("s") ? 1 : 0) - (has("ArrowUp") || has("w") ? 1 : 0);
  return normalized(x, z, has("Shift"));
}

export function movementFromPointer(dx: number, dy: number, radius: number): WorldMoveCommand {
  const distance = Math.hypot(dx, dy);
  if (distance <= DEAD_ZONE || radius <= 0) return { x: 0, z: 0, sprint: false };
  return normalized(dx / radius, dy / radius);
}

export function worldActionFromKey(key: string): "EXIT" | "ENTER_SHOP" | null {
  if (key === "Escape") return "EXIT";
  if (key === "Enter") return "ENTER_SHOP";
  return null;
}

export function useWorldInput(args: {
  enabled: boolean;
  onMove: (command: WorldMoveCommand) => void;
  onAction: (action: "EXIT" | "ENTER_SHOP") => void;
}): void {
  const keysRef = useRef(new Set<string>());
  const onMoveRef = useRef(args.onMove);
  const onActionRef = useRef(args.onAction);
  onMoveRef.current = args.onMove;
  onActionRef.current = args.onAction;

  useEffect(() => {
    if (!args.enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = worldActionFromKey(event.key);
      if (action === "EXIT") {
        event.preventDefault();
        onActionRef.current("EXIT");
        return;
      }
      if (action === "ENTER_SHOP") {
        event.preventDefault();
        onActionRef.current("ENTER_SHOP");
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "Shift"].includes(event.key)) {
        event.preventDefault();
        keysRef.current.add(event.key);
        onMoveRef.current(movementFromKeyboard(keysRef.current));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key);
      onMoveRef.current(movementFromKeyboard(keysRef.current));
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      keysRef.current.clear();
      onMoveRef.current({ x: 0, z: 0, sprint: false });
    };
  }, [args.enabled]);
}
