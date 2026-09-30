export interface WorldCapabilityInput {
  webglAvailable: boolean;
  reducedMotion: boolean;
  coarsePointer: boolean;
  devicePixelRatio: number;
}

export interface WorldCapabilities {
  canRender: boolean;
  pixelRatio: number;
  animateTransitions: boolean;
}

export function detectWorldCapabilities(input: WorldCapabilityInput): WorldCapabilities {
  return {
    canRender: input.webglAvailable,
    pixelRatio: Math.min(input.devicePixelRatio, input.coarsePointer ? 1.5 : 2),
    animateTransitions: !input.reducedMotion,
  };
}

export function shouldPauseWorld(visibilityState: "hidden" | "visible" | string): boolean {
  return visibilityState === "hidden";
}
