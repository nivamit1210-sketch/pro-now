import * as THREE from "three";

export interface PlayerState {
  group: THREE.Sprite;
  x: number;
  z: number;
}

export function createPlayer(texture: THREE.Texture): PlayerState {
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const group = new THREE.Sprite(material);
  group.scale.set(2.2, 3.1, 1);
  group.position.set(0, 1.55, 1.5);
  return { group, x: 0, z: 1.5 };
}

export function movePlayer(player: PlayerState, command: { x: number; z: number; sprint: boolean }, deltaSeconds: number): void {
  const speed = command.sprint ? 4.4 : 2.7;
  player.x = THREE.MathUtils.clamp(player.x + command.x * speed * deltaSeconds, -4.8, 4.8);
  player.z = THREE.MathUtils.clamp(player.z + command.z * speed * deltaSeconds, -64, 4);
  player.group.position.set(player.x, 1.55, player.z);
}
