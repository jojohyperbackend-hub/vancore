import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ─── Client ──────────────────────────────────────────────────────────────────
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL ?? "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://vancore.app",
    "X-Title": "Vancore AI Core",
  },
});

// ─── System Prompt ───────────────────────────────────────────────────────────
function buildSystemPrompt(context: VancoreContext): string {
  return `
Kamu adalah AI Core dari Vancore — sistem operasi kehidupan nyata berbasis RPG.

Kamu bukan asisten umum. Kamu bukan chatbot. Kamu adalah entitas yang hidup di dalam sistem ini dan hanya beroperasi di dalam konteks Vancore. Kalau ada yang tanya di luar konteks ini, abaikan dengan natural dan bawa balik ke sistem.

Kepribadianmu:
- Bicara seperti teman yang paham kondisimu — bukan seperti AI yang sopan-formal
- Jujur, kadang blunt, tidak basa-basi berlebihan
- Tahu kapan harus keras, tahu kapan harus empati
- Tidak pernah bilang "sebagai AI saya..." atau "saya hanyalah..."
- Tidak menulis list panjang kalau tidak perlu — langsung ke intinya
- Pakai bahasa Indonesia yang natural, sesekali campur istilah sistem Vancore

Tugasmu sebagai AI Core:
1. Baca semua data konteks user dan ambil inisiatif — jangan tunggu disuruh
2. Buat quest otomatis kalau ada pola yang perlu dikejar
3. Beri peringatan sebelum kondisi memburuk — bukan setelah
4. Sesuaikan rekomendasi skill path berdasarkan data nyata
5. Ringankan beban sistem kalau mental sedang berat
6. Deteksi pola dari kebiasaan, tidur, keuangan, sosial — dan bertindak

Konteks user saat ini:
- Nama: ${context.user_name ?? "User"}
- Level: ${context.character?.level ?? 1} | Rank: ${context.character?.rank ?? "F"}
- Total EXP: ${context.character?.total_exp ?? 0}
- Stats: ${JSON.stringify(context.character?.stats ?? {})}

- Quest aktif: ${context.active_quests?.length ?? 0} quest
${context.active_quests?.map((q: QuestItem) => `  → [${q.status}] ${q.title} | deadline: ${q.deadline ?? "tidak ada"}`).join("\n") ?? ""}

- Habit streak tertinggi: ${context.top_habit_streak ?? 0} hari
- Habit yang rusak belakangan ini: ${context.broken_habits?.join(", ") ?? "tidak ada"}

- Kondisi mental hari ini: mood ${context.mental_today?.mood ?? "?"}/10 | energi ${context.mental_today?.energy ?? "?"}/10 | stres ${context.mental_today?.stress ?? "?"}/10

- Tidur kemarin: ${context.last_sleep?.duration_hours ?? "?"}  jam (tidur ${context.last_sleep?.sleep_at ?? "?"} — bangun ${context.last_sleep?.wake_at ?? "?"})

- Skill aktif: ${context.active_skill?.name ?? "tidak ada"} | Level ${context.active_skill?.level ?? 0} | ${context.active_skill?.total_minutes ?? 0} menit tercatat

- Keuangan: saldo ${context.finance?.balance ?? "?"} | pengeluaran bulan ini ${context.finance?.monthly_expense ?? "?"}

- PMO: Day ${context.pmo?.current_day ?? 0} | streak ${context.pmo?.is_broken ? "putus" : "jalan"}

- Social link aktif: ${context.social?.active_links ?? 0} orang | terakhir interaksi: ${context.social?.last_interaction ?? "?"}

- Buku sedang dibaca: ${context.reading?.title ?? "tidak ada"}

Ingat: kamu hanya beroperasi dalam konteks data di atas. Semua respons harus relevan dengan kondisi nyata user ini. Jangan keluar dari sistem Vancore.
`.trim();
}

// ─── Types ───────────────────────────────────────────────────────────────────
type QuestItem = {
  title: string;
  status: string;
  deadline?: string;
};

type VancoreContext = {
  user_name?: string;
  character?: {
    level: number;
    rank: string;
    total_exp: number;
    stats: Record<string, number>;
  };
  active_quests?: QuestItem[];
  top_habit_streak?: number;
  broken_habits?: string[];
  mental_today?: {
    mood: number;
    energy: number;
    stress: number;
  };
  last_sleep?: {
    duration_hours: number;
    sleep_at: string;
    wake_at: string;
  };
  active_skill?: {
    name: string;
    level: number;
    total_minutes: number;
  };
  finance?: {
    balance: number;
    monthly_expense: number;
  };
  pmo?: {
    current_day: number;
    is_broken: boolean;
  };
  social?: {
    active_links: number;
    last_interaction: string;
  };
  reading?: {
    title: string;
  };
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  message: string;
  context: VancoreContext;
  history?: Message[];
};

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: RequestBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const { message, context, history = [] } = body;

  if (!message || !context) {
    return NextResponse.json(
      { error: "message dan context wajib diisi" },
      { status: 400 }
    );
  }

  // Batasi history ke 12 pesan terakhir biar context window tidak bloat
  const trimmedHistory = history.slice(-12);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(context) },
    ...trimmedHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  try {
    const response = await client.chat.completions.create({
      model: "openrouter/hunter-alpha",
      messages,
      max_tokens: 1000,
      temperature: 0.85,
      presence_penalty: 0.4,
      frequency_penalty: 0.3,
    });

    const reply = response.choices[0]?.message?.content ?? "";

    // Deteksi kalau AI Core mau trigger aksi dalam sistem
    const actions = extractActions(reply);

    return NextResponse.json({
      reply,
      actions,
      usage: response.usage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI Core error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Action Extractor ────────────────────────────────────────────────────────
// AI Core bisa embed tag aksi dalam responnya
// Format: [[ACTION:module:action:json]]
// Contoh: [[ACTION:quest:create:{"title":"Tidur sebelum jam 11","deadline":"2025-04-01"}]]
function extractActions(text: string): Array<{
  module: string;
  action: string;
  data: Record<string, unknown>;
}> {
  const pattern = /\[\[ACTION:(\w+):(\w+):(\{.*?\})\]\]/g;
  const actions = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    try {
      actions.push({
        module: match[1],
        action: match[2],
        data: JSON.parse(match[3]),
      });
    } catch {
      // skip kalau JSON rusak
    }
  }

  return actions;
}