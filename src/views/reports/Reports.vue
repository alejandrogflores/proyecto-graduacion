<!-- src/views/reports/Reports.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from "vue";
import { auth, db } from "@/services/firebase";
import {
  collection, query, where, orderBy, getDocs, Timestamp,
} from "firebase/firestore";
import Chart from "chart.js/auto";

/** ========= UTIL FECHAS ========= **/
function atStart(d: Date){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function atEnd(d: Date){ const x=new Date(d); x.setHours(23,59,59,999); return x; }
function toDayKey(d: Date){ return d.toISOString().slice(0,10); }
function tsToDate(ts:any):Date{
  return ts?.toDate?.() ?? (typeof ts==="number" ? new Date(ts) : new Date());
}

/** ========= STATE ========= **/
type Role = "teacher" | "student" | "unknown";
const role = ref<Role>("unknown");
const loading = ref(false);
const errorMsg = ref("");

/** rango UI (inputs type=date) **/
const startStr = ref<string>("");
const endStr   = ref<string>("");

/** KPIs **/
const kpiAssignmentsCreated   = ref(0);
const kpiAssignmentsPublished = ref(0);
const kpiAttempts             = ref(0);

/** datasets agregados **/
const perStudentAvg = ref<{ student: string; avg: number; attempts: number }[]>([]);
const attemptsByDay = ref<{ day: string; attempts: number }[]>([]);
const perAssignmentTop = ref<{ id:string; title:string; avg:number; attempts:number; avgDur:number|null }[]>([]);

/** CSV bruto del rango **/
const csvRows = ref<any[]>([]);

/** ========= CHART HANDLES ========= **/
let chartStudent: Chart | null = null;
let chartByDay: Chart | null = null;
let chartTopAssign: Chart | null = null;

const canvasStudent = ref<HTMLCanvasElement|null>(null);
const canvasByDay   = ref<HTMLCanvasElement|null>(null);
const canvasTop     = ref<HTMLCanvasElement|null>(null);

function destroyCharts(){
  chartStudent?.destroy(); chartStudent=null;
  chartByDay?.destroy(); chartByDay=null;
  chartTopAssign?.destroy(); chartTopAssign=null;
}

/** ========= helpers etiquetas alumno ========= **/
function cap(s:string){ return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : ""; }
function firstToken(s?:string){
  if(!s) return "";
  // separa por espacios o guiones múltiples
  return s.trim().split(/\s+|-/)[0] || "";
}
function labelFromNameParts(firstName?:string, lastName?:string){
  const f = firstToken(firstName);
  const l = firstToken(lastName);
  return [cap(f), cap(l)].filter(Boolean).join(" ").trim();
}
function labelFromDisplayName(displayName?:string){
  if(!displayName) return "";
  const parts = displayName.trim().split(/\s+/);
  const f = parts[0];
  const l = parts.length>1 ? parts[1] : "";
  return [cap(f), cap(l)].filter(Boolean).join(" ").trim();
}
function labelFromEmail(email?:string){
  if(!email) return "";
  const local = email.split("@")[0];
  // intenta "nombre.apellido" / "nombre_apellido" / "nombre-apellido"
  const parts = local.split(/[._-]+/);
  const f = parts[0] || "";
  const l = parts.length>1 ? parts[1] : "";
  return [cap(f), cap(l)].filter(Boolean).join(" ").trim() || email;
}

/** ========= helpers búsqueda usuarios ========= **/
function chunk<T>(arr: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchLabelsForStudents(
  rows: { studentUid?: string|null; studentEmail?: string|null }[]
): Promise<Map<string,string>> {
  const key = (uid?:string|null, email?:string|null) =>
    uid ? `uid:${uid}` : (email ? `email:${email}` : "desconocido");

  const uids = Array.from(new Set(rows.map(r => r.studentUid).filter(Boolean))) as string[];
  const emailsNoUid = Array.from(
    new Set(rows.filter(r => !r.studentUid && r.studentEmail).map(r => r.studentEmail!))
  );

  const labels = new Map<string,string>();

  // 1) Buscar por UID (IN de 10 en 10)
  for (const part of chunk(uids, 10)) {
    const snap = await getDocs(
      query(collection(db,"users"), where("uid","in", part))
    );
    snap.forEach(d => {
      const u = d.data() as any;
      const fromNames = labelFromNameParts(u.firstName, u.lastName);
      const label =
        labelFromDisplayName(u.displayName) ||
        fromNames ||
        labelFromEmail(u.email) ||
        (u.email || u.uid);
      labels.set(`uid:${u.uid}`, label);
    });
  }

  // 2) Buscar por email cuando no hay UID (IN de 10 en 10)
  for (const part of chunk(emailsNoUid, 10)) {
    const snap = await getDocs(
      query(collection(db,"users"), where("email","in", part))
    );
    snap.forEach(d => {
      const u = d.data() as any;
      const fromNames = labelFromNameParts(u.firstName, u.lastName);
      const label =
        labelFromDisplayName(u.displayName) ||
        fromNames ||
        labelFromEmail(u.email) ||
        (u.email || u.uid);
      labels.set(`email:${(u.email || "").toLowerCase()}`, label);
    });
  }

  // 3) Fallbacks para quien no se encontró
  for (const r of rows) {
    const k = key(r.studentUid ?? null, r.studentEmail?.toLowerCase() ?? null);
    if (!labels.has(k)) {
      labels.set(k, r.studentEmail || r.studentUid || "desconocido");
    }
  }

  return labels;
}

/** ========= ROLE ========= **/
async function fetchRole(uid: string): Promise<Role> {
  try {
    const s = await getDocs(query(collection(db,"users"), where("uid","==",uid)));
    const r = s.docs[0]?.data()?.role;
    return r === "teacher" || r === "student" ? r : "unknown";
  } catch { return "unknown"; }
}

/** ========= HELPERS TEACHER ========= **/
// IDs de las asignaciones del docente (para filtrar attempts)
async function fetchMyAssignmentIds(myUid: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const snap = await getDocs(query(
    collection(db,"assignments"),
    where("ownerUid","==", myUid),
    where("isPublished","==", true)
  ));
  snap.forEach(d => ids.add(d.id));
  return ids;
}

/** ========= CARGA PRINCIPAL ========= **/
async function load(){
  loading.value = true;
  errorMsg.value = "";

  const u = auth.currentUser;
  if(!u){ errorMsg.value="No has iniciado sesión."; loading.value=false; return; }
  role.value = await fetchRole(u.uid);

  // fechas por defecto (últimos 30 días)
  if(!startStr.value || !endStr.value){
    const today = new Date();
    const from  = new Date(today); from.setDate(today.getDate()-29);
    startStr.value = toDayKey(atStart(from));
    endStr.value   = toDayKey(atEnd(today));
  }

  await applyRange();
  loading.value = false;
}

async function applyRange(){
  errorMsg.value = "";
  destroyCharts();

  const u = auth.currentUser;
  if(!u){ errorMsg.value="No has iniciado sesión."; return; }

  const start = atStart(new Date(startStr.value));
  const end   = atEnd(new Date(endStr.value));
  const startTs = Timestamp.fromDate(start);
  const endTs   = Timestamp.fromDate(end);

  // ----- 1) Asignaciones creadas/publicadas -----
  try{
    const colA = collection(db, "assignments");
    // createdAt
    {
      const qs = role.value==="teacher"
        ? query(colA, where("ownerUid","==",u.uid), where("createdAt", ">=", startTs), where("createdAt", "<=", endTs))
        : query(colA, where("createdAt", ">=", startTs), where("createdAt", "<=", endTs));
      const snap = await getDocs(qs);
      kpiAssignmentsCreated.value = snap.size;
    }
    // publishedAt
    {
      const qs = role.value==="teacher"
        ? query(colA, where("ownerUid","==",u.uid), where("publishedAt", ">=", startTs), where("publishedAt", "<=", endTs))
        : query(colA, where("publishedAt", ">=", startTs), where("publishedAt", "<=", endTs));
      const snap = await getDocs(qs);
      kpiAssignmentsPublished.value = snap.size;
    }
  }catch{
    kpiAssignmentsCreated.value = 0;
    kpiAssignmentsPublished.value = 0;
  }

  // ----- 2) Attempts (dos esquemas soportados) -----
  const colT = collection(db, "attempts");

  // Para teacher NO filtramos por ownerUid (no existe en attempts)
  // Para student sí optimizamos por userUid
  const attemptsFinished: any[] = [];
  const attemptsAnswered: any[] = [];

  try{
    const qFinished = role.value === "student"
      ? query(colT,
          where("userUid","==",u.uid),
          where("finishedAt", ">=", startTs),
          where("finishedAt", "<=", endTs),
          orderBy("finishedAt","asc"))
      : query(colT,
          where("finishedAt", ">=", startTs),
          where("finishedAt", "<=", endTs),
          orderBy("finishedAt","asc"));
    const s1 = await getDocs(qFinished);
    s1.forEach(d => attemptsFinished.push({ id:d.id, ...d.data() }));
  }catch{}

  try{
    const qAnswered = role.value === "student"
      ? query(colT,
          where("userUid","==",u.uid),
          where("answeredAt", ">=", startTs),
          where("answeredAt", "<=", endTs),
          orderBy("answeredAt","asc"))
      : query(colT,
          where("answeredAt", ">=", startTs),
          where("answeredAt", "<=", endTs),
          orderBy("answeredAt","asc"));
    const s2 = await getDocs(qAnswered);
    s2.forEach(d => attemptsAnswered.push({ id:d.id, ...d.data() }));
  }catch{}

  // Si soy teacher, filtro por mis assignmentId
  let myAssignIds: Set<string> | null = null;
  if (role.value === "teacher") {
    myAssignIds = await fetchMyAssignmentIds(u.uid);
  }

  // normalización: dateTs, studentUid?, studentEmail?, score, assignmentId?, assignmentTitle?, durationSec?
  const rows:any[] = [];

  if(attemptsFinished.length){
    for(const a of attemptsFinished){
      if (role.value === "teacher" && myAssignIds && a.assignmentId && !myAssignIds.has(a.assignmentId)) continue;
      rows.push({
        dateTs: a.finishedAt,
        studentUid: a.studentUid ?? a.userUid ?? null,
        studentEmail: a.studentEmail ?? a.userEmail ?? null,
        score: Number(a.score ?? 0),
        assignmentId: a.assignmentId ?? null,
        assignmentTitle: a.assignmentTitle ?? "(sin título)",
        durationSec: typeof a.durationSec==="number" ? a.durationSec : null,
      });
    }
  }

  if(!attemptsFinished.length && attemptsAnswered.length){
    for(const a of attemptsAnswered){
      // para teacher, solo contamos si conocemos assignmentId y es mío
      if (role.value === "teacher") {
        if (!a.assignmentId || !myAssignIds?.has(a.assignmentId)) continue;
      }
      rows.push({
        dateTs: a.answeredAt,
        studentUid: a.userUid ?? null,
        studentEmail: a.userEmail ?? null,
        score: a.isCorrect === true ? 100 : 0,
        assignmentId: a.assignmentId ?? null,
        assignmentTitle: a.assignmentTitle ?? (a.problemTitle ?? "(sin título)"),
        durationSec: null,
      });
    }
  }

  kpiAttempts.value = rows.length;

  // ==== labels de alumnos para agrupar y mostrar ====
  const labelMap = await fetchLabelsForStudents(rows);
  const keyFor = (r:any) => (r.studentUid ? `uid:${r.studentUid}` :
                             (r.studentEmail ? `email:${String(r.studentEmail).toLowerCase()}` : "desconocido"));
  const labelForKey = (k:string) => labelMap.get(k) || "desconocido";

  // Guarda filas para CSV con etiqueta lista
  csvRows.value = rows.map(r => ({ ...r, studentLabel: labelForKey(keyFor(r)) }));

  // ==== agregaciones ====
  const byStudent = new Map<string, {sum:number; n:number}>(); // clave: uid:... o email:...
  const byDay     = new Map<string, number>();
  const byAssign  = new Map<string, {title:string; sum:number; n:number; durSum:number; durN:number}>();

  for(const r of rows){
    const d   = tsToDate(r.dateTs);
    const keyDay = toDayKey(d);
    byDay.set(keyDay, (byDay.get(keyDay) ?? 0) + 1);

    const sKey = keyFor(r);
    const stAgg = byStudent.get(sKey) ?? {sum:0,n:0};
    stAgg.sum += r.score; stAgg.n += 1;
    byStudent.set(sKey, stAgg);

    if(r.assignmentId){
      const x = byAssign.get(r.assignmentId) ?? {title:r.assignmentTitle ?? "(sin título)", sum:0,n:0,durSum:0,durN:0};
      x.sum += r.score; x.n += 1;
      if(typeof r.durationSec==="number"){ x.durSum += r.durationSec; x.durN += 1; }
      byAssign.set(r.assignmentId, x);
    }
  }

  perStudentAvg.value = Array.from(byStudent.entries())
    .map(([sKey, v]) => ({
      student: labelForKey(sKey),
      avg: v.n ? Math.round((v.sum/v.n)*10)/10 : 0,
      attempts: v.n
    }))
    .sort((a,b)=> b.avg - a.avg);

  attemptsByDay.value = Array.from(byDay.entries())
    .map(([day, n]) => ({ day, attempts: n }))
    .sort((a,b)=> a.day.localeCompare(b.day));

  const tmpAssign = Array.from(byAssign.entries())
    .map(([id, v]) => ({
      id,
      title: v.title,
      avg: v.n ? Math.round((v.sum/v.n)*10)/10 : 0,
      attempts: v.n,
      avgDur: v.durN ? Math.round((v.durSum/v.durN)) : null
    }))
    .sort((a,b)=> b.avg - a.avg);
  perAssignmentTop.value = tmpAssign.slice(0,5);

  drawCharts();
}

/** ========= CSV ========= **/
function toCSV(headers: string[], rows: (string|number|null)[][]): string{
  const esc = (v:any) => {
    const s = String(v ?? "");
    const needs = /[,"\n]/.test(s);
    const e = s.replace(/"/g,'""');
    return needs ? `"${e}"` : e;
  };
  return [headers.map(esc).join(","), ...rows.map(r=> r.map(esc).join(","))].join("\n");
}
function downloadCSV(filename:string, csv:string){
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function exportCSV(){
  const rows = csvRows.value.map(r=>{
    const d = tsToDate(r.dateTs).toISOString();
    return [
      d,
      r.studentLabel ?? "",           // etiqueta amigable
      r.studentEmail ?? "",           // (extra) email
      r.studentUid ?? "",             // (extra) uid
      r.score,
      r.assignmentId ?? "",
      r.assignmentTitle ?? "",
      r.durationSec ?? ""
    ];
  });
  downloadCSV("reportes_rango.csv", toCSV(
    ["fechaISO","alumno","email","uid","score","assignmentId","assignmentTitle","durationSec"],
    rows
  ));
}

/** ========= CHARTS ========= **/
function drawCharts(){
  if(canvasStudent.value){
    chartStudent?.destroy();
    chartStudent = new Chart(canvasStudent.value.getContext("2d")!, {
      type: "bar",
      data: {
        labels: perStudentAvg.value.map(x=>x.student),
        datasets: [{ label: "Promedio por alumno", data: perStudentAvg.value.map(x=>x.avg) }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    });
  }
  if(canvasByDay.value){
    chartByDay?.destroy();
    chartByDay = new Chart(canvasByDay.value.getContext("2d")!, {
      type: "bar",
      data: {
        labels: attemptsByDay.value.map(x=>x.day),
        datasets: [{ label: "Intentos por día", data: attemptsByDay.value.map(x=>x.attempts) }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    });
  }
  if(canvasTop.value){
    chartTopAssign?.destroy();
    chartTopAssign = new Chart(canvasTop.value.getContext("2d")!, {
      type: "bar",
      data: {
        labels: perAssignmentTop.value.map(x=>x.title),
        datasets: [{ label: "Promedio por asignación (Top 5)", data: perAssignmentTop.value.map(x=>x.avg) }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    });
  }
}

onMounted(load);
onBeforeUnmount(destroyCharts);
watch([perStudentAvg, attemptsByDay, perAssignmentTop], drawCharts);
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-bold">Reportes</h1>
      <div class="flex items-center gap-2">
        <button @click="exportCSV" class="border rounded px-3 py-1 text-sm hover:bg-slate-50">
          CSV (todo el rango)
        </button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="flex flex-wrap items-end gap-3">
      <div>
        <label class="block text-xs text-slate-600 mb-1">Desde</label>
        <input v-model="startStr" type="date" class="border rounded px-3 py-2 text-sm">
      </div>
      <div>
        <label class="block text-xs text-slate-600 mb-1">Hasta</label>
        <input v-model="endStr" type="date" class="border rounded px-3 py-2 text-sm">
      </div>
      <button @click="applyRange" class="px-3 py-2 border rounded hover:bg-slate-50">
        Aplicar
      </button>
    </div>

    <div v-if="loading">Cargando…</div>
    <div v-else>
      <div class="grid sm:grid-cols-3 gap-4">
        <div class="border rounded-xl p-4">
          <div class="text-slate-500 mb-1">Asignaciones creadas</div>
          <div class="text-2xl font-semibold">{{ kpiAssignmentsCreated }}</div>
        </div>
        <div class="border rounded-xl p-4">
          <div class="text-slate-500 mb-1">Asignaciones publicadas</div>
          <div class="text-2xl font-semibold">{{ kpiAssignmentsPublished }}</div>
        </div>
        <div class="border rounded-xl p-4">
          <div class="text-slate-500 mb-1">Intentos de alumnos</div>
          <div class="text-2xl font-semibold">{{ kpiAttempts }}</div>
        </div>
      </div>

      <p v-if="errorMsg" class="text-slate-500 mt-4">{{ errorMsg }}</p>
      <p v-else-if="kpiAttempts === 0" class="text-slate-500 mt-4">
        No hay intentos para el rango seleccionado.
      </p>

      <div v-else class="grid lg:grid-cols-2 gap-6 mt-6">
        <div class="border rounded-xl p-4 h-72">
          <div class="text-sm font-medium mb-2">Promedio por alumno</div>
          <canvas ref="canvasStudent" class="w-full h-full"></canvas>
        </div>
        <div class="border rounded-xl p-4 h-72">
          <div class="text-sm font-medium mb-2">Intentos por día</div>
          <canvas ref="canvasByDay" class="w-full h-full"></canvas>
        </div>

        <div class="border rounded-xl p-4 lg:col-span-2">
          <div class="text-sm font-medium mb-3">Top 5 — Promedio por asignación</div>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="h-64">
              <canvas ref="canvasTop" class="w-full h-full"></canvas>
            </div>
            <div class="overflow-auto">
              <table class="w-full text-sm border rounded">
                <thead class="bg-slate-100">
                  <tr>
                    <th class="text-left p-2 border">Asignación</th>
                    <th class="text-left p-2 border">Intentos</th>
                    <th class="text-left p-2 border">Promedio</th>
                    <th class="text-left p-2 border">Tiempo prom.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="a in perAssignmentTop" :key="a.id">
                    <td class="p-2 border">{{ a.title }}</td>
                    <td class="p-2 border">{{ a.attempts }}</td>
                    <td class="p-2 border">{{ a.avg.toFixed(1) }}%</td>
                    <td class="p-2 border">
                      <span v-if="a.avgDur!=null">{{ Math.round(a.avgDur/60) }}m {{ a.avgDur%60|0 }}s</span>
                      <span v-else>—</span>
                    </td>
                  </tr>
                  <tr v-if="perAssignmentTop.length===0">
                    <td colspan="4" class="p-3 text-center text-slate-500">Sin datos</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>
</template>

