'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEPARTMENT_COLORS: Record<string, number> = {
  'dept-research': 0xf97316,
  'dept-risk': 0x10b981,
  'dept-monitoring': 0x38bdf8,
};

const DEPARTMENT_SHORT: Record<string, string> = {
  'dept-research': 'RESEARCH',
  'dept-risk': 'RISK',
  'dept-monitoring': 'MONITORING',
};

type DepartmentTopology = {
  id: string;
  name: string;
  order: number;
};

type AgentTopology = {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  departmentName: string;
  tier: string;
  status: string;
  model: string;
  brainAccess: boolean;
  retrievalAccess: {
    startupMemory: boolean;
    startupBrain: boolean;
    gatewayEnforced: boolean;
    fullMemoryDumpAllowed: boolean;
    fullBrainDumpAllowed: boolean;
  };
};

type BrainNode = {
  id: string;
  label: string;
  type?: string;
};

type BrainEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
};

type TopologyPayload = {
  generatedAt: string;
  departments: DepartmentTopology[];
  agents: AgentTopology[];
  brainGraph: {
    nodes: BrainNode[];
    edges: BrainEdge[];
  };
  operationalMemory: {
    experiences: number;
    decisions: number;
    validatedLessons: number;
  };
};

function colorCss(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function createTextSprite(
  text: string,
  options: {
    color?: string;
    fontSize?: number;
    scale?: [number, number];
  } = {},
) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `700 ${options.fontSize ?? 64}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = options.color ?? '#f5f5f5';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  const scale = options.scale ?? [6, 1.5];
  sprite.scale.set(scale[0], scale[1], 1);
  return sprite;
}

function line(
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: number,
  opacity = 0.25,
) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  return new THREE.Line(geometry, material);
}

function dashedLine(
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: number,
  opacity = 0.8,
) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity,
    dashSize: 0.38,
    gapSize: 0.28,
  });
  const result = new THREE.Line(geometry, material);
  result.computeLineDistances();
  return result;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const candidate = child as THREE.Mesh & {
      material?: THREE.Material | THREE.Material[];
    };
    candidate.geometry?.dispose();
    if (Array.isArray(candidate.material)) {
      candidate.material.forEach((material) => material.dispose());
    } else {
      candidate.material?.dispose();
    }
  });
}

function stableUnit(seed: string, salt: number) {
  let value = 2166136261 ^ salt;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 100000) / 100000;
}

function brainNodePosition(id: string, index: number) {
  const radius = 1.25 + stableUnit(id, 11) * 3.1;
  const theta = stableUnit(id, 23) * Math.PI * 2;
  const phi = Math.acos(2 * stableUnit(id, 37) - 1);
  const spread = 0.84 + Math.min(index, 100) * 0.003;

  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta) * radius * spread,
    Math.cos(phi) * radius * spread,
    Math.sin(phi) * Math.sin(theta) * radius * spread,
  );
}

const DEPARTMENT_POSITIONS: Record<string, THREE.Vector3> = {
  'dept-research': new THREE.Vector3(-11.2, 7.2, 0.6),
  'dept-risk': new THREE.Vector3(11.2, 5.8, -0.8),
  'dept-monitoring': new THREE.Vector3(0, -11.3, 0.9),
};

export function StartupBrain3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [topology, setTopology] = useState<TopologyPayload | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentTopology | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentTopology | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/brain/topology', {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`topology_http_${response.status}`);
        const payload = (await response.json()) as TopologyPayload;
        if (!cancelled) {
          setTopology(payload);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load Startup Brain topology',
          );
        }
      }
    };

    void load();
    const timer = window.setInterval(load, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !topology) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03050a, 0.018);

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 160);
    camera.position.set(0, 3.5, 34);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 11;
    controls.maxDistance = 58;

    // Deliberately disabled: the camera must stay exactly where the user leaves it.
    controls.autoRotate = false;

    const world = new THREE.Group();
    scene.add(world);

    scene.add(new THREE.AmbientLight(0xffffff, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(7, 13, 15);
    scene.add(key);

    const interactive: THREE.Object3D[] = [];
    const agentPositionById = new Map<string, THREE.Vector3>();

    // ------------------------------------------------------------------
    // Company intelligence core: Startup Brain + Startup Memory.
    // There is no enclosing sphere. Departments live outside this core.
    // ------------------------------------------------------------------

    const brainRoot = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0xff4d3d,
        emissive: 0x4d0905,
        emissiveIntensity: 0.7,
        roughness: 0.38,
        metalness: 0.12,
      }),
    );
    brainRoot.userData = {
      kind: 'brain',
      label: 'Startup Brain',
    };
    world.add(brainRoot);
    interactive.push(brainRoot);

    const brainRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.65, 0.035, 10, 128),
      new THREE.MeshBasicMaterial({
        color: 0xff4d3d,
        transparent: true,
        opacity: 0.22,
      }),
    );
    brainRing.rotation.x = Math.PI / 2;
    world.add(brainRing);

    const brainLabel = createTextSprite('STARTUP BRAIN', {
      color: '#ffffff',
      fontSize: 64,
      scale: [6.7, 1.55],
    });
    brainLabel.position.set(0, -1.75, 0);
    world.add(brainLabel);

    const memoryPosition = new THREE.Vector3(0, 5.4, -0.6);
    const memoryHub = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.92, 1),
      new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        emissive: 0x2f3540,
        emissiveIntensity: 0.5,
        roughness: 0.5,
        metalness: 0.2,
      }),
    );
    memoryHub.position.copy(memoryPosition);
    memoryHub.userData = {
      kind: 'memory',
      label: 'Startup Memory',
    };
    world.add(memoryHub);
    interactive.push(memoryHub);

    const memoryLabel = createTextSprite('STARTUP MEMORY', {
      color: '#d1d5db',
      fontSize: 54,
      scale: [6.4, 1.45],
    });
    memoryLabel.position.copy(memoryPosition.clone().add(new THREE.Vector3(0, 1.45, 0)));
    world.add(memoryLabel);

    world.add(dashedLine(memoryPosition, new THREE.Vector3(0, 1.2, 0), 0x64748b, 0.42));

    // Real experiential nodes. Empty today; this cluster grows as the Brain store grows.
    const brainNodePositions = new Map<string, THREE.Vector3>();
    topology.brainGraph.nodes.forEach((node, index) => {
      const position = brainNodePosition(node.id, index);
      brainNodePositions.set(node.id, position);

      const knowledgeNode = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 14, 10),
        new THREE.MeshBasicMaterial({
          color: 0xff8a65,
          transparent: true,
          opacity: 0.9,
        }),
      );
      knowledgeNode.position.copy(position);
      knowledgeNode.userData = {
        kind: 'brain-node',
        label: node.label,
      };
      world.add(knowledgeNode);
      interactive.push(knowledgeNode);

      world.add(line(new THREE.Vector3(0, 0, 0), position, 0xff5f45, 0.12));
    });

    for (const edge of topology.brainGraph.edges) {
      const source = brainNodePositions.get(edge.source);
      const target = brainNodePositions.get(edge.target);
      if (source && target) {
        world.add(line(source, target, 0xff765f, 0.28));
      }
    }

    // ------------------------------------------------------------------
    // Departments outside the company intelligence core.
    // Each employee belongs visually to the department, not to a grey shell.
    // ------------------------------------------------------------------

    for (const department of topology.departments) {
      const departmentPosition =
        DEPARTMENT_POSITIONS[department.id] ??
        new THREE.Vector3(0, 10, 0);
      const color = DEPARTMENT_COLORS[department.id] ?? 0xa3a3a3;

      const departmentRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.0, 0.1, 12, 48),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
        }),
      );
      departmentRing.position.copy(departmentPosition);
      departmentRing.userData = {
        kind: 'department',
        department,
      };
      world.add(departmentRing);
      interactive.push(departmentRing);

      const departmentCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.52, 20, 16),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.22,
          roughness: 0.52,
        }),
      );
      departmentCore.position.copy(departmentPosition);
      departmentCore.userData = {
        kind: 'department',
        department,
      };
      world.add(departmentCore);
      interactive.push(departmentCore);

      const departmentLabel = createTextSprite(
        DEPARTMENT_SHORT[department.id] ?? department.name.toUpperCase(),
        {
          color: colorCss(color),
          fontSize: 56,
          scale: [6.0, 1.4],
        },
      );
      departmentLabel.position.copy(
        departmentPosition.clone().add(new THREE.Vector3(0, 1.75, 0)),
      );
      world.add(departmentLabel);

      world.add(dashedLine(departmentPosition, new THREE.Vector3(0, 0, 0), color, 0.2));

      const departmentAgents = topology.agents.filter(
        (agent) => agent.departmentId === department.id,
      );

      departmentAgents.forEach((agent, index) => {
        const angle =
          -Math.PI * 0.75 +
          (departmentAgents.length <= 1
            ? 0
            : (index / (departmentAgents.length - 1)) * Math.PI * 1.5);
        const localRadius = 2.25 + (index % 2) * 0.55;
        const localZ = (index % 3 - 1) * 0.55;

        const position = departmentPosition.clone().add(
          new THREE.Vector3(
            Math.cos(angle) * localRadius,
            Math.sin(angle) * localRadius,
            localZ,
          ),
        );
        agentPositionById.set(agent.id, position);

        const agentMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.43, 20, 15),
          new THREE.MeshStandardMaterial({
            color: 0xe5e7eb,
            emissive: color,
            emissiveIntensity: 0.14,
            roughness: 0.48,
          }),
        );
        agentMesh.position.copy(position);
        agentMesh.userData = {
          kind: 'agent',
          agent,
        };
        world.add(agentMesh);
        interactive.push(agentMesh);

        const agentLabel = createTextSprite(agent.name, {
          color: '#f5f5f5',
          fontSize: 50,
          scale: [3.0, 0.72],
        });
        agentLabel.position.copy(position.clone().add(new THREE.Vector3(0, 0.78, 0)));
        world.add(agentLabel);

        world.add(line(position, departmentPosition, color, 0.42));
      });
    }

    // Highlight selective dual retrieval only for the selected employee.
    if (selectedAgent) {
      const selectedPosition = agentPositionById.get(selectedAgent.id);
      if (selectedPosition) {
        world.add(dashedLine(selectedPosition, memoryPosition, 0xe2e8f0, 0.9));
        if (selectedAgent.brainAccess) {
          world.add(dashedLine(selectedPosition, new THREE.Vector3(0, 0, 0), 0xff5b4a, 0.95));
        }
      }
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const intersectionsFor = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(interactive, false);
    };

    const onPointerMove = (event: PointerEvent) => {
      const hit = intersectionsFor(event)[0]?.object;
      const label =
        hit?.userData.kind === 'agent'
          ? (hit.userData.agent as AgentTopology).name
          : hit?.userData.kind === 'department'
            ? (hit.userData.department as DepartmentTopology).name
            : (hit?.userData.label as string | undefined);

      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      setHovered(label ?? null);
    };

    const onPointerDown = (event: PointerEvent) => {
      const hit = intersectionsFor(event)[0]?.object;
      if (!hit) return;

      if (hit.userData.kind === 'agent') {
        setSelectedAgent(hit.userData.agent as AgentTopology);
        setSelectedDepartment(null);
      } else if (hit.userData.kind === 'department') {
        setSelectedDepartment(hit.userData.department as DepartmentTopology);
        setSelectedAgent(null);
      } else {
        setSelectedDepartment(null);
        setSelectedAgent(null);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let animationFrame = 0;
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.dispose();
      disposeObject(world);
      renderer.dispose();
      renderer.domElement.remove();
      setHovered(null);
    };
  }, [topology, selectedAgent]);

  const selectedDepartmentAgents =
    selectedDepartment && topology
      ? topology.agents.filter(
          (agent) => agent.departmentId === selectedDepartment.id,
        )
      : [];

  return (
    <div className="relative overflow-hidden rounded-lg-t border border-os-border bg-[#03050a]">
      <div className="absolute left-4 top-4 z-10 max-w-[390px] rounded-md-t border border-os-border bg-black/75 px-4 py-3 backdrop-blur">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
          Company intelligence graph
        </div>
        <div className="mt-1 text-sm font-semibold text-white">
          Memory + Brain + 3 operating departments
        </div>
        <p className="mt-1 text-xs leading-relaxed text-os-muted">
          Departments live outside the intelligence core. Click an employee to reveal its selective retrieval paths to Startup Memory and Startup Brain.
        </p>
      </div>

      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <div className="rounded-md-t border border-os-border bg-black/75 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-os-muted backdrop-blur">
          {topology ? `${topology.agents.length} employees` : 'loading'}
        </div>
        <div className="rounded-md-t border border-os-border bg-black/75 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-os-muted backdrop-blur">
          brain nodes {topology?.brainGraph.nodes.length ?? 0}
        </div>
      </div>

      <div
        ref={mountRef}
        className="h-[720px] w-full"
        aria-label="Interactive three-dimensional Startup company intelligence graph"
      />

      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2 rounded-md-t border border-os-border bg-black/75 px-3 py-2 text-[10px] backdrop-blur">
        <span className="text-orange-400">â— Research</span>
        <span className="text-emerald-400">â— Risk</span>
        <span className="text-sky-400">â— Monitoring</span>
        <span className="text-os-dim">drag = rotate Â· wheel = zoom Â· right-drag = pan Â· no auto-reset</span>
      </div>

      {hovered ? (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-md-t border border-os-border bg-black/85 px-3 py-2 text-xs text-white backdrop-blur">
          {hovered}
        </div>
      ) : null}

      <aside className="absolute bottom-4 right-4 z-10 w-[330px] rounded-md-t border border-os-border bg-black/85 p-4 backdrop-blur">
        {selectedAgent ? (
          <>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
              Selected employee
            </div>
            <div className="mt-2 text-base font-semibold text-white">
              {selectedAgent.name}
            </div>
            <div className="mt-1 text-xs text-os-muted">
              {selectedAgent.role}
            </div>
            <div className="mt-3 space-y-1 font-mono text-[10px] text-os-dim">
              <div>department: {selectedAgent.departmentName}</div>
              <div>model: {selectedAgent.model}</div>
              <div>startup memory: selective retrieval</div>
              <div>startup brain: {selectedAgent.brainAccess ? 'selective retrieval' : 'disabled'}</div>
              <div>gateway enforced: yes</div>
              <div>full dump: forbidden</div>
            </div>
          </>
        ) : selectedDepartment ? (
          <>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
              Department
            </div>
            <div className="mt-2 text-base font-semibold text-white">
              {selectedDepartment.name}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selectedDepartmentAgents.map((agent) => (
                <span
                  key={agent.id}
                  className="rounded border border-os-border px-2 py-1 font-mono text-[10px] text-os-muted"
                >
                  {agent.name}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-os-dim">
              Tool branches are intentionally omitted in this checkpoint.
            </p>
          </>
        ) : (
          <>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
              Graph behavior
            </div>
            <p className="mt-2 text-xs leading-relaxed text-os-muted">
              The Brain is graph-native: it starts with zero experiential nodes and will visually grow as governed memories are written. The camera never auto-rotates back to a preset view.
            </p>
          </>
        )}
      </aside>

      {error ? (
        <div className="absolute left-4 right-4 top-24 z-20 border border-red-500/30 bg-red-950/80 px-4 py-3 text-xs text-red-200">
          Unable to load live topology: {error}
        </div>
      ) : null}
    </div>
  );
}
