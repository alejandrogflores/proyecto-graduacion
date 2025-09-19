<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { colAttempts, type Attempt } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

type Student = { uid: string; email?: string; total: number; correct: number; accuracy: number };

const route = useRoute();
const router = useRouter();
const profile = useProfileStore();

const loading = ref(false);
const error = ref<string | null>(null);
const attemptsAll = ref<Attempt[]>([]);
const students = ref<Student[]>([]);
const selectedUid = ref<string | null>(null);
const selectedEmail = ref<string | null>(null);
const studentAttempts = ref<Attempt[]>([]);
const search = ref("");

const ownerUid = computed(() => profile.profile?.uid ?? null);
let unsub: Unsubscribe | null = null;

const ts = (x: any) => x?.toMillis?.() ?? x?.toDate?.()?.getTime?.() ?? 0;

// -----------------------------
// Utilidades de selección/cálculo
// -----------------------------
function setSelected(uid: string) {
  selectedUid.value = uid;
  const s = students.value.find((x) => x.uid === uid);
  selectedEmail.value = s?.email ?? null;
  studentAttempts.value = attemptsAll.value
    .filter((a) => a.userUid === uid)
    .sort((a, b) => ts(b.answeredAt) - ts(a.answeredAt));
}

function select(uid: string) {
  setSelected(uid);
  router.replace({ name: "reports-teacher-user", params: { uid } });
}

function rebuildStudents() {
  const map = new Map<string, Student>();
  for (const a of attemptsAll.value) {
    if (!map.has(a.userUid)) {
      map.set(a.userUid, {
        uid: a.userUid,
        email: a.userEmail,
        total: 0,
        correct: 0,
        accuracy: 0,
      });
    }
    const s = map.get(a.userUid)!;
    s.total += 1;
    if (a.isCorrect) s.correct += 1;
  }

  students.value = Array.from(map.values())
    .map((s) => ({ ...s, accuracy: s.total ? s.correct / s.total : 0 }))
    .sort((a, b) => b.accuracy - a.accuracy);

  // Si la URL trae un uid válido, respetarlo; si hay solo un alumno y no hay selección, autoseleccionarlo
  const uidParam = (route.params.uid as string | undefined) || null;
  if (uidParam && map.has(uidParam)) {
    setSelected(uidParam);
  } else if (!selectedUid.value && students.value.length === 1) {
    select(students.value[0].uid);
  } else if (selectedUid.value && !map.has(selectedUid.value)) {
    // si el alumno seleccionado ya no está en lista (filtro/refresh), limpia selección
    selectedUid.value = null;
    selectedEmail.value = null;
    studentAttempts.value = [];
  }
}

const studentsFiltered = computed(() => {
  const f = search.value.trim().toLowerCase();
  const arr = students.value.slice().sort((a, b) => b.accuracy - a.accuracy);
  if (!f) return arr;
  return arr.filter(
    (s) =>
      s.uid.toLowerCase().includes(f) ||
      (s.email ?? "").toLowerCase().includes(f)
  );
});

function fmt(tsVal: any) {
  try {
    if (tsVal?.toDate) return tsVal.toDate().toLocaleString();
  } catch {}
  return "";
}

// -----------------------------
// Datos en tiempo real
// -----------------------------
watch(
  ownerUid,
  (uid) => {
    if (unsub) {
      unsub();
      unsub = null;
    }
    if (!uid) return;

    error.value = null;
    loading.value = true;

    try {
      // Requiere índice compuesto: ownerUid ASC + answeredAt DESC (ya lo creaste)
      const q = query(
        colAttempts,
        where("ownerUid", "==", uid),
        orderBy("answeredAt", "desc")
      );

      unsub = onSnapshot(
        q,
        (snap) => {
          attemptsAll.value = snap.docs.map((d) => d.data());
          rebuildStudents();
          loading.value = false;
        },
        (e) => {
          console.error("onSnapshot error:", e);
          error.value = e?.message ?? "Error cargando datos.";
          loading.value = false;
        }
      );
    } catch (e: any) {
      console.error("setup query error:", e);
      error.value = e?.message ?? "Error preparando la consulta.";
      loading.value = false;
    }
  },
  { immediate: true }
);

// Mantén sincronía si cambian los parámetros de la URL
watch(
  () => route.params.uid as string | undefined,
  (uid) => {
    if (!uid) return;
    const exists = students.value.some((s) => s.uid === uid);
    if (exists) setSelected(uid);
  }
);

// Botón de recarga manual (por si lo necesitas)
async function manualRefresh() {
  if (!ownerUid.value) return;
  loading.value = true;
  error.value = null;
  try {
    const q = query(
      colAttempts,
      where("ownerUid", "==", ownerUid.value),
      orderBy("answeredAt", "desc")
    );
    const snap = await getDocs(q);
    attemptsAll.value = snap.docs.map((d) => d.data());
    rebuildStudents();
  } catch (e: any) {
    console.error("manualRefresh error:", e);
    error.value = e?.message ?? "Error recargando datos.";
  } finally {
    loading.value = false;
  }
}

onBeforeUnmount(() => {
  if (unsub) unsub();
});
// --- Helpers CSV ---
function toCSV(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: any) => {
    const s = String(v ?? "");
    const needs = /[,"\n]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needs ? `"${escaped}"` : escaped;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  return lines.join("\n");
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function tsISO(x: any): string {
  try { if (x?.toDate) return x.toDate().toISOString(); } catch {}
  return "";
}

// Resumen (todos los alumnos)
function exportSummaryCSV() {
  const headers = ["alumnoEmail", "alumnoUid", "intentos", "aciertos", "precision"];
  const rows = students.value.map(s => [
    s.email ?? "",
    s.uid,
    s.total,
    s.correct,
    (Math.round(s.accuracy * 10000) / 100).toFixed(2) + "%"
  ]);
  downloadCSV("reporte_docente_resumen.csv", toCSV(headers, rows));
}

// Alumno seleccionado (detalle de intentos)
function exportStudentCSV() {
  if (!selectedUid.value) return;
  const headers = ["fechaISO", "problema", "respuesta", "resultado", "alumnoUid", "alumnoEmail"];
  const rows = studentAttempts.value.map(a => [
    tsISO(a.answeredAt),
    a.problemTitle || a.problemId,
    (a.answerIndex ?? 0) + 1,
    a.isCorrect ? "Correcto" : "Incorrecto",
    a.userUid,
    a.userEmail ?? ""
  ]);
  const name = (selectedEmail.value || selectedUid.value || "alumno").replace(/[^\w.-]+/g, "_");
  downloadCSV(`reporte_${name}.csv`, toCSV(headers, rows));
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-between gap-3">
  <h1 class="text-2xl font-semibold">Reporte Docente</h1>
  <div class="flex items-center gap-2">
    <button @click="manualRefresh" class="border rounded px-3 py-1 text-sm hover:bg-slate-50">
      Actualizar
    </button>
    <button @click="exportSummaryCSV" class="border rounded px-3 py-1 text-sm hover:bg-slate-50">
      Exportar resumen CSV
    </button>
  </div>
</div>

    <div
      v-if="error"
      class="text-red-700 text-sm border border-red-200 bg-red-50 p-3 rounded"
    >
      {{ error }}
      <div class="text-xs mt-1">
        Si el mensaje menciona "index", abre la consola: habrá un enlace para
        crear el índice requerido.
      </div>
    </div>

    <div v-if="loading">Cargando…</div>

    <div v-else class="grid md:grid-cols-3 gap-6">
      <!-- Lista de alumnos -->
      <aside class="md:col-span-1 space-y-3">
        <div class="border rounded p-3">
          <input
            v-model="search"
            type="text"
            placeholder="Buscar alumno por email o UID"
            class="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div class="border rounded overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-100">
              <tr>
                <th class="text-left p-2 border">Alumno</th>
                <th class="text-left p-2 border">Prec.</th>
                <th class="text-left p-2 border w-32">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in studentsFiltered"
                :key="s.uid"
                :class="[
                  'cursor-pointer hover:bg-slate-50',
                  selectedUid === s.uid ? 'bg-slate-50' : '',
                ]"
                @click="select(s.uid)"
              >
                <td class="p-2 border">
                  <div class="font-medium">{{ s.email || s.uid }}</div>
                  <div class="text-xs text-slate-500">
                    Intentos: {{ s.total }} • Aciertos: {{ s.correct }}
                  </div>
                </td>
                <td class="p-2 border">{{ (s.accuracy * 100).toFixed(0) }}%</td>
                <td class="p-2 border">
                  <button
                    class="text-sm underline"
                    @click.stop="select(s.uid)"
                    title="Ver reporte detallado"
                  >
                    Ver detalle
                  </button>
                </td>
              </tr>

              <tr v-if="studentsFiltered.length === 0">
                <td colspan="3" class="p-3 text-center text-slate-500">
                  Sin alumnos (todavía).
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </aside>

      <!-- Detalle del alumno -->
      <main class="md:col-span-2 space-y-4">
        <div v-if="!selectedUid" class="text-slate-600">
          Selecciona un alumno en la lista para ver su reporte detallado.
        </div>

        <div v-else class="space-y-4">
          <div>
            <h2 class="text-xl font-semibold">Alumno</h2>
            <p class="text-sm text-slate-600">
              {{ selectedEmail || selectedUid }}
            </p>
          </div>

          <div class="grid sm:grid-cols-3 gap-3">
            <div class="border rounded p-3">
              <div class="text-xs text-slate-500">Intentos</div>
              <div class="text-xl font-semibold">
                {{ studentAttempts.length }}
              </div>
            </div>
            <div class="border rounded p-3">
              <div class="text-xs text-slate-500">Correctos</div>
              <div class="text-xl font-semibold">
                {{ studentAttempts.filter((a) => a.isCorrect).length }}
              </div>
            </div>
            <div class="border rounded p-3">
              <div class="text-xs text-slate-500">Precisión</div>
              <div class="text-xl font-semibold">
                {{
                  studentAttempts.length
                    ? Math.round(
                        (studentAttempts.filter((a) => a.isCorrect).length /
                          studentAttempts.length) *
                          100
                      )
                    : 0
                }}%
              </div>
            </div>
          </div>

          <div class="border rounded overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-100">
                <tr>
                  <th class="text-left p-2 border">Fecha</th>
                  <th class="text-left p-2 border">Problema</th>
                  <th class="text-left p-2 border">Respuesta</th>
                  <th class="text-left p-2 border">Resultado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in studentAttempts" :key="a.id">
                  <td class="p-2 border">{{ fmt(a.answeredAt) }}</td>
                  <td class="p-2 border">
                    {{ a.problemTitle || a.problemId }}
                  </td>
                  <td class="p-2 border">Opción #{{ (a.answerIndex ?? 0) + 1 }}</td>
                  <td class="p-2 border">
                    <span :class="a.isCorrect ? 'text-green-700' : 'text-red-700'">
                      {{ a.isCorrect ? "Correcto" : "Incorrecto" }}
                    </span>
                  </td>
                </tr>
                <tr v-if="studentAttempts.length === 0">
                  <td colspan="4" class="p-3 text-center text-slate-500">
                    Este alumno aún no tiene intentos.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  </section>
</template>





