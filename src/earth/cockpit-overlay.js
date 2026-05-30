import * as THREE from "three";

let ready = false;
let renderer = null;
let scene = null;
let camera = null;
let rig = null;
let container = null;
let stick = null;
let throttleLeft = null;
let throttleRight = null;

function makeMaterial(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.35,
    roughness: opts.roughness ?? 0.55,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

function buildInterior() {
  const group = new THREE.Group();
  const frameMat = makeMaterial(0x0a1018, { metalness: 0.7, roughness: 0.35 });
  const dashMat = makeMaterial(0x152535, { metalness: 0.45, roughness: 0.5 });

  const dashboard = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.5), dashMat);
  dashboard.position.set(0, -0.62, -0.55);
  group.add(dashboard);

  const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), frameMat);
  leftRail.position.set(-1.15, 0.05, -0.35);
  group.add(leftRail);

  const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), frameMat);
  rightRail.position.set(1.15, 0.05, -0.35);
  group.add(rightRail);

  const canopyBow = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.07, 0.12), frameMat);
  canopyBow.position.set(0, 0.55, -0.28);
  group.add(canopyBow);

  stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.32, 8), makeMaterial(0x4a5a6a));
  stick.position.set(0.18, -0.38, -0.48);
  stick.name = "control-stick";
  group.add(stick);

  throttleLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.06), makeMaterial(0x6a7a8a));
  throttleLeft.position.set(-0.75, -0.48, -0.4);
  group.add(throttleLeft);

  throttleRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.06), makeMaterial(0x6a7a8a));
  throttleRight.position.set(-0.69, -0.48, -0.4);
  group.add(throttleRight);

  const light = new THREE.PointLight(0x5a9fd4, 0.35, 3);
  light.position.set(0, -0.2, -0.3);
  group.add(light);

  return group;
}

export function initCockpitOverlay(el) {
  container = el;
  const canvas = document.createElement("canvas");
  canvas.className = "cockpit-overlay-canvas";
  container.appendChild(canvas);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(54, 1, 0.05, 20);
  camera.position.set(0, 0.12, 0.08);

  rig = new THREE.Group();
  rig.add(buildInterior());
  scene.add(rig);
  scene.add(new THREE.AmbientLight(0x8eb8ff, 0.45));

  resizeCockpitOverlay();
  ready = true;
  return true;
}

export function resizeCockpitOverlay() {
  if (!ready || !container) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w < 1 || h < 1) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

export function updateCockpitOverlay(flight, visible) {
  if (!ready) return;
  container.style.visibility = visible ? "visible" : "hidden";
  if (!visible) return;

  rig.rotation.order = "YXZ";
  rig.rotation.x = flight.pitch * 0.85;
  rig.rotation.z = flight.roll * 1.2;

  if (stick) stick.rotation.x = -flight.pitch * 0.55;
  const pull = flight.throttle * 0.12;
  if (throttleLeft) throttleLeft.position.y = -0.48 - pull;
  if (throttleRight) throttleRight.position.y = -0.48 - pull;
}

export function renderCockpitOverlay() {
  if (!ready || container.style.visibility === "hidden") return;
  renderer.render(scene, camera);
}

export function isCockpitReady() {
  return ready;
}
