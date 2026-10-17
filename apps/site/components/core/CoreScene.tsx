"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clamp01, CORE_HEIGHT, CORE_RADIUS, dayToY, drillState, easeInOut, type DrillState } from "@/lib/drill";
import type { CoreData } from "@/lib/orbit";

/**
 * The Orbit tenant as an ice core. Each band is a day: meetings leave cloudy layers sized by how much was said,
 * emails leave thin cyan lines, supersessions leave dark ash lines. Every bubble is one recorded utterance or email.
 * Threads join the facts of a supersession chain; only the value in force today is lit in helium peach.
 */

export type CoreTag = { id: string; day: number; label: string; detail?: string };

type SceneProps = {
  data: CoreData;
  stops: number[];
  /** Scroll position in screens, written by the page. */
  screensRef: RefObject<number>;
  reduced: boolean;
  tags: CoreTag[];
  tagRefs: RefObject<(HTMLDivElement | null)[]>;
  onState?: (s: DrillState) => void;
};

const SECTION_DAYS = 8;
/** Public-domain GISP2 core photograph (USGS National Ice Core Laboratory), used as fine-layer detail. */
const DETAIL_URL = "/images/gisp2-core-1837m.webp";
const PLACEHOLDER = new THREE.DataTexture(new Uint8Array([107, 107, 107, 255]), 1, 1, THREE.RGBAFormat);
PLACEHOLDER.needsUpdate = true;
const GAP = 0.06;
const ROWS = 640;

const coreVertex = /* glsl */ `
  uniform float uOffset;
  varying vec3 vLocal;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vCap;
  void main() {
    vLocal = position + vec3(0.0, uOffset, 0.0);
    vCap = abs(normal.y);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const coreFragment = /* glsl */ `
  uniform sampler2D uBands;
  uniform float uH;
  uniform float uFocus;
  uniform float uFocusAmt;
  uniform float uSide;
  uniform sampler2D uDetail;
  uniform float uHasDetail;
  varying vec3 vLocal;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vCap;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  void main() {
    float v = clamp((vLocal.y + uH * 0.5) / uH, 0.0, 1.0);
    vec4 b = texture2D(uBands, vec2(0.5, v));
    vec3 n = normalize(vNormalV);
    vec3 viewDir = normalize(-vViewPos);
    float facing = abs(dot(n, viewDir));
    float fres = pow(1.0 - facing, 2.4);

    float wobble = noise(vec3(vLocal.xz * 1.7, vLocal.y * 0.6)) * 0.9;
    float lamina = smoothstep(0.32, 0.5, abs(fract(v * 150.0 + wobble) - 0.5));
    // Fine layering from a real core: the GISP2 photograph, wrapped around the cylinder and repeated along it.
    float ang = atan(vLocal.z, vLocal.x) / 6.2831853 + 0.5;
    vec3 dt = texture2D(uDetail, vec2(fract(v * 2.6), 0.22 + ang * 0.56)).rgb;
    float detail = (dot(dt, vec3(0.299, 0.587, 0.114)) - 0.42) * uHasDetail;
    float cloud = clamp(b.r + lamina * 0.04 + detail * 0.6, 0.0, 1.0);
    // Round micro-bubbles: one candidate per cell, kept only where the layer is cloudy enough.
    vec3 cell = floor(vLocal * 30.0);
    vec3 jitter = vec3(hash(cell), hash(cell + 7.1), hash(cell + 3.7));
    float dist = length(fract(vLocal * 30.0) - jitter);
    float keep = step(0.72 - cloud * 0.45, hash(cell + 1.3));
    float specks = (1.0 - smoothstep(0.05, 0.12, dist)) * keep;

    vec3 clearIce = vec3(0.19, 0.35, 0.54);
    vec3 frost = vec3(0.90, 0.96, 1.0);
    vec3 col = mix(clearIce, frost, cloud);
    col += specks * 0.3;
    col = mix(col, vec3(0.56, 0.89, 1.0), b.b * 0.7);
    col = mix(col, vec3(0.03, 0.05, 0.09), b.g * 0.92);

    float focus = exp(-pow((vLocal.y - uFocus) * 4.0, 2.0)) * uFocusAmt;
    col = mix(col, vec3(1.0, 0.68, 0.54), focus * 0.32);

    float alpha = 0.2 + cloud * 0.55 + fres * 0.36 + b.g * 0.6 + b.b * 0.25 + specks * 0.16;
    col += fres * vec3(0.62, 0.86, 1.0) * 0.36;
    if (uSide < 0.0) {
      alpha *= 0.5;
      col *= 0.78;
    }
    if (vCap > 0.5) {
      alpha = max(alpha, 0.5);
      col = mix(col, frost, 0.3);
    }
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
  }
`;

const bubbleVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const bubbleFragment = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - facing, 1.6);
    float spec = pow(max(dot(normalize(vN), normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 24.0);
    vec3 col = vec3(0.92, 0.97, 1.0);
    gl_FragColor = vec4(col, 0.08 + rim * 0.8 + spec * 0.6);
  }
`;

function smoothNoise(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aSize;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y = mod(p.y - uTime * (0.06 + aSeed * 0.1) + 10.0, 20.0) - 10.0;
    p.x += sin(uTime * 0.15 + aSeed * 21.0) * 0.35;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (14.0 / -mv.z);
    vAlpha = 0.18 + 0.82 * pow(abs(sin(uTime * 0.6 + aSeed * 37.0)), 8.0);
  }
`;

const dustFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(0.86, 0.95, 1.0, a * a * vAlpha * 0.8);
  }
`;

/** Diamond dust: ice crystals drifting through the cold air around the core, glinting now and then. */
function Dust({ reduced }: { reduced: boolean }) {
  const gl = useThree((s) => s.gl);
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const count = 520;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = (k: number) => smoothNoise(i * 7.13 + k * 101.7);
      pos.set([(r(1) - 0.5) * 26, (r(2) - 0.5) * 20, -9 + r(3) * 15], i * 3);
      seed[i] = r(4);
      size[i] = 0.6 + r(5) * 2.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    return g;
  }, []);
  const uniforms = useMemo(() => ({ uTime: { value: 3 }, uPixelRatio: { value: Math.min(gl.getPixelRatio(), 1.75) } }), [gl]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    if (!reduced && material.current) material.current.uniforms.uTime.value += delta;
  });
  return (
    <points geometry={geometry} renderOrder={5} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={dustVertex}
        fragmentShader={dustFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function useBandTexture(data: CoreData) {
  return useMemo(() => {
    const cloud = new Float32Array(ROWS);
    const ash = new Float32Array(ROWS);
    const mail = new Float32Array(ROWS);
    const rowDay = (r: number) => ((r + 0.5) / ROWS) * data.days;
    const add = (arr: Float32Array, center: number, sigma: number, amount: number) => {
      for (let r = 0; r < ROWS; r++) {
        const d = rowDay(r) - center;
        arr[r] += Math.exp(-(d * d) / (2 * sigma * sigma)) * amount;
      }
    };
    for (let r = 0; r < ROWS; r++) cloud[r] = 0.13 + smoothNoise(Math.floor(r / 3)) * 0.08;
    for (const layer of data.layers) {
      // Meetings leave broad, soft cloudy zones (more talk, thicker zone) rather than thin rings.
      for (const m of layer.meetings) add(cloud, layer.day + 0.42, 0.22 + m.episodes / 170, 0.32 + m.episodes / 210);
      layer.emails.forEach(() => add(mail, layer.day + 0.6, 0.045, 1));
      if (layer.superseded) add(ash, layer.day + 0.47, 0.04, 1);
      if (layer.facts) add(cloud, layer.day + 0.5, 0.25, Math.min(0.2, layer.facts / 60));
    }
    const px = new Uint8Array(ROWS * 4);
    for (let r = 0; r < ROWS; r++) {
      px[r * 4] = Math.min(255, cloud[r] * 255);
      px[r * 4 + 1] = Math.min(255, ash[r] * 255);
      px[r * 4 + 2] = Math.min(255, mail[r] * 255);
      px[r * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(px, 1, ROWS, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [data]);
}

/** Writes uniform values on live materials (kept outside components: materials are mutable GPU state, not React state). */
function setUniforms(materials: (THREE.ShaderMaterial | null)[], values: Record<string, unknown>) {
  for (const m of materials) {
    if (!m) continue;
    for (const [k, v] of Object.entries(values)) if (m.uniforms[k]) m.uniforms[k].value = v;
  }
}

function CoreBody({ data, focusRef }: { data: CoreData; focusRef: RefObject<{ y: number; amt: number }> }) {
  const bands = useBandTexture(data);
  const sections = useMemo(() => {
    const count = Math.ceil(data.days / SECTION_DAYS);
    const h = CORE_HEIGHT / count;
    return Array.from({ length: count }, (_, i) => ({ y: -CORE_HEIGHT / 2 + h * (i + 0.5), h: h - GAP }));
  }, [data.days]);

  const geometries = useMemo(() => sections.map((s) => new THREE.CylinderGeometry(CORE_RADIUS, CORE_RADIUS, s.h, 112, 1, false)), [sections]);

  // One uniform set per material. Materials are declared in JSX so React Three Fiber owns their lifetime;
  // the focus uniforms are updated each frame through the material refs.
  const uniformSets = useMemo(
    () =>
      sections.flatMap((s) =>
        [-1, 1].map((side) => ({
          uBands: { value: bands },
          uH: { value: CORE_HEIGHT },
          uOffset: { value: s.y },
          uFocus: { value: 0 },
          uFocusAmt: { value: 0 },
          uSide: { value: side },
          uDetail: { value: PLACEHOLDER },
          uHasDetail: { value: 0 },
        })),
      ),
    [sections, bands],
  );
  const mats = useRef<(THREE.ShaderMaterial | null)[]>([]);
  const [detail, setDetail] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let alive = true;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(DETAIL_URL, (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
      loaded = tex;
      if (alive) setDetail(tex);
      else tex.dispose();
    });
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, []);

  useEffect(() => {
    if (detail) setUniforms(mats.current, { uDetail: detail, uHasDetail: 1 });
  }, [detail, uniformSets]);

  useEffect(
    () => () => {
      geometries.forEach((g) => g.dispose());
      bands.dispose();
    },
    [geometries, bands],
  );

  useFrame(() => {
    const f = focusRef.current;
    setUniforms(mats.current, { uFocus: f.y, uFocusAmt: f.amt });
  });

  return (
    <group>
      {sections.map((s, i) => (
        <group key={i} position={[0, s.y, 0]}>
          {[0, 1].map((k) => (
            <mesh key={k} geometry={geometries[i]} renderOrder={k === 0 ? 0 : 4}>
              <shaderMaterial
                ref={(m) => {
                  mats.current[i * 2 + k] = m;
                }}
                vertexShader={coreVertex}
                fragmentShader={coreFragment}
                uniforms={uniformSets[i * 2 + k]}
                transparent
                depthWrite={false}
                side={k === 0 ? THREE.BackSide : THREE.FrontSide}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Bubbles({ data }: { data: CoreData }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader: bubbleVertex, fragmentShader: bubbleFragment, transparent: true, depthWrite: false }), []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    data.bubbles.forEach((b, i) => {
      const a = b.seed * Math.PI * 2 * 7.31;
      const r = Math.sqrt((b.seed * 9.17) % 1) * CORE_RADIUS * 0.84;
      const jitter = (((b.seed * 31.7) % 1) - 0.5) * 0.12;
      o.position.set(Math.cos(a) * r, dayToY(b.d, data.days) + jitter, Math.sin(a) * r);
      const s = b.kind === "email" ? 0.034 : 0.011 + ((b.seed * 53.3) % 1) * 0.022;
      o.scale.set(s, b.kind === "email" ? s * 0.55 : s * 0.82, s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [data]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <instancedMesh ref={mesh} args={[geometry, material, data.bubbles.length]} renderOrder={1} frustumCulled={false} />;
}

const CHAIN_ANGLES = [-0.42, 0.62, 1.75];
const HELIUM = new THREE.Color("#ffae8a");
const ASH = new THREE.Color("#7e8ba0");

function Chains({ data }: { data: CoreData }) {
  const built = useMemo(
    () =>
      data.chains.map((chain, ci) => {
        const a = CHAIN_ANGLES[ci % CHAIN_ANGLES.length];
        const r = CORE_RADIUS * (0.58 - ci * 0.06);
        const points = chain.links.map((l) => new THREE.Vector3(Math.cos(a) * r, dayToY(l.day, data.days), Math.sin(a) * r));
        const segments = points.slice(1).map((p, i) => {
          const from = points[i];
          const curve = new THREE.CatmullRomCurve3([from, new THREE.Vector3(((from.x + p.x) / 2) * 1.12, (from.y + p.y) / 2, ((from.z + p.z) / 2) * 1.12), p]);
          return { geometry: new THREE.TubeGeometry(curve, 48, 0.0075, 6, false) };
        });
        return { points, segments, links: chain.links };
      }),
    [data],
  );

  const sphere = useMemo(() => new THREE.SphereGeometry(1, 20, 14), []);
  const ring = useMemo(() => new THREE.TorusGeometry(1, 0.22, 10, 32), []);
  const mats = useMemo(
    () => ({
      current: new THREE.MeshBasicMaterial({ color: HELIUM, transparent: true, depthWrite: false }),
      old: new THREE.MeshBasicMaterial({ color: ASH, transparent: true, opacity: 0.95, depthWrite: false }),
      threadOld: new THREE.MeshBasicMaterial({ color: ASH, transparent: true, opacity: 0.75, depthWrite: false }),
    }),
    [],
  );

  useEffect(
    () => () => {
      built.forEach((c) => c.segments.forEach((s) => s.geometry.dispose()));
      sphere.dispose();
      ring.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    },
    [built, sphere, ring, mats],
  );

  const camera = useThree((s) => s.camera);
  const ringsRef = useRef<THREE.Group>(null);
  useFrame(() => {
    // Rings face the viewer so a superseded value always reads as a hollow mark.
    ringsRef.current?.children.forEach((child) => child.quaternion.copy(camera.quaternion));
  });

  return (
    <group renderOrder={2}>
      {built.map((c, ci) => (
        <group key={ci}>
          {c.segments.map((s, si) => (
            <mesh key={si} geometry={s.geometry} material={mats.threadOld} renderOrder={2} />
          ))}
        </group>
      ))}
      {built.map((c, ci) =>
        c.points.map((p, pi) =>
          c.links[pi].status === "active" ? <mesh key={`${ci}-${pi}`} geometry={sphere} material={mats.current} position={p} scale={0.048} renderOrder={3} /> : null,
        ),
      )}
      <group ref={ringsRef}>
        {built.flatMap((c, ci) =>
          c.points.map((p, pi) =>
            c.links[pi].status !== "active" ? <mesh key={`${ci}-${pi}`} geometry={ring} material={mats.old} position={p} scale={0.045} renderOrder={3} /> : null,
          ),
        )}
      </group>
    </group>
  );
}

function Rig({ data, stops, screensRef, reduced, tags, tagRefs, onState }: SceneProps) {
  const rig = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const focus = useRef({ y: 0, amt: 0 });
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const pointer = useThree((s) => s.pointer);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const last = useRef<string>("");
  const smoothed = useRef<number | null>(null);
  const stopY = useMemo(() => stops.map((d) => dayToY(d, data.days)), [stops, data.days]);
  const tagY = useMemo(() => tags.map((t) => dayToY(t.day, data.days)), [tags, data.days]);

  useFrame((_, delta) => {
    const target = screensRef.current ?? 0;
    const k = reduced ? 1 : 1 - Math.pow(0.0008, Math.min(delta, 0.05));
    smoothed.current = smoothed.current == null ? target : smoothed.current + (target - smoothed.current) * k;
    const st = drillState(smoothed.current, stops.length);
    const key = `${st.active}|${st.dive > 0.5}|${st.exit > 0.5}`;
    if (key !== last.current) {
      last.current = key;
      onState?.(st);
    }

    const wide = size.width / size.height > 1.05;
    const lo = Math.floor(st.stop);
    const hi = Math.min(stops.length - 1, lo + 1);
    const yStop = stopY[lo] + (stopY[hi] - stopY[lo]) * (st.stop - lo);
    const d = st.dive;
    const e = easeInOut(st.exit);

    // Three framings: the tilted specimen, the close drill, and the core laid flat with time running left to right.
    // On narrow screens the core lies flat throughout, in its own band near the top, and the camera tracks along it.
    const halfH = (z: number) => z * Math.tan((16 * Math.PI) / 180);
    const band = (z: number, fromTop: number) => halfH(z) * (1 - 2 * fromTop);
    const overview = wide ? { x: 2.3, z: 17.5, tilt: -0.15, scale: 0.78, y: -0.25 } : { x: 0, z: 24, tilt: -Math.PI / 2, scale: 0.58, y: band(24, 0.17) };
    const close = wide ? { x: 1.6, z: 7.4, tilt: 0, scale: 1, y: 0 } : { x: 0, z: 9, tilt: -Math.PI / 2, scale: 0.62, y: band(9, 0.21) };
    // At the end: wide screens lay the core flat; portrait screens stand it upright under the closing line.
    const flat = wide ? { x: 0, z: 16, tilt: -Math.PI / 2, scale: 0.92, y: 0 } : { x: 0, z: 20, tilt: 0, scale: 0.52, y: -halfH(20) * 0.36 };
    const mix3 = (a: number, b: number, c: number) => (a + (b - a) * d) * (1 - e) + c * e;

    const g = rig.current;
    const scale = mix3(overview.scale, close.scale, flat.scale);
    if (g) {
      g.position.x = mix3(overview.x, close.x, flat.x);
      g.position.y = mix3(overview.y, close.y, flat.y);
      g.rotation.z = mix3(overview.tilt, close.tilt, flat.tilt);
      g.scale.setScalar(scale);
      const par = reduced || !wide ? 0 : (1 - d) * (1 - e);
      g.rotation.x += (-pointer.y * 0.08 * par - g.rotation.x) * 0.06;
    }
    if (spin.current && !reduced) spin.current.rotation.y += delta * (0.05 + 0.05 * (1 - d) + 0.04 * e);

    // Upright, the stop is a height to follow; laid flat, a local height becomes a horizontal position.
    const follow = yStop * close.scale * d * (1 - e);
    const camX = wide ? 0 : follow;
    const camY = wide ? follow : 0;
    camera.position.set(camX, camY, mix3(overview.z, close.z, flat.z));
    camera.lookAt(camX, camY, 0);

    focus.current.y = yStop;
    focus.current.amt = d * (1 - Math.min(1, Math.abs(st.stop - Math.round(st.stop)) * 2.4)) * (1 - e);

    // Project HTML tags to their layers: right of the core in the overview, left of it up close, below it once flat.
    const els = tagRefs.current;
    if (g && els) {
      g.updateMatrixWorld();
      const side = e > 0.5 ? "below" : d > 0.5 || !wide ? "left" : "right";
      const edge = (side === "left" ? -1 : 1) * CORE_RADIUS * 1.08;
      const modeFade = side === "below" ? clamp01((e - 0.7) / 0.3) : 1 - clamp01(e / 0.4);
      tags.forEach((t, i) => {
        const el = els[i];
        if (!el) return;
        if (el.dataset.side !== side) el.dataset.side = side;
        projected.set(edge, tagY[i], 0).applyMatrix4(g.matrixWorld).project(camera);
        const x = (projected.x * 0.5 + 0.5) * size.width;
        const y = (-projected.y * 0.5 + 0.5) * size.height;
        const nearStop = d > 0.5 && side !== "below" ? 1 - Math.min(1, Math.abs(tagY[i] - yStop) / 1.6) : 1;
        const visible = projected.z < 1 && y > 40 && y < size.height - 30 ? 1 : 0;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        el.style.opacity = String(visible * (0.35 + 0.65 * nearStop) * modeFade);
      });
    }
  });

  return (
    <group ref={rig}>
      <group ref={spin}>
        <CoreBody data={data} focusRef={focus} />
        <Bubbles data={data} />
        <Chains data={data} />
      </group>
    </group>
  );
}

export default function CoreScene(props: SceneProps & { active: boolean }) {
  const { active, reduced } = props;
  return (
    <Canvas
      frameloop={active ? (reduced ? "demand" : "always") : "never"}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 17.5], fov: 32, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      aria-hidden
    >
      <Rig {...props} />
      <Dust reduced={reduced} />
    </Canvas>
  );
}
