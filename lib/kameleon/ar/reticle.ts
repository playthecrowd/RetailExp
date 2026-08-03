import * as THREE from "three";

const COPPER = 0xc08552;
const RED = 0xb23a3a;

export interface ReticleHandle {
  object: THREE.Object3D;
  update: (elapsedSeconds: number) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

/**
 * The "premium scanning reticle" — a copper corner-bracket ring (echoing the
 * viewfinder motif already used on the simulated AR screens) with a slow
 * red pulse at its center, instead of a plain browser-default crosshair.
 */
export function createReticle(): ReticleHandle {
  const group = new THREE.Group();
  group.visible = false;
  group.name = "kameleon-reticle";

  const disposables: Array<{ dispose: () => void }> = [];

  const outerRingGeo = new THREE.RingGeometry(0.075, 0.09, 48);
  const outerRingMat = new THREE.MeshBasicMaterial({
    color: COPPER,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
  outerRing.rotation.x = -Math.PI / 2;
  group.add(outerRing);
  disposables.push(outerRingGeo, outerRingMat);

  const pulseRingGeo = new THREE.RingGeometry(0.015, 0.028, 32);
  const pulseRingMat = new THREE.MeshBasicMaterial({
    color: RED,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  });
  const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
  pulseRing.rotation.x = -Math.PI / 2;
  group.add(pulseRing);
  disposables.push(pulseRingGeo, pulseRingMat);

  // Four corner-bracket ticks around the outer ring, matching the
  // Viewfinder.tsx corner-bracket motif used elsewhere in the app.
  const tickGeo = new THREE.BoxGeometry(0.018, 0.002, 0.004);
  const tickMat = new THREE.MeshBasicMaterial({ color: COPPER, transparent: true, opacity: 0.9 });
  disposables.push(tickGeo, tickMat);
  const tickRadius = 0.105;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.position.set(Math.cos(angle) * tickRadius, 0, Math.sin(angle) * tickRadius);
    tick.rotation.y = -angle;
    group.add(tick);
  }

  function update(elapsedSeconds: number) {
    const pulse = 1 + 0.35 * Math.sin(elapsedSeconds * 2.2);
    pulseRing.scale.setScalar(pulse);
    pulseRingMat.opacity = 0.45 + 0.35 * Math.sin(elapsedSeconds * 2.2);
    group.rotation.y = elapsedSeconds * 0.15;
  }

  function setVisible(visible: boolean) {
    group.visible = visible;
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  return { object: group, update, setVisible, dispose };
}
