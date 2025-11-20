/**
 * Migración segura para añadir/completear explicaciones de problemas.
 * - Idempotente: puedes ejecutarlo varias veces.
 * - No cambia IDs.
 * - Respeta explicaciones ya existentes por opción.
 *
 * Casos soportados:
 * - multiple_choice:
 *    a) options_explanations (string[] por opción)
 *    b) options: [{ text, correct, explanation? }] (explicación por opción)
 *    c) fallback general con explanationCorrect/explanationWrong (+ correctIndex u options[].correct)
 *    d) "rellenar huecos": completa null/vacíos en options_explanations con fallback sin sobreescribir textos existentes
 *
 * - true_false:
 *    a) explanations: [expTrue, expFalse]
 *    b) fallback general: explanationCorrect/explanationWrong (o alias en answer.*)
 *
 * Variables de entorno requeridas:
 *   GOOGLE_APPLICATION_CREDENTIALS (ruta absoluta al service account json)
 *   GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT (solo informativo)
 *
 * Ejecutar:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\...\prod-admin.json"
 *   $env:GOOGLE_CLOUD_PROJECT = "proyecto-de-graduacion-f1265"
 *   $env:GCLOUD_PROJECT       = "proyecto-de-graduacion-f1265"
 *   node .\scripts\migrate-add-fallback-explanations.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "node:fs";

function envOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno ${name}`);
  return v;
}

const CRED_PATH = envOrThrow("GOOGLE_APPLICATION_CREDENTIALS");
if (!fs.existsSync(CRED_PATH)) {
  throw new Error(`No existe el archivo de credenciales: ${CRED_PATH}`);
}
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(CRED_PATH, "utf8"))) });
const db = getFirestore();

/* -------------------- Utilidades de detección -------------------- */
function hasPerOptionExplanations(p) {
  // a) options_explanations con algún texto no vacío
  if (Array.isArray(p.options_explanations) && p.options_explanations.length > 0) {
    const anyText = p.options_explanations.some((x) => x != null && String(x).trim().length > 0);
    if (anyText) return true;
  }
  // b) options objeto con .explanation / alias
  if (Array.isArray(p.options) && p.options.length && typeof p.options[0] === "object") {
    const anyOptionHasExplanation = p.options.some(
      (o) => o && (o.explanation || o.feedback || o.why || o.rationale)
    );
    if (anyOptionHasExplanation) return true;
  }
  // c) true_false con arreglo explanations[2]
  if (p.type === "true_false" && Array.isArray(p.explanations) && p.explanations.length >= 2) {
    const anyText = p.explanations.some((x) => x != null && String(x).trim().length > 0);
    if (anyText) return true;
  }
  return false;
}

function inferCorrectIndex(p) {
  if (typeof p.correctIndex === "number") return p.correctIndex;
  if (Array.isArray(p.options) && p.options.length && typeof p.options[0] === "object") {
    const idx = p.options.findIndex((o) => o?.correct === true);
    return idx >= 0 ? idx : -1;
  }
  return -1;
}

function getOptionsCount(p) {
  if (Array.isArray(p.options_strings)) return p.options_strings.length;
  if (Array.isArray(p.options) && typeof p.options[0] === "string") return p.options.length;
  if (Array.isArray(p.options) && typeof p.options[0] === "object") return p.options.length;
  return 0;
}

function getFallbackCorrect(p) {
  return (
    p.explanationCorrect ??
    p.answer?.explanationCorrect ??
    p.answer?.trueExplanation ??
    p.trueExplanation ??
    null
  );
}

function getFallbackWrong(p) {
  return (
    p.explanationWrong ??
    p.answer?.explanationWrong ??
    p.answer?.falseExplanation ??
    p.falseExplanation ??
    null
  );
}

/* -------------------- Migración principal -------------------- */
(async () => {
  const dry = ["--dry", "--dry-run"].some((f) => process.argv.includes(f));
  console.log(`🔧 Migración explicaciones (dryRun=${dry})…`);

  const snap = await db.collection("problems").get();
  let scanned = 0;
  let updated = 0;

  for (const doc of snap.docs) {
    scanned++;
    const p = doc.data();
    const updates = {};

    try {
      if (p.type === "true_false") {
        // Si ya tiene explanations de 2 y con texto, no tocar.
        if (!hasPerOptionExplanations(p)) {
          const corr = getFallbackCorrect(p);
          const wron = getFallbackWrong(p);
          if (corr != null || wron != null) {
            // Genera arreglo [trueExp, falseExp] respetando que "correct" indica la verdadera
            const isTrueCorrect = p.answer?.correct === true; // true si la opción correcta es "Verdadero"
            const explanations = isTrueCorrect
              ? [corr ?? null, wron ?? null]
              : [wron ?? null, corr ?? null];

            // Solo si realmente no hay nada actualmente
            if (!(Array.isArray(p.explanations) && p.explanations.length >= 2)) {
              updates.explanations = explanations;
            } else {
              // Rellenar huecos si existen
              const cur = p.explanations.slice(0, 2);
              const filled = [0, 1].map((i) => {
                const val = cur[i];
                if (val != null && String(val).trim().length > 0) return val;
                return explanations[i];
              });
              if (JSON.stringify(filled) !== JSON.stringify(cur)) {
                updates.explanations = filled;
              }
            }
          }
        }
      } else {
        // multiple_choice y otros
        const optionsCount = getOptionsCount(p);
        const correctIndex = inferCorrectIndex(p);

        // Si ya hay explicaciones por opción con algún contenido, no tocar (pero sí podemos rellenar huecos)
        if (Array.isArray(p.options_explanations) && optionsCount > 0) {
          const corr = getFallbackCorrect(p);
          const wron = getFallbackWrong(p);

          if (corr != null || wron != null) {
            // Rellenar huecos con fallback, conservando existentes
            const existing = p.options_explanations.slice();
            const filled = Array.from({ length: optionsCount }, (_, i) => {
              const cur = existing[i];
              if (cur != null && String(cur).trim().length > 0) return cur;
              if (correctIndex >= 0) {
                return i === correctIndex ? (corr ?? null) : (wron ?? null);
              }
              // Si no se pudo inferir correctIndex, deja igual
              return cur ?? null;
            });
            if (JSON.stringify(filled) !== JSON.stringify(existing)) {
              updates.options_explanations = filled;
            }
          }
        } else if (!hasPerOptionExplanations(p)) {
          // No hay explicaciones por opción → aplicar fallback solo si hay datos globales
          if (optionsCount > 0 && correctIndex >= 0) {
            const corr = getFallbackCorrect(p);
            const wron = getFallbackWrong(p);
            if (corr != null || wron != null) {
              updates.options_explanations = Array.from({ length: optionsCount }, (_, i) =>
                i === correctIndex ? (corr ?? null) : (wron ?? null)
              );
            }
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = FieldValue.serverTimestamp();
        if (dry) {
          console.log(` (dry) → ${doc.id} ::`, updates);
        } else {
          await doc.ref.update(updates);
          updated++;
        }
      }
    } catch (e) {
      console.warn(`⚠️  Error procesando ${doc.id}:`, e?.message || e);
    }
  }

  console.log(`✅ Hecho. Escaneados: ${scanned} — Actualizados: ${updated}${dry ? " (dry-run)" : ""}`);
  process.exit(0);
})();
