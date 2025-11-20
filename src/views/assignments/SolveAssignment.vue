<!-- src/views/assignments/SolveAssignment.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  doc, getDoc, serverTimestamp, addDoc, updateDoc,
  query, where, limit, getDocs
} from "firebase/firestore";
import { storeToRefs } from "pinia";
import { useProfileStore } from "@/stores/profile";
import { db, assignmentDoc, colAttempts, attemptDoc } from "@/services/firebase";

/* ---------------------------- tipos del dominio --------------------------- */
type Problem = {
  id: string;
  title?: string;
  statement?: string;
  options: string[];      // normalizado
  correctIndex: number;
  ownerUid?: string;
  type?: string;
};
type Assignment = {
  id: string;
  title?: string;
  problemIds?: string[];
  ownerUid: string;
  startsAt?: any;
  endsAt?: any;
  timeLimitSec?: number;
};

/* ------------------------------ configuración ----------------------------- */
// Para volver a mostrar feedback por-pregunta, cambia a true.
const SHOW_IMMEDIATE_FEEDBACK = false;

/* --------------------------------- utils --------------------------------- */
function debounce<T extends (...a:any[])=>any>(fn:T, ms:number){
  let t:any; return (...args:any[]) => { clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}
function pad2(n:number){ return String(n).padStart(2,"0"); }

/* ------------------------------- estado base ------------------------------ */
const route = useRoute();
const router = useRouter();
const assignmentId = route.params.id as string;

const profile = useProfileStore();
const { uid } = storeToRefs(profile);
const email = computed<string>(() => (profile as any).email ?? "");

const loading  = ref(true);
const saving   = ref(false);
const errorMsg = ref("");

const assignment = ref<Assignment | null>(null);
const problems   = ref<Problem[]>([]);

const i = ref(0);
const currentIndex = ref(0);
const selectedIndex = ref<number | null>(null);
const submitted = ref(false);       // solo se usa si SHOW_IMMEDIATE_FEEDBACK
const locked    = ref(false);

const attemptId   = ref<string | null>(null);
const startedAtMs = ref<number | null>(null);
const answers = ref<Record<string, number | null>>({});

/* --------------------------- temporizador (timeLimitSec) ------------------ */
const hasTimer     = ref(false);
const deadlineMs   = ref<number | null>(null);
const remainingSec = ref<number>(0);
let ticker:any = null;

const remainingLabel = computed(()=>{
  const s = Math.max(0, remainingSec.value);
  const m = Math.floor(s/60);
  const ss = s % 60;
  return `${pad2(m)}:${pad2(ss)}`;
});
const remainingClass = computed(()=>{
  if(!hasTimer.value) return "";
  if(remainingSec.value<=30)  return "bg-red-100 text-red-800";
  if(remainingSec.value<=120) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
});
function startTimer(){ if(!deadlineMs.value) return; hasTimer.value=true; tick(); ticker=setInterval(tick,1000); }
function tick(){
  if(!deadlineMs.value) return;
  const left = Math.floor((deadlineMs.value - Date.now())/1000);
  remainingSec.value = Math.max(0, left);
  if(left<=0){
    clearInterval(ticker); ticker=null;
    if(!saving.value && !locked.value && attemptId.value){
      locked.value = true;
      finalizeAttempt();
    }
  }
}
onUnmounted(()=>{ if(ticker) clearInterval(ticker); });

/* ------------------------------- persistencia ----------------------------- */
const persistPartial = debounce(async ()=>{
  if(!attemptId.value) return;
  const packedPartial = Object.entries(answers.value)
    .filter(([,sel])=>sel!==null)
    .map(([pid, sel])=>{
      const p = problems.value.find(pp=>pp.id===pid);
      const correct = (sel as number) === (p?.correctIndex ?? -1);
      return { problemId: pid, selectedIndex: sel as number, correct };
    });
  try{
    await updateDoc(attemptDoc(attemptId.value), {
      answers: packedPartial,
      currentIndex: currentIndex.value,
    });
  }catch(e){ console.warn("[SolveAssignment] persistPartial falló", e); }
}, 300);

/* ------------------------------ normalización ---------------------------- */
function normalizeProblem(raw: any, id: string): Problem {
  let options: string[] = [];
  let correctIndex = -1;

  if (Array.isArray(raw.options_strings) && raw.options_strings.every((x:any)=>typeof x==="string")) {
    options = raw.options_strings.slice();
    if (typeof raw.correctIndex === "number") correctIndex = raw.correctIndex;

  } else if (Array.isArray(raw.options)) {
    const first = raw.options[0];
    if (typeof first === "string") {
      options = raw.options.map((x:any)=>String(x));
      if (typeof raw.correctIndex === "number") correctIndex = raw.correctIndex;
    } else {
      options = raw.options.map((o:any)=> o?.text ?? o?.label ?? String(o ?? ""));
      if (typeof raw.correctIndex === "number") correctIndex = raw.correctIndex;
      else {
        const idx = raw.options.findIndex((o:any)=>o?.correct===true);
        correctIndex = idx>=0 ? idx : -1;
      }
    }

  } else if (Array.isArray(raw.choices)) {
    options = raw.choices.map((c:any)=> c?.text ?? c?.label ?? String(c ?? ""));
    const idx = raw.choices.findIndex((c:any)=>c?.correct===true);
    correctIndex = idx>=0 ? idx : -1;

  } else if (raw.type === "true_false" || (raw.answer && typeof raw.answer.correct === "boolean")) {
    options = ["Verdadero","Falso"];
    correctIndex = raw.answer?.correct ? 0 : 1;
  }

  if (correctIndex<0 && typeof raw.correctIndex === "number") correctIndex = raw.correctIndex;

  return { id, title: raw.title, statement: raw.statement, options, correctIndex, ownerUid: raw.ownerUid, type: raw.type };
}

/* ------------------------------ carga inicial ---------------------------- */
onMounted(async ()=>{
  try{
    const aSnap = await getDoc(assignmentDoc(assignmentId));
    if(!aSnap.exists()){ errorMsg.value="Asignación no encontrada"; loading.value=false; return; }
    assignment.value = { id: aSnap.id, ...(aSnap.data() as any) };

    const ids: string[] = assignment.value.problemIds ?? [];
    problems.value = [];
    for(const pid of ids){
      const pSnap = await getDoc(doc(db,"problems", pid));
      if(pSnap.exists()){
        const p = normalizeProblem(pSnap.data(), pSnap.id);
        problems.value.push(p);
        if(!(p.id in answers.value)) answers.value[p.id] = null;
      }
    }

    // intento abierto
    let docSnapOpen:any|null = null;
    try{
      const qOpen = query(
        colAttempts,
        where("assignmentId","==", assignmentId),
        where("studentUid","==", uid.value),
        where("status","==","in_progress"),
        limit(1)
      );
      const qs = await getDocs(qOpen);
      if(!qs.empty) docSnapOpen = qs.docs[0];
    }catch{}

    if(docSnapOpen){
      attemptId.value = docSnapOpen.id;
      const data = docSnapOpen.data() as any;
      for(const a of (data.answers ?? [])) answers.value[a.problemId] = a.selectedIndex;
      i.value = typeof data.currentIndex==="number" ? data.currentIndex : 0;
      currentIndex.value = i.value;
      startedAtMs.value = data.startedAt?.toMillis?.() ?? Date.now();
    }else{
      const newAttempt = await addDoc(colAttempts, {
        assignmentId,
        assignmentTitle: assignment.value?.title ?? "",
        ownerUid: assignment.value!.ownerUid,
        studentUid: uid.value,
        userUid: uid.value,
        studentEmail: email.value ?? "",
        answers: [],
        correctCount: 0,
        total: problems.value.length,
        score: 0,
        startedAt: serverTimestamp(),
        finishedAt: null,
        version: 1,
        status: "in_progress",
        currentIndex: 0,
        createdAt: serverTimestamp()
      });
      attemptId.value = newAttempt.id;
      i.value = 0; currentIndex.value = 0;
      startedAtMs.value = Date.now();
    }

    // timer
    const limitSec = Number((assignment.value as any)?.timeLimitSec || 0);
    if(limitSec>0){ deadlineMs.value = (startedAtMs.value ?? Date.now()) + limitSec*1000; startTimer(); }

    // hotkeys
    window.addEventListener("keydown", onKey);
  }catch(e){
    console.error("[SolveAssignment] load error", e);
    errorMsg.value = "No se pudo cargar la asignación.";
  }finally{
    loading.value=false;
  }
});
onUnmounted(()=> window.removeEventListener("keydown", onKey));

/* ------------------------------ derivados/UI ----------------------------- */
const current = computed(()=> problems.value[i.value]);
const total   = computed(()=> problems.value.length);
const canPrev = computed(()=> i.value > 0);
const canNext = computed(()=> i.value < (total.value - 1));

/* ---------------------- rehidratar selección al cambiar i ----------------- */
watch(i, ()=>{
  const pid = current.value?.id;
  selectedIndex.value = pid ? (answers.value[pid] ?? null) : null;
});

/* --------------------------- navegación sin enviar ------------------------ */
function goPrev(){
  if(!canPrev.value || saving.value || locked.value) return;
  i.value--; currentIndex.value = i.value; persistPartial();
}
function goNext(){
  if(!canNext.value || saving.value || locked.value) return;
  i.value++; currentIndex.value = i.value; persistPartial();
}
function onKey(e: KeyboardEvent){
  if(e.key === "ArrowLeft"){ e.preventDefault(); goPrev(); }
  if(e.key === "ArrowRight"){ e.preventDefault(); goNext(); }
}

/* ------------------------- enviar respuesta / avanzar --------------------- */
async function submitAttempt(){
  if(locked.value) return;
  if(!assignment.value || !current.value || selectedIndex.value==null || !uid.value) return;

  if (SHOW_IMMEDIATE_FEEDBACK) submitted.value = true;
  locked.value = true;

  answers.value[current.value.id] = selectedIndex.value;
  persistPartial();

  const isLast = i.value >= (total.value - 1);
  if(isLast){
    await finalizeAttempt();
  }else{
    setTimeout(()=>{
      i.value++; currentIndex.value = i.value;
      selectedIndex.value = answers.value[current.value?.id ?? ""] ?? null;
      if (SHOW_IMMEDIATE_FEEDBACK) submitted.value = false;
      locked.value = false;
      persistPartial();
    }, 200);
  }
}

/* -------------------------------- finalizar ------------------------------- */
async function finalizeAttempt(){
  if(!attemptId.value) return;
  saving.value = true;
  try{
    let correctCount = 0;
    const packed = problems.value.map(p=>{
      const selected = answers.value[p.id] ?? -1;
      const correct  = (selected === p.correctIndex);
      if(correct) correctCount++;
      return { problemId: p.id, selectedIndex: selected as number, correct };
    });
    const totalCount = problems.value.length;
    const score = Math.round(100 * (correctCount/totalCount));
    const durationSec = startedAtMs.value ? Math.round((Date.now() - startedAtMs.value)/1000) : null;

    await updateDoc(attemptDoc(attemptId.value), {
      answers: packed,
      correctCount,
      total: totalCount,
      score,
      finishedAt: serverTimestamp(),
      durationSec,
      status: "finished",
      currentIndex: i.value,
    });

    router.push({ name: "AssignmentResult", params: { id: assignmentId }, query: { attempt: attemptId.value } });
  }catch(e:any){
    console.error("[SolveAssignment] finalize error", e);
    errorMsg.value = e.message ?? String(e);
    locked.value = false;
  }finally{
    saving.value=false;
  }
}
</script>

<template>
  <div class="p-4 max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold">Resolver Asignación</h1>
      <div v-if="hasTimer" class="px-3 py-1 rounded-full text-sm font-medium" :class="remainingClass">
        ⏱ {{ remainingLabel }}
      </div>
    </div>

    <div v-if="loading">Cargando…</div>
    <div v-else-if="errorMsg" class="text-red-600">{{ errorMsg }}</div>
    <div v-else-if="!assignment">Asignación no encontrada.</div>

    <div v-else>
      <div class="flex items-center justify-between text-sm text-gray-600 mb-3">
        <div>Problema {{ i + 1 }} de {{ total }}</div>
        
      </div>

      <div v-if="current" class="space-y-3 border rounded-xl p-4">
        <div class="font-medium">{{ current.title || "Problema" }}</div>
        <div class="whitespace-pre-line">{{ current.statement }}</div>

        <!-- Opciones -->
        <div v-if="current.options && current.options.length" class="space-y-2">
          <label v-for="(opt, idx) in current.options" :key="idx" class="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              :value="idx"
              v-model="selectedIndex"
              :disabled="saving || locked"
              @change="answers[current!.id] = idx; persistPartial();"
            />
            <span>{{ opt }}</span>
          </label>
        </div>
        <div v-else class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Este problema no tiene opciones registradas. Verifica el documento del problema
          (usa <code>options[]</code>, <code>choices[]</code> con <code>correct:true</code> o <code>type: "true_false"</code>).
        </div>

        <div class="flex items-center gap-3 pt-1">
          <button
            class="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
            :disabled="selectedIndex === null || saving || locked"
            @click="submitAttempt"
          >
            {{ i < total - 1 ? "Responder y siguiente" : "Responder y finalizar" }}
          </button>

          <!-- feedback inmediato oculto -->
          <span v-if="SHOW_IMMEDIATE_FEEDBACK && submitted && selectedIndex !== null">
            {{ selectedIndex === current.correctIndex ? "✅ Correcto" : "❌ Incorrecto" }}
          </span>

          <!-- navegación secundaria -->
          <div class="ml-auto flex gap-2">
            <button class="px-3 py-1 rounded-lg border" :disabled="!canPrev || saving || locked" @click="goPrev">← Anterior</button>
            <button class="px-3 py-1 rounded-lg border" :disabled="!canNext || saving || locked" @click="goNext">Siguiente →</button>
          </div>
        </div>
      </div>

      <div v-else>
        <p>No hay más problemas. ¡Buen trabajo!</p>
      </div>
    </div>
  </div>
</template>




