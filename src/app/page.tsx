"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion, useScroll, useTransform, useInView, AnimatePresence } from "framer-motion";
import * as THREE from "three";

// ─── Liquid Ether (inline, touch-ready) ────────────────────────────────────
function LiquidEther({ colors = ["#7C5CBF", "#c4b5f4", "#F5F4F2"] }: { colors?: string[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;

    function makePalette(stops: string[]) {
      const arr = stops.length === 1 ? [stops[0], stops[0]] : stops;
      const data = new Uint8Array(arr.length * 4);
      arr.forEach((s, i) => {
        const c = new THREE.Color(s);
        data[i * 4] = Math.round(c.r * 255);
        data[i * 4 + 1] = Math.round(c.g * 255);
        data[i * 4 + 2] = Math.round(c.b * 255);
        data[i * 4 + 3] = 255;
      });
      const tex = new THREE.DataTexture(data, arr.length, 1, THREE.RGBAFormat);
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      return tex;
    }

    const paletteTex = makePalette(colors);
    const bgVec4 = new THREE.Vector4(0, 0, 0, 0);

    let width = Math.max(1, Math.floor(container.clientWidth));
    let height = Math.max(1, Math.floor(container.clientHeight));
    const res = 0.45;
    let fboW = Math.max(1, Math.round(res * width));
    let fboH = Math.max(1, Math.round(res * height));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    const canvas = renderer.domElement;
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;touch-action:none;";
    container.appendChild(canvas);

    const fboOpts = {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    } as THREE.RenderTargetOptions;

    function makeFBO() {
      return new THREE.WebGLRenderTarget(fboW, fboH, fboOpts);
    }

    const fbos = {
      vel0: makeFBO(),
      vel1: makeFBO(),
      div: makeFBO(),
      pres0: makeFBO(),
      pres1: makeFBO(),
    };

    const faceVert = `attribute vec3 position;uniform vec2 px;uniform vec2 boundarySpace;varying vec2 uv;precision highp float;void main(){vec3 pos=position;vec2 scale=1.0-boundarySpace*2.0;pos.xy=pos.xy*scale;uv=vec2(0.5)+(pos.xy)*0.5;gl_Position=vec4(pos,1.0);}`;
    const mouseVert = `precision highp float;attribute vec3 position;attribute vec2 uv;uniform vec2 center;uniform vec2 scale;uniform vec2 px;varying vec2 vUv;void main(){vec2 pos=position.xy*scale*2.0*px+center;vUv=uv;gl_Position=vec4(pos,0.0,1.0);}`;
    const advFrag = `precision highp float;uniform sampler2D velocity;uniform float dt;uniform vec2 fboSize;uniform vec2 px;varying vec2 uv;void main(){vec2 ratio=max(fboSize.x,fboSize.y)/fboSize;vec2 vel=texture2D(velocity,uv).xy;vec2 uv2=uv-vel*dt*ratio;vec2 newVel=texture2D(velocity,uv2).xy;gl_FragColor=vec4(newVel,0.0,0.0);}`;
    const colorFrag = `precision highp float;uniform sampler2D velocity;uniform sampler2D palette;uniform vec4 bgColor;varying vec2 uv;void main(){vec2 vel=texture2D(velocity,uv).xy;float lenv=clamp(length(vel),0.0,1.0);vec3 c=texture2D(palette,vec2(lenv,0.5)).rgb;vec3 outRGB=mix(bgColor.rgb,c,lenv);float outA=mix(bgColor.a,1.0,lenv);gl_FragColor=vec4(outRGB,outA);}`;
    const divFrag = `precision highp float;uniform sampler2D velocity;uniform float dt;uniform vec2 px;varying vec2 uv;void main(){float x0=texture2D(velocity,uv-vec2(px.x,0.0)).x;float x1=texture2D(velocity,uv+vec2(px.x,0.0)).x;float y0=texture2D(velocity,uv-vec2(0.0,px.y)).y;float y1=texture2D(velocity,uv+vec2(0.0,px.y)).y;float d=(x1-x0+y1-y0)/2.0;gl_FragColor=vec4(d/dt);}`;
    const poisFrag = `precision highp float;uniform sampler2D pressure;uniform sampler2D divergence;uniform vec2 px;varying vec2 uv;void main(){float p0=texture2D(pressure,uv+vec2(px.x*2.0,0.0)).r;float p1=texture2D(pressure,uv-vec2(px.x*2.0,0.0)).r;float p2=texture2D(pressure,uv+vec2(0.0,px.y*2.0)).r;float p3=texture2D(pressure,uv-vec2(0.0,px.y*2.0)).r;float div=texture2D(divergence,uv).r;float newP=(p0+p1+p2+p3)/4.0-div;gl_FragColor=vec4(newP);}`;
    const presFrag = `precision highp float;uniform sampler2D pressure;uniform sampler2D velocity;uniform vec2 px;uniform float dt;varying vec2 uv;void main(){float p0=texture2D(pressure,uv+vec2(px.x,0.0)).r;float p1=texture2D(pressure,uv-vec2(px.x,0.0)).r;float p2=texture2D(pressure,uv+vec2(0.0,px.y)).r;float p3=texture2D(pressure,uv-vec2(0.0,px.y)).r;vec2 v=texture2D(velocity,uv).xy;vec2 gradP=vec2(p0-p1,p2-p3)*0.5;v=v-gradP*dt;gl_FragColor=vec4(v,0.0,1.0);}`;
    const forceFrag = `precision highp float;uniform vec2 force;uniform vec2 center;uniform vec2 scale;uniform vec2 px;varying vec2 vUv;void main(){vec2 circle=(vUv-0.5)*2.0;float d=1.0-min(length(circle),1.0);d*=d;gl_FragColor=vec4(force*d,0.0,1.0);}`;

    function pass(vert: string, frag: string, uniforms: Record<string, { value: unknown }>) {
      const scene = new THREE.Scene();
      const cam = new THREE.Camera();
      const mat = new THREE.RawShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms });
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      return { scene, cam, mat, uniforms };
    }

    function renderPass(p: ReturnType<typeof pass>, fbo: THREE.WebGLRenderTarget | null) {
      renderer.setRenderTarget(fbo);
      renderer.render(p.scene, p.cam);
      renderer.setRenderTarget(null);
    }

    const cell = new THREE.Vector2(1 / fboW, 1 / fboH);
    const fboSize = new THREE.Vector2(fboW, fboH);
    const dt = 0.014;

    const advPass = pass(faceVert, advFrag, {
      boundarySpace: { value: cell },
      px: { value: cell },
      fboSize: { value: fboSize },
      velocity: { value: fbos.vel0.texture },
      dt: { value: dt },
    });

    const forceScene = new THREE.Scene();
    const forceCam = new THREE.Camera();
    const forceMat = new THREE.RawShaderMaterial({
      vertexShader: mouseVert,
      fragmentShader: forceFrag,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        px: { value: cell },
        force: { value: new THREE.Vector2() },
        center: { value: new THREE.Vector2() },
        scale: { value: new THREE.Vector2(100, 100) },
      },
    });
    forceScene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), forceMat));

    const divPass = pass(faceVert, divFrag, {
      boundarySpace: { value: cell },
      velocity: { value: fbos.vel1.texture },
      px: { value: cell },
      dt: { value: dt },
    });
    const poisPass = pass(faceVert, poisFrag, {
      boundarySpace: { value: cell },
      pressure: { value: fbos.pres0.texture },
      divergence: { value: fbos.div.texture },
      px: { value: cell },
    });
    const presPass = pass(faceVert, presFrag, {
      boundarySpace: { value: cell },
      pressure: { value: fbos.pres0.texture },
      velocity: { value: fbos.vel1.texture },
      px: { value: cell },
      dt: { value: dt },
    });

    const outputScene = new THREE.Scene();
    const outputCam = new THREE.Camera();
    const outputMat = new THREE.RawShaderMaterial({
      vertexShader: faceVert,
      fragmentShader: colorFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        velocity: { value: fbos.vel0.texture },
        boundarySpace: { value: new THREE.Vector2() },
        palette: { value: paletteTex },
        bgColor: { value: bgVec4 },
      },
    });
    outputScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outputMat));

    // Mouse/touch
    const mouse = new THREE.Vector2(0, 0);
    const mouseOld = new THREE.Vector2(0, 0);
    const diff = new THREE.Vector2();

    function getCoords(clientX: number, clientY: number) {
      const rect = container.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      mouse.set(nx * 2 - 1, -(ny * 2 - 1));
    }

    const onMove = (e: MouseEvent) => getCoords(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length) getCoords(e.touches[0].clientX, e.touches[0].clientY);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });

    // Auto demo
    const autoPos = new THREE.Vector2(0, 0);
    const autoTarget = new THREE.Vector2();
    function pickTarget() {
      autoTarget.set((Math.random() * 2 - 1) * 0.8, (Math.random() * 2 - 1) * 0.8);
    }
    pickTarget();

    function loop() {
      const d = autoPos.distanceTo(autoTarget);
      if (d < 0.02) pickTarget();
      autoPos.lerp(autoTarget, 0.01);
      mouse.lerp(autoPos, 0.03);

      diff.subVectors(mouse, mouseOld);
      mouseOld.copy(mouse);

      forceMat.uniforms.force.value.set(diff.x * 20, diff.y * 20);
      forceMat.uniforms.center.value.set(mouse.x * 0.9, mouse.y * 0.9);

      advPass.uniforms.velocity.value = fbos.vel0.texture;
      renderPass(advPass, fbos.vel1);

      renderer.setRenderTarget(fbos.vel1);
      renderer.render(forceScene, forceCam);
      renderer.setRenderTarget(null);

      divPass.uniforms.velocity.value = fbos.vel1.texture;
      renderPass(divPass, fbos.div);

      poisPass.uniforms.divergence.value = fbos.div.texture;
      let pIn = fbos.pres0,
        pOut = fbos.pres1;
      for (let i = 0; i < 24; i++) {
        poisPass.uniforms.pressure.value = pIn.texture;
        renderPass(poisPass, pOut);
        [pIn, pOut] = [pOut, pIn];
      }

      presPass.uniforms.velocity.value = fbos.vel1.texture;
      presPass.uniforms.pressure.value = pIn.texture;
      renderPass(presPass, fbos.vel0);

      outputMat.uniforms.velocity.value = fbos.vel0.texture;
      renderer.setRenderTarget(null);
      renderer.render(outputScene, outputCam);

      rafRef.current = requestAnimationFrame(loop);
    }

    function handleResize() {
      width = Math.max(1, Math.floor(container.clientWidth));
      height = Math.max(1, Math.floor(container.clientHeight));
      renderer.setSize(width, height);
      fboW = Math.max(1, Math.round(res * width));
      fboH = Math.max(1, Math.round(res * height));
      Object.values(fbos).forEach((f) => f.setSize(fboW, fboH));
      cell.set(1 / fboW, 1 / fboH);
      fboSize.set(fboW, fboH);
    }

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchstart", onTouch);
      ro.disconnect();
      renderer.dispose();
      canvas.remove();
    };
  }, []); // eslint-disable-line

  return <div ref={mountRef} className="absolute inset-0 w-full h-full" />;
}

// ─── Data ──────────────────────────────────────────────────────────────────
const modules = [
  {
    icon: "⚔️",
    label: "Battle System",
    desc: "Turn-based harian melawan prokrastinasi & kebiasaan buruk. Persona × Final Fantasy.",
  },
  {
    icon: "🌿",
    label: "Skill Tree",
    desc: "Bebas tanpa batas. Satu skill aktif, digrind dari level 1–10 lewat log aktivitas nyata.",
  },
  {
    icon: "🎯",
    label: "Quest & Mission",
    desc: "Deadline keras. Lewat batas → auto Failed → potong EXP. Tidak ada negosiasi.",
  },
  {
    icon: "💰",
    label: "Finance OS",
    desc: "Catat semua manual. Kesadaran finansial dimulai dari tindakan mencatat itu sendiri.",
  },
  {
    icon: "🧠",
    label: "Mental Tracking",
    desc: "Mood, energi, stres. Jurnal privat yang benar-benar privat — tidak masuk gamifikasi.",
  },
  {
    icon: "🔗",
    label: "Social OS",
    desc: "Setiap relasi punya level. Terinspirasi Social Link Persona Series.",
  },
  {
    icon: "📚",
    label: "Literacy Hub",
    desc: "Buku, artikel, manga, anime — semua tercatat. Review setelah selesai menghasilkan EXP.",
  },
  {
    icon: "🔒",
    label: "PMO Tracker",
    desc: "Day 0 → 1200 hari. Streak putus: reset total. Tidak ada override. Tidak ada jalan pintas.",
  },
  {
    icon: "🤖",
    label: "AI Agent",
    desc: "Bukan chatbot. Entitas aktif yang membaca semua modul dan mengambil inisiatif sendiri.",
  },
];

const statList = [
  { label: "Vitality", color: "bg-violet-400" },
  { label: "Focus", color: "bg-purple-400" },
  { label: "Intelligence", color: "bg-indigo-400" },
  { label: "Discipline", color: "bg-violet-500" },
  { label: "Social", color: "bg-fuchsia-400" },
  { label: "Wealth", color: "bg-purple-500" },
  { label: "Willpower", color: "bg-violet-300" },
];

const ranks = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];

// ─── Reusable ──────────────────────────────────────────────────────────────
function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ModuleCard({
  icon,
  label,
  desc,
  i,
}: {
  icon: string;
  label: string;
  desc: string;
  i: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: (i % 3) * 0.07, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.22 } }}
      className="group bg-white rounded-2xl p-6 border border-stone-200/80 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-100/60 transition-all duration-300 cursor-default"
    >
      <div className="text-2xl mb-3">{icon}</div>
      <div className="font-semibold text-stone-800 text-sm tracking-wide mb-2">{label}</div>
      <div className="text-stone-400 text-xs leading-relaxed">{desc}</div>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function Home() {
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -60]);

  const [activeRank, setActiveRank] = useState(0);
  const statValues = useMemo(() => [52, 68, 71, 44, 59, 38, 63], []);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setActiveRank((r) => (r + 1) % ranks.length), 850);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 overflow-x-hidden">
      {/* ── Nav ── */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-5 md:px-12 py-4 bg-stone-50/80 backdrop-blur-md border-b border-stone-200/60">
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55 }}
          className="flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-black leading-none">V</span>
          </div>
          <span className="font-black text-stone-800 text-sm tracking-tight">vancore</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="hidden md:flex items-center gap-8"
        >
          {["Modules", "System", "Philosophy"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-stone-400 hover:text-stone-800 text-sm transition-colors duration-200"
            >
              {item}
            </a>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55 }}
          className="hidden md:block"
        >
          <a
            href="/login"
            className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors duration-200"
          >
            Enter System
          </a>
        </motion.div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="md:hidden w-8 h-8 flex flex-col justify-center items-center gap-1.5"
          aria-label="Menu"
        >
          <span
            className={`block w-5 h-0.5 bg-stone-600 transition-all duration-200 origin-center ${menuOpen ? "rotate-45 translate-y-2" : ""}`}
          />
          <span
            className={`block w-5 h-0.5 bg-stone-600 transition-all duration-200 ${menuOpen ? "opacity-0 scale-x-0" : ""}`}
          />
          <span
            className={`block w-5 h-0.5 bg-stone-600 transition-all duration-200 origin-center ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`}
          />
        </button>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="fixed top-[61px] inset-x-0 z-40 bg-white border-b border-stone-200 px-6 py-6 flex flex-col gap-4 md:hidden shadow-lg"
          >
            {["Modules", "System", "Philosophy"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                onClick={() => setMenuOpen(false)}
                className="text-stone-700 text-base font-medium"
              >
                {item}
              </a>
            ))}
            <a
              href="/login"
              className="bg-violet-600 text-white text-sm font-semibold px-5 py-3.5 rounded-xl text-center mt-1"
            >
              Enter System
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16">
        {/* Liquid WebGL background */}
        <div className="absolute inset-0">
          <LiquidEther colors={["#7C5CBF", "#a78bfa", "#ddd6fe", "#F5F4F2"]} />
        </div>

        {/* Subtle grain */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: "160px",
          }}
        />

        <motion.div
          style={{ y: heroY }}
          className="relative z-10 text-center px-5 max-w-4xl mx-auto w-full"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.25 }}
            className="inline-flex items-center gap-2 bg-white/70 backdrop-blur-sm border border-violet-200/70 rounded-full px-4 py-1.5 mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse shrink-0" />
            <span className="text-violet-700 text-xs font-medium tracking-wide">
              Dark Souls × RPG × Real Life
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-stone-900 leading-none tracking-tighter mb-5"
          >
            Hidup Adalah
            <br />
            <span className="text-violet-600">Game.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.52 }}
            className="text-stone-500 text-base sm:text-lg max-w-lg mx-auto leading-relaxed mb-10"
          >
            Sistem operasi kehidupan nyata. Setiap tindakan adalah data.
            Setiap data adalah kemajuan. Kemajuan itu nyata dan terukur.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.68 }}
            className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center"
          >
            <a
              href="/login"
              className="bg-violet-600 hover:bg-violet-700 text-white font-semibold px-8 py-4 rounded-2xl text-sm transition-colors duration-200 shadow-xl shadow-violet-300/40 text-center"
            >
              Mulai Sekarang
            </a>
            <a
              href="#modules"
              className="bg-white/80 backdrop-blur-sm hover:bg-white text-stone-700 font-medium px-8 py-4 rounded-2xl text-sm transition-colors duration-200 border border-stone-200/80 text-center"
            >
              Lihat Sistem →
            </a>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
        >
          <span className="text-stone-400 text-xs tracking-widest uppercase">scroll</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            className="w-px h-6 bg-gradient-to-b from-stone-300 to-transparent rounded-full"
          />
        </motion.div>
      </section>

      {/* ── Character Preview ── */}
      <section id="system" className="py-20 md:py-32 px-5 md:px-12 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <FadeUp>
              <span className="text-violet-500 text-xs font-semibold tracking-widest uppercase mb-3 block">
                Character System
              </span>
              <h2 className="text-4xl md:text-5xl font-black text-stone-900 tracking-tighter leading-tight mb-5">
                Kamu adalah
                <br />
                karakternya.
              </h2>
              <p className="text-stone-400 text-base leading-relaxed mb-8 max-w-md">
                Bukan avatar kosmetik. Setiap stat mencerminkan perilaku nyatamu.
                Tidur buruk menurunkan Vitality. PMO streak tinggi menaikkan Willpower.
                Tidak ada yang bisa dipalsukan.
              </p>
            </FadeUp>

            <FadeUp delay={0.1}>
              <div className="space-y-3">
                {statList.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="text-stone-400 text-xs w-20 shrink-0 font-medium">
                      {s.label}
                    </span>
                    <div className="flex-1 bg-stone-100 rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${statValues[i]}%` }}
                        viewport={{ once: true }}
                        transition={{
                          duration: 1.2,
                          delay: i * 0.07,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className={`h-full ${s.color} rounded-full`}
                      />
                    </div>
                    <span className="text-stone-300 text-xs w-5 text-right tabular-nums">
                      {statValues[i]}
                    </span>
                  </div>
                ))}
              </div>
            </FadeUp>
          </div>

          <FadeUp delay={0.12}>
            <div className="bg-white rounded-3xl p-6 md:p-8 border border-stone-200/80 shadow-xl shadow-stone-100/80">
              {/* Rank row */}
              <div className="mb-6">
                <div className="text-stone-400 text-xs font-medium mb-3">Current Rank</div>
                <div className="flex gap-1.5 flex-wrap">
                  {ranks.map((r, i) => (
                    <motion.div
                      key={r}
                      animate={
                        i === activeRank
                          ? { scale: 1.12, opacity: 1 }
                          : { scale: 1, opacity: 0.28 }
                      }
                      transition={{ duration: 0.25 }}
                      className={`text-center px-2.5 py-1 rounded-lg text-xs font-bold tracking-widest transition-colors duration-200 ${
                        i === activeRank
                          ? "bg-violet-600 text-white shadow-md shadow-violet-300/50"
                          : "bg-stone-100 text-stone-400"
                      }`}
                    >
                      {r}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* EXP bar */}
              <div className="border-t border-stone-100 pt-5 mb-5">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-stone-400 text-xs font-medium">EXP Progress</span>
                  <span className="text-violet-600 text-xs font-semibold">Level 12</span>
                </div>
                <div className="bg-stone-100 rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "67%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full"
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-stone-300 text-xs tabular-nums">48,200</span>
                  <span className="text-stone-300 text-xs tabular-nums">72,000 EXP</span>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { v: "14", l: "Habit Streak" },
                  { v: "3", l: "Active Quests" },
                  { v: "Day 47", l: "PMO" },
                ].map((item) => (
                  <div key={item.l} className="bg-stone-50 rounded-2xl p-3 text-center">
                    <div className="text-violet-600 font-black text-lg leading-none mb-1">
                      {item.v}
                    </div>
                    <div className="text-stone-400 text-xs leading-tight">{item.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── Modules ── */}
      <section id="modules" className="py-20 md:py-32 bg-stone-100/70 px-5 md:px-12">
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-14">
            <span className="text-violet-500 text-xs font-semibold tracking-widest uppercase mb-3 block">
              19 Modul Terintegrasi
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-stone-900 tracking-tighter">
              Semua aspek hidupmu,
              <br />
              satu sistem.
            </h2>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((m, i) => (
              <ModuleCard key={m.label} {...m} i={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Philosophy ── */}
      <section id="philosophy" className="py-20 md:py-32 px-5 md:px-12 max-w-6xl mx-auto">
        <FadeUp className="text-center mb-14">
          <span className="text-violet-500 text-xs font-semibold tracking-widest uppercase mb-3 block">
            Dark Souls Philosophy
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-stone-900 tracking-tighter">
            Tidak ada jalan
            <br />
            pintas.
          </h2>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              title: "Tidak ada yang gratis.",
              body: "Setiap reward punya harga nyata — waktu, konsistensi, atau pilihan untuk tidak melakukan hal lain.",
            },
            {
              title: "Tidak ada yang dihapus.",
              body: "Data historis adalah aset. Kegagalan tercatat bukan sebagai aib, tapi bagian dari narasi perkembangan.",
            },
            {
              title: "Semuanya terhubung.",
              body: "Tidur buruk mempengaruhi battle. Mental berat mengubah rekomendasi AI. Ini satu sistem yang hidup.",
            },
          ].map((p, i) => (
            <FadeUp key={p.title} delay={i * 0.09}>
              <div className="bg-white border border-stone-200/80 rounded-3xl p-7 h-full hover:border-violet-200 hover:shadow-lg hover:shadow-violet-100/40 transition-all duration-300">
                <div className="w-7 h-0.5 bg-violet-400 mb-5 rounded-full" />
                <h3 className="font-bold text-stone-800 text-base mb-3 leading-snug">{p.title}</h3>
                <p className="text-stone-400 text-sm leading-relaxed">{p.body}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── AI Agent Banner ── */}
      <section className="py-20 md:py-32 bg-violet-600 px-5 md:px-12 overflow-hidden relative">
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 50%, #fff 0%, transparent 55%), radial-gradient(circle at 80% 15%, #fff 0%, transparent 45%)",
          }}
        />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <FadeUp>
            <span className="text-violet-200 text-xs font-semibold tracking-widest uppercase mb-5 block">
              AI Agent
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-5 leading-tight">
              Bukan chatbot.
              <br />
              Entitas aktif.
            </h2>
            <p className="text-violet-200 text-base leading-relaxed max-w-xl mx-auto mb-10">
              AI Agent membaca semua modul secara simultan dan mengambil inisiatif sendiri —
              membuat quest otomatis, memberi peringatan dini, menyesuaikan beban saat kondisi
              mental sedang berat.
            </p>
            <a
              href="/login"
              className="inline-block bg-white text-violet-700 font-bold px-8 py-4 rounded-2xl text-sm hover:bg-violet-50 transition-colors duration-200 shadow-xl"
            >
              Masuk ke Sistem
            </a>
          </FadeUp>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 md:py-36 px-5 md:px-12">
        <div className="max-w-2xl mx-auto text-center">
          <FadeUp>
            <h2 className="text-4xl md:text-5xl font-black text-stone-900 tracking-tighter mb-5 leading-tight">
              Mulai dari
              <br />
              Day 0.
            </h2>
            <p className="text-stone-400 text-base leading-relaxed mb-10 max-w-sm mx-auto">
              Karakter tumbuh karena benar-benar melewati sesuatu — bukan karena klik tombol.
            </p>
            <a
              href="/login"
              className="inline-block bg-violet-600 hover:bg-violet-700 text-white font-bold px-10 py-4 rounded-2xl text-sm transition-colors duration-200 shadow-xl shadow-violet-200/60"
            >
              Buat Karakter
            </a>
          </FadeUp>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-stone-200 px-5 md:px-12 py-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-black leading-none">V</span>
            </div>
            <span className="font-black text-stone-700 text-sm tracking-tight">vancore</span>
          </div>
          <span className="text-stone-300 text-xs">Your life. Your system. Your rules.</span>
        </div>
      </footer>
    </main>
  );
}

// page.tsx