"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { auth, logout } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

// ════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════
type Module =
  | "home" | "quest" | "mission" | "battle" | "skill"
  | "habit" | "finance" | "sleep" | "mental" | "social"
  | "pmo" | "school" | "book" | "anime" | "job"
  | "stock" | "crypto" | "buy" | "evaluation" | "ai";

type StatKey = "vitality"|"focus"|"intelligence"|"discipline"|"social"|"wealth"|"willpower";

interface VancoreRow {
  id: string; user_id: string; module: string; action: string;
  data: Record<string, unknown>; exp_gained: number;
  created_at: string; updated_at: string;
}
interface Character { level:number; rank:string; total_exp:number; stats:Record<StatKey,number>; }
interface Quest { id:string; title:string; status:"todo"|"progress"|"success"|"failed"; deadline?:string; mission_id?:string; exp:number; }
interface Mission { id:string; title:string; description?:string; status:"active"|"completed"|"failed"; quest_count:number; }
interface Habit { id:string; title:string; streak:number; frequency:string; last_checkin?:string; done_today:boolean; }
interface Task { id:string; title:string; priority:"high"|"medium"|"low"; done:boolean; due?:string; }
interface SleepEntry { id:string; date:string; sleep_at:string; wake_at:string; duration_hours:number; }
interface MentalEntry { id:string; date:string; mood:number; energy:number; stress:number; journal?:string; }
interface FinanceEntry { id:string; type:"income"|"expense"; amount:number; category:string; note?:string; date:string; }
interface PmoData { id:string; current_day:number; streak_start:string; is_broken:boolean; milestone_reached:number[]; }
interface SocialLink { id:string; name:string; level:number; last_interaction?:string; total_interactions:number; }
interface SocialLog { id:string; link_id:string; link_name:string; type:string; topic:string; note?:string; date:string; }
interface SchoolItem { id:string; type:"assignment"|"exam"|"goal"|"note"; title:string; due?:string; status:"todo"|"done"; subject?:string; content?:string; }
interface BookEntry { id:string; title:string; author?:string; type:"book"|"article"|"paper"; status:"want"|"reading"|"done"|"dropped"; review?:string; }
interface AnimeEntry { id:string; title:string; type:"anime"|"manga"; status:"watching"|"reading"|"onhold"|"completed"|"dropped"|"plan"; progress:number; total?:number; }
interface JobEntry { id:string; company:string; position:string; status:"applied"|"screening"|"interview"|"offer"|"accepted"|"rejected"; applied_at:string; note?:string; }
interface StockEntry { id:string; ticker:string; name:string; type:"stock"|"bond"|"money_market"; buy_price:number; current_price:number; qty:number; note?:string; }
interface CryptoEntry { id:string; symbol:string; name:string; buy_price:number; current_price:number; amount:number; allocation_pct:number; }
interface BuyEntry { id:string; item:string; category:string; price:number; date:string; worth_it?:boolean; evaluation?:string; }
interface EvalEntry { id:string; period:"daily"|"weekly"|"monthly"|"quarterly"; content:string; linked_module?:string; date:string; }
interface SkillEntry { id:string; name:string; level:number; total_minutes:number; is_active:boolean; prerequisites:string[]; description?:string; }
interface SkillLog { id:string; skill_id:string; skill_name:string; duration_minutes:number; note?:string; date:string; }
interface BattleEnemy { id:string; name:string; type:string; hp:number; max_hp:number; defeated:boolean; date:string; }
interface AiMessage { role:"user"|"assistant"; content:string; }

// ════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════
const STAT_META:{key:StatKey;icon:string;color:string}[] = [
  {key:"vitality",     icon:"❤️", color:"bg-rose-400"},
  {key:"focus",        icon:"🎯", color:"bg-violet-400"},
  {key:"intelligence", icon:"📖", color:"bg-indigo-400"},
  {key:"discipline",   icon:"⚔️", color:"bg-amber-400"},
  {key:"social",       icon:"🔗", color:"bg-teal-400"},
  {key:"wealth",       icon:"💰", color:"bg-emerald-400"},
  {key:"willpower",    icon:"🔒", color:"bg-purple-500"},
];

const NAV:{id:Module;label:string;icon:string;group:string}[] = [
  {id:"home",       label:"Home",        icon:"◈",  group:"core"},
  {id:"ai",         label:"AI Core",     icon:"◉",  group:"core"},
  {id:"quest",      label:"Quest",       icon:"◎",  group:"rpg"},
  {id:"mission",    label:"Mission",     icon:"⊕",  group:"rpg"},
  {id:"battle",     label:"Battle",      icon:"⚔",  group:"rpg"},
  {id:"skill",      label:"Skill Tree",  icon:"✦",  group:"rpg"},
  {id:"habit",      label:"Habit/Task",  icon:"↺",  group:"tracker"},
  {id:"sleep",      label:"Sleep",       icon:"◐",  group:"tracker"},
  {id:"mental",     label:"Mental",      icon:"◯",  group:"tracker"},
  {id:"pmo",        label:"PMO",         icon:"⬡",  group:"tracker"},
  {id:"finance",    label:"Finance",     icon:"◇",  group:"life"},
  {id:"school",     label:"School",      icon:"◫",  group:"life"},
  {id:"social",     label:"Social OS",   icon:"⬡",  group:"life"},
  {id:"job",        label:"Job",         icon:"◻",  group:"life"},
  {id:"book",       label:"Literacy",    icon:"◪",  group:"log"},
  {id:"anime",      label:"Anime/Manga", icon:"◈",  group:"log"},
  {id:"stock",      label:"Stock",       icon:"◈",  group:"log"},
  {id:"crypto",     label:"Crypto",      icon:"◈",  group:"log"},
  {id:"buy",        label:"Buy Log",     icon:"◈",  group:"log"},
  {id:"evaluation", label:"Evaluation",  icon:"◈",  group:"log"},
];

const NAV_GROUPS = [
  {key:"core",label:"Core"},{key:"rpg",label:"RPG"},
  {key:"tracker",label:"Tracker"},{key:"life",label:"Life"},{key:"log",label:"Log"},
];

const PMO_MILESTONES = [7,14,30,60,90,180,365,730,1200];
const DEFAULT_CHAR:Character = {level:1,rank:"F",total_exp:0,stats:{vitality:10,focus:10,intelligence:10,discipline:10,social:10,wealth:10,willpower:10}};
const BATTLE_ENEMIES = ["Prokrastinasi","Doomscrolling","Tidur Berlebihan","Pengeluaran Impulsif","Isolasi Sosial","Overthinking","Skip Olahraga"];

// ════════════════════════════════════════════════════════════
// API HELPERS
// ════════════════════════════════════════════════════════════
async function apiGet(uid:string, mod:string, limit=100):Promise<VancoreRow[]> {
  try {
    const r = await fetch(`/api/crud?user_id=${uid}&module=${mod}&limit=${limit}`);
    if(!r.ok) return [];
    return (await r.json()).data ?? [];
  } catch { return []; }
}
async function apiPost(uid:string,mod:string,action:string,data:Record<string,unknown>,exp?:number):Promise<VancoreRow|null> {
  try {
    const r = await fetch("/api/crud",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({user_id:uid,module:mod,action,data,exp_gained:exp})});
    if(!r.ok) return null;
    return (await r.json()).data ?? null;
  } catch { return null; }
}
async function apiPatch(id:string,uid:string,action:string,data?:Record<string,unknown>):Promise<VancoreRow|null> {
  try {
    const r = await fetch("/api/crud",{method:"PATCH",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id,user_id:uid,action,data})});
    if(!r.ok) return null;
    return (await r.json()).data ?? null;
  } catch { return null; }
}
async function apiDelete(id:string,uid:string):Promise<boolean> {
  try {
    const r = await fetch("/api/crud",{method:"DELETE",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id,user_id:uid})});
    return r.ok;
  } catch { return false; }
}

// ════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════
const expNextLevel = (l:number) => l*l*500;
const expCurLevel  = (l:number) => (l-1)*(l-1)*500;
const expProgress  = (c:Character) => Math.min(((c.total_exp-expCurLevel(c.level))/(expNextLevel(c.level)-expCurLevel(c.level)))*100,100);
const isToday      = (d?:string) => !!d && new Date(d).toDateString()===new Date().toDateString();
const today        = () => new Date().toISOString().slice(0,10);
const daysLeft     = (d?:string) => d ? Math.ceil((new Date(d).getTime()-Date.now())/86400000) : null;
const fmtIDR       = (n:number) => `Rp ${Math.abs(n).toLocaleString("id")}`;

const statusColor = (s:string) => ({
  todo:        "bg-stone-100 text-stone-400",
  progress:    "bg-violet-100 text-violet-600",
  success:     "bg-emerald-100 text-emerald-600",
  failed:      "bg-red-100 text-red-400",
  active:      "bg-violet-100 text-violet-600",
  completed:   "bg-emerald-100 text-emerald-600",
  done:        "bg-emerald-100 text-emerald-600",
  applied:     "bg-blue-100 text-blue-500",
  screening:   "bg-yellow-100 text-yellow-600",
  interview:   "bg-violet-100 text-violet-600",
  offer:       "bg-emerald-100 text-emerald-600",
  accepted:    "bg-emerald-200 text-emerald-700",
  rejected:    "bg-red-100 text-red-400",
  want:        "bg-stone-100 text-stone-400",
  reading:     "bg-violet-100 text-violet-600",
  dropped:     "bg-red-100 text-red-400",
  watching:    "bg-violet-100 text-violet-600",
  onhold:      "bg-amber-100 text-amber-600",
  plan:        "bg-stone-100 text-stone-400",
  high:        "bg-red-100 text-red-500",
  medium:      "bg-amber-100 text-amber-600",
  low:         "bg-stone-100 text-stone-400",
  stock:       "bg-blue-100 text-blue-500",
  bond:        "bg-indigo-100 text-indigo-500",
  money_market:"bg-teal-100 text-teal-500",
}[s] ?? "bg-stone-100 text-stone-400");

// ════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ════════════════════════════════════════════════════════════
const Sk = ({cls=""}:{cls?:string}) => <div className={`animate-pulse bg-stone-100 rounded-2xl ${cls}`}/>;
const Empty = ({icon,text}:{icon:string;text:string}) => (
  <div className="flex flex-col items-center py-14 gap-2 text-center">
    <span className="text-3xl">{icon}</span>
    <p className="text-stone-300 text-sm">{text}</p>
  </div>
);

function Input({value,onChange,placeholder,type="text",className="",onKeyDown}:{
  value:string;onChange:(v:string)=>void;placeholder?:string;type?:string;className?:string;onKeyDown?:(e:React.KeyboardEvent)=>void;
}) {
  return (
    <input value={value} type={type} placeholder={placeholder} onKeyDown={onKeyDown}
      onChange={e=>onChange(e.target.value)}
      className={`bg-stone-50 border border-stone-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 rounded-xl px-4 py-2.5 text-sm text-stone-800 placeholder-stone-300 outline-none transition-all w-full ${className}`}
    />
  );
}

function Btn({children,onClick,disabled,variant="primary",small=false,className=""}:{
  children:React.ReactNode;onClick?:()=>void;disabled?:boolean;
  variant?:"primary"|"secondary"|"danger"|"ghost";small?:boolean;className?:string;
}) {
  const base = `font-semibold rounded-xl transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${small?"text-xs px-3 py-1.5":"text-sm px-5 py-2.5"}`;
  const vars = {
    primary:"bg-violet-600 hover:bg-violet-700 text-white",
    secondary:"bg-stone-100 hover:bg-stone-200 text-stone-600",
    danger:"bg-red-50 hover:bg-red-100 text-red-500",
    ghost:"text-stone-400 hover:text-stone-700 hover:bg-stone-50",
  };
  return <button onClick={onClick} disabled={disabled} className={`${base} ${vars[variant]} ${className}`}>{children}</button>;
}

function Card({children,className=""}:{children:React.ReactNode;className?:string}) {
  return <div className={`bg-white rounded-3xl border border-stone-200/80 p-5 ${className}`}>{children}</div>;
}

function StatBar({meta,value}:{meta:typeof STAT_META[0];value:number}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-sm w-5 shrink-0">{meta.icon}</span>
      <span className="text-stone-400 text-xs w-20 shrink-0 capitalize">{meta.key}</span>
      <div className="flex-1 bg-stone-100 rounded-full h-1.5 overflow-hidden">
        <motion.div initial={{width:0}} animate={{width:`${value}%`}}
          transition={{duration:1,ease:[0.22,1,0.36,1]}} className={`h-full ${meta.color} rounded-full`}/>
      </div>
      <span className="text-stone-300 text-xs w-5 text-right tabular-nums">{value}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// HOME
// ════════════════════════════════════════════════════════════
function HomeView({uid,userName,onNav}:{uid:string;userName:string;onNav:(m:Module)=>void}) {
  const [char,setChar] = useState<Character|null>(null);
  const [quests,setQuests] = useState<Quest[]>([]);
  const [habits,setHabits] = useState<Habit[]>([]);
  const [pmo,setPmo] = useState<PmoData|null>(null);
  const [sleep,setSleep] = useState<SleepEntry|null>(null);
  const [mental,setMental] = useState<MentalEntry|null>(null);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{
    if(!uid) return;
    (async()=>{
      setLoading(true);
      const [cR,qR,hR,pR,sR,mR] = await Promise.all([
        apiGet(uid,"character"),apiGet(uid,"quest"),apiGet(uid,"habit"),
        apiGet(uid,"pmo"),apiGet(uid,"sleep",1),apiGet(uid,"mental",1),
      ]);
      setChar(cR[0]?(cR[0].data as unknown as Character):DEFAULT_CHAR);
      setQuests(qR.map(r=>({id:r.id,title:String(r.data.title??""),
        status:(r.data.status??"todo") as Quest["status"],
        deadline:r.data.deadline as string|undefined, exp:r.exp_gained})));
      setHabits(hR.map(r=>({id:r.id,title:String(r.data.title??""),
        streak:Number(r.data.streak??0),frequency:"daily",
        last_checkin:r.data.last_checkin as string|undefined,
        done_today:isToday(r.data.last_checkin as string|undefined)})));
      if(pR[0]) setPmo(pR[0].data as unknown as PmoData);
      if(sR[0]) setSleep(sR[0].data as unknown as SleepEntry);
      if(mR[0]) setMental(mR[0].data as unknown as MentalEntry);
      setLoading(false);
    })();
  },[uid]);

  const c = char??DEFAULT_CHAR;
  const progress = expProgress(c);
  const hour = new Date().getHours();
  const greeting = hour<12?"Selamat pagi":hour<17?"Selamat siang":"Selamat malam";
  const activeQ = quests.filter(q=>q.status==="progress"||q.status==="todo");
  const doneH = habits.filter(h=>h.done_today).length;

  if(loading) return <div className="space-y-4"><Sk cls="h-44"/><Sk cls="h-52"/><Sk cls="h-32"/></div>;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
        className="bg-violet-600 rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{backgroundImage:"radial-gradient(circle at 80% 20%,#fff 0%,transparent 50%)"}}/>
        <p className="text-violet-200 text-xs mb-0.5">{greeting},</p>
        <h2 className="text-white font-black text-2xl tracking-tight mb-4">{userName}</h2>
        <div className="flex justify-between mb-1.5">
          <span className="text-violet-200 text-xs">Level {c.level} · Rank {c.rank}</span>
          <span className="text-violet-200 text-xs tabular-nums">{c.total_exp.toLocaleString()} EXP</span>
        </div>
        <div className="bg-violet-500/50 rounded-full h-2 overflow-hidden">
          <motion.div initial={{width:0}} animate={{width:`${progress}%`}}
            transition={{duration:1.2,ease:[0.22,1,0.36,1]}} className="h-full bg-white/80 rounded-full"/>
        </div>
        <button onClick={()=>onNav("ai")}
          className="mt-4 flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition-colors">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>Tanya AI Core
        </button>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.06}}>
        <Card><h3 className="font-bold text-stone-800 text-sm mb-4">Stats</h3>
          <div className="space-y-2.5">{STAT_META.map(m=><StatBar key={m.key} meta={m} value={c.stats[m.key]??0}/>)}</div>
        </Card>
      </motion.div>

      {/* Quick stats */}
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.1}} className="grid grid-cols-3 gap-3">
        {[
          {label:"Quest aktif",value:activeQ.length>0?String(activeQ.length):"—",icon:"◎",color:"text-violet-600",nav:"quest"as Module},
          {label:"Habit",value:habits.length>0?`${doneH}/${habits.length}`:"—",icon:"↺",color:"text-teal-500",nav:"habit"as Module},
          {label:"PMO Day",value:pmo?String(pmo.current_day):"—",icon:"🔒",color:"text-purple-600",nav:"pmo"as Module},
        ].map(s=>(
          <button key={s.label} onClick={()=>onNav(s.nav)}
            className="bg-white rounded-2xl p-4 border border-stone-200/80 text-center hover:border-violet-200 hover:shadow-md hover:shadow-violet-100/40 transition-all">
            <div className="text-lg mb-1">{s.icon}</div>
            <div className={`font-black text-base leading-none mb-1 ${s.color}`}>{s.value}</div>
            <div className="text-stone-400 text-xs">{s.label}</div>
          </button>
        ))}
      </motion.div>

      {/* Mental today */}
      {mental && (
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.14}}>
          <Card>
            <h3 className="font-bold text-stone-800 text-sm mb-3">Kondisi Mental Terakhir</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[{label:"Mood",val:mental.mood,icon:"😄"},{label:"Energi",val:mental.energy,icon:"⚡"},{label:"Stres",val:mental.stress,icon:"🌡"}].map(x=>(
                <div key={x.label} className="bg-stone-50 rounded-2xl p-3">
                  <div className="text-lg mb-1">{x.icon}</div>
                  <div className="font-black text-violet-600 text-lg leading-none">{x.val}/10</div>
                  <div className="text-stone-400 text-xs mt-0.5">{x.label}</div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Sleep */}
      {sleep && (
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.18}}>
          <Card>
            <h3 className="font-bold text-stone-800 text-sm mb-3">Tidur Terakhir</h3>
            <div className="flex items-center justify-between">
              <div><p className="text-stone-400 text-xs mb-1">Tidur → Bangun</p>
                <p className="text-stone-700 text-sm font-semibold">{sleep.sleep_at} → {sleep.wake_at}</p></div>
              <p className={`font-black text-3xl tabular-nums ${sleep.duration_hours>=7?"text-emerald-500":sleep.duration_hours>=6?"text-amber-500":"text-red-400"}`}>
                {sleep.duration_hours}h</p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Active quests preview */}
      {activeQ.length>0 && (
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.22}}>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-stone-800 text-sm">Quest Aktif</h3>
              <button onClick={()=>onNav("quest")} className="text-violet-500 text-xs">Semua →</button>
            </div>
            <div className="space-y-2">
              {activeQ.slice(0,3).map(q=>{const d=daysLeft(q.deadline);return(
                <div key={q.id} className="flex items-center gap-2 py-2 border-b border-stone-100 last:border-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor(q.status)}`}>{q.status}</span>
                  <span className="text-stone-700 text-sm flex-1 truncate">{q.title}</span>
                  {d!==null&&<span className={`text-xs shrink-0 ${d<0?"text-red-400":d<3?"text-amber-500":"text-stone-300"}`}>{d<0?"overdue":`${d}d`}</span>}
                </div>
              );})}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// QUEST
// ════════════════════════════════════════════════════════════
function QuestView({uid}:{uid:string}) {
  const [quests,setQuests]=useState<Quest[]>([]);
  const [loading,setLoading]=useState(true);
  const [title,setTitle]=useState(""); const [deadline,setDeadline]=useState(""); const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"quest");
    setQuests(rows.map(r=>({id:r.id,title:String(r.data.title??""),
      status:(r.data.status??"todo") as Quest["status"],
      deadline:r.data.deadline as string|undefined,exp:r.exp_gained})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add() {
    if(!title.trim()) return; setAdding(true);
    const row=await apiPost(uid,"quest","create",{title:title.trim(),status:"todo",deadline:deadline||null});
    if(row) setQuests(p=>[{id:row.id,title:title.trim(),status:"todo",deadline:deadline||undefined,exp:row.exp_gained},...p]);
    setTitle(""); setDeadline(""); setAdding(false);
  }
  async function updateStatus(q:Quest,status:Quest["status"]) {
    const action=status==="success"?"complete":status==="failed"?"fail":"update";
    const row=await apiPatch(q.id,uid,action,{...q,status});
    if(row) setQuests(p=>p.map(x=>x.id===q.id?{...x,status}:x));
  }
  async function del(id:string){if(await apiDelete(id,uid)) setQuests(p=>p.filter(x=>x.id!==id));}

  const groups={progress:quests.filter(q=>q.status==="progress"),todo:quests.filter(q=>q.status==="todo"),
    success:quests.filter(q=>q.status==="success"),failed:quests.filter(q=>q.status==="failed")};

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Quest Baru</h3>
        <div className="space-y-2">
          <Input value={title} onChange={setTitle} placeholder="Nama quest..." onKeyDown={e=>e.key==="Enter"&&add()}/>
          <div className="flex gap-2">
            <Input value={deadline} onChange={setDeadline} type="date" className="flex-1"/>
            <Btn onClick={add} disabled={adding||!title.trim()}>{adding?"...":"+ Tambah"}</Btn>
          </div>
        </div>
      </Card>
      {loading?<div className="space-y-2"><Sk cls="h-14"/><Sk cls="h-14"/><Sk cls="h-14"/></div>
      :quests.length===0?<Empty icon="◎" text="Belum ada quest."/>
      :(["progress","todo","success","failed"] as const).map(status=>groups[status].length>0&&(
        <Card key={status}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(status)}`}>{status}</span>
            <span className="text-stone-300 text-xs">{groups[status].length}</span>
          </div>
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {groups[status].map(q=>{const d=daysLeft(q.deadline);return(
                <motion.div key={q.id} layout initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-12}}
                  className="flex items-start gap-3 p-3 rounded-2xl bg-stone-50 border border-stone-200/60">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${status==="success"?"line-through text-stone-300":"text-stone-700"}`}>{q.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {d!==null&&<span className={`text-xs ${d<0?"text-red-400":d<3?"text-amber-500":"text-stone-300"}`}>{d<0?"overdue":`${d}d lagi`}</span>}
                      <span className="text-violet-400 text-xs">+{q.exp} EXP</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {status==="todo"&&<Btn onClick={()=>updateStatus(q,"progress")} variant="secondary" small>Mulai</Btn>}
                    {status==="progress"&&<Btn onClick={()=>updateStatus(q,"success")} variant="secondary" small>Done</Btn>}
                    {(status==="todo"||status==="progress")&&<Btn onClick={()=>updateStatus(q,"failed")} variant="danger" small>Fail</Btn>}
                    <Btn onClick={()=>del(q.id)} variant="ghost" small>✕</Btn>
                  </div>
                </motion.div>
              );})}
            </div>
          </AnimatePresence>
        </Card>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MISSION
// ════════════════════════════════════════════════════════════
function MissionView({uid}:{uid:string}) {
  const [missions,setMissions]=useState<Mission[]>([]);
  const [loading,setLoading]=useState(true);
  const [title,setTitle]=useState(""); const [desc,setDesc]=useState(""); const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"mission");
    setMissions(rows.map(r=>({id:r.id,title:String(r.data.title??""),
      description:r.data.description as string|undefined,
      status:(r.data.status??"active") as Mission["status"],
      quest_count:Number(r.data.quest_count??0)})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!title.trim()) return; setAdding(true);
    const row=await apiPost(uid,"mission","create",{title:title.trim(),description:desc.trim()||null,status:"active",quest_count:0});
    if(row) setMissions(p=>[{id:row.id,title:title.trim(),description:desc.trim(),status:"active",quest_count:0},...p]);
    setTitle(""); setDesc(""); setAdding(false);
  }
  async function complete(m:Mission){
    await apiPatch(m.id,uid,"complete",{...m,status:"completed"});
    setMissions(p=>p.map(x=>x.id===m.id?{...x,status:"completed"}:x));
  }
  async function del(id:string){if(await apiDelete(id,uid)) setMissions(p=>p.filter(x=>x.id!==id));}

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Mission Baru</h3>
        <div className="space-y-2">
          <Input value={title} onChange={setTitle} placeholder="Nama mission..."/>
          <Input value={desc} onChange={setDesc} placeholder="Deskripsi (opsional)..."/>
          <Btn onClick={add} disabled={adding||!title.trim()} className="w-full">{adding?"...":"+ Buat Mission"}</Btn>
        </div>
      </Card>
      {loading?<div className="space-y-2"><Sk cls="h-20"/><Sk cls="h-20"/></div>
      :missions.length===0?<Empty icon="⊕" text="Belum ada mission besar."/>
      :missions.map(m=>(
        <Card key={m.id}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(m.status)}`}>{m.status}</span>
              </div>
              <p className="text-stone-800 font-bold text-sm">{m.title}</p>
              {m.description&&<p className="text-stone-400 text-xs mt-1">{m.description}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              {m.status==="active"&&<Btn onClick={()=>complete(m)} variant="secondary" small>Complete</Btn>}
              <Btn onClick={()=>del(m.id)} variant="ghost" small>✕</Btn>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// BATTLE
// ════════════════════════════════════════════════════════════
function BattleView({uid}:{uid:string}) {
  const [battles,setBattles]   = useState<BattleEnemy[]>([]);
  const [loading,setLoading]   = useState(true);
  const [starting,setStarting] = useState(false);
  const [active,setActive]     = useState<BattleEnemy|null>(null);
  const [attacking,setAttacking] = useState(false);
  const [lastDmg,setLastDmg]   = useState<number|null>(null);
  const [shaking,setShaking]   = useState(false);
  const [won,setWon]           = useState(false);
  const attackingRef           = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await apiGet(uid,"battle",20);
    const mapped = rows.map(r=>({
      id: r.id,
      name: String(r.data.name??""),
      type: String(r.data.type??""),
      hp: Number(r.data.hp??0),
      max_hp: Number(r.data.max_hp??100),
      defeated: Boolean(r.data.defeated??false),
      date: String(r.data.date??r.created_at.slice(0,10)),
    }));
    setBattles(mapped);
    const ongoing = mapped.find(b => !b.defeated && b.date === today());
    setActive(ongoing ?? null);
    setLoading(false);
  },[uid]);

  useEffect(() => { load(); },[load]);

  async function startBattle() {
    if (starting) return;
    setStarting(true);
    setWon(false);
    setLastDmg(null);
    const enemy = BATTLE_ENEMIES[Math.floor(Math.random() * BATTLE_ENEMIES.length)];
    const row = await apiPost(uid,"battle","create",{
      name: enemy, type:"daily_enemy",
      hp: 100, max_hp: 100,
      defeated: false, date: today(),
    }, 5);
    if (row) {
      const b:BattleEnemy = {
        id: row.id, name: enemy, type:"daily_enemy",
        hp: 100, max_hp: 100, defeated: false, date: today(),
      };
      setActive(b);
      setBattles(p => [b,...p]);
    }
    setStarting(false);
  }

  async function attack() {
    // Guard: gunakan ref agar tidak double-fire dari re-render
    if (!active || attackingRef.current) return;
    attackingRef.current = true;
    setAttacking(true);
    setLastDmg(null);

    const dmg      = Math.floor(Math.random() * 25) + 10;
    const newHp    = Math.max(0, active.hp - dmg);
    const defeated = newHp === 0;

    setLastDmg(dmg);
    setShaking(true);
    setTimeout(() => setShaking(false), 400);

    const updated: BattleEnemy = { ...active, hp: newHp, defeated };

    // Update DB
    await apiPatch(
      active.id, uid,
      defeated ? "complete" : "update",
      { name: active.name, type: active.type, hp: newHp, max_hp: active.max_hp, defeated, date: active.date }
    );

    setBattles(p => p.map(b => b.id === active.id ? updated : b));

    if (defeated) {
      setWon(true);
      setActive(null);
    } else {
      setActive(updated);
    }

    attackingRef.current = false;
    setAttacking(false);
  }

  const hpPct = active ? (active.hp / active.max_hp) * 100 : 0;
  const hpColor = hpPct > 60 ? "bg-white/80" : hpPct > 30 ? "bg-yellow-300" : "bg-red-300";

  return (
    <div className="space-y-5">

      {/* Victory screen */}
      <AnimatePresence>
        {won && (
          <motion.div
            initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.9}}
            className="bg-emerald-500 rounded-3xl p-8 text-center"
          >
            <p className="text-5xl mb-3">🏆</p>
            <p className="text-white font-black text-2xl mb-1">Musuh Dikalahkan!</p>
            <p className="text-emerald-100 text-sm mb-5">+50 EXP · Discipline +1</p>
            <button
              onClick={() => setWon(false)}
              className="bg-white text-emerald-600 font-bold px-6 py-2.5 rounded-2xl text-sm"
            >
              Lanjut
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active battle */}
      {!won && active && (
        <motion.div
          animate={shaking ? {x:[0,-8,8,-6,6,-4,4,0]} : {x:0}}
          transition={{duration:0.35}}
          className="bg-red-600 rounded-3xl p-6 text-center relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-10 pointer-events-none"
            style={{backgroundImage:"radial-gradient(circle at 50% 30%,#fff 0%,transparent 60%)"}}/>

          <p className="text-red-200 text-xs uppercase tracking-widest mb-2">Battle Aktif</p>
          <h2 className="text-white font-black text-3xl mb-1">{active.name}</h2>

          {/* Damage popup */}
          <AnimatePresence>
            {lastDmg !== null && (
              <motion.p
                key={lastDmg + Date.now()}
                initial={{opacity:1,y:0,scale:1.2}}
                animate={{opacity:0,y:-40,scale:1}}
                exit={{opacity:0}}
                transition={{duration:0.8}}
                className="text-yellow-300 font-black text-2xl absolute top-6 right-8 pointer-events-none"
              >
                -{lastDmg}
              </motion.p>
            )}
          </AnimatePresence>

          {/* HP bar */}
          <div className="bg-red-900/40 rounded-full h-4 overflow-hidden mb-1 mt-4 mx-4">
            <motion.div
              animate={{width:`${hpPct}%`}}
              transition={{duration:0.4, ease:"easeOut"}}
              className={`h-full ${hpColor} rounded-full`}
            />
          </div>
          <p className="text-red-200 text-xs mb-6 tabular-nums font-semibold">
            {active.hp} / {active.max_hp} HP
          </p>

          {/* Attack button — plain button bukan motion.button agar tidak ada pointer-events issue */}
          <button
            type="button"
            onClick={attack}
            disabled={attacking}
            className="bg-white text-red-600 font-black px-10 py-4 rounded-2xl text-base shadow-2xl active:scale-95 transition-transform duration-100 disabled:opacity-60 disabled:cursor-not-allowed select-none"
            style={{WebkitTapHighlightColor:"transparent"}}
          >
            {attacking ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin inline-block"/>
                Menyerang...
              </span>
            ) : "⚔ Serang"}
          </button>

          {/* Enemy flavor */}
          <p className="text-red-300/60 text-xs mt-4">
            Setiap serangan = satu keputusan nyata.
          </p>
        </motion.div>
      )}

      {/* No active battle */}
      {!won && !active && !loading && (
        <Card>
          <div className="text-center py-6">
            <p className="text-4xl mb-3">⚔️</p>
            <p className="text-stone-800 font-bold text-lg mb-1">Siap Bertarung?</p>
            <p className="text-stone-400 text-sm mb-6 max-w-xs mx-auto leading-relaxed">
              Spawn musuh harian. Kalahkan dengan menyelesaikan tindakan nyata.
            </p>
            <button
              type="button"
              onClick={startBattle}
              disabled={starting}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-2xl text-sm transition-colors active:scale-95 duration-100"
              style={{WebkitTapHighlightColor:"transparent"}}
            >
              {starting ? "Spawning..." : "⚔ Mulai Battle Harian"}
            </button>
          </div>
        </Card>
      )}

      {loading && <Sk cls="h-48"/>}

      {/* Battle history */}
      {!loading && battles.length > 0 && (
        <Card>
          <h3 className="font-bold text-stone-800 text-sm mb-3">Riwayat Battle</h3>
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {battles.slice(0,10).map(b => (
                <motion.div
                  key={b.id}
                  layout
                  initial={{opacity:0, x:-8}}
                  animate={{opacity:1, x:0}}
                  exit={{opacity:0, x:16, height:0, marginBottom:0}}
                  transition={{duration:0.22}}
                  className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-700 text-sm font-medium truncate">{b.name}</p>
                    <p className="text-stone-400 text-xs">{b.date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      b.defeated
                        ? "bg-emerald-100 text-emerald-600"
                        : b.date === today()
                          ? "bg-red-100 text-red-500"
                          : "bg-stone-100 text-stone-400"
                    }`}>
                      {b.defeated ? "Defeated" : b.date === today() ? "Ongoing" : "Escaped"}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await apiDelete(b.id, uid);
                        if (ok) setBattles(p => p.filter(x => x.id !== b.id));
                      }}
                      className="text-stone-200 hover:text-red-400 text-xs px-1.5 py-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SKILL TREE
// ════════════════════════════════════════════════════════════
function SkillView({uid}:{uid:string}) {
  const [skills,setSkills]=useState<SkillEntry[]>([]);
  const [logs,setLogs]=useState<SkillLog[]>([]);
  const [loading,setLoading]=useState(true);
  const [name,setName]=useState(""); const [desc,setDesc]=useState(""); const [adding,setAdding]=useState(false);
  const [logMin,setLogMin]=useState(""); const [logNote,setLogNote]=useState("");
  const [loggingId,setLoggingId]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    const [sR,lR]=await Promise.all([apiGet(uid,"skill"),apiGet(uid,"skill")]);
    setSkills(sR.filter(r=>r.action==="create"||r.action==="update").map(r=>({
      id:r.id,name:String(r.data.name??""),level:Number(r.data.level??1),
      total_minutes:Number(r.data.total_minutes??0),
      is_active:Boolean(r.data.is_active??false),
      prerequisites:(r.data.prerequisites as string[])||[],
      description:r.data.description as string|undefined})));
    setLogs(lR.filter(r=>r.action==="log").map(r=>({
      id:r.id,skill_id:String(r.data.skill_id??""),skill_name:String(r.data.skill_name??""),
      duration_minutes:Number(r.data.duration_minutes??0),
      note:r.data.note as string|undefined,date:String(r.data.date??r.created_at.slice(0,10))})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function addSkill(){
    if(!name.trim()) return; setAdding(true);
    const hasActive=skills.some(s=>s.is_active);
    const row=await apiPost(uid,"skill","create",{name:name.trim(),description:desc.trim(),level:1,total_minutes:0,is_active:!hasActive,prerequisites:[]});
    if(row) setSkills(p=>[{id:row.id,name:name.trim(),description:desc.trim(),level:1,total_minutes:0,is_active:!hasActive,prerequisites:[]},...p]);
    setName(""); setDesc(""); setAdding(false);
  }

  async function setActive(skill:SkillEntry){
    // Deactivate all, activate selected
    await Promise.all(skills.filter(s=>s.is_active&&s.id!==skill.id).map(s=>apiPatch(s.id,uid,"update",{...s,is_active:false})));
    await apiPatch(skill.id,uid,"update",{...skill,is_active:true});
    setSkills(p=>p.map(s=>({...s,is_active:s.id===skill.id})));
  }

  async function logSession(){
    const active=skills.find(s=>s.is_active);
    if(!active||!logMin) return;
    const mins=Number(logMin);
    const newMins=active.total_minutes+mins;
    const newLevel=Math.min(10,Math.floor(newMins/120)+1);
    await apiPost(uid,"skill","log",{skill_id:active.id,skill_name:active.name,duration_minutes:mins,note:logNote.trim()||null,date:today()},15);
    await apiPatch(active.id,uid,"update",{...active,total_minutes:newMins,level:newLevel});
    setSkills(p=>p.map(s=>s.id===active.id?{...s,total_minutes:newMins,level:newLevel}:s));
    setLogs(prev=>[{id:Date.now().toString(),skill_id:active.id,skill_name:active.name,duration_minutes:mins,note:logNote,date:today()},...prev]);
    setLogMin(""); setLogNote("");
  }

  const active=skills.find(s=>s.is_active);

  return (
    <div className="space-y-5">
      {/* Active skill */}
      {active&&(
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-400"/>
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Skill Aktif</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <div><p className="text-stone-800 font-black text-lg">{active.name}</p>
              <p className="text-stone-400 text-xs">Level {active.level}/10 · {active.total_minutes} menit total</p></div>
            <span className="text-violet-600 font-black text-2xl">Lv{active.level}</span>
          </div>
          <div className="bg-stone-100 rounded-full h-2 overflow-hidden mb-4">
            <motion.div animate={{width:`${((active.total_minutes%120)/120)*100}%`}} transition={{duration:0.8}}
              className="h-full bg-violet-500 rounded-full"/>
          </div>
          <h4 className="text-stone-500 text-xs font-semibold mb-2">Log Sesi</h4>
          <div className="flex gap-2">
            <Input value={logMin} onChange={setLogMin} placeholder="Durasi (menit)" type="number" className="w-28"/>
            <Input value={logNote} onChange={setLogNote} placeholder="Catatan sesi..."/>
            <Btn onClick={logSession} disabled={!logMin}>+</Btn>
          </div>
        </Card>
      )}

      {/* Add skill */}
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Tambah Skill</h3>
        <div className="space-y-2">
          <Input value={name} onChange={setName} placeholder="Nama skill (e.g. TypeScript, Memasak)..."/>
          <Input value={desc} onChange={setDesc} placeholder="Deskripsi singkat..."/>
          <Btn onClick={addSkill} disabled={adding||!name.trim()} className="w-full">{adding?"...":"+ Tambah"}</Btn>
        </div>
      </Card>

      {/* Skill list */}
      {loading?<div className="space-y-2"><Sk cls="h-16"/><Sk cls="h-16"/></div>
      :skills.length===0?<Empty icon="✦" text="Belum ada skill. Mulai dengan satu skill aktif."/>
      :<Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Skill Tree</h3>
        <div className="space-y-2">
          {skills.map(s=>(
            <div key={s.id} className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${s.is_active?"border-violet-200 bg-violet-50":"border-stone-100 bg-stone-50"}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-stone-800 text-sm font-semibold">{s.name}</p>
                  {s.is_active&&<span className="text-xs bg-violet-600 text-white px-1.5 py-0.5 rounded-md">Aktif</span>}
                </div>
                <p className="text-stone-400 text-xs">Lv {s.level}/10 · {s.total_minutes} mnt</p>
              </div>
              {!s.is_active&&<Btn onClick={()=>setActive(s)} variant="secondary" small>Aktifkan</Btn>}
            </div>
          ))}
        </div>
      </Card>}

      {/* Session logs */}
      {logs.length>0&&(
        <Card>
          <h3 className="font-bold text-stone-800 text-sm mb-3">Log Sesi Terbaru</h3>
          <div className="space-y-2">
            {logs.slice(0,8).map(l=>(
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                <div><p className="text-stone-700 text-sm">{l.skill_name}</p>
                  <p className="text-stone-400 text-xs">{l.date}{l.note?` · ${l.note}`:""}</p></div>
                <span className="text-violet-500 font-semibold text-sm tabular-nums">{l.duration_minutes}m</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// HABIT + TASK
// ════════════════════════════════════════════════════════════
function HabitView({uid}:{uid:string}) {
  const [habits,setHabits]=useState<Habit[]>([]);
  const [tasks,setTasks]=useState<Task[]>([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<"habit"|"task">("habit");
  const [input,setInput]=useState(""); const [priority,setPriority]=useState<Task["priority"]>("medium");
  const [due,setDue]=useState(""); const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const [hR,tR]=await Promise.all([apiGet(uid,"habit"),apiGet(uid,"task")]);
    setHabits(hR.map(r=>({id:r.id,title:String(r.data.title??""),streak:Number(r.data.streak??0),
      frequency:"daily",last_checkin:r.data.last_checkin as string|undefined,
      done_today:isToday(r.data.last_checkin as string|undefined)})));
    setTasks(tR.map(r=>({id:r.id,title:String(r.data.title??""),
      priority:(r.data.priority??"medium") as Task["priority"],
      done:Boolean(r.data.done??false),due:r.data.due as string|undefined})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function addHabit(){
    if(!input.trim()) return; setAdding(true);
    const row=await apiPost(uid,"habit","create",{title:input.trim(),streak:0,frequency:"daily",last_checkin:null});
    if(row) setHabits(p=>[{id:row.id,title:input.trim(),streak:0,frequency:"daily",done_today:false},...p]);
    setInput(""); setAdding(false);
  }
  async function addTask(){
    if(!input.trim()) return; setAdding(true);
    const row=await apiPost(uid,"task","create",{title:input.trim(),priority,done:false,due:due||null});
    if(row) setTasks(p=>[{id:row.id,title:input.trim(),priority,done:false,due:due||undefined},...p]);
    setInput(""); setDue(""); setAdding(false);
  }
  async function checkin(h:Habit){
    if(h.done_today) return;
    const newStreak=h.streak+1;
    await apiPatch(h.id,uid,"checkin",{...h,streak:newStreak,last_checkin:new Date().toISOString()});
    setHabits(p=>p.map(x=>x.id===h.id?{...x,streak:newStreak,done_today:true}:x));
  }
  async function toggleTask(t:Task){
    await apiPatch(t.id,uid,t.done?"update":"complete",{...t,done:!t.done});
    setTasks(p=>p.map(x=>x.id===t.id?{...x,done:!x.done}:x));
  }
  async function delHabit(id:string){if(await apiDelete(id,uid)) setHabits(p=>p.filter(x=>x.id!==id));}
  async function delTask(id:string){if(await apiDelete(id,uid)) setTasks(p=>p.filter(x=>x.id!==id));}

  const doneH=habits.filter(h=>h.done_today).length;

  return (
    <div className="space-y-5">
      {/* Tab */}
      <div className="flex gap-2 bg-stone-100 rounded-2xl p-1">
        {(["habit","task"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${tab===t?"bg-white text-stone-800 shadow-sm":"text-stone-400"}`}>
            {t==="habit"?"Habit":"Task"}
          </button>
        ))}
      </div>

      {/* Add */}
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">{tab==="habit"?"Habit Baru":"Task Baru"}</h3>
        <div className="space-y-2">
          <Input value={input} onChange={setInput} placeholder={tab==="habit"?"Nama habit...":"Nama task..."}
            onKeyDown={e=>e.key==="Enter"&&(tab==="habit"?addHabit():addTask())}/>
          {tab==="task"&&(
            <div className="flex gap-2">
              <select value={priority} onChange={e=>setPriority(e.target.value as Task["priority"])}
                className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-600 outline-none">
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">⚪ Low</option>
              </select>
              <Input value={due} onChange={setDue} type="date" className="flex-1"/>
            </div>
          )}
          <Btn onClick={tab==="habit"?addHabit:addTask} disabled={adding||!input.trim()} className="w-full">
            {adding?"...":"+ Tambah"}
          </Btn>
        </div>
      </Card>

      {tab==="habit"&&(
        <>
          {habits.length>0&&(
            <Card>
              <div className="flex justify-between mb-2">
                <span className="text-stone-500 text-sm font-semibold">Hari ini</span>
                <span className="text-stone-400 text-sm">{doneH}/{habits.length}</span>
              </div>
              <div className="bg-stone-100 rounded-full h-2 overflow-hidden">
                <motion.div animate={{width:`${habits.length>0?(doneH/habits.length)*100:0}%`}} transition={{duration:0.5}}
                  className="h-full bg-violet-500 rounded-full"/>
              </div>
            </Card>
          )}
          {loading?<Sk cls="h-32"/>:habits.length===0?<Empty icon="↺" text="Belum ada habit."/>
          :<Card>
            <AnimatePresence>
              {habits.map(h=>(
                <motion.div key={h.id} layout initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-12}}
                  className="flex items-center gap-3 py-2.5 border-b border-stone-100 last:border-0">
                  <button onClick={()=>checkin(h)} disabled={h.done_today}
                    className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${h.done_today?"bg-violet-600 border-violet-600":"border-stone-300 hover:border-violet-400"}`}>
                    {h.done_today&&<span className="text-white text-xs leading-none">✓</span>}
                  </button>
                  <span className={`text-sm flex-1 ${h.done_today?"text-stone-300 line-through":"text-stone-700"}`}>{h.title}</span>
                  <span className="text-xs">🔥</span>
                  <span className="text-xs font-semibold text-stone-400 tabular-nums">{h.streak}</span>
                  <Btn onClick={()=>delHabit(h.id)} variant="ghost" small>✕</Btn>
                </motion.div>
              ))}
            </AnimatePresence>
          </Card>}
        </>
      )}

      {tab==="task"&&(
        loading?<Sk cls="h-32"/>:tasks.length===0?<Empty icon="◻" text="Belum ada task."/>
        :<Card>
          <AnimatePresence>
            {tasks.sort((a,b)=>a.done===b.done?0:a.done?1:-1).map(t=>{
              const d=daysLeft(t.due);
              return(
                <motion.div key={t.id} layout initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-12}}
                  className="flex items-center gap-3 py-2.5 border-b border-stone-100 last:border-0">
                  <button onClick={()=>toggleTask(t)}
                    className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${t.done?"bg-violet-600 border-violet-600":"border-stone-300 hover:border-violet-400"}`}>
                    {t.done&&<span className="text-white text-xs leading-none">✓</span>}
                  </button>
                  <span className={`text-sm flex-1 ${t.done?"text-stone-300 line-through":"text-stone-700"}`}>{t.title}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${statusColor(t.priority)}`}>{t.priority}</span>
                  {d!==null&&<span className={`text-xs ${d<0?"text-red-400":d<2?"text-amber-500":"text-stone-300"}`}>{d<0?"overdue":`${d}d`}</span>}
                  <Btn onClick={()=>delTask(t.id)} variant="ghost" small>✕</Btn>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SLEEP
// ════════════════════════════════════════════════════════════
function SleepView({uid}:{uid:string}) {
  const [entries,setEntries]=useState<SleepEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [sleepAt,setSleepAt]=useState(""); const [wakeAt,setWakeAt]=useState(""); const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"sleep",30);
    setEntries(rows.map(r=>({id:r.id,date:String(r.data.date??r.created_at.slice(0,10)),
      sleep_at:String(r.data.sleep_at??""),wake_at:String(r.data.wake_at??""),
      duration_hours:Number(r.data.duration_hours??0)})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  function calcDur(s:string,w:string){
    if(!s||!w) return 0;
    const [sh,sm]=s.split(":").map(Number); const [wh,wm]=w.split(":").map(Number);
    let d=wh*60+wm-(sh*60+sm); if(d<0) d+=1440;
    return Math.round((d/60)*10)/10;
  }
  async function add(){
    if(!sleepAt||!wakeAt) return; setAdding(true);
    const dur=calcDur(sleepAt,wakeAt);
    const row=await apiPost(uid,"sleep","create",{date:today(),sleep_at:sleepAt,wake_at:wakeAt,duration_hours:dur},10);
    if(row) setEntries(p=>[{id:row.id,date:today(),sleep_at:sleepAt,wake_at:wakeAt,duration_hours:dur},...p]);
    setSleepAt(""); setWakeAt(""); setAdding(false);
  }

  const avg=entries.length>0?Math.round((entries.reduce((a,e)=>a+e.duration_hours,0)/entries.length)*10)/10:0;

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Log Tidur</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div><label className="text-stone-400 text-xs mb-1 block">Jam Tidur</label>
            <Input value={sleepAt} onChange={setSleepAt} type="time"/></div>
          <div><label className="text-stone-400 text-xs mb-1 block">Jam Bangun</label>
            <Input value={wakeAt} onChange={setWakeAt} type="time"/></div>
        </div>
        {sleepAt&&wakeAt&&<p className="text-violet-500 text-xs mb-2">Durasi: {calcDur(sleepAt,wakeAt)} jam</p>}
        <Btn onClick={add} disabled={adding||!sleepAt||!wakeAt} className="w-full">{adding?"Menyimpan...":"Simpan +10 EXP"}</Btn>
      </Card>

      {entries.length>0&&(
        <Card>
          <div className="flex justify-between items-center">
            <div><p className="text-stone-400 text-xs mb-1">Rata-rata ({entries.length} malam)</p>
              <p className={`font-black text-3xl tabular-nums ${avg>=7?"text-emerald-500":avg>=6?"text-amber-500":"text-red-400"}`}>{avg}h</p></div>
            <div className="text-right"><p className="text-stone-400 text-xs mb-1">Target</p>
              <p className="text-stone-500 font-bold text-lg">7–9h</p></div>
          </div>
        </Card>
      )}

      {loading?<Sk cls="h-40"/>:entries.length===0?<Empty icon="◐" text="Belum ada log tidur."/>
      :<Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Riwayat</h3>
        <div className="space-y-2">
          {entries.map(e=>(
            <div key={e.id} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
              <div><p className="text-stone-700 text-sm font-medium">{e.date}</p>
                <p className="text-stone-400 text-xs">{e.sleep_at} → {e.wake_at}</p></div>
              <span className={`font-black text-base tabular-nums ${e.duration_hours>=7?"text-emerald-500":e.duration_hours>=6?"text-amber-500":"text-red-400"}`}>{e.duration_hours}h</span>
            </div>
          ))}
        </div>
      </Card>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MENTAL
// ════════════════════════════════════════════════════════════
function MentalView({uid}:{uid:string}) {
  const [entries,setEntries]=useState<MentalEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [mood,setMood]=useState(5); const [energy,setEnergy]=useState(5); const [stress,setStress]=useState(5);
  const [journal,setJournal]=useState(""); const [adding,setAdding]=useState(false);
  const [checkedToday,setCheckedToday]=useState(false); const [showJournal,setShowJournal]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"mental",30);
    const mapped=rows.map(r=>({id:r.id,date:String(r.data.date??r.created_at.slice(0,10)),
      mood:Number(r.data.mood??5),energy:Number(r.data.energy??5),stress:Number(r.data.stress??5)}));
    setEntries(mapped);
    setCheckedToday(mapped.some(e=>isToday(e.date)));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function checkin(){
    setAdding(true);
    const row=await apiPost(uid,"mental","checkin",{date:today(),mood,energy,stress},5);
    if(row){setEntries(p=>[{id:row.id,date:today(),mood,energy,stress},...p]);setCheckedToday(true);}
    // Journal stored separately (private)
    if(journal.trim()) await apiPost(uid,"mental","log",{date:today(),private_journal:journal.trim(),mood,energy,stress},0);
    setAdding(false);
  }

  const emoji=(v:number)=>v>=8?"😄":v>=6?"🙂":v>=4?"😐":v>=2?"😟":"😞";

  return (
    <div className="space-y-5">
      {!checkedToday&&(
        <Card>
          <h3 className="font-bold text-stone-800 text-sm mb-4">Check-in Hari Ini</h3>
          {[{label:"Mood",val:mood,set:setMood},{label:"Energi",val:energy,set:setEnergy},{label:"Stres",val:stress,set:setStress}].map(({label,val,set})=>(
            <div key={label} className="mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-stone-500 text-sm">{label}</span>
                <span className="text-stone-400 text-sm">{emoji(val)} {val}/10</span>
              </div>
              <input type="range" min={1} max={10} value={val} onChange={e=>set(Number(e.target.value))}
                className="w-full accent-violet-600"/>
            </div>
          ))}
          <button onClick={()=>setShowJournal(!showJournal)}
            className="text-stone-400 text-xs mb-3 hover:text-stone-600 transition-colors">
            {showJournal?"▲ Sembunyikan jurnal privat":"▼ Tambah jurnal privat (tidak masuk gamifikasi)"}
          </button>
          {showJournal&&(
            <textarea value={journal} onChange={e=>setJournal(e.target.value)}
              placeholder="Tulis bebas di sini. Ini privat, tidak dibaca AI, tidak menghasilkan EXP." rows={4}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-700 placeholder-stone-300 outline-none resize-none mb-3"/>
          )}
          <Btn onClick={checkin} disabled={adding} className="w-full">{adding?"Menyimpan...":"Simpan Check-in +5 EXP"}</Btn>
        </Card>
      )}
      {checkedToday&&<div className="bg-violet-50 border border-violet-100 rounded-3xl p-4 text-center">
        <p className="text-violet-600 font-semibold text-sm">✓ Sudah check-in hari ini</p>
      </div>}

      {loading?<Sk cls="h-40"/>:entries.length===0?<Empty icon="◯" text="Belum ada data mental."/>
      :<Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Riwayat 30 Hari</h3>
        <div className="space-y-2">
          {entries.map(e=>(
            <div key={e.id} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
              <span className="text-stone-400 text-xs w-20 shrink-0">{e.date}</span>
              <div className="flex gap-3 text-xs text-stone-500">
                <span>😄 {e.mood}</span><span>⚡ {e.energy}</span><span>🌡 {e.stress}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// FINANCE
// ════════════════════════════════════════════════════════════
function FinanceView({uid}:{uid:string}) {
  const [entries,setEntries]=useState<FinanceEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [type,setType]=useState<"income"|"expense">("expense");
  const [amount,setAmount]=useState(""); const [category,setCategory]=useState("");
  const [note,setNote]=useState(""); const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"finance",100);
    setEntries(rows.map(r=>({id:r.id,type:(r.data.type??"expense") as "income"|"expense",
      amount:Number(r.data.amount??0),category:String(r.data.category??""),
      note:r.data.note as string|undefined,date:String(r.data.date??r.created_at.slice(0,10))})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!amount||!category.trim()) return; setAdding(true);
    const row=await apiPost(uid,"finance","create",{type,amount:Number(amount),category:category.trim(),note:note.trim()||null,date:today()},3);
    if(row) setEntries(p=>[{id:row.id,type,amount:Number(amount),category:category.trim(),note:note.trim(),date:today()},...p]);
    setAmount(""); setCategory(""); setNote(""); setAdding(false);
  }
  async function del(id:string){if(await apiDelete(id,uid)) setEntries(p=>p.filter(x=>x.id!==id));}

  const totalIn=entries.filter(e=>e.type==="income").reduce((a,e)=>a+e.amount,0);
  const totalOut=entries.filter(e=>e.type==="expense").reduce((a,e)=>a+e.amount,0);
  const balance=totalIn-totalOut;

  return (
    <div className="space-y-5">
      {entries.length>0&&(
        <Card>
          <p className="text-stone-400 text-xs mb-1">Saldo</p>
          <p className={`font-black text-3xl tabular-nums mb-3 ${balance>=0?"text-emerald-500":"text-red-400"}`}>
            {balance<0?"-":""}{fmtIDR(balance)}
          </p>
          <div className="flex gap-4">
            <div><p className="text-stone-400 text-xs">Masuk</p>
              <p className="text-emerald-500 font-semibold text-sm">+{fmtIDR(totalIn)}</p></div>
            <div><p className="text-stone-400 text-xs">Keluar</p>
              <p className="text-red-400 font-semibold text-sm">-{fmtIDR(totalOut)}</p></div>
          </div>
        </Card>
      )}
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Catat Transaksi</h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            {(["expense","income"] as const).map(t=>(
              <button key={t} onClick={()=>setType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${type===t?(t==="expense"?"bg-red-100 text-red-500":"bg-emerald-100 text-emerald-600"):"bg-stone-50 text-stone-400 hover:bg-stone-100"}`}>
                {t==="expense"?"Pengeluaran":"Pemasukan"}
              </button>
            ))}
          </div>
          <Input value={amount} onChange={setAmount} placeholder="Jumlah (Rp)" type="number"/>
          <Input value={category} onChange={setCategory} placeholder="Kategori (makan, transport, gaji...)"/>
          <Input value={note} onChange={setNote} placeholder="Catatan (opsional)"/>
          <Btn onClick={add} disabled={adding||!amount||!category.trim()} className="w-full">{adding?"Menyimpan...":"Catat"}</Btn>
        </div>
      </Card>
      {loading?<Sk cls="h-40"/>:entries.length===0?<Empty icon="◇" text="Belum ada transaksi."/>
      :<Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Riwayat</h3>
        <div className="space-y-2">
          {entries.slice(0,30).map(e=>(
            <div key={e.id} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0 group">
              <div className="flex-1 min-w-0">
                <p className="text-stone-700 text-sm font-medium capitalize truncate">{e.category}</p>
                <p className="text-stone-400 text-xs">{e.date}{e.note?` · ${e.note}`:""}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className={`font-semibold text-sm tabular-nums ${e.type==="income"?"text-emerald-500":"text-red-400"}`}>
                  {e.type==="income"?"+":"-"}{fmtIDR(e.amount)}
                </span>
                <Btn onClick={()=>del(e.id)} variant="ghost" small className="opacity-0 group-hover:opacity-100">✕</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PMO
// ════════════════════════════════════════════════════════════
function PmoView({uid}:{uid:string}) {
  const [pmo,setPmo]=useState<PmoData|null>(null); const [pmoId,setPmoId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true); const [confirming,setConfirming]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"pmo");
    if(rows[0]){setPmoId(rows[0].id);setPmo(rows[0].data as unknown as PmoData);}
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function start(){
    const d:PmoData={current_day:0,streak_start:today(),is_broken:false,milestone_reached:[]};
    const row=await apiPost(uid,"pmo","create",d as unknown as Record<string,unknown>,0);
    if(row){setPmoId(row.id);setPmo(d);}
  }
  async function checkin(){
    if(!pmo||!pmoId) return;
    const newDay=pmo.current_day+1;
    const newM=[...pmo.milestone_reached];
    if(PMO_MILESTONES.includes(newDay)&&!newM.includes(newDay)) newM.push(newDay);
    const exp=PMO_MILESTONES.includes(newDay)?newDay*10:5;
    const updated:PmoData={...pmo,current_day:newDay,milestone_reached:newM};
    await apiPatch(pmoId,uid,"checkin",updated as unknown as Record<string,unknown>);
    if(exp>5) await apiPost(uid,"pmo","log",{milestone:newDay,exp},exp);
    setPmo(updated);
  }
  async function reset(){
    if(!pmoId||!pmo) return;
    const r:PmoData={current_day:0,streak_start:today(),is_broken:true,milestone_reached:[]};
    await apiPatch(pmoId,uid,"reset",r as unknown as Record<string,unknown>);
    setPmo(r); setConfirming(false);
  }

  if(loading) return <div className="space-y-4"><Sk cls="h-48"/><Sk cls="h-64"/></div>;
  if(!pmo) return (
    <div className="space-y-5">
      <Card className="text-center py-8">
        <p className="text-stone-800 font-black text-xl mb-2">Mulai dari Day 0</p>
        <p className="text-stone-400 text-sm leading-relaxed mb-6 max-w-xs mx-auto">1200 hari. Tidak ada override. Tidak ada jalan pintas.</p>
        <Btn onClick={start} className="mx-auto">Mulai Sekarang</Btn>
      </Card>
      <div className="bg-red-50 border border-red-100 rounded-3xl p-4">
        <p className="text-red-400 text-xs font-semibold mb-1">⚠ Aturan Sistem</p>
        <p className="text-red-400/70 text-xs leading-relaxed">Streak putus → reset ke Day 0. Tidak ada negosiasi.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-violet-600 rounded-3xl p-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{backgroundImage:"radial-gradient(circle at 50% 50%,#fff 0%,transparent 60%)"}}/>
        <p className="text-violet-200 text-xs uppercase tracking-widest mb-2">PMO Tracker</p>
        <motion.div key={pmo.current_day} initial={{scale:0.8,opacity:0}} animate={{scale:1,opacity:1}}
          className="text-white font-black text-8xl tabular-nums mb-1 leading-none">{pmo.current_day}</motion.div>
        <p className="text-violet-200 text-sm mb-4">hari berjalan</p>
        <div className="bg-violet-500/40 rounded-full h-2 overflow-hidden mb-1">
          <motion.div initial={{width:0}} animate={{width:`${(pmo.current_day/1200)*100}%`}}
            transition={{duration:1.2,ease:[0.22,1,0.36,1]}} className="h-full bg-white/80 rounded-full"/>
        </div>
        <p className="text-violet-200/60 text-xs tabular-nums mb-0">{pmo.current_day} / 1200</p>
      </div>

      <div className="flex gap-2">
        <Btn onClick={checkin} className="flex-1">Check-in Hari Ini</Btn>
        <Btn onClick={()=>setConfirming(true)} variant="danger">Reset</Btn>
      </div>

      <AnimatePresence>
        {confirming&&(
          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            className="bg-red-50 border border-red-200 rounded-3xl p-5">
            <p className="text-red-500 font-bold text-sm mb-1">Reset ke Day 0?</p>
            <p className="text-red-400/70 text-xs mb-4">Semua progress hilang. Tidak bisa di-undo.</p>
            <div className="flex gap-2">
              <Btn onClick={reset} variant="danger" className="flex-1">Ya, Reset</Btn>
              <Btn onClick={()=>setConfirming(false)} variant="secondary" className="flex-1">Batal</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-4">Milestone</h3>
        <div className="space-y-2">
          {PMO_MILESTONES.map(m=>{const reached=pmo.current_day>=m;return(
            <div key={m} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${reached?"bg-violet-600":"bg-stone-100"}`}>
                {reached&&<span className="text-white text-xs leading-none">✓</span>}
              </div>
              <span className={`text-sm flex-1 ${reached?"text-stone-700 font-medium":"text-stone-300"}`}>Day {m}</span>
              <span className="text-violet-400 text-xs font-semibold">+{m*10} EXP</span>
            </div>
          );})}
        </div>
      </Card>
      <div className="bg-red-50 border border-red-100 rounded-3xl p-4">
        <p className="text-red-400 text-xs font-semibold mb-1">⚠ Aturan Sistem</p>
        <p className="text-red-400/70 text-xs leading-relaxed">Streak putus → reset ke Day 0. Tidak ada override. Tidak ada negosiasi.</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SOCIAL OS
// ════════════════════════════════════════════════════════════
function SocialView({uid}:{uid:string}) {
  const [links,setLinks]=useState<SocialLink[]>([]);
  const [logs,setLogs]=useState<SocialLog[]>([]);
  const [loading,setLoading]=useState(true);
  const [name,setName]=useState(""); const [adding,setAdding]=useState(false);
  const [selected,setSelected]=useState<SocialLink|null>(null);
  const [logType,setLogType]=useState("tatap muka"); const [logTopic,setLogTopic]=useState(""); const [logNote,setLogNote]=useState("");
  const [logging,setLogging]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const [lR,logR]=await Promise.all([apiGet(uid,"social"),apiGet(uid,"social",50)]);
    setLinks(lR.filter(r=>r.action==="create"||r.action==="update").map(r=>({
      id:r.id,name:String(r.data.name??""),level:Number(r.data.level??1),
      last_interaction:r.data.last_interaction as string|undefined,
      total_interactions:Number(r.data.total_interactions??0)})));
    setLogs(logR.filter(r=>r.action==="log").map(r=>({
      id:r.id,link_id:String(r.data.link_id??""),link_name:String(r.data.link_name??""),
      type:String(r.data.type??""),topic:String(r.data.topic??""),
      note:r.data.note as string|undefined,date:String(r.data.date??r.created_at.slice(0,10))})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function addLink(){
    if(!name.trim()) return; setAdding(true);
    const row=await apiPost(uid,"social","create",{name:name.trim(),level:1,total_interactions:0});
    if(row) setLinks(p=>[{id:row.id,name:name.trim(),level:1,total_interactions:0},...p]);
    setName(""); setAdding(false);
  }
  async function logInteraction(){
    if(!selected||!logTopic.trim()) return; setLogging(true);
    const newTotal=selected.total_interactions+1;
    const newLevel=Math.min(10,Math.floor(newTotal/5)+1);
    await apiPost(uid,"social","log",{link_id:selected.id,link_name:selected.name,type:logType,topic:logTopic.trim(),note:logNote.trim()||null,date:today()},8);
    await apiPatch(selected.id,uid,"update",{...selected,total_interactions:newTotal,level:newLevel,last_interaction:today()});
    setLinks(p=>p.map(l=>l.id===selected.id?{...l,total_interactions:newTotal,level:newLevel,last_interaction:today()}:l));
    setLogs(p=>[{id:Date.now().toString(),link_id:selected.id,link_name:selected.name,type:logType,topic:logTopic.trim(),note:logNote,date:today()},...p]);
    setSelected(null); setLogTopic(""); setLogNote(""); setLogging(false);
  }

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Social Link Baru</h3>
        <div className="flex gap-2">
          <Input value={name} onChange={setName} placeholder="Nama orang..." onKeyDown={e=>e.key==="Enter"&&addLink()}/>
          <Btn onClick={addLink} disabled={adding||!name.trim()}>{adding?"...":"+"}</Btn>
        </div>
      </Card>

      {selected&&(
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-stone-800 text-sm">Log Interaksi · {selected.name}</h3>
            <Btn onClick={()=>setSelected(null)} variant="ghost" small>✕</Btn>
          </div>
          <div className="space-y-2">
            <select value={logType} onChange={e=>setLogType(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-600 outline-none">
              {["tatap muka","pesan","telepon","video call","social media"].map(t=><option key={t}>{t}</option>)}
            </select>
            <Input value={logTopic} onChange={setLogTopic} placeholder="Topik yang dibicarakan..."/>
            <Input value={logNote} onChange={setLogNote} placeholder="Catatan singkat..."/>
            <Btn onClick={logInteraction} disabled={logging||!logTopic.trim()} className="w-full">{logging?"...":"Simpan +8 EXP"}</Btn>
          </div>
        </Card>
      )}

      {loading?<Sk cls="h-40"/>:links.length===0?<Empty icon="⬡" text="Belum ada social link."/>
      :<Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Social Links</h3>
        <div className="space-y-2">
          {links.sort((a,b)=>b.total_interactions-a.total_interactions).map(l=>(
            <div key={l.id} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                <span className="text-violet-600 text-xs font-bold">{l.name[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1">
                <p className="text-stone-700 text-sm font-medium">{l.name}</p>
                <p className="text-stone-400 text-xs">Lv {l.level} · {l.total_interactions} interaksi{l.last_interaction?` · ${l.last_interaction}`:""}</p>
              </div>
              <Btn onClick={()=>setSelected(l)} variant="secondary" small>+ Log</Btn>
            </div>
          ))}
        </div>
      </Card>}

      {logs.length>0&&(
        <Card>
          <h3 className="font-bold text-stone-800 text-sm mb-3">Log Terbaru</h3>
          <div className="space-y-2">
            {logs.slice(0,10).map(l=>(
              <div key={l.id} className="py-2 border-b border-stone-100 last:border-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-stone-700 text-sm font-medium">{l.link_name}</span>
                  <span className="text-stone-300 text-xs">·</span>
                  <span className="text-stone-400 text-xs">{l.type}</span>
                  <span className="text-stone-300 text-xs ml-auto">{l.date}</span>
                </div>
                <p className="text-stone-500 text-xs">{l.topic}{l.note?` — ${l.note}`:""}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SCHOOL HUB
// ════════════════════════════════════════════════════════════
function SchoolView({uid}:{uid:string}) {
  const [items,setItems]=useState<SchoolItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<SchoolItem["type"]>("assignment");
  const [title,setTitle]=useState(""); const [subject,setSubject]=useState("");
  const [due,setDue]=useState(""); const [content,setContent]=useState(""); const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"school",100);
    setItems(rows.map(r=>({id:r.id,type:(r.data.type??"assignment") as SchoolItem["type"],
      title:String(r.data.title??""),due:r.data.due as string|undefined,
      status:(r.data.status??"todo") as SchoolItem["status"],
      subject:r.data.subject as string|undefined,content:r.data.content as string|undefined})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!title.trim()) return; setAdding(true);
    const row=await apiPost(uid,"school","create",{type:tab,title:title.trim(),subject:subject.trim()||null,due:due||null,status:"todo",content:content.trim()||null},5);
    if(row) setItems(p=>[{id:row.id,type:tab,title:title.trim(),due:due||undefined,status:"todo",subject:subject.trim()||undefined,content:content.trim()||undefined},...p]);
    setTitle(""); setSubject(""); setDue(""); setContent(""); setAdding(false);
  }
  async function toggleDone(item:SchoolItem){
    const status=item.status==="done"?"todo":"done";
    await apiPatch(item.id,uid,status==="done"?"complete":"update",{...item,status});
    setItems(p=>p.map(x=>x.id===item.id?{...x,status}:x));
  }
  async function del(id:string){if(await apiDelete(id,uid)) setItems(p=>p.filter(x=>x.id!==id));}

  const tabs:SchoolItem["type"][] = ["assignment","exam","goal","note"];
  const filtered=items.filter(i=>i.type===tab);

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 bg-stone-100 rounded-2xl p-1">
        {tabs.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all capitalize ${tab===t?"bg-white text-stone-800 shadow-sm":"text-stone-400"}`}>
            {t}
          </button>
        ))}
      </div>
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3 capitalize">{tab} Baru</h3>
        <div className="space-y-2">
          <Input value={title} onChange={setTitle} placeholder="Judul..."/>
          {(tab==="assignment"||tab==="exam")&&<Input value={subject} onChange={setSubject} placeholder="Mata pelajaran/kuliah..."/>}
          {(tab==="assignment"||tab==="exam")&&<Input value={due} onChange={setDue} type="date"/>}
          {(tab==="note"||tab==="goal")&&(
            <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder={tab==="goal"?"Detail goal...":"Isi catatan..."} rows={3}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-700 placeholder-stone-300 outline-none resize-none"/>
          )}
          <Btn onClick={add} disabled={adding||!title.trim()} className="w-full">{adding?"...":"+ Tambah"}</Btn>
        </div>
      </Card>
      {loading?<Sk cls="h-40"/>:filtered.length===0?<Empty icon="◫" text={`Belum ada ${tab}.`}/>
      :<Card>
        <AnimatePresence>
          {filtered.map(item=>{const d=daysLeft(item.due);return(
            <motion.div key={item.id} layout initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-12}}
              className="flex items-start gap-3 py-3 border-b border-stone-100 last:border-0">
              {(tab==="assignment"||tab==="exam"||tab==="goal")&&(
                <button onClick={()=>toggleDone(item)}
                  className={`w-5 h-5 mt-0.5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${item.status==="done"?"bg-violet-600 border-violet-600":"border-stone-300 hover:border-violet-400"}`}>
                  {item.status==="done"&&<span className="text-white text-xs leading-none">✓</span>}
                </button>
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${item.status==="done"?"line-through text-stone-300":"text-stone-700"}`}>{item.title}</p>
                {item.subject&&<p className="text-stone-400 text-xs">{item.subject}</p>}
                {item.content&&<p className="text-stone-400 text-xs mt-1 line-clamp-2">{item.content}</p>}
                {d!==null&&<p className={`text-xs mt-1 ${d<0?"text-red-400":d<3?"text-amber-500":"text-stone-300"}`}>{d<0?"overdue":`${d}d lagi`}</p>}
              </div>
              <Btn onClick={()=>del(item.id)} variant="ghost" small>✕</Btn>
            </motion.div>
          );})}
        </AnimatePresence>
      </Card>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// BOOK / LITERACY
// ════════════════════════════════════════════════════════════
function BookView({uid}:{uid:string}) {
  const [books,setBooks]=useState<BookEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [title,setTitle]=useState(""); const [author,setAuthor]=useState("");
  const [type,setType]=useState<BookEntry["type"]>("book");
  const [status,setStatus]=useState<BookEntry["status"]>("want");
  const [review,setReview]=useState(""); const [adding,setAdding]=useState(false);
  const [reviewingId,setReviewingId]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"book",100);
    setBooks(rows.map(r=>({id:r.id,title:String(r.data.title??""),author:r.data.author as string|undefined,
      type:(r.data.type??"book") as BookEntry["type"],status:(r.data.status??"want") as BookEntry["status"],
      review:r.data.review as string|undefined})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!title.trim()) return; setAdding(true);
    const row=await apiPost(uid,"book","create",{title:title.trim(),author:author.trim()||null,type,status},3);
    if(row) setBooks(p=>[{id:row.id,title:title.trim(),author:author.trim()||undefined,type,status},...p]);
    setTitle(""); setAuthor(""); setAdding(false);
  }
  async function updateStatus(b:BookEntry,newStatus:BookEntry["status"]){
    const exp=newStatus==="done"?40:2;
    await apiPatch(b.id,uid,newStatus==="done"?"complete":"update",{...b,status:newStatus});
    setBooks(p=>p.map(x=>x.id===b.id?{...x,status:newStatus}:x));
  }
  async function saveReview(b:BookEntry){
    await apiPatch(b.id,uid,"update",{...b,review:review.trim()});
    setBooks(p=>p.map(x=>x.id===b.id?{...x,review:review.trim()}:x));
    setReviewingId(null); setReview("");
  }
  async function del(id:string){if(await apiDelete(id,uid)) setBooks(p=>p.filter(x=>x.id!==id));}

  const STATUS_ORDER:BookEntry["status"][] = ["reading","want","done","dropped"];

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Tambah Buku/Konten</h3>
        <div className="space-y-2">
          <Input value={title} onChange={setTitle} placeholder="Judul..."/>
          <Input value={author} onChange={setAuthor} placeholder="Penulis/Sumber (opsional)"/>
          <div className="flex gap-2">
            <select value={type} onChange={e=>setType(e.target.value as BookEntry["type"])}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-600 outline-none">
              <option value="book">📚 Buku</option>
              <option value="article">📄 Artikel</option>
              <option value="paper">🔬 Paper</option>
            </select>
            <select value={status} onChange={e=>setStatus(e.target.value as BookEntry["status"])}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-600 outline-none">
              <option value="want">Want</option>
              <option value="reading">Reading</option>
              <option value="done">Done</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>
          <Btn onClick={add} disabled={adding||!title.trim()} className="w-full">{adding?"...":"+ Tambah"}</Btn>
        </div>
      </Card>
      {loading?<Sk cls="h-40"/>:books.length===0?<Empty icon="◪" text="Belum ada buku atau konten."/>
      :STATUS_ORDER.map(s=>{const filtered=books.filter(b=>b.status===s);return filtered.length>0&&(
        <Card key={s}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(s)}`}>{s}</span>
            <span className="text-stone-300 text-xs">{filtered.length}</span>
          </div>
          <div className="space-y-3">
            {filtered.map(b=>(
              <div key={b.id}>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-stone-700 text-sm font-medium">{b.title}</p>
                    {b.author&&<p className="text-stone-400 text-xs">{b.author} · {b.type}</p>}
                    {b.review&&<p className="text-stone-400 text-xs mt-1 italic">"{b.review}"</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {s==="reading"&&<Btn onClick={()=>updateStatus(b,"done")} variant="secondary" small>Done</Btn>}
                    {s==="done"&&!b.review&&<Btn onClick={()=>{setReviewingId(b.id);setReview("");}} variant="secondary" small>Review</Btn>}
                    <Btn onClick={()=>del(b.id)} variant="ghost" small>✕</Btn>
                  </div>
                </div>
                {reviewingId===b.id&&(
                  <div className="mt-2 space-y-2">
                    <textarea value={review} onChange={e=>setReview(e.target.value)} placeholder="Tulis review singkat..." rows={2}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-700 placeholder-stone-300 outline-none resize-none"/>
                    <div className="flex gap-2">
                      <Btn onClick={()=>saveReview(b)} small>Simpan</Btn>
                      <Btn onClick={()=>setReviewingId(null)} variant="ghost" small>Batal</Btn>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      );})}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ANIME / MANGA
// ════════════════════════════════════════════════════════════
function AnimeView({uid}:{uid:string}) {
  const [entries,setEntries]=useState<AnimeEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [title,setTitle]=useState(""); const [type,setType]=useState<AnimeEntry["type"]>("anime");
  const [status,setStatus]=useState<AnimeEntry["status"]>("plan");
  const [total,setTotal]=useState(""); const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"anime",100);
    setEntries(rows.map(r=>({id:r.id,title:String(r.data.title??""),type:(r.data.type??"anime") as AnimeEntry["type"],
      status:(r.data.status??"plan") as AnimeEntry["status"],progress:Number(r.data.progress??0),
      total:r.data.total as number|undefined})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!title.trim()) return; setAdding(true);
    const row=await apiPost(uid,"anime","create",{title:title.trim(),type,status,progress:0,total:total?Number(total):null},2);
    if(row) setEntries(p=>[{id:row.id,title:title.trim(),type,status,progress:0,total:total?Number(total):undefined},...p]);
    setTitle(""); setTotal(""); setAdding(false);
  }
  async function updateProgress(e:AnimeEntry,delta:number){
    const newProg=Math.max(0,(e.total?Math.min(e.total,e.progress+delta):e.progress+delta));
    const newStatus=(e.total&&newProg>=e.total)?"completed":e.status;
    await apiPatch(e.id,uid,"update",{...e,progress:newProg,status:newStatus});
    setEntries(p=>p.map(x=>x.id===e.id?{...x,progress:newProg,status:newStatus as AnimeEntry["status"]}:x));
  }
  async function del(id:string){if(await apiDelete(id,uid)) setEntries(p=>p.filter(x=>x.id!==id));}

  const STATUS_GROUPS:AnimeEntry["status"][] = ["watching","reading","plan","onhold","completed","dropped"];

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Tambah Anime/Manga</h3>
        <div className="space-y-2">
          <Input value={title} onChange={setTitle} placeholder="Judul..."/>
          <div className="flex gap-2">
            <select value={type} onChange={e=>setType(e.target.value as AnimeEntry["type"])}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-600 outline-none">
              <option value="anime">Anime</option><option value="manga">Manga</option>
            </select>
            <select value={status} onChange={e=>setStatus(e.target.value as AnimeEntry["status"])}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-600 outline-none">
              <option value="plan">Plan</option><option value="watching">Watching</option>
              <option value="reading">Reading</option><option value="onhold">On Hold</option>
              <option value="completed">Completed</option><option value="dropped">Dropped</option>
            </select>
          </div>
          <Input value={total} onChange={setTotal} placeholder="Total ep/chapter (opsional)" type="number"/>
          <Btn onClick={add} disabled={adding||!title.trim()} className="w-full">{adding?"...":"+ Tambah"}</Btn>
        </div>
      </Card>
      {loading?<Sk cls="h-40"/>:entries.length===0?<Empty icon="◈" text="Belum ada anime atau manga."/>
      :STATUS_GROUPS.map(s=>{const filtered=entries.filter(e=>e.status===s);return filtered.length>0&&(
        <Card key={s}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(s)}`}>{s}</span>
            <span className="text-stone-300 text-xs">{filtered.length}</span>
          </div>
          <div className="space-y-3">
            {filtered.map(e=>(
              <div key={e.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-stone-700 text-sm font-medium">{e.title}</p>
                  <p className="text-stone-400 text-xs">{e.type} · {e.progress}{e.total?`/${e.total}`:""} {e.type==="anime"?"ep":"ch"}</p>
                  {e.total&&<div className="bg-stone-100 rounded-full h-1 mt-1 overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full" style={{width:`${(e.progress/e.total)*100}%`}}/>
                  </div>}
                </div>
                {(s==="watching"||s==="reading")&&(
                  <div className="flex gap-1">
                    <Btn onClick={()=>updateProgress(e,1)} variant="secondary" small>+1</Btn>
                    <Btn onClick={()=>updateProgress(e,-1)} variant="ghost" small>-1</Btn>
                  </div>
                )}
                <Btn onClick={()=>del(e.id)} variant="ghost" small>✕</Btn>
              </div>
            ))}
          </div>
        </Card>
      );})}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// JOB
// ════════════════════════════════════════════════════════════
function JobView({uid}:{uid:string}) {
  const [jobs,setJobs]=useState<JobEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [company,setCompany]=useState(""); const [position,setPosition]=useState("");
  const [status,setStatus]=useState<JobEntry["status"]>("applied");
  const [note,setNote]=useState(""); const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"job",100);
    setJobs(rows.map(r=>({id:r.id,company:String(r.data.company??""),position:String(r.data.position??""),
      status:(r.data.status??"applied") as JobEntry["status"],
      applied_at:String(r.data.applied_at??r.created_at.slice(0,10)),note:r.data.note as string|undefined})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!company.trim()||!position.trim()) return; setAdding(true);
    const row=await apiPost(uid,"job","create",{company:company.trim(),position:position.trim(),status,applied_at:today(),note:note.trim()||null},5);
    if(row) setJobs(p=>[{id:row.id,company:company.trim(),position:position.trim(),status,applied_at:today(),note:note.trim()},...p]);
    setCompany(""); setPosition(""); setNote(""); setAdding(false);
  }
  const PIPELINE:JobEntry["status"][] = ["applied","screening","interview","offer","accepted","rejected"];
  async function advance(j:JobEntry){
    const idx=PIPELINE.indexOf(j.status);
    if(idx>=PIPELINE.length-1) return;
    const next=PIPELINE[idx+1];
    await apiPatch(j.id,uid,"update",{...j,status:next});
    setJobs(p=>p.map(x=>x.id===j.id?{...x,status:next}:x));
  }
  async function del(id:string){if(await apiDelete(id,uid)) setJobs(p=>p.filter(x=>x.id!==id));}

  const total=jobs.length;
  const accepted=jobs.filter(j=>j.status==="accepted").length;
  const rejected=jobs.filter(j=>j.status==="rejected").length;

  return (
    <div className="space-y-5">
      {jobs.length>0&&(
        <Card>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[{label:"Total",val:total,color:"text-stone-700"},{label:"Accepted",val:accepted,color:"text-emerald-500"},{label:"Rejected",val:rejected,color:"text-red-400"}].map(s=>(
              <div key={s.label}><p className={`font-black text-2xl ${s.color}`}>{s.val}</p>
                <p className="text-stone-400 text-xs">{s.label}</p></div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Tambah Lamaran</h3>
        <div className="space-y-2">
          <Input value={company} onChange={setCompany} placeholder="Perusahaan..."/>
          <Input value={position} onChange={setPosition} placeholder="Posisi..."/>
          <select value={status} onChange={e=>setStatus(e.target.value as JobEntry["status"])}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-600 outline-none">
            {PIPELINE.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <Input value={note} onChange={setNote} placeholder="Catatan..."/>
          <Btn onClick={add} disabled={adding||!company.trim()||!position.trim()} className="w-full">{adding?"...":"+ Tambah"}</Btn>
        </div>
      </Card>
      {loading?<Sk cls="h-40"/>:jobs.length===0?<Empty icon="◻" text="Belum ada lamaran."/>
      :<Card>
        <div className="space-y-3">
          {jobs.map(j=>(
            <div key={j.id} className="flex items-start gap-3 py-2 border-b border-stone-100 last:border-0">
              <div className="flex-1">
                <p className="text-stone-800 text-sm font-bold">{j.company}</p>
                <p className="text-stone-500 text-xs">{j.position} · {j.applied_at}</p>
                {j.note&&<p className="text-stone-400 text-xs mt-0.5">{j.note}</p>}
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(j.status)}`}>{j.status}</span>
              </div>
              <div className="flex gap-1 shrink-0">
                {j.status!=="accepted"&&j.status!=="rejected"&&<Btn onClick={()=>advance(j)} variant="secondary" small>→</Btn>}
                <Btn onClick={()=>del(j.id)} variant="ghost" small>✕</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STOCK / OBLIGASI
// ════════════════════════════════════════════════════════════
function StockView({uid}:{uid:string}) {
  const [stocks,setStocks]=useState<StockEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [ticker,setTicker]=useState(""); const [name,setName]=useState("");
  const [type,setType]=useState<StockEntry["type"]>("stock");
  const [buyPrice,setBuyPrice]=useState(""); const [currentPrice,setCurrentPrice]=useState("");
  const [qty,setQty]=useState(""); const [note,setNote]=useState(""); const [adding,setAdding]=useState(false);
  const [editingPrice,setEditingPrice]=useState<string|null>(null); const [newPrice,setNewPrice]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"stock",100);
    setStocks(rows.map(r=>({id:r.id,ticker:String(r.data.ticker??""),name:String(r.data.name??""),
      type:(r.data.type??"stock") as StockEntry["type"],
      buy_price:Number(r.data.buy_price??0),current_price:Number(r.data.current_price??0),
      qty:Number(r.data.qty??0),note:r.data.note as string|undefined})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!ticker.trim()||!buyPrice||!qty) return; setAdding(true);
    const row=await apiPost(uid,"stock","create",{ticker:ticker.trim().toUpperCase(),name:name.trim(),type,buy_price:Number(buyPrice),current_price:Number(currentPrice||buyPrice),qty:Number(qty),note:note.trim()||null},3);
    if(row) setStocks(p=>[{id:row.id,ticker:ticker.trim().toUpperCase(),name:name.trim(),type,buy_price:Number(buyPrice),current_price:Number(currentPrice||buyPrice),qty:Number(qty),note:note.trim()},...p]);
    setTicker(""); setName(""); setBuyPrice(""); setCurrentPrice(""); setQty(""); setNote(""); setAdding(false);
  }
  async function updatePrice(s:StockEntry){
    if(!newPrice) return;
    await apiPatch(s.id,uid,"update",{...s,current_price:Number(newPrice)});
    setStocks(p=>p.map(x=>x.id===s.id?{...x,current_price:Number(newPrice)}:x));
    setEditingPrice(null); setNewPrice("");
  }
  async function del(id:string){if(await apiDelete(id,uid)) setStocks(p=>p.filter(x=>x.id!==id));}

  const totalVal=stocks.reduce((a,s)=>a+s.current_price*s.qty,0);
  const totalCost=stocks.reduce((a,s)=>a+s.buy_price*s.qty,0);
  const totalGL=totalVal-totalCost;

  return (
    <div className="space-y-5">
      {stocks.length>0&&(
        <Card>
          <p className="text-stone-400 text-xs mb-1">Total Portofolio</p>
          <p className="font-black text-3xl text-stone-800 tabular-nums mb-2">{fmtIDR(totalVal)}</p>
          <span className={`text-sm font-semibold ${totalGL>=0?"text-emerald-500":"text-red-400"}`}>
            {totalGL>=0?"+":""}{fmtIDR(totalGL)} ({totalCost>0?((totalGL/totalCost)*100).toFixed(1):0}%)
          </span>
        </Card>
      )}
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Tambah Aset</h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={ticker} onChange={setTicker} placeholder="Ticker (BBCA)" className="w-28"/>
            <Input value={name} onChange={setName} placeholder="Nama aset..." className="flex-1"/>
          </div>
          <select value={type} onChange={e=>setType(e.target.value as StockEntry["type"])}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-600 outline-none">
            <option value="stock">📈 Saham</option>
            <option value="bond">📄 Obligasi</option>
            <option value="money_market">💵 Pasar Uang</option>
          </select>
          <div className="flex gap-2">
            <Input value={buyPrice} onChange={setBuyPrice} placeholder="Harga beli" type="number"/>
            <Input value={currentPrice} onChange={setCurrentPrice} placeholder="Harga kini" type="number"/>
            <Input value={qty} onChange={setQty} placeholder="Lot/unit" type="number" className="w-24"/>
          </div>
          <Input value={note} onChange={setNote} placeholder="Catatan analisis..."/>
          <Btn onClick={add} disabled={adding||!ticker.trim()||!buyPrice||!qty} className="w-full">{adding?"...":"+ Tambah"}</Btn>
        </div>
      </Card>
      {loading?<Sk cls="h-40"/>:stocks.length===0?<Empty icon="◈" text="Belum ada portofolio."/>
      :<Card>
        <div className="space-y-3">
          {stocks.map(s=>{const gl=s.current_price*s.qty-s.buy_price*s.qty; const glPct=s.buy_price>0?((s.current_price-s.buy_price)/s.buy_price*100).toFixed(1):"0";return(
            <div key={s.id} className="py-2 border-b border-stone-100 last:border-0">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-stone-800 font-black text-sm">{s.ticker}</span>
                    <span className="text-stone-400 text-xs">{s.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${statusColor(s.type)}`}>{s.type}</span>
                  </div>
                  <p className="text-stone-400 text-xs">{s.qty} unit · Beli {fmtIDR(s.buy_price)}</p>
                  {s.note&&<p className="text-stone-400 text-xs mt-0.5 italic">{s.note}</p>}
                </div>
                <div className="text-right shrink-0">
                  {editingPrice===s.id?(
                    <div className="flex gap-1">
                      <Input value={newPrice} onChange={setNewPrice} placeholder="Harga" type="number" className="w-24 text-xs py-1.5"/>
                      <Btn onClick={()=>updatePrice(s)} small>✓</Btn>
                    </div>
                  ):(
                    <button onClick={()=>{setEditingPrice(s.id);setNewPrice(String(s.current_price));}}
                      className="text-stone-700 font-bold text-sm hover:text-violet-600 transition-colors">{fmtIDR(s.current_price)}</button>
                  )}
                  <p className={`text-xs font-semibold ${gl>=0?"text-emerald-500":"text-red-400"}`}>
                    {gl>=0?"+":""}{fmtIDR(gl)} ({glPct}%)
                  </p>
                </div>
              </div>
              <Btn onClick={()=>del(s.id)} variant="ghost" small className="mt-1">Hapus</Btn>
            </div>
          );})}
        </div>
      </Card>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// CRYPTO
// ════════════════════════════════════════════════════════════
function CryptoView({uid}:{uid:string}) {
  const [entries,setEntries]=useState<CryptoEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [symbol,setSymbol]=useState(""); const [name,setName]=useState("");
  const [buyPrice,setBuyPrice]=useState(""); const [currentPrice,setCurrentPrice]=useState("");
  const [amount,setAmount]=useState(""); const [adding,setAdding]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null); const [newPrice,setNewPrice]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"crypto",100);
    setEntries(rows.map(r=>({id:r.id,symbol:String(r.data.symbol??""),name:String(r.data.name??""),
      buy_price:Number(r.data.buy_price??0),current_price:Number(r.data.current_price??0),
      amount:Number(r.data.amount??0),allocation_pct:Number(r.data.allocation_pct??0)})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!symbol.trim()||!buyPrice||!amount) return; setAdding(true);
    const totalVal=entries.reduce((a,e)=>a+e.current_price*e.amount,0);
    const newVal=Number(currentPrice||buyPrice)*Number(amount);
    const alloc=totalVal+newVal>0?(newVal/(totalVal+newVal))*100:100;
    const row=await apiPost(uid,"crypto","create",{symbol:symbol.trim().toUpperCase(),name:name.trim(),buy_price:Number(buyPrice),current_price:Number(currentPrice||buyPrice),amount:Number(amount),allocation_pct:Math.round(alloc)},3);
    if(row) setEntries(p=>[{id:row.id,symbol:symbol.trim().toUpperCase(),name:name.trim(),buy_price:Number(buyPrice),current_price:Number(currentPrice||buyPrice),amount:Number(amount),allocation_pct:Math.round(alloc)},...p]);
    setSymbol(""); setName(""); setBuyPrice(""); setCurrentPrice(""); setAmount(""); setAdding(false);
  }
  async function updatePrice(e:CryptoEntry){
    if(!newPrice) return;
    await apiPatch(e.id,uid,"update",{...e,current_price:Number(newPrice)});
    setEntries(p=>p.map(x=>x.id===e.id?{...x,current_price:Number(newPrice)}:x));
    setEditingId(null); setNewPrice("");
  }
  async function del(id:string){if(await apiDelete(id,uid)) setEntries(p=>p.filter(x=>x.id!==id));}

  const totalVal=entries.reduce((a,e)=>a+e.current_price*e.amount,0);
  const totalCost=entries.reduce((a,e)=>a+e.buy_price*e.amount,0);
  const totalGL=totalVal-totalCost;

  return (
    <div className="space-y-5">
      {entries.length>0&&(
        <Card>
          <p className="text-stone-400 text-xs mb-1">Portofolio Kripto</p>
          <p className="font-black text-3xl text-stone-800 tabular-nums mb-2">{fmtIDR(totalVal)}</p>
          <span className={`text-sm font-semibold ${totalGL>=0?"text-emerald-500":"text-red-400"}`}>
            {totalGL>=0?"+":""}{fmtIDR(totalGL)}
          </span>
        </Card>
      )}
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Tambah Kripto</h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={symbol} onChange={setSymbol} placeholder="BTC, ETH..." className="w-28"/>
            <Input value={name} onChange={setName} placeholder="Nama..." className="flex-1"/>
          </div>
          <div className="flex gap-2">
            <Input value={buyPrice} onChange={setBuyPrice} placeholder="Harga beli" type="number"/>
            <Input value={currentPrice} onChange={setCurrentPrice} placeholder="Harga kini" type="number"/>
            <Input value={amount} onChange={setAmount} placeholder="Jumlah" type="number" className="w-24"/>
          </div>
          <Btn onClick={add} disabled={adding||!symbol.trim()||!buyPrice||!amount} className="w-full">{adding?"...":"+ Tambah"}</Btn>
        </div>
      </Card>
      {loading?<Sk cls="h-40"/>:entries.length===0?<Empty icon="◈" text="Belum ada portofolio kripto."/>
      :<Card>
        <div className="space-y-3">
          {entries.map(e=>{const gl=(e.current_price-e.buy_price)*e.amount;return(
            <div key={e.id} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-black text-stone-800 text-sm">{e.symbol}</span>
                  {e.name&&<span className="text-stone-400 text-xs">{e.name}</span>}
                </div>
                <p className="text-stone-400 text-xs">{e.amount} · Beli {fmtIDR(e.buy_price)}</p>
                <div className="bg-stone-100 rounded-full h-1 mt-1 w-full overflow-hidden">
                  <div className="h-full bg-violet-400 rounded-full" style={{width:`${Math.min(e.allocation_pct,100)}%`}}/>
                </div>
                <p className="text-stone-300 text-xs">{e.allocation_pct}% alokasi</p>
              </div>
              <div className="text-right shrink-0">
                {editingId===e.id?(
                  <div className="flex gap-1">
                    <Input value={newPrice} onChange={setNewPrice} placeholder="Harga" type="number" className="w-24 text-xs py-1.5"/>
                    <Btn onClick={()=>updatePrice(e)} small>✓</Btn>
                  </div>
                ):(
                  <button onClick={()=>{setEditingId(e.id);setNewPrice(String(e.current_price));}}
                    className="text-stone-700 font-bold text-sm hover:text-violet-600">{fmtIDR(e.current_price)}</button>
                )}
                <p className={`text-xs font-semibold ${gl>=0?"text-emerald-500":"text-red-400"}`}>
                  {gl>=0?"+":""}{fmtIDR(gl)}
                </p>
              </div>
              <Btn onClick={()=>del(e.id)} variant="ghost" small>✕</Btn>
            </div>
          );})}
        </div>
      </Card>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// BUY LOG
// ════════════════════════════════════════════════════════════
function BuyView({uid}:{uid:string}) {
  const [entries,setEntries]=useState<BuyEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [item,setItem]=useState(""); const [category,setCategory]=useState("");
  const [price,setPrice]=useState(""); const [worth,setWorth]=useState<boolean|undefined>(undefined);
  const [evaluation,setEvaluation]=useState(""); const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"buy",100);
    setEntries(rows.map(r=>({id:r.id,item:String(r.data.item??""),category:String(r.data.category??""),
      price:Number(r.data.price??0),date:String(r.data.date??r.created_at.slice(0,10)),
      worth_it:r.data.worth_it as boolean|undefined,evaluation:r.data.evaluation as string|undefined})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!item.trim()||!category.trim()) return; setAdding(true);
    const row=await apiPost(uid,"buy","create",{item:item.trim(),category:category.trim(),price:Number(price)||0,date:today(),worth_it:worth??null,evaluation:evaluation.trim()||null},2);
    if(row) setEntries(p=>[{id:row.id,item:item.trim(),category:category.trim(),price:Number(price)||0,date:today(),worth_it:worth,evaluation:evaluation.trim()},...p]);
    setItem(""); setCategory(""); setPrice(""); setWorth(undefined); setEvaluation(""); setAdding(false);
  }
  async function del(id:string){if(await apiDelete(id,uid)) setEntries(p=>p.filter(x=>x.id!==id));}

  const totalSpend=entries.reduce((a,e)=>a+e.price,0);
  const worthCount=entries.filter(e=>e.worth_it===true).length;
  const notWorthCount=entries.filter(e=>e.worth_it===false).length;

  return (
    <div className="space-y-5">
      {entries.length>0&&(
        <Card>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[{label:"Total",val:fmtIDR(totalSpend),color:"text-stone-700"},{label:"Worth It",val:String(worthCount),color:"text-emerald-500"},{label:"Not Worth",val:String(notWorthCount),color:"text-red-400"}].map(s=>(
              <div key={s.label}><p className={`font-black text-lg ${s.color}`}>{s.val}</p>
                <p className="text-stone-400 text-xs">{s.label}</p></div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Log Pembelian</h3>
        <div className="space-y-2">
          <Input value={item} onChange={setItem} placeholder="Nama barang/hobi..."/>
          <Input value={category} onChange={setCategory} placeholder="Kategori (elektronik, outfit, hobi...)"/>
          <Input value={price} onChange={setPrice} placeholder="Harga (Rp)" type="number"/>
          <div className="flex gap-2">
            <button onClick={()=>setWorth(true)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${worth===true?"bg-emerald-100 text-emerald-600":"bg-stone-50 text-stone-400 hover:bg-stone-100"}`}>
              ✓ Worth it
            </button>
            <button onClick={()=>setWorth(false)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${worth===false?"bg-red-100 text-red-500":"bg-stone-50 text-stone-400 hover:bg-stone-100"}`}>
              ✕ Not worth
            </button>
          </div>
          <Input value={evaluation} onChange={setEvaluation} placeholder="Evaluasi singkat..."/>
          <Btn onClick={add} disabled={adding||!item.trim()||!category.trim()} className="w-full">{adding?"...":"Catat"}</Btn>
        </div>
      </Card>
      {loading?<Sk cls="h-40"/>:entries.length===0?<Empty icon="◈" text="Belum ada log pembelian."/>
      :<Card>
        <div className="space-y-3">
          {entries.map(e=>(
            <div key={e.id} className="flex items-start gap-3 py-2 border-b border-stone-100 last:border-0 group">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-stone-700 text-sm font-medium">{e.item}</p>
                  {e.worth_it===true&&<span className="text-xs text-emerald-500">✓</span>}
                  {e.worth_it===false&&<span className="text-xs text-red-400">✕</span>}
                </div>
                <p className="text-stone-400 text-xs">{e.category} · {e.date}</p>
                {e.evaluation&&<p className="text-stone-400 text-xs mt-0.5 italic">{e.evaluation}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-stone-600 font-semibold text-sm tabular-nums">{fmtIDR(e.price)}</span>
                <Btn onClick={()=>del(e.id)} variant="ghost" small className="opacity-0 group-hover:opacity-100">✕</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// EVALUATION
// ════════════════════════════════════════════════════════════
function EvalView({uid}:{uid:string}) {
  const [entries,setEntries]=useState<EvalEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [period,setPeriod]=useState<EvalEntry["period"]>("weekly");
  const [content,setContent]=useState(""); const [linked,setLinked]=useState("");
  const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const rows=await apiGet(uid,"evaluation",50);
    setEntries(rows.map(r=>({id:r.id,period:(r.data.period??"weekly") as EvalEntry["period"],
      content:String(r.data.content??""),linked_module:r.data.linked_module as string|undefined,
      date:String(r.data.date??r.created_at.slice(0,10))})));
    setLoading(false);
  },[uid]);
  useEffect(()=>{load();},[load]);

  async function add(){
    if(!content.trim()) return; setAdding(true);
    const row=await apiPost(uid,"evaluation","create",{period,content:content.trim(),linked_module:linked||null,date:today()},10);
    if(row) setEntries(p=>[{id:row.id,period,content:content.trim(),linked_module:linked||undefined,date:today()},...p]);
    setContent(""); setLinked(""); setAdding(false);
  }
  async function del(id:string){if(await apiDelete(id,uid)) setEntries(p=>p.filter(x=>x.id!==id));}

  const TEMPLATES:{period:EvalEntry["period"];prompts:string[]} = {
    period:"weekly",
    prompts:["Apa yang berjalan baik minggu ini?","Apa yang bisa diperbaiki?","Apa fokus minggu depan?"],
  };

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-stone-800 text-sm mb-3">Evaluasi Baru</h3>
        <div className="space-y-2">
          <div className="flex gap-1.5 mb-2">
            {(["daily","weekly","monthly","quarterly"] as const).map(p=>(
              <button key={p} onClick={()=>setPeriod(p)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors ${period===p?"bg-violet-600 text-white":"bg-stone-50 text-stone-400 hover:bg-stone-100"}`}>
                {p==="daily"?"Harian":p==="weekly"?"Mingguan":p==="monthly"?"Bulanan":"Kuartal"}
              </button>
            ))}
          </div>
          {period==="weekly"&&(
            <div className="bg-violet-50 rounded-xl p-3 mb-2">
              <p className="text-violet-600 text-xs font-semibold mb-1">Template Prompt:</p>
              {TEMPLATES.prompts.map((q,i)=><p key={i} className="text-violet-500 text-xs">• {q}</p>)}
            </div>
          )}
          <textarea value={content} onChange={e=>setContent(e.target.value)}
            placeholder="Tulis evaluasimu di sini..." rows={5}
            className="w-full bg-stone-50 border border-stone-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 rounded-xl px-4 py-3 text-sm text-stone-700 placeholder-stone-300 outline-none resize-none"/>
          <select value={linked} onChange={e=>setLinked(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-600 outline-none">
            <option value="">Tidak terhubung ke modul</option>
            {["quest","habit","skill","finance","sleep","mental","pmo","job","school"].map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <Btn onClick={add} disabled={adding||!content.trim()} className="w-full">{adding?"Menyimpan...":"Simpan +10 EXP"}</Btn>
        </div>
      </Card>
      {loading?<Sk cls="h-40"/>:entries.length===0?<Empty icon="◈" text="Belum ada evaluasi."/>
      :entries.map(e=>(
        <Card key={e.id}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor("progress")}`}>{e.period}</span>
              <span className="text-stone-400 text-xs">{e.date}</span>
              {e.linked_module&&<span className="text-stone-300 text-xs">· {e.linked_module}</span>}
            </div>
            <Btn onClick={()=>del(e.id)} variant="ghost" small>✕</Btn>
          </div>
          <p className="text-stone-600 text-sm leading-relaxed whitespace-pre-wrap">{e.content}</p>
        </Card>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// AI CORE
// ════════════════════════════════════════════════════════════
function AiView({uid,userName}:{uid:string;userName:string}) {
  const [messages,setMessages]=useState<AiMessage[]>([]);
  const [input,setInput]=useState(""); const [loading,setLoading]=useState(false);
  const [charData,setCharData]=useState<Character|null>(null); const [ready,setReady]=useState(false);
  const bottomRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!uid||ready) return;
    (async()=>{
      const [cR,pR,mR,sR,qR,hR]=await Promise.all([
        apiGet(uid,"character"),apiGet(uid,"pmo"),
        apiGet(uid,"mental",1),apiGet(uid,"sleep",1),
        apiGet(uid,"quest"),apiGet(uid,"habit"),
      ]);
      const char=cR[0]?(cR[0].data as unknown as Character):DEFAULT_CHAR;
      setCharData(char); setReady(true);
      const pmo=pR[0]?.data as {current_day?:number}|undefined;
      const mental=mR[0]?.data as {mood?:number;energy?:number;stress?:number}|undefined;
      const sleep=sR[0]?.data as {duration_hours?:number}|undefined;
      const activeQ=qR.filter(r=>r.data.status==="progress"||r.data.status==="todo").length;
      const doneH=hR.filter(r=>isToday(r.data.last_checkin as string|undefined)).length;
      const parts=[
        `Level ${char.level}, Rank ${char.rank}, ${char.total_exp.toLocaleString()} EXP`,
        pmo?.current_day!==undefined?`PMO Day ${pmo.current_day}`:null,
        mental?`Kondisi: mood ${mental.mood}, energi ${mental.energy}, stres ${mental.stress}`:null,
        sleep?`Tidur terakhir: ${sleep.duration_hours}j`:null,
        `${activeQ} quest aktif, ${doneH} habit selesai hari ini`,
      ].filter(Boolean).join(" · ");
      setMessages([{role:"assistant",content:`Halo ${userName}. Gw udah baca semua data lo — ${parts}. Ada yang mau dibahas atau langsung minta analisis kondisi sekarang?`}]);
    })();
  },[uid,userName,ready]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  async function send(){
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",content:msg}]); setLoading(true);
    try {
      const res=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({message:msg,context:{user_name:userName,character:charData??DEFAULT_CHAR},history:messages.slice(-10)})});
      const json=await res.json();
      setMessages(m=>[...m,{role:"assistant",content:json.reply??"Koneksi gagal."}]);
      if(json.actions?.length>0) for(const a of json.actions) await apiPost(uid,a.module,a.action,a.data);
    } catch {setMessages(m=>[...m,{role:"assistant",content:"Koneksi ke AI Core gagal."}]);}
    finally {setLoading(false);}
  }

  return (
    <div className="flex flex-col" style={{height:"calc(100vh - 180px)"}}>
      <Card className="mb-4 flex items-center gap-3 shrink-0 py-4">
        <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-black">◉</span>
        </div>
        <div><p className="font-bold text-stone-800 text-sm">AI Core</p>
          <p className="text-stone-400 text-xs">Membaca semua modul</p></div>
        <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0"/>
      </Card>
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {!ready?(<div className="space-y-2 pt-4"><Sk cls="h-12 w-3/4"/><Sk cls="h-12 w-1/2 ml-auto"/></div>)
        :<AnimatePresence initial={false}>
          {messages.map((m,i)=>(
            <motion.div key={i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.25}}
              className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
              <div className={`max-w-xs md:max-w-sm rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role==="user"?"bg-violet-600 text-white rounded-br-sm":"bg-white border border-stone-200/80 text-stone-700 rounded-bl-sm"}`}>
                {m.content}
              </div>
            </motion.div>
          ))}
          {loading&&(
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex justify-start">
              <div className="bg-white border border-stone-200/80 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">{[0,150,300].map(d=>(
                  <span key={d} className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce" style={{animationDelay:`${d}ms`}}/>
                ))}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>}
        <div ref={bottomRef}/>
      </div>
      <Card className="flex gap-2 mt-3 shrink-0 py-3">
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="Tanya atau minta analisis..."
          className="flex-1 bg-transparent text-sm text-stone-800 placeholder-stone-300 outline-none px-2"/>
        <Btn onClick={send} disabled={!input.trim()||loading||!ready} small>Kirim</Btn>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const router=useRouter();
  const [activeModule,setActiveModule]=useState<Module>("home");
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [userId,setUserId]=useState<string|null>(null);
  const [userName,setUserName]=useState("");
  const [authReady,setAuthReady]=useState(false);

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,(user)=>{
      if(user){setUserId(user.uid);setUserName(user.displayName?.split(" ")[0]??"User");setAuthReady(true);}
      else {
        const cookie=document.cookie.split(";").find(c=>c.trim().startsWith("session="));
        const val=cookie?.split("=")?.[1]?.trim();
        if(val?.startsWith("guest_")){setUserId(`guest_${val.replace("guest_","")}`);setUserName(val.replace("guest_",""));setAuthReady(true);}
        else router.push("/login");
      }
    });
    return ()=>unsub();
  },[router]);

  function handleLogout(){document.cookie="session=; path=/; max-age=0";logout().catch(()=>{});router.push("/login");}
  function navigate(m:Module){setActiveModule(m);setSidebarOpen(false);}

  function renderModule(){
    if(!userId) return null;
    switch(activeModule){
      case "home":       return <HomeView uid={userId} userName={userName} onNav={navigate}/>;
      case "quest":      return <QuestView uid={userId}/>;
      case "mission":    return <MissionView uid={userId}/>;
      case "battle":     return <BattleView uid={userId}/>;
      case "skill":      return <SkillView uid={userId}/>;
      case "habit":      return <HabitView uid={userId}/>;
      case "sleep":      return <SleepView uid={userId}/>;
      case "mental":     return <MentalView uid={userId}/>;
      case "finance":    return <FinanceView uid={userId}/>;
      case "pmo":        return <PmoView uid={userId}/>;
      case "social":     return <SocialView uid={userId}/>;
      case "school":     return <SchoolView uid={userId}/>;
      case "book":       return <BookView uid={userId}/>;
      case "anime":      return <AnimeView uid={userId}/>;
      case "job":        return <JobView uid={userId}/>;
      case "stock":      return <StockView uid={userId}/>;
      case "crypto":     return <CryptoView uid={userId}/>;
      case "buy":        return <BuyView uid={userId}/>;
      case "evaluation": return <EvalView uid={userId}/>;
      case "ai":         return <AiView uid={userId} userName={userName}/>;
      default:           return null;
    }
  }

  const currentNav=NAV.find(n=>n.id===activeModule);

  if(!authReady) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
          <span className="text-white text-sm font-black">V</span>
        </div>
        <div className="w-5 h-5 border-2 border-stone-200 border-t-violet-600 rounded-full animate-spin"/>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-100/60 flex">

      {/* ── Sidebar Desktop ── */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-stone-200/80 fixed left-0 top-0 bottom-0 z-30 overflow-y-auto">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-stone-100 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-black leading-none">V</span>
          </div>
          <span className="font-black text-stone-800 text-sm tracking-tight">vancore</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map(g=>(
            <div key={g.key}>
              <p className="text-stone-300 text-xs font-semibold uppercase tracking-wider px-2 mb-1">{g.label}</p>
              {NAV.filter(n=>n.group===g.key).map(item=>(
                <button key={item.id} onClick={()=>navigate(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left ${activeModule===item.id?"bg-violet-50 text-violet-700":"text-stone-500 hover:bg-stone-50 hover:text-stone-700"}`}>
                  <span className="text-base leading-none w-4 shrink-0">{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-stone-100 shrink-0">
          <div className="flex items-center gap-2.5 px-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
              <span className="text-violet-600 text-xs font-bold">{userName[0]?.toUpperCase()}</span>
            </div>
            <p className="text-stone-700 text-xs font-semibold truncate">{userName}</p>
          </div>
          <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-stone-400 hover:text-red-400 text-xs font-medium rounded-xl hover:bg-red-50 transition-colors">
            Keluar sistem
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar ── */}
      <AnimatePresence>
        {sidebarOpen&&(
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={()=>setSidebarOpen(false)} className="fixed inset-0 bg-black/20 z-40 md:hidden"/>
            <motion.aside initial={{x:"-100%"}} animate={{x:0}} exit={{x:"-100%"}}
              transition={{type:"spring",damping:28,stiffness:300}}
              className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50 md:hidden flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-5 border-b border-stone-100 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
                    <span className="text-white text-xs font-black leading-none">V</span>
                  </div>
                  <span className="font-black text-stone-800 text-sm">vancore</span>
                </div>
                <button onClick={()=>setSidebarOpen(false)} className="text-stone-400 text-lg leading-none">✕</button>
              </div>
              <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
                {NAV_GROUPS.map(g=>(
                  <div key={g.key}>
                    <p className="text-stone-300 text-xs font-semibold uppercase tracking-wider px-2 mb-1">{g.label}</p>
                    {NAV.filter(n=>n.group===g.key).map(item=>(
                      <button key={item.id} onClick={()=>navigate(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left ${activeModule===item.id?"bg-violet-50 text-violet-700":"text-stone-500 hover:bg-stone-50 hover:text-stone-700"}`}>
                        <span className="text-base leading-none w-4 shrink-0">{item.icon}</span>{item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
              <div className="p-4 border-t border-stone-100 shrink-0">
                <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-stone-400 hover:text-red-400 text-xs font-medium rounded-xl hover:bg-red-50 transition-colors">
                  Keluar sistem
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main ── */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        {/* Mobile topbar */}
        <header className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-stone-200/60 flex items-center justify-between px-5 py-3.5 shrink-0">
          <button onClick={()=>setSidebarOpen(true)} className="w-8 h-8 flex flex-col justify-center gap-1.5">
            <span className="block w-5 h-0.5 bg-stone-600"/><span className="block w-5 h-0.5 bg-stone-600"/>
            <span className="block w-3.5 h-0.5 bg-stone-600"/>
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center">
              <span className="text-white text-xs font-black leading-none">V</span>
            </div>
            <span className="font-black text-stone-800 text-sm">vancore</span>
          </div>
          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
            <span className="text-violet-600 text-xs font-bold">{userName[0]?.toUpperCase()}</span>
          </div>
        </header>

        {/* Desktop topbar */}
        <header className="hidden md:flex sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-stone-200/60 items-center justify-between px-8 py-3.5 shrink-0">
          <div>
            <h1 className="font-black text-stone-800 text-base tracking-tight">{currentNav?.label??"Dashboard"}</h1>
            <p className="text-stone-400 text-xs">{userName}</p>
          </div>
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500"/>
            <span className="text-stone-600 text-xs font-medium">Online</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-5 md:px-8 py-6 max-w-2xl w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div key={activeModule} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
              transition={{duration:0.22,ease:[0.22,1,0.36,1]}}>
              {renderModule()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-stone-200/60 flex items-center justify-around px-1 py-2 z-20">
          {(["home","quest","habit","pmo","ai"] as Module[]).map(id=>{
            const item=NAV.find(n=>n.id===id)!; const active=activeModule===id;
            return(
              <button key={id} onClick={()=>navigate(id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${active?"text-violet-600":"text-stone-400"}`}>
                <span className={`text-lg leading-none transition-transform ${active?"scale-110":""}`}>{item.icon}</span>
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="h-20 md:hidden"/>
      </div>
    </div>
  );
}