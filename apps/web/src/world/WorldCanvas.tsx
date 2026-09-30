import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { WorldMode, WorldMoveCommand, WorldRouteModel, WorldSceneModel } from "./types";
import { detectWorldCapabilities, shouldPauseWorld } from "./worldCapabilities";
import { movementFromPointer, useWorldInput } from "./worldInput";
import "./WorldCanvas.css";

/** How far a drag must travel from its start for full walking speed, in px. */
const DRAG_RADIUS = 60;

export type WorldEvent =
  | { type: "EXIT" }
  | { type: "REQUEST_SERVICE"; serviceId: string }
  | { type: "SHOP_NEAR"; shopId: string | null }
  | { type: "ENTER_SHOP"; shopId: string }
  | { type: "WORLD_ERROR"; code: "WEBGL_UNAVAILABLE" | "ASSET_FAILED" | "RENDER_FAILED" };

export interface WorldSceneHandle {
  update(model: WorldSceneModel): void;
  move(command: WorldMoveCommand): void;
  enter?(): void;
  render(nowMs: number): void;
  dispose(): void;
}

export interface WorldSceneFactoryArgs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  model: WorldSceneModel;
  onEvent: (event: WorldEvent) => void;
}

export type WorldSceneFactory = (args: WorldSceneFactoryArgs) => WorldSceneHandle;

export interface WorldCanvasProps {
  mode: WorldMode;
  route: WorldRouteModel | null;
  avatarNo: number | null;
  scene: WorldSceneModel;
  reducedMotion?: boolean;
  onEvent: (event: WorldEvent) => void;
  fallback: ReactNode;
  sceneFactory?: WorldSceneFactory;
}

function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function WorldCanvas({
  scene,
  reducedMotion = false,
  onEvent,
  fallback,
  sceneFactory,
}: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef(scene);
  modelRef.current = scene;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const sceneHandleRef = useRef<WorldSceneHandle | null>(null);

  useWorldInput({
    enabled: scene.mode === "EXPLORE" || scene.mode === "ROUTE",
    onMove: (command) => sceneHandleRef.current?.move(command),
    onAction: (action) => {
      if (action === "EXIT") onEventRef.current({ type: "EXIT" });
      else sceneHandleRef.current?.enter?.();
    },
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === "undefined") return;

    const capabilities = detectWorldCapabilities({
      webglAvailable: webglAvailable(),
      reducedMotion: reducedMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
      coarsePointer: window.matchMedia?.("(pointer: coarse)").matches === true || window.innerWidth < 768,
      devicePixelRatio: window.devicePixelRatio || 1,
    });

    if (!capabilities.canRender) {
      onEventRef.current({ type: "WORLD_ERROR", code: "WEBGL_UNAVAILABLE" });
      return;
    }

    const surface = document.createElement("div");
    surface.className = "world-canvas__surface";
    host.prepend(surface);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(capabilities.pixelRatio);
      renderer.setSize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor("#120c18", 1);
      surface.appendChild(renderer.domElement);
    } catch {
      onEventRef.current({ type: "WORLD_ERROR", code: "RENDER_FAILED" });
      surface.remove();
      return;
    }

    const scene3d = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1_000);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 0, 0);
    const handle = sceneFactory?.({ renderer, scene: scene3d, camera, model: modelRef.current, onEvent: (event) => onEventRef.current(event) }) ?? {
      update: () => undefined,
      move: () => undefined,
      render: () => renderer.render(scene3d, camera),
      dispose: () => undefined,
    } satisfies WorldSceneHandle;
    sceneHandleRef.current = handle;

    let frame = 0;
    let paused = shouldPauseWorld(document.visibilityState);
    const render = (nowMs: number) => {
      if (!paused) {
        handle.update(modelRef.current);
        handle.render(nowMs);
      }
      frame = window.requestAnimationFrame(render);
    };

    const resize = () => {
      const width = host.clientWidth || window.innerWidth;
      const height = host.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const onVisibility = () => {
      paused = shouldPauseWorld(document.visibilityState);
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Drag on the street to walk — a phone has no keys. The finger's offset
    // from where it touched down is a held direction until it lifts.
    const canvas = renderer.domElement;
    let drag: { x: number; y: number; id: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      const mode = modelRef.current.mode;
      if (mode !== "EXPLORE" && mode !== "ROUTE") return;
      drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      handle.move(movementFromPointer(event.clientX - drag.x, event.clientY - drag.y, DRAG_RADIUS));
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      drag = null;
      handle.move({ x: 0, z: 0, sprint: false });
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerEnd);
    canvas.addEventListener("pointercancel", onPointerEnd);
    resize();
    frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      resizeObserver.disconnect();
      handle.dispose();
      sceneHandleRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
      surface.remove();
    };
  }, [reducedMotion, sceneFactory]);

  return (
    <div className="world-canvas" ref={hostRef} role="img" aria-label="העולם של PRO NOW">
      <div className="world-canvas__status" aria-live="polite" />
      {fallback}
    </div>
  );
}

export type { WorldMoveCommand };
