import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CameraPreset, Player, TacticalPath } from '../types/tactics';
import { playMarkerClickSound } from '../utils/audio';

// Constants
const PITCH_WIDTH = 56; // X bounds: -28 to +28
const PITCH_LENGTH = 90; // Z bounds: -45 to +45
const PITCH_MARGIN = 6;

export class PitchScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;
  private clock: THREE.Clock;

  // Pitch objects
  private pitchMesh: THREE.Mesh | null = null;
  private playerGroups: Map<string, THREE.Group> = new Map();
  private ballMesh: THREE.Group | null = null;
  private pathObjectsGroup: THREE.Group = new THREE.Group();
  private activeHaloMesh: THREE.Mesh | null = null;

  // Interaction & Raycasting
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private pointer: THREE.Vector2 = new THREE.Vector2();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private draggedEntity: { id: string; isBall: boolean; group: THREE.Group } | null = null;
  private dragPlaneIntersection: THREE.Vector3 = new THREE.Vector3();
  private isPointerDown: boolean = false;
  private hoveredPlayerId: string | null = null;

  // Tactical drawing state
  private isDrawingMode: boolean = false;
  private currentDrawType: 'pass' | 'run' | 'press' | 'zone' = 'pass';
  private drawStartPoint: THREE.Vector3 | null = null;
  private drawPreviewMesh: THREE.Mesh | null = null;

  // Camera animation
  private targetCameraPos: THREE.Vector3 = new THREE.Vector3(0, 24, 46);
  private targetLookAt: THREE.Vector3 = new THREE.Vector3(0, 0, -6);
  private isCameraTransitioning: boolean = false;

  // Sequence playback animation
  private isSequencePlaying: boolean = false;
  private sequenceProgress: number = 0;
  private sequenceStartSnapshot: Map<string, THREE.Vector3> = new Map();

  // Motion preference
  private prefersReducedMotion: boolean = false;

  // Callbacks to React
  public onPlayerSelect?: (playerId: string | null) => void;
  public onPlayerMove?: (playerId: string, pos: { x: number; z: number }) => void;
  public onBallMove?: (pos: { x: number; z: number }) => void;
  public onPathDrawn?: (path: TacticalPath) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
        this.prefersReducedMotion = e.matches;
      });
    }

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060c16);
    this.scene.fog = new THREE.FogExp2(0x060c16, 0.007);

    // 2. Camera setup (Initial: broadcast angle matching reference image)
    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 300);
    this.camera.position.set(0, 24, 46);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 4. Room Environment for PBR metallic / glossy reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 5. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03; // don't go below ground
    this.controls.minDistance = 8;
    this.controls.maxDistance = 140;
    this.controls.target.set(0, 0, -6);

    // 6. Build 3D Pitch and Stadium
    this.setupLighting();
    this.buildPitch();
    this.buildStadium();
    this.buildGoals();
    this.buildBall();
    this.buildActiveHalo();

    this.scene.add(this.pathObjectsGroup);

    // 7. Event listeners
    this.bindEvents();

    // 8. Pre-warm & start loop
    this.renderer.compile(this.scene, this.camera);
    this.animate();
  }

  // --- LIGHTING RIG ---
  private setupLighting() {
    // Ambient / Hemisphere soft stadium sky fill
    const hemiLight = new THREE.HemisphereLight(0x4070a0, 0x152230, 0.6);
    this.scene.add(hemiLight);

    // Main floodlight key light
    const keySpot = new THREE.DirectionalLight(0xffffff, 1.4);
    keySpot.position.set(20, 50, 30);
    keySpot.castShadow = true;
    keySpot.shadow.mapSize.width = 2048;
    keySpot.shadow.mapSize.height = 2048;
    keySpot.shadow.camera.near = 10;
    keySpot.shadow.camera.far = 120;
    keySpot.shadow.camera.left = -40;
    keySpot.shadow.camera.right = 40;
    keySpot.shadow.camera.top = 50;
    keySpot.shadow.camera.bottom = -50;
    keySpot.shadow.bias = -0.0005;
    keySpot.shadow.normalBias = 0.02;
    this.scene.add(keySpot);

    // Secondary fill light from opposite corner
    const fillSpot = new THREE.DirectionalLight(0x8bc34a, 0.4);
    fillSpot.position.set(-25, 40, -30);
    this.scene.add(fillSpot);

    // Stadium Floodlight Towers with volumetric-like emissive arrays
    this.createFloodlightTower(35, 28, 48, -15, 0, 0);
    this.createFloodlightTower(-35, 28, 48, 15, 0, 0);
    this.createFloodlightTower(35, 28, -48, -15, 0, 0);
    this.createFloodlightTower(-35, 28, -48, 15, 0, 0);
  }

  private createFloodlightTower(x: number, y: number, z: number, _targetX: number, _targetY: number, _targetZ: number) {
    const towerGroup = new THREE.Group();
    towerGroup.position.set(x, 0, z);

    // Steel mast
    const mastGeo = new THREE.CylinderGeometry(0.5, 0.8, y, 6);
    const mastMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.8,
      roughness: 0.3,
    });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.y = y / 2;
    towerGroup.add(mast);

    // Floodlight rack
    const rackGeo = new THREE.BoxGeometry(7, 3, 0.6);
    const rackMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.85,
      roughness: 0.2,
    });
    const rack = new THREE.Mesh(rackGeo, rackMat);
    rack.position.set(0, y, 0);
    rack.lookAt(0, 0, 0);
    towerGroup.add(rack);

    // Light banks (bright glowing emissive bulbs)
    const bulbsGeo = new THREE.PlaneGeometry(6.6, 2.6);
    const bulbsMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    const bulbs = new THREE.Mesh(bulbsGeo, bulbsMat);
    bulbs.position.set(0, 0, 0.32);
    rack.add(bulbs);

    // Actual SpotLight focused onto the field
    const spot = new THREE.SpotLight(0xf8fafc, 2.5);
    spot.position.set(0, y, 0);
    spot.target.position.set(0, 0, 0);
    spot.angle = Math.PI / 3.5;
    spot.penumbra = 0.6;
    spot.decay = 1.2;
    spot.distance = 150;
    this.scene.add(spot.target);
    towerGroup.add(spot);

    this.scene.add(towerGroup);
  }

  // --- PROCEDURAL PITCH & TURF TEXTURE ---
  private buildPitch() {
    const totalW = PITCH_WIDTH + PITCH_MARGIN * 2;
    const totalL = PITCH_LENGTH + PITCH_MARGIN * 2;

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 3072;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // 1. Base turf with alternating mowing stripes (12 vertical/horizontal cuts)
      const numStripes = 14;
      const stripeH = canvas.height / numStripes;

      for (let i = 0; i < numStripes; i++) {
        // Subtle mowing difference: light grass green vs deeper emerald
        ctx.fillStyle = i % 2 === 0 ? '#1b5a26' : '#236e30';
        ctx.fillRect(0, i * stripeH, canvas.width, stripeH);
      }

      // Add micro-noise texture for realistic grass texture
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 14;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      // Pitch dimensions relative to canvas
      const marginX = (canvas.width * (PITCH_MARGIN / totalW));
      const marginY = (canvas.height * (PITCH_MARGIN / totalL));
      const pitchW = canvas.width - marginX * 2;
      const pitchH = canvas.height - marginY * 2;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Regulation White Markings
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 10;
      ctx.fillStyle = '#f8fafc';

      // Touchlines boundary
      ctx.strokeRect(marginX, marginY, pitchW, pitchH);

      // Halfway line
      ctx.beginPath();
      ctx.moveTo(marginX, centerY);
      ctx.lineTo(marginX + pitchW, centerY);
      ctx.stroke();

      // Center Circle & Center Spot
      const centerCircleRadius = pitchW * (9.15 / 56);
      ctx.beginPath();
      ctx.arc(centerX, centerY, centerCircleRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
      ctx.fill();

      // Penalty Boxes & Goal Boxes
      const drawPenaltyArea = (isTop: boolean) => {
        const penaltyW = pitchW * (40.3 / 56);
        const penaltyDepth = pitchH * (16.5 / 90);
        const penaltyX = centerX - penaltyW / 2;
        const penaltyY = isTop ? marginY : marginY + pitchH - penaltyDepth;

        // 18-yard box
        ctx.strokeRect(penaltyX, penaltyY, penaltyW, penaltyDepth);

        // 6-yard box
        const goalAreaW = pitchW * (18.3 / 56);
        const goalAreaDepth = pitchH * (5.5 / 90);
        const goalAreaX = centerX - goalAreaW / 2;
        const goalAreaY = isTop ? marginY : marginY + pitchH - goalAreaDepth;
        ctx.strokeRect(goalAreaX, goalAreaY, goalAreaW, goalAreaDepth);

        // Penalty spot (11m from line)
        const penaltySpotDist = pitchH * (11 / 90);
        const spotY = isTop ? marginY + penaltySpotDist : marginY + pitchH - penaltySpotDist;
        ctx.beginPath();
        ctx.arc(centerX, spotY, 7, 0, Math.PI * 2);
        ctx.fill();

        // Penalty arc (D)
        ctx.beginPath();
        if (isTop) {
          ctx.arc(centerX, spotY, centerCircleRadius, 0.65, Math.PI - 0.65);
        } else {
          ctx.arc(centerX, spotY, centerCircleRadius, Math.PI + 0.65, Math.PI * 2 - 0.65);
        }
        ctx.stroke();
      };

      drawPenaltyArea(true);
      drawPenaltyArea(false);

      // Corner Arcs
      const cornerR = pitchW * (1.2 / 56);
      const corners = [
        { x: marginX, y: marginY, start: 0, end: Math.PI / 2 },
        { x: marginX + pitchW, y: marginY, start: Math.PI / 2, end: Math.PI },
        { x: marginX, y: marginY + pitchH, start: Math.PI * 1.5, end: Math.PI * 2 },
        { x: marginX + pitchW, y: marginY + pitchH, start: Math.PI, end: Math.PI * 1.5 },
      ];

      corners.forEach((c) => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, cornerR, c.start, c.end);
        ctx.stroke();
      });
    }

    const pitchTexture = new THREE.CanvasTexture(canvas);
    pitchTexture.colorSpace = THREE.SRGBColorSpace;
    pitchTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const pitchGeo = new THREE.PlaneGeometry(totalW, totalL);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: pitchTexture,
      roughness: 0.78,
      metalness: 0.05,
    });

    this.pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
    this.pitchMesh.rotation.x = -Math.PI / 2;
    this.pitchMesh.receiveShadow = true;
    this.pitchMesh.name = 'pitch_ground';
    this.scene.add(this.pitchMesh);
  }

  // --- STADIUM STANDS & PERIMETER ---
  private buildStadium() {
    const stadiumGroup = new THREE.Group();

    // 1. LED Perimeter Boards around touchline
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.3,
      metalness: 0.6,
      emissive: new THREE.Color(0x0c2514),
      emissiveIntensity: 0.4,
    });

    const createBoard = (w: number, d: number, x: number, z: number, ry: number) => {
      const geo = new THREE.BoxGeometry(w, 1.2, d);
      const mesh = new THREE.Mesh(geo, boardMat);
      mesh.position.set(x, 0.6, z);
      mesh.rotation.y = ry;
      stadiumGroup.add(mesh);
    };

    createBoard(PITCH_LENGTH + 6, 0.4, -PITCH_WIDTH / 2 - 2, 0, Math.PI / 2);
    createBoard(PITCH_LENGTH + 6, 0.4, PITCH_WIDTH / 2 + 2, 0, Math.PI / 2);
    createBoard(PITCH_WIDTH + 4, 0.4, 0, -PITCH_LENGTH / 2 - 2, 0);
    createBoard(PITCH_WIDTH + 4, 0.4, 0, PITCH_LENGTH / 2 + 2, 0);

    // 2. Grandstands (Tiered Seating banks)
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x09121f,
      roughness: 0.9,
      metalness: 0.1,
    });

    const createStand = (width: number, height: number, depth: number, x: number, y: number, z: number, rx: number, ry: number) => {
      const geo = new THREE.BoxGeometry(width, height, depth);
      const mesh = new THREE.Mesh(geo, standMat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, 0);
      stadiumGroup.add(mesh);
    };

    // North Stand (behind North Goal)
    createStand(PITCH_WIDTH + 30, 20, 35, 0, 8, -PITCH_LENGTH / 2 - 24, -0.3, 0);
    // South Stand (behind South Goal)
    createStand(PITCH_WIDTH + 30, 20, 35, 0, 8, PITCH_LENGTH / 2 + 24, 0.3, 0);
    // West Stand
    createStand(PITCH_LENGTH + 40, 22, 40, -PITCH_WIDTH / 2 - 28, 9, 0, 0, Math.PI / 2 + 0.28);
    // East Stand
    createStand(PITCH_LENGTH + 40, 22, 40, PITCH_WIDTH / 2 + 28, 9, 0, 0, -Math.PI / 2 - 0.28);

    // Ground surrounding outside stadium
    const outerGroundGeo = new THREE.PlaneGeometry(300, 300);
    const outerGroundMat = new THREE.MeshBasicMaterial({ color: 0x030712 });
    const outerGround = new THREE.Mesh(outerGroundGeo, outerGroundMat);
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.05;
    stadiumGroup.add(outerGround);

    this.scene.add(stadiumGroup);
  }

  // --- GOAL POSTS & 3D NETTING ---
  private buildGoals() {
    const goalWidth = 10;
    const goalHeight = 4.2;
    const goalDepth = 3.2;
    const postRadius = 0.12;

    const postMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.4,
    });

    const netMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
      roughness: 0.9,
    });

    const createGoal = (zPos: number, isNorth: boolean) => {
      const group = new THREE.Group();
      group.position.set(0, 0, zPos);

      // Left post
      const postL = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 16), postMat);
      postL.position.set(-goalWidth / 2, goalHeight / 2, 0);
      postL.castShadow = true;
      group.add(postL);

      // Right post
      const postR = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 16), postMat);
      postR.position.set(goalWidth / 2, goalHeight / 2, 0);
      postR.castShadow = true;
      group.add(postR);

      // Crossbar
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalWidth, 16), postMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, goalHeight, 0);
      bar.castShadow = true;
      group.add(bar);

      // Back frame supports
      const dir = isNorth ? -1 : 1;
      const backBottom = new THREE.Mesh(new THREE.CylinderGeometry(postRadius * 0.8, postRadius * 0.8, goalWidth, 12), postMat);
      backBottom.rotation.z = Math.PI / 2;
      backBottom.position.set(0, 0.05, dir * goalDepth);
      group.add(backBottom);

      // 3D Net Geometry
      const netGeo = new THREE.BoxGeometry(goalWidth, goalHeight, goalDepth);
      const netMesh = new THREE.Mesh(netGeo, netMat);
      netMesh.position.set(0, goalHeight / 2, (dir * goalDepth) / 2);
      group.add(netMesh);

      this.scene.add(group);
    };

    createGoal(-PITCH_LENGTH / 2, true);
    createGoal(PITCH_LENGTH / 2, false);
  }

  // --- 3D TACTICAL PLAYER MARKERS (Matching Reference Image!) ---
  // The reference tokens have:
  // - A beveled circular puck pedestal base
  // - A circular vertical disc head atop it
  // - White satin finish for Team Home; deep Navy for Team Away
  public setPlayers(players: Player[]) {
    const existingIds = new Set(this.playerGroups.keys());
    const newIds = new Set(players.map((p) => p.id));

    // Remove defunct players
    existingIds.forEach((id) => {
      if (!newIds.has(id)) {
        const grp = this.playerGroups.get(id);
        if (grp) this.scene.remove(grp);
        this.playerGroups.delete(id);
      }
    });

    players.forEach((player) => {
      let group = this.playerGroups.get(player.id);
      if (!group) {
        group = this.createPlayerMarkerGroup(player);
        group.position.set(player.position.x, 0, player.position.z);
        this.scene.add(group);
        this.playerGroups.set(player.id, group);
      } else {
        // Smoothly animate towards target position
        group.userData.targetPosition = new THREE.Vector3(player.position.x, 0, player.position.z);
        group.userData.player = player;
      }
    });
  }

  private createPlayerMarkerGroup(player: Player): THREE.Group {
    const group = new THREE.Group();
    group.userData = {
      id: player.id,
      isPlayer: true,
      player,
      targetPosition: new THREE.Vector3(player.position.x, 0, player.position.z),
    };

    const isHome = player.team === 'home';
    const baseColor = isHome ? 0xf8fafc : 0x0f1e36;
    const rimColor = isHome ? 0xe2e8f0 : 0x1e3a8a;

    // 1. Pedestal Base Puck (Cylinder with beveled aesthetic)
    const baseGeo = new THREE.CylinderGeometry(1.2, 1.35, 0.38, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: isHome ? 0.25 : 0.35,
      metalness: isHome ? 0.3 : 0.45,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.19;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Subtle metallic base trim ring
    const trimGeo = new THREE.TorusGeometry(1.32, 0.05, 12, 32);
    const trimMat = new THREE.MeshStandardMaterial({
      color: rimColor,
      roughness: 0.2,
      metalness: 0.8,
    });
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.rotation.x = Math.PI / 2;
    trimMesh.position.y = 0.08;
    group.add(trimMesh);

    // 2. Vertical Circular Disc Head (matches reference photos exactly)
    const discGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.22, 32);

    // Number & Name canvas texture for disc faces
    const discTexture = this.createPlayerBadgeTexture(player.number, player.role, isHome);
    const discFaceMat = new THREE.MeshStandardMaterial({
      map: discTexture,
      roughness: 0.3,
      metalness: 0.2,
    });
    const discSideMat = new THREE.MeshStandardMaterial({
      color: rimColor,
      roughness: 0.2,
      metalness: 0.7,
    });

    const discMesh = new THREE.Mesh(discGeo, [discSideMat, discFaceMat, discFaceMat]);
    // Stand disc vertically facing the camera perspective
    discMesh.rotation.x = Math.PI / 2;
    discMesh.rotation.z = Math.PI / 2;
    discMesh.position.y = 1.32;
    discMesh.castShadow = true;
    group.add(discMesh);

    // Small stem connecting base to vertical disc
    const stemGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.4, 16);
    const stemMesh = new THREE.Mesh(stemGeo, discSideMat);
    stemMesh.position.y = 0.45;
    group.add(stemMesh);

    return group;
  }

  private createPlayerBadgeTexture(num: number, role: string, isHome: boolean): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Background circle
    ctx.fillStyle = isHome ? '#ffffff' : '#0c1b33';
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, Math.PI * 2);
    ctx.fill();

    // Border ring
    ctx.lineWidth = 10;
    ctx.strokeStyle = isHome ? '#94a3b8' : '#38bdf8';
    ctx.stroke();

    // Text: Number
    ctx.fillStyle = isHome ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 102px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${num}`, 128, 114);

    // Text: Role (e.g. GK, CB, ST)
    ctx.font = 'bold 38px Montserrat, sans-serif';
    ctx.fillStyle = isHome ? '#64748b' : '#a3e635';
    ctx.fillText(role, 128, 192);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // --- 3D SOCCER BALL ---
  private buildBall() {
    const ballGroup = new THREE.Group();
    ballGroup.userData = { id: 'ball', isBall: true, targetPosition: new THREE.Vector3(0, 0.45, 0) };

    const ballCanvas = document.createElement('canvas');
    ballCanvas.width = 512;
    ballCanvas.height = 256;
    const ctx = ballCanvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 256);

    // Procedural black pentagons
    ctx.fillStyle = '#111827';
    for (let x = 32; x < 512; x += 85) {
      for (let y = 32; y < 256; y += 85) {
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const ballTexture = new THREE.CanvasTexture(ballCanvas);
    ballTexture.colorSpace = THREE.SRGBColorSpace;

    const ballGeo = new THREE.SphereGeometry(0.55, 32, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      map: ballTexture,
      roughness: 0.28,
      metalness: 0.1,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.position.y = 0.55;
    ballMesh.castShadow = true;
    ballGroup.add(ballMesh);

    // Ball contact shadow plane
    const shadowGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 64, 64);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);

    const shadowMesh = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;
    ballGroup.add(shadowMesh);

    this.ballMesh = ballGroup;
    this.scene.add(ballGroup);
  }

  // --- SELECTION HALO RING (Matching Reference Image) ---
  private buildActiveHalo() {
    const haloGeo = new THREE.RingGeometry(1.6, 1.85, 48);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xa3e635,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.activeHaloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.activeHaloMesh.rotation.x = -Math.PI / 2;
    this.activeHaloMesh.position.y = 0.03;
    this.activeHaloMesh.visible = false;
    this.scene.add(this.activeHaloMesh);
  }

  public setActivePlayer(playerId: string | null) {
    this.hoveredPlayerId = playerId;
    if (!playerId) {
      if (this.activeHaloMesh) this.activeHaloMesh.visible = false;
      return;
    }
    const grp = this.playerGroups.get(playerId);
    if (grp && this.activeHaloMesh) {
      this.activeHaloMesh.position.x = grp.position.x;
      this.activeHaloMesh.position.z = grp.position.z;
      this.activeHaloMesh.visible = true;
    }
  }

  // --- TACTICAL PATHS & ARROWS (Matching Reference Images!) ---
  public setPaths(paths: TacticalPath[]) {
    // Clear previous paths
    while (this.pathObjectsGroup.children.length > 0) {
      const child = this.pathObjectsGroup.children[0];
      this.pathObjectsGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }

    paths.forEach((path) => {
      const mesh = this.createTacticalPathMesh(path);
      if (mesh) {
        this.pathObjectsGroup.add(mesh);
      }
    });
  }

  private createTacticalPathMesh(path: TacticalPath): THREE.Group | null {
    if (!path.points || path.points.length < 2) return null;

    const group = new THREE.Group();
    const colorHex = path.color || (path.type === 'run' ? '#a3e635' : path.type === 'press' ? '#ef4444' : '#ffffff');
    const color = new THREE.Color(colorHex);

    const p0 = path.points[0];
    const pEnd = path.points[path.points.length - 1];

    if (path.type === 'zone') {
      // Area zone highlight
      const zoneGeo = new THREE.CircleGeometry(4, 32);
      const zoneMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
      zoneMesh.rotation.x = -Math.PI / 2;
      zoneMesh.position.set(p0.x, 0.03, p0.z);
      group.add(zoneMesh);
      return group;
    }

    // Build curve (straight line or curved arc)
    const curvePoints: THREE.Vector3[] = [];
    if (path.points.length === 2 && path.type === 'run') {
      // Add subtle curve offset for runs
      const mid = new THREE.Vector3((p0.x + pEnd.x) / 2, 0.04, (p0.z + pEnd.z) / 2);
      const dir = new THREE.Vector3(pEnd.x - p0.x, 0, pEnd.z - p0.z);
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(4);
      mid.add(perp);

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(p0.x, 0.04, p0.z),
        mid,
        new THREE.Vector3(pEnd.x, 0.04, pEnd.z)
      );
      curvePoints.push(...curve.getPoints(24));
    } else if (path.points.length > 2) {
      const vPoints = path.points.map((p) => new THREE.Vector3(p.x, 0.04, p.z));
      const curve = new THREE.CatmullRomCurve3(vPoints);
      curvePoints.push(...curve.getPoints(24));
    } else {
      curvePoints.push(new THREE.Vector3(p0.x, 0.04, p0.z), new THREE.Vector3(pEnd.x, 0.04, pEnd.z));
    }

    // Create ribbon strip for the path line
    const ribbonGeo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const width = path.type === 'press' ? 0.35 : 0.45;

    for (let i = 0; i < curvePoints.length - 1; i++) {
      const cur = curvePoints[i];
      const next = curvePoints[i + 1];
      const dir = new THREE.Vector3().subVectors(next, cur).normalize();
      const norm = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);

      vertices.push(
        cur.x - norm.x, cur.y, cur.z - norm.z,
        cur.x + norm.x, cur.y, cur.z + norm.z,
        next.x - norm.x, next.y, next.z - norm.z,

        cur.x + norm.x, cur.y, cur.z + norm.z,
        next.x + norm.x, next.y, next.z + norm.z,
        next.x - norm.x, next.y, next.z - norm.z
      );
    }

    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const ribbonMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: path.type === 'press' ? 0.7 : 0.9,
      depthWrite: false,
    });
    const lineMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    group.add(lineMesh);

    // Arrowhead at the end point
    const lastP = curvePoints[curvePoints.length - 1];
    const prevP = curvePoints[curvePoints.length - 2];
    const tangent = new THREE.Vector3().subVectors(lastP, prevP).normalize();
    const arrowAngle = Math.atan2(tangent.x, tangent.z);

    const arrowHeadGeo = new THREE.ConeGeometry(0.85, 1.8, 3);
    const arrowHeadMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const arrowHead = new THREE.Mesh(arrowHeadGeo, arrowHeadMat);
    arrowHead.rotation.x = Math.PI / 2;
    arrowHead.rotation.z = arrowAngle + Math.PI;
    arrowHead.position.set(lastP.x, 0.05, lastP.z);
    group.add(arrowHead);

    return group;
  }

  // --- CAMERA PRESET TRANSITIONS ---
  public setCameraPreset(preset: CameraPreset) {
    this.isCameraTransitioning = true;
    switch (preset) {
      case 'broadcast':
        // Exactly matches reference images!
        this.targetCameraPos.set(0, 24, 46);
        this.targetLookAt.set(0, 0, -6);
        break;
      case 'overhead':
        // Pure top-down tactical chalkboard view
        this.targetCameraPos.set(0, 68, 0.1);
        this.targetLookAt.set(0, 0, 0);
        break;
      case 'attacking':
        // Zoomed into final third towards north goal
        this.targetCameraPos.set(0, 16, 18);
        this.targetLookAt.set(0, 0, -32);
        break;
      case 'defending':
        // Zoomed into defensive half towards south goal
        this.targetCameraPos.set(0, 16, -18);
        this.targetLookAt.set(0, 0, 32);
        break;
      case 'free':
        this.isCameraTransitioning = false;
        break;
    }

    if (this.prefersReducedMotion && preset !== 'free') {
      this.camera.position.copy(this.targetCameraPos);
      this.controls.target.copy(this.targetLookAt);
      this.controls.update();
      this.isCameraTransitioning = false;
    }
  }

  // --- PLAYBACK ANIMATION SEQUENCE ---
  public playSequence(paths: TacticalPath[]) {
    if (this.isSequencePlaying) return;
    this.isSequencePlaying = true;
    this.sequenceProgress = 0;

    // Snapshot current positions
    this.sequenceStartSnapshot.clear();
    this.playerGroups.forEach((grp, id) => {
      this.sequenceStartSnapshot.set(id, grp.position.clone());
    });
    if (this.ballMesh) {
      this.sequenceStartSnapshot.set('ball', this.ballMesh.position.clone());
    }

    // Identify paths to animate
    const runPaths = paths.filter((p) => p.type === 'run');
    const passPaths = paths.filter((p) => p.type === 'pass');

    // Run animation loop over 3 seconds
    const duration = 3.2; // seconds
    let elapsed = 0;

    const animateStep = () => {
      const dt = this.clock.getDelta();
      elapsed += dt;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

      // Animate ball along passes
      if (passPaths.length > 0 && this.ballMesh) {
        const activePass = passPaths[0];
        const pStart = activePass.points[0];
        const pEnd = activePass.points[activePass.points.length - 1];
        this.ballMesh.position.x = pStart.x + (pEnd.x - pStart.x) * ease;
        this.ballMesh.position.z = pStart.z + (pEnd.z - pStart.z) * ease;
      }

      // Animate players along run paths
      runPaths.forEach((path) => {
        // Find nearest player to start of run
        let nearestGroup: THREE.Group | null = null;
        let minDist = 8;
        this.playerGroups.forEach((grp) => {
          const d = Math.hypot(grp.position.x - path.points[0].x, grp.position.z - path.points[0].z);
          if (d < minDist) {
            minDist = d;
            nearestGroup = grp;
          }
        });

        if (nearestGroup) {
          const pStart = path.points[0];
          const pEnd = path.points[path.points.length - 1];
          (nearestGroup as THREE.Group).position.x = pStart.x + (pEnd.x - pStart.x) * ease;
          (nearestGroup as THREE.Group).position.z = pStart.z + (pEnd.z - pStart.z) * ease;
        }
      });

      if (progress < 1 && this.isSequencePlaying) {
        requestAnimationFrame(animateStep);
      } else {
        this.isSequencePlaying = false;
      }
    };

    requestAnimationFrame(animateStep);
  }

  // --- DRAWING MODE SETTER ---
  public setDrawingMode(enabled: boolean, type: 'pass' | 'run' | 'press' | 'zone' = 'pass') {
    this.isDrawingMode = enabled;
    this.currentDrawType = type;
    this.controls.enabled = !enabled; // disable camera orbit while drawing
    if (!enabled && this.drawPreviewMesh) {
      this.scene.remove(this.drawPreviewMesh);
      this.drawPreviewMesh = null;
    }
  }

  // --- EVENT BINDING & RAYCASTING ---
  private bindEvents() {
    const el = this.renderer.domElement;

    const getPitchIntersection = (e: MouseEvent | Touch): THREE.Vector3 | null => {
      const rect = el.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = new THREE.Vector3();
      const hasHit = this.raycaster.ray.intersectPlane(this.groundPlane, hit);
      return hasHit ? hit : null;
    };

    const handlePointerDown = (e: MouseEvent | Touch) => {
      this.isPointerDown = true;
      const hit = getPitchIntersection(e);
      if (!hit) return;

      if (this.isDrawingMode) {
        this.drawStartPoint = hit.clone();
        return;
      }

      // Check if clicking on ball
      if (this.ballMesh) {
        const ballDist = Math.hypot(hit.x - this.ballMesh.position.x, hit.z - this.ballMesh.position.z);
        if (ballDist < 1.8) {
          this.draggedEntity = { id: 'ball', isBall: true, group: this.ballMesh };
          this.controls.enabled = false;
          playMarkerClickSound();
          return;
        }
      }

      // Check if clicking on any player
      let clickedPlayerId: string | null = null;
      let closestDist = 2.4;

      this.playerGroups.forEach((grp, id) => {
        const dist = Math.hypot(hit.x - grp.position.x, hit.z - grp.position.z);
        if (dist < closestDist) {
          closestDist = dist;
          clickedPlayerId = id;
          this.draggedEntity = { id, isBall: false, group: grp };
        }
      });

      if (clickedPlayerId) {
        this.controls.enabled = false;
        this.setActivePlayer(clickedPlayerId);
        this.onPlayerSelect?.(clickedPlayerId);
        playMarkerClickSound();
      } else {
        this.setActivePlayer(null);
        this.onPlayerSelect?.(null);
      }
    };

    const handlePointerMove = (e: MouseEvent | Touch) => {
      const hit = getPitchIntersection(e);
      if (!hit) return;

      // Handle entity dragging
      if (this.draggedEntity && this.isPointerDown) {
        // Clamp to pitch bounds
        const clampedX = Math.max(-PITCH_WIDTH / 2 - 2, Math.min(PITCH_WIDTH / 2 + 2, hit.x));
        const clampedZ = Math.max(-PITCH_LENGTH / 2 - 2, Math.min(PITCH_LENGTH / 2 + 2, hit.z));

        this.draggedEntity.group.position.x = clampedX;
        this.draggedEntity.group.position.z = clampedZ;

        if (this.draggedEntity.isBall) {
          this.onBallMove?.({ x: clampedX, z: clampedZ });
        } else {
          this.onPlayerMove?.(this.draggedEntity.id, { x: clampedX, z: clampedZ });
          if (this.activeHaloMesh) {
            this.activeHaloMesh.position.x = clampedX;
            this.activeHaloMesh.position.z = clampedZ;
          }
        }
        return;
      }

      // Handle drawing preview
      if (this.isDrawingMode && this.drawStartPoint && this.isPointerDown) {
        // Update or create preview line
        if (!this.drawPreviewMesh) {
          const previewGeo = new THREE.BufferGeometry();
          previewGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
          this.drawPreviewMesh = new THREE.Mesh(
            previewGeo,
            new THREE.MeshBasicMaterial({ color: 0xa3e635, side: THREE.DoubleSide })
          );
          this.scene.add(this.drawPreviewMesh);
        }

        const positions = new Float32Array([
          this.drawStartPoint.x, 0.05, this.drawStartPoint.z,
          hit.x, 0.05, hit.z,
        ]);
        this.drawPreviewMesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      }
    };

    const handlePointerUp = (e: MouseEvent | Touch) => {
      this.isPointerDown = false;

      if (this.draggedEntity) {
        playMarkerClickSound();
        this.draggedEntity = null;
        if (!this.isDrawingMode) {
          this.controls.enabled = true;
        }
      }

      if (this.isDrawingMode && this.drawStartPoint) {
        const hit = getPitchIntersection(e);
        if (hit) {
          const dist = Math.hypot(hit.x - this.drawStartPoint.x, hit.z - this.drawStartPoint.z);
          if (dist > 1.5) {
            const newPath: TacticalPath = {
              id: 'path_' + Date.now(),
              type: this.currentDrawType,
              points: [
                { x: this.drawStartPoint.x, z: this.drawStartPoint.z },
                { x: hit.x, z: hit.z },
              ],
            };
            this.onPathDrawn?.(newPath);
            playMarkerClickSound();
          }
        }

        if (this.drawPreviewMesh) {
          this.scene.remove(this.drawPreviewMesh);
          this.drawPreviewMesh = null;
        }
        this.drawStartPoint = null;
      }
    };

    // DOM bindings
    el.addEventListener('mousedown', (e) => handlePointerDown(e));
    window.addEventListener('mousemove', (e) => handlePointerMove(e));
    window.addEventListener('mouseup', (e) => handlePointerUp(e));

    el.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) handlePointerDown(e.touches[0]);
      },
      { passive: true }
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 1) handlePointerMove(e.touches[0]);
      },
      { passive: true }
    );
    window.addEventListener(
      'touchend',
      (e) => {
        if (e.changedTouches.length === 1) handlePointerUp(e.changedTouches[0]);
      },
      { passive: true }
    );

    window.addEventListener('resize', this.onWindowResize);
  }

  private onWindowResize = () => {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // --- ANIMATION TICK ---
  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    // Smooth camera preset interpolation
    if (this.isCameraTransitioning) {
      this.camera.position.lerp(this.targetCameraPos, 0.05);
      this.controls.target.lerp(this.targetLookAt, 0.05);

      if (
        this.camera.position.distanceTo(this.targetCameraPos) < 0.1 &&
        this.controls.target.distanceTo(this.targetLookAt) < 0.1
      ) {
        this.isCameraTransitioning = false;
      }
    }

    this.controls.update();

    // Smooth player positions when switching formations (damping)
    this.playerGroups.forEach((grp) => {
      const target = grp.userData.targetPosition as THREE.Vector3;
      if (target && grp.position.distanceTo(target) > 0.01) {
        if (this.prefersReducedMotion) {
          grp.position.copy(target);
        } else {
          grp.position.lerp(target, 0.1);
        }
        if (this.hoveredPlayerId === grp.userData.id && this.activeHaloMesh) {
          this.activeHaloMesh.position.x = grp.position.x;
          this.activeHaloMesh.position.z = grp.position.z;
        }
      }
    });

    this.renderer.render(this.scene, this.camera);
  };

  // --- CLEANUP ---
  public dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
