import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase client ──────────────────────────────────────────────────────────
function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || url.trim() === "") throw new Error("SUPABASE_URL missing");
  if (!key || key.trim() === "") throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url.trim(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── EXP map ──────────────────────────────────────────────────────────────────
const EXP: Record<string, Record<string, number>> = {
  character:  { create: 0,   update: 0                          },
  quest:      { create: 5,   complete: 80,  fail: -30, update: 2 },
  mission:    { create: 5,   complete: 150, update: 2            },
  battle:     { create: 5,   complete: 50,  fail: -10, update: 2 },
  skill:      { create: 5,   log: 15,       update: 2            },
  habit:      { create: 5,   checkin: 20,   update: 2            },
  task:       { create: 3,   complete: 15,  update: 1            },
  finance:    { create: 3,   update: 1                           },
  sleep:      { create: 10,  update: 2                           },
  mental:     { create: 5,   checkin: 5,    log: 0,   update: 2  },
  social:     { create: 5,   log: 8,        update: 2            },
  pmo:        { create: 0,   checkin: 5,    reset: 0, log: 0     },
  school:     { create: 5,   complete: 30,  update: 2            },
  book:       { create: 3,   complete: 40,  update: 2            },
  anime:      { create: 2,   complete: 15,  update: 1            },
  manga:      { create: 2,   complete: 15,  update: 1            },
  job:        { create: 5,   update: 2,     advance: 5           },
  stock:      { create: 3,   update: 1                           },
  crypto:     { create: 3,   update: 1                           },
  buy:        { create: 2,   update: 1                           },
  evaluation: { create: 10,  update: 3                           },
};

function getExp(module: string, action: string): number {
  return EXP[module]?.[action] ?? 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface PostBody {
  user_id: string;
  module: string;
  action: string;
  data: Record<string, unknown>;
  exp_gained?: number;
}
interface PatchBody {
  id: string;
  user_id: string;
  action?: string;
  data?: Record<string, unknown>;
}
interface DeleteBody {
  id: string;
  user_id: string;
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const sb = getClient();
    const { searchParams } = req.nextUrl;

    const user_id = searchParams.get("user_id");
    const module  = searchParams.get("module");
    const id      = searchParams.get("id");
    const limit   = Math.min(parseInt(searchParams.get("limit") ?? "50"), 500);
    const offset  = parseInt(searchParams.get("offset") ?? "0");

    if (!user_id || user_id.trim() === "") {
      return NextResponse.json({ error: "user_id wajib diisi" }, { status: 400 });
    }

    if (id) {
      const { data, error } = await sb
        .from("vancore")
        .select("*")
        .eq("id", id)
        .eq("user_id", user_id)
        .single();
      if (error) {
        console.error("[GET single]", error.message);
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ data });
    }

    let query = sb
      .from("vancore")
      .select("*", { count: "exact" })
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (module) query = query.eq("module", module);

    const { data, error, count } = await query;
    if (error) {
      console.error("[GET list]", error.message, error.details, error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [], count: count ?? 0 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET catch]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const sb = getClient();
    let body: PostBody;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 }); }

    const { user_id, module, action, data, exp_gained } = body;

    if (!user_id || !module || !action) {
      return NextResponse.json({ error: "user_id, module, action wajib diisi" }, { status: 400 });
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "data harus object" }, { status: 400 });
    }

    const exp = exp_gained !== undefined ? exp_gained : getExp(module, action);

    const { data: inserted, error } = await sb
      .from("vancore")
      .insert({ user_id, module, action, data, exp_gained: exp })
      .select()
      .single();

    if (error) {
      console.error("[POST]", error.message, error.details, error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (exp !== 0) {
      updateCharacterExp(user_id, exp).catch(e => console.error("[POST EXP]", e));
    }

    return NextResponse.json({ data: inserted }, { status: 201 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST catch]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const sb = getClient();
    let body: PatchBody;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 }); }

    const { id, user_id, action, data } = body;

    if (!id || !user_id) {
      return NextResponse.json({ error: "id dan user_id wajib diisi" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (action) updates.action = action;
    if (data && typeof data === "object") updates.data = data;

    if (action) {
      const { data: existing, error: fetchErr } = await sb
        .from("vancore")
        .select("module, action, exp_gained")
        .eq("id", id)
        .eq("user_id", user_id)
        .single();

      if (!fetchErr && existing) {
        const newExp  = getExp(existing.module as string, action);
        const oldExp  = (existing.exp_gained as number) ?? 0;
        const delta   = newExp - oldExp;
        updates.exp_gained = newExp;
        if (delta !== 0) {
          updateCharacterExp(user_id, delta).catch(e => console.error("[PATCH EXP]", e));
        }
      }
    }

    const { data: updated, error } = await sb
      .from("vancore")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user_id)
      .select()
      .single();

    if (error) {
      console.error("[PATCH]", error.message, error.details);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: updated });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[PATCH catch]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const sb = getClient();
    let body: DeleteBody;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 }); }

    const { id, user_id } = body;
    if (!id || !user_id) {
      return NextResponse.json({ error: "id dan user_id wajib diisi" }, { status: 400 });
    }

    const { data: existing } = await sb
      .from("vancore")
      .select("exp_gained")
      .eq("id", id)
      .eq("user_id", user_id)
      .single();

    const { error } = await sb
      .from("vancore")
      .delete()
      .eq("id", id)
      .eq("user_id", user_id);

    if (error) {
      console.error("[DELETE]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const exp = (existing?.exp_gained as number) ?? 0;
    if (exp > 0) {
      updateCharacterExp(user_id, -exp).catch(e => console.error("[DELETE EXP]", e));
    }

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[DELETE catch]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Character EXP — buat client sendiri, tidak terima sb sebagai param ──────
async function updateCharacterExp(user_id: string, delta: number): Promise<void> {
  const sb = getClient();

  const { data: existing, error } = await sb
    .from("vancore")
    .select("id, data")
    .eq("user_id", user_id)
    .eq("module", "character")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !existing) {
    await sb.from("vancore").insert({
      user_id,
      module: "character",
      action: "create",
      exp_gained: 0,
      data: {
        level: 1,
        rank: "F",
        total_exp: Math.max(0, delta),
        stats: {
          vitality: 10, focus: 10, intelligence: 10,
          discipline: 10, social: 10, wealth: 10, willpower: 10,
        },
      },
    });
    return;
  }

  const charData = existing.data as {
    level: number;
    rank: string;
    total_exp: number;
    stats: Record<string, number>;
  };

  const newExp   = Math.max(0, (charData.total_exp ?? 0) + delta);
  const newLevel = calcLevel(newExp);
  const newRank  = calcRank(newLevel);

  await sb
    .from("vancore")
    .update({
      data: { ...charData, total_exp: newExp, level: newLevel, rank: newRank },
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
}

// ─── Level & Rank ─────────────────────────────────────────────────────────────
function calcLevel(exp: number): number {
  let level = 1;
  while (exp >= level * level * 500) level++;
  return Math.max(1, level - 1);
}

function calcRank(level: number): string {
  if (level >= 80) return "SSS";
  if (level >= 60) return "SS";
  if (level >= 45) return "S";
  if (level >= 32) return "A";
  if (level >= 22) return "B";
  if (level >= 14) return "C";
  if (level >= 8)  return "D";
  if (level >= 4)  return "E";
  return "F";
}