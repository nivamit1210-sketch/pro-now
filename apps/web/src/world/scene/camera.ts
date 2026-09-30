import * as THREE from "three";

export function followCharacter(camera: THREE.PerspectiveCamera, target: THREE.Vector3, reducedMotion: boolean): void {
  const desired = new THREE.Vector3(target.x, target.y + 4.4, target.z + 8.2);
  if (reducedMotion) camera.position.copy(desired);
  else camera.position.lerp(desired, 0.08);
  camera.lookAt(target.x, target.y + 1.2, target.z - 2.5);
}

export function frameStreet(camera: THREE.PerspectiveCamera, reducedMotion: boolean): void {
  const desired = new THREE.Vector3(0, 19, 20);
  if (reducedMotion) camera.position.copy(desired);
  else camera.position.lerp(desired, 0.04);
  camera.lookAt(0, 0, -28);
}
