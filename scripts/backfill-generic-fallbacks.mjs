import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "node:fs";

const CRED = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!CRED || !fs.existsSync(CRED)) throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS o archivo no existe");
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(CRED, "utf8"))) });
const db = getFirestore();

function hasPerOptionExplanations(p) {
  if (Array.isArray(p.options_explanations) && p.options_explanations.some(x => x && String(x).trim())) return true;
  if (Array.isArray(p.options) && p.options.length && typeof p.options[0] === "object") {
    return p.options.some(o => o && (o.explanation || o.feedback || o.why || o.rationale));
  }
  if (p.type === "true_false" && Array.isArray(p.explanations) && p.explanations.some(x => x && String(x).trim())) {
    return true;
  }
  return false;
}

function hasFallback(p) {
  const corr = p.explanationCorrect ?? p.answer?.explanationCorrect ?? p.answer?.trueExplanation ?? p.trueExplanation ?? null;
  const wron = p.explanationWrong   ?? p.answer?.explanationWrong   ?? p.answer?.falseExplanation ?? p.falseExplanation ?? null;
  return (corr != null) || (wron != null);
}

// Mensajes genéricos por tipo (puedes personalizar)
function genericTexts(p) {
  if (p.type === "true_false") {
    return {
      explanationCorrect: "Esta afirmación coincide con la definición/propiedad correcta del enunciado.",
      explanationWrong: "Revisa la definición o contraejemplos: esta opción no se ajusta al enunciado."
    };
  }
  // multiple_choice y otros
  return {
    explanationCorrect: "Esta opción satisface correctamente el planteamiento del problema.",
    explanationWrong: "Vuelve a plantear el problema y verifica las operaciones; esta opción no cumple las condiciones."
  };
}

(async () => {
  const dry = ["--dry", "--dry-run"].some((f) => process.argv.includes(f));
  console.log(`🧩 Backfill genérico de fallbacks (dryRun=${dry})…`);

  const snap = await db.collection("problems").get();
  let scanned = 0, updated = 0;

  for (const doc of snap.docs) {
    scanned++;
    const p = doc.data();

    // Si ya hay explicaciones por opción o ya hay fallbacks, no hacemos nada
    if (hasPerOptionExplanations(p) || hasFallback(p)) continue;

    const { explanationCorrect, explanationWrong } = genericTexts(p);
    const updates = {
      explanationCorrect,
      explanationWrong,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (dry) {
      console.log(`(dry) ${doc.id} "${p.title}" → añade fallbacks`);
    } else {
      await doc.ref.update(updates);
      updated++;
    }
  }

  console.log(`✅ Backfill listo. Escaneados: ${scanned} — Actualizados: ${updated}${dry ? " (dry-run)" : ""}`);
  process.exit(0);
})();
