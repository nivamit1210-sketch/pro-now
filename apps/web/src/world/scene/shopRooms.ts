import * as THREE from "three";

export function createRoom(texture: THREE.Texture): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  const room = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), material);
  room.position.set(0, 3.1, -1.5);
  return room;
}
