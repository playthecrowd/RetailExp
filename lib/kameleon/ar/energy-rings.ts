import * as THREE from "three";

export interface EnergyRingsHandle {
  object: THREE.Object3D;
  update: (elapsedSeconds: number) => void;
  dispose: () => void;
}

/** Small radial-gradient dot generated at runtime — no external texture file. */
function createGlowSprite(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(192,133,82,0.85)");
    gradient.addColorStop(1, "rgba(192,133,82,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * A lightweight procedural "wine energy" effect around the placed model:
 * two slowly-counter-rotating glow rings (copper + red, additive-blended)
 * plus a low-count (24) orbiting particle system. Purely code-generated —
 * no textures, no external assets, no generation service — and cheap enough
 * for mobile (a couple dozen triangles' worth of torus geometry + 24 points).
 * Proves the visual language for the eventual bottle-energy scene without
 * pretending this prototype IS that final scene.
 */
export function createEnergyRings(radius = 0.14): EnergyRingsHandle {
  const group = new THREE.Group();
  group.name = "kameleon-energy-rings";
  const disposables: Array<{ dispose: () => void }> = [];

  const ring1Geo = new THREE.TorusGeometry(radius, 0.003, 8, 64);
  const ring1Mat = new THREE.MeshBasicMaterial({
    color: 0xc08552,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
  });
  const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
  ring1.rotation.x = Math.PI / 2;
  group.add(ring1);
  disposables.push(ring1Geo, ring1Mat);

  const ring2Geo = new THREE.TorusGeometry(radius * 1.35, 0.002, 8, 64);
  const ring2Mat = new THREE.MeshBasicMaterial({
    color: 0xb23a3a,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
  });
  const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
  ring2.rotation.x = Math.PI / 2;
  group.add(ring2);
  disposables.push(ring2Geo, ring2Mat);

  const particleCount = 24;
  const positions = new Float32Array(particleCount * 3);
  const orbitRadii: number[] = [];
  const orbitAngles: number[] = [];
  const orbitSpeeds: number[] = [];
  const orbitHeights: number[] = [];
  for (let i = 0; i < particleCount; i++) {
    const r = radius * (0.9 + Math.random() * 0.5);
    const a = Math.random() * Math.PI * 2;
    orbitRadii.push(r);
    orbitAngles.push(a);
    orbitSpeeds.push(0.2 + Math.random() * 0.3);
    orbitHeights.push((Math.random() - 0.5) * 0.03);
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = orbitHeights[i];
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const glowTexture = createGlowSprite();
  const particleMat = new THREE.PointsMaterial({
    size: 0.012,
    map: glowTexture,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: 0xe3b583,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  group.add(particles);
  disposables.push(particleGeo, particleMat, glowTexture);

  function update(elapsedSeconds: number) {
    ring1.rotation.z = elapsedSeconds * 0.25;
    ring2.rotation.z = -elapsedSeconds * 0.15;
    group.scale.setScalar(1 + 0.03 * Math.sin(elapsedSeconds * 1.6));

    const posAttr = particleGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < particleCount; i++) {
      const angle = orbitAngles[i] + elapsedSeconds * orbitSpeeds[i];
      const r = orbitRadii[i];
      posAttr.setXYZ(i, Math.cos(angle) * r, orbitHeights[i] + Math.sin(elapsedSeconds + i) * 0.005, Math.sin(angle) * r);
    }
    posAttr.needsUpdate = true;
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  return { object: group, update, dispose };
}
