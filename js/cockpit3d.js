// First-person cockpit — aircraft rig: pilot + cockpit rotate; environment scrolls past
(() => {
  const Cockpit3D = {
    scene: null,
    camera: null,
    renderer: null,
    container: null,
    aircraftRig: null,
    shakeNode: null,
    cockpit: null,
    environment: null,
    world: null,
    skyDome: null,
    runwayChunks: [],
    cloudMeshes: [],
    approachLights: [],
    throttleLeft: null,
    throttleRight: null,
    gearLights: [],
    ready: false,
    _tmpPos: null,
  };

  const WORLD = {
    forwardScale: 0.12,
    altitudeScale: 0.11,
    runwayLength: 120,
    bankFactor: 0.16,
  };

  function makeMaterial(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metalness ?? 0.35,
      roughness: opts.roughness ?? 0.55,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
  }

  function addGauge(parent, x, y, z, radius, color) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.014, 8, 28),
      makeMaterial(color, { emissive: color, emissiveIntensity: 0.5 })
    );
    ring.position.set(x, y, z);
    ring.rotation.x = -0.55;
    parent.add(ring);
  }

  function buildCockpitInterior(parent) {
    const group = new THREE.Group();
    group.name = "cockpit-interior";
    const frameMat = makeMaterial(0x0a1018, { metalness: 0.7, roughness: 0.35 });
    const dashMat = makeMaterial(0x152535, { metalness: 0.45, roughness: 0.5 });

    const dashboard = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.5), dashMat);
    dashboard.position.set(0, -0.62, -0.55);
    group.add(dashboard);

    const glareShield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.35), frameMat);
    glareShield.position.set(0, -0.28, -0.48);
    group.add(glareShield);

    const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), frameMat);
    leftRail.position.set(-1.15, 0.05, -0.35);
    group.add(leftRail);

    const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), frameMat);
    rightRail.position.set(1.15, 0.05, -0.35);
    group.add(rightRail);

    const canopyBow = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.07, 0.12), frameMat);
    canopyBow.position.set(0, 0.55, -0.28);
    group.add(canopyBow);

    [-0.55, 0, 0.55].forEach((x) => {
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.05), makeMaterial(0x0c1828));
      bezel.position.set(x, -0.48, -0.52);
      group.add(bezel);
      addGauge(group, x, -0.44, -0.54, 0.06, 0x4fd1ff);
    });

    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.32, 8), makeMaterial(0x4a5a6a));
    stick.position.set(0.18, -0.38, -0.48);
    stick.name = "control-stick";
    group.add(stick);

    const seatRim = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.55), makeMaterial(0x1a2535));
    seatRim.position.set(0, -0.72, 0.15);
    group.add(seatRim);

    const throttleHousing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.35, 0.28), frameMat);
    throttleHousing.position.set(-0.72, -0.55, -0.42);
    group.add(throttleHousing);

    const throttleL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.06), makeMaterial(0x6a7a8a));
    throttleL.position.set(-0.75, -0.48, -0.4);
    throttleL.name = "throttle-left";
    group.add(throttleL);
    Cockpit3D.throttleLeft = throttleL;

    const throttleR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.06), makeMaterial(0x6a7a8a));
    throttleR.position.set(-0.69, -0.48, -0.4);
    throttleR.name = "throttle-right";
    group.add(throttleR);
    Cockpit3D.throttleRight = throttleR;

    const noseFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.6), frameMat);
    noseFrame.position.set(0, -0.2, -0.72);
    group.add(noseFrame);

    Cockpit3D.gearLights = [];
    [-0.2, 0, 0.2].forEach((x) => {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 8),
        makeMaterial(0x223344, { emissive: 0x112233, emissiveIntensity: 0.15 })
      );
      lamp.position.set(x, -0.32, -0.5);
      group.add(lamp);
      Cockpit3D.gearLights.push(lamp);
    });

    const dashLight = new THREE.PointLight(0x5a9fd4, 0.25, 2);
    dashLight.position.set(0, -0.35, -0.45);
    group.add(dashLight);

    parent.add(group);
    return group;
  }

  function buildSkyDome(parent) {
    const geo = new THREE.SphereGeometry(400, 36, 24);
    const dome = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0x6eb8f0, side: THREE.BackSide, fog: false })
    );
    parent.add(dome);
    return dome;
  }

  function buildRunwayChunk(zOffset) {
    const group = new THREE.Group();
    const asphalt = makeMaterial(0x2e3848);
    const stripe = makeMaterial(0xf0f6ff, { emissive: 0x99bbdd, emissiveIntensity: 0.25 });

    const slab = new THREE.Mesh(new THREE.PlaneGeometry(60, WORLD.runwayLength), asphalt);
    slab.rotation.x = -Math.PI / 2;
    group.add(slab);

    const center = new THREE.Mesh(new THREE.PlaneGeometry(0.6, WORLD.runwayLength), stripe);
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.02;
    group.add(center);

    for (let z = -WORLD.runwayLength / 2 + 8; z < WORLD.runwayLength / 2; z += 14) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 5), stripe);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(0, 0.025, z);
      group.add(mark);
    }

    group.position.z = zOffset;
    return group;
  }

  function buildEnvironment() {
    const environment = new THREE.Group();
    environment.name = "environment";

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 800),
      makeMaterial(0x1a4a62)
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    environment.add(ground);

    Cockpit3D.runwayChunks = [];
    for (let i = 0; i < 12; i += 1) {
      const chunk = buildRunwayChunk(-40 - i * WORLD.runwayLength);
      environment.add(chunk);
      Cockpit3D.runwayChunks.push(chunk);
    }

    Cockpit3D.approachLights = [];
    for (let i = 0; i < 16; i += 1) {
      const z = -60 - i * 12;
      const red = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.15, 0.4),
        makeMaterial(0xff3333, { emissive: 0xff2222, emissiveIntensity: 0.9 })
      );
      red.position.set(-6, 0.08, z);
      environment.add(red);
      Cockpit3D.approachLights.push(red);

      const white = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.15, 0.4),
        makeMaterial(0xffffff, { emissive: 0xeeeeff, emissiveIntensity: 0.8 })
      );
      white.position.set(6, 0.08, z);
      environment.add(white);
      Cockpit3D.approachLights.push(white);
    }

    Cockpit3D.cloudMeshes = [];
    const cloudMat = makeMaterial(0xffffff, { transparent: true, opacity: 0.28, roughness: 1 });
    for (let i = 0; i < 20; i += 1) {
      const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(3 + Math.random() * 5, 8, 8),
        cloudMat
      );
      cloud.position.set((Math.random() - 0.5) * 100, 15 + Math.random() * 35, -50 - Math.random() * 300);
      environment.add(cloud);
      Cockpit3D.cloudMeshes.push(cloud);
    }

    environment.add(new THREE.HemisphereLight(0xb8dcff, 0x2a4050, 1.2));
    const sun = new THREE.DirectionalLight(0xfff0d0, 0.85);
    sun.position.set(20, 50, -30);
    environment.add(sun);

    Cockpit3D.skyDome = buildSkyDome(environment);
    return environment;
  }

  function init(container) {
    if (typeof THREE === "undefined") {
      console.warn("[Cockpit3D] THREE not loaded");
      return false;
    }

    Cockpit3D.container = container;
    const canvas = document.createElement("canvas");
    canvas.id = "cockpit3d-canvas";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    container.appendChild(canvas);

    Cockpit3D.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    Cockpit3D.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    Cockpit3D.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    Cockpit3D.renderer.toneMappingExposure = 1.05;
    if (Cockpit3D.renderer.outputColorSpace !== undefined) {
      Cockpit3D.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    Cockpit3D.scene = new THREE.Scene();
    Cockpit3D.scene.background = new THREE.Color(0x000000);
    Cockpit3D.scene.fog = new THREE.Fog(0x8ec8e8, 60, 320);

    Cockpit3D._tmpPos = new THREE.Vector3();

    // Aircraft rig: pilot seat + attitude (pitch/bank)
    Cockpit3D.aircraftRig = new THREE.Group();
    Cockpit3D.aircraftRig.name = "aircraft-rig";
    Cockpit3D.scene.add(Cockpit3D.aircraftRig);

    Cockpit3D.shakeNode = new THREE.Group();
    Cockpit3D.shakeNode.name = "shake-node";
    Cockpit3D.aircraftRig.add(Cockpit3D.shakeNode);

    Cockpit3D.camera = new THREE.PerspectiveCamera(54, 1, 0.05, 600);
    Cockpit3D.camera.position.set(0, 0.14, 0.05);
    Cockpit3D.shakeNode.add(Cockpit3D.camera);

    Cockpit3D.cockpit = buildCockpitInterior(Cockpit3D.camera);

    // World scrolls relative to aircraft (inverse of flight position)
    Cockpit3D.environment = buildEnvironment();
    Cockpit3D.scene.add(Cockpit3D.environment);
    Cockpit3D.world = Cockpit3D.environment;

    resize();
    Cockpit3D.ready = true;
    return true;
  }

  function resize() {
    if (!Cockpit3D.ready || !Cockpit3D.container) return;
    const w = Cockpit3D.container.clientWidth;
    const h = Cockpit3D.container.clientHeight;
    if (w < 1 || h < 1) return;
    Cockpit3D.camera.aspect = w / h;
    Cockpit3D.camera.updateProjectionMatrix();
    Cockpit3D.renderer.setSize(w, h, false);
  }

  function update(dt) {
    if (!Cockpit3D.ready) return;
    const s = window.state;
    const f = s.flight;
    const cam = s.camera;
    const c = window.CONSTANTS;
    const altitude = Math.max(0, c.GROUND_Y - f.y);
    const speed = Math.max(0, f.vx);

    cam.time += dt;
    const shakeAmt = Math.min(1, speed / 50) * 0.004;
    const shakeX = Math.sin(cam.time * 17) * shakeAmt;
    const shakeY = Math.cos(cam.time * 21) * shakeAmt;

    const bank = -f.pitch * WORLD.bankFactor;

    // Whole aircraft (pilot + cockpit) pitches and banks together
    Cockpit3D.aircraftRig.rotation.order = "YXZ";
    Cockpit3D.aircraftRig.rotation.x = f.pitch;
    Cockpit3D.aircraftRig.rotation.y = 0;
    Cockpit3D.aircraftRig.rotation.z = bank;

    Cockpit3D.shakeNode.rotation.x = shakeY;
    Cockpit3D.shakeNode.rotation.z = shakeX;

    Cockpit3D.camera.rotation.set(0, 0, 0);

    const stick = Cockpit3D.cockpit.getObjectByName("control-stick");
    if (stick) stick.rotation.x = -f.pitch * 0.65;

    const thrPull = f.throttle * 0.14;
    if (Cockpit3D.throttleLeft) Cockpit3D.throttleLeft.position.y = -0.48 - thrPull;
    if (Cockpit3D.throttleRight) Cockpit3D.throttleRight.position.y = -0.48 - thrPull;

    Cockpit3D.gearLights.forEach((lamp, i) => {
      const on = f.gearDown && i === 1;
      lamp.material.emissive.setHex(on ? 0x52e0a5 : 0x223344);
      lamp.material.emissiveIntensity = on ? 1.0 : 0.12;
    });

    const forward = f.x * WORLD.forwardScale;
    const climbOffset = altitude * WORLD.altitudeScale;

    Cockpit3D.environment.position.set(0, -climbOffset, -forward);
    Cockpit3D.environment.rotation.set(0, 0, 0);

    const runwayScroll = forward % WORLD.runwayLength;
    Cockpit3D.runwayChunks.forEach((chunk, i) => {
      chunk.position.z = -40 - i * WORLD.runwayLength - runwayScroll;
    });

    Cockpit3D.cloudMeshes.forEach((cloud, i) => {
      cloud.position.z = -60 - i * 22 - (forward * 0.3) % 50;
    });

    const inApproach = s.mission.phase === "approach";
    Cockpit3D.approachLights.forEach((light, i) => {
      light.material.emissiveIntensity = inApproach ? 0.85 + Math.sin(cam.time * 5 + i) * 0.15 : 0.4;
    });

    if (Cockpit3D.scene.fog) {
      Cockpit3D.scene.fog.color.setHex(altitude > 80 ? 0x6aaee0 : 0x8ec8e8);
      Cockpit3D.scene.fog.far = 280 + Math.min(altitude, 120);
    }

    const startup = s.ui?.startup;
    Cockpit3D.renderer.toneMappingExposure = startup?.active
      ? 0.3 + startup.progress * 0.75
      : 1.05;
  }

  function render() {
    if (!Cockpit3D.ready) return;
    Cockpit3D.renderer.render(Cockpit3D.scene, Cockpit3D.camera);
  }

  window.Cockpit3D = {
    init,
    resize,
    update,
    render,
    isReady: () => Cockpit3D.ready,
  };
})();
