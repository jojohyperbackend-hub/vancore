"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { loginGoogle } from "@/lib/firebase";

// ─── Soal Fisika ────────────────────────────────────────────────────────────
const PHYSICS_QUESTIONS = [
  {
    question: "Sebuah benda bermassa 2 kg bergerak dengan kecepatan 3 m/s. Berapakah momentum linearnya (kg·m/s)?",
    answer: "6",
  },
  {
    question: "Sebuah kapasitor 4 μF diisi hingga tegangan 50 V. Berapakah energi yang tersimpan dalam kapasitor (mJ)?",
    answer: "5",
  },
  {
    question: "Jika gaya 20 N bekerja pada benda selama 4 detik, berapakah impuls yang diberikan (N·s)?",
    answer: "80",
  },
  {
    question: "Sebuah pegas dengan konstanta 200 N/m diregangkan sejauh 0.1 m. Berapa energi potensial pegas (J)?",
    answer: "1",
  },
  {
    question: "Sebuah bola dilempar vertikal ke atas dengan kecepatan awal 20 m/s. Berapa tinggi maksimum yang dicapai (m)? (g = 10 m/s²)",
    answer: "20",
  },
];

function getRandomQuestion() {
  return PHYSICS_QUESTIONS[Math.floor(Math.random() * PHYSICS_QUESTIONS.length)];
}

const COOLDOWN_SECONDS = 60;

// ─── Step Types ──────────────────────────────────────────────────────────────
type Step = "choose" | "guest-name" | "guest-physics" | "google";

export default function LoginPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Guest name
  const [guestName, setGuestName] = useState("");

  // Physics
  const [question] = useState(getRandomQuestion);
  const [physicsAnswer, setPhysicsAnswer] = useState("");
  const [physicsWrong, setPhysicsWrong] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // ── Google login ──
  async function handleGoogle() {
    setLoading(true);
    setError("");
    try {
      const result = await loginGoogle();
      const token = await result.user.getIdToken();
      document.cookie = `session=${token}; path=/; max-age=3600; SameSite=Strict`;
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  }

  // ── Guest: submit name ──
  function handleGuestName() {
    if (!guestName.trim()) { setError("Masukkan namamu dulu."); return; }
    setError("");
    setStep("guest-physics");
  }

  // ── Guest: submit physics ──
  function handlePhysics() {
    const clean = physicsAnswer.trim().replace(",", ".");
    if (clean === question.answer) {
      // Benar → set guest session
      document.cookie = `session=guest_${guestName.trim()}; path=/; max-age=3600; SameSite=Strict`;
      router.push("/dashboard");
    } else {
      setPhysicsWrong(true);
      setPhysicsAnswer("");
      setCooldown(COOLDOWN_SECONDS);
      setError("Jawaban salah. Tunggu 1 menit untuk mencoba lagi.");
    }
  }

  // ── Shared card wrapper ──
  function Card({ children }: { children: React.ReactNode }) {
    return (
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm mx-auto"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-10">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-black leading-none">V</span>
          </div>
          <span className="font-black text-stone-800 text-lg tracking-tight">vancore</span>
        </div>

        <div className="bg-white rounded-3xl border border-stone-200/80 shadow-xl shadow-stone-100/80 p-8">
          {children}
        </div>

        <p className="text-stone-300 text-xs text-center mt-6">
          Tidak ada jalan pintas. Tidak ada yang gratis.
        </p>
      </motion.div>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center px-5">
      <AnimatePresence mode="wait">

        {/* ── STEP 1: Choose ── */}
        {step === "choose" && (
          <Card key="choose">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight mb-1">
              Masuk ke Sistem
            </h1>
            <p className="text-stone-400 text-sm mb-8 leading-relaxed">
              Karaktermu menunggu. Pilih cara masuk.
            </p>

            {/* Google */}
            <motion.button
              onClick={() => { setStep("google"); handleGoogle(); }}
              whileTap={{ scale: 0.97 }}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-stone-50 border border-stone-200 hover:border-stone-300 rounded-2xl px-5 py-3.5 text-sm font-semibold text-stone-700 transition-all duration-200 shadow-sm mb-3"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84z" />
              </svg>
              Lanjutkan dengan Google
            </motion.button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-stone-100" />
              <span className="text-stone-300 text-xs">atau</span>
              <div className="flex-1 h-px bg-stone-100" />
            </div>

            {/* Guest */}
            <motion.button
              onClick={() => setStep("guest-name")}
              whileTap={{ scale: 0.97 }}
              className="w-full flex items-center justify-center gap-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-2xl px-5 py-3.5 text-sm font-semibold text-stone-600 transition-all duration-200"
            >
              <span>👤</span>
              Masuk sebagai Guest
            </motion.button>
          </Card>
        )}

        {/* ── STEP 2: Guest Name ── */}
        {step === "guest-name" && (
          <Card key="guest-name">
            <button
              onClick={() => { setStep("choose"); setError(""); setGuestName(""); }}
              className="flex items-center gap-1.5 text-stone-400 hover:text-stone-600 text-xs mb-6 transition-colors duration-150"
            >
              ← Kembali
            </button>

            <h1 className="text-2xl font-black text-stone-900 tracking-tight mb-1">
              Siapa kamu?
            </h1>
            <p className="text-stone-400 text-sm mb-8 leading-relaxed">
              Masukkan namamu sebelum masuk ke sistem.
            </p>

            <div className="space-y-3">
              <input
                type="text"
                value={guestName}
                onChange={(e) => { setGuestName(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleGuestName()}
                placeholder="Nama kamu..."
                maxLength={32}
                className="w-full bg-stone-50 border border-stone-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 rounded-2xl px-4 py-3.5 text-sm text-stone-800 placeholder-stone-300 outline-none transition-all duration-200"
              />

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-xs px-1"
                >
                  {error}
                </motion.p>
              )}

              <motion.button
                onClick={handleGuestName}
                whileTap={{ scale: 0.97 }}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-2xl px-5 py-3.5 text-sm transition-colors duration-200"
              >
                Lanjut →
              </motion.button>
            </div>
          </Card>
        )}

        {/* ── STEP 3: Physics Question ── */}
        {step === "guest-physics" && (
          <Card key="guest-physics">
            <button
              onClick={() => { setStep("guest-name"); setError(""); setPhysicsAnswer(""); setPhysicsWrong(false); setCooldown(0); }}
              className="flex items-center gap-1.5 text-stone-400 hover:text-stone-600 text-xs mb-6 transition-colors duration-150"
            >
              ← Kembali
            </button>

            <div className="flex items-center gap-2 mb-6">
              <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <span className="text-violet-600 text-xs">⚛</span>
              </div>
              <span className="text-violet-600 text-xs font-semibold tracking-wide uppercase">
                Verifikasi Fisika
              </span>
            </div>

            <h1 className="text-lg font-black text-stone-900 tracking-tight mb-2 leading-snug">
              Halo, {guestName}.
            </h1>
            <p className="text-stone-400 text-xs mb-6 leading-relaxed">
              Jawab soal berikut dengan benar untuk masuk. Jawaban salah = cooldown 1 menit.
            </p>

            {/* Soal */}
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 mb-5">
              <p className="text-stone-700 text-sm leading-relaxed font-medium">
                {question.question}
              </p>
            </div>

            {/* Cooldown state */}
            {cooldown > 0 ? (
              <div className="space-y-3">
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
                  <p className="text-red-400 text-xs mb-2">Jawaban salah. Coba lagi dalam:</p>
                  <span className="text-red-500 font-black text-3xl tabular-nums">
                    {String(Math.floor(cooldown / 60)).padStart(2, "0")}:
                    {String(cooldown % 60).padStart(2, "0")}
                  </span>
                </div>

                {/* Progress bar cooldown */}
                <div className="bg-stone-100 rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    initial={{ width: "100%" }}
                    animate={{ width: `${(cooldown / COOLDOWN_SECONDS) * 100}%` }}
                    transition={{ duration: 1, ease: "linear" }}
                    className="h-full bg-red-300 rounded-full"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={physicsAnswer}
                  onChange={(e) => { setPhysicsAnswer(e.target.value); setError(""); setPhysicsWrong(false); }}
                  onKeyDown={(e) => e.key === "Enter" && !cooldown && handlePhysics()}
                  placeholder="Jawaban (angka)..."
                  className={`w-full bg-stone-50 border focus:ring-2 rounded-2xl px-4 py-3.5 text-sm text-stone-800 placeholder-stone-300 outline-none transition-all duration-200 ${physicsWrong ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-stone-200 focus:border-violet-400 focus:ring-violet-100"}`}
                />

                {error && !cooldown && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-xs px-1"
                  >
                    {error}
                  </motion.p>
                )}

                <motion.button
                  onClick={handlePhysics}
                  disabled={!physicsAnswer.trim()}
                  whileTap={{ scale: 0.97 }}
                  className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-2xl px-5 py-3.5 text-sm transition-colors duration-200"
                >
                  Verifikasi & Masuk
                </motion.button>
              </div>
            )}
          </Card>
        )}

        {/* ── STEP Google loading ── */}
        {step === "google" && (
          <Card key="google">
            <div className="flex flex-col items-center py-6 gap-4">
              {loading ? (
                <>
                  <span className="w-8 h-8 border-2 border-stone-200 border-t-violet-600 rounded-full animate-spin" />
                  <p className="text-stone-400 text-sm">Menghubungkan akun Google...</p>
                </>
              ) : error ? (
                <>
                  <p className="text-red-400 text-sm text-center">{error}</p>
                  <button
                    onClick={() => { setStep("choose"); setError(""); }}
                    className="text-violet-600 text-sm font-semibold"
                  >
                    Coba lagi
                  </button>
                </>
              ) : null}
            </div>
          </Card>
        )}

      </AnimatePresence>
    </main>
  );
}