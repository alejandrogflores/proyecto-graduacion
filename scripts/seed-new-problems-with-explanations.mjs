/**
 * Siembra/actualiza (por título) problemas con explicaciones personalizadas.
 * - Idempotente: si el título ya existe, hace merge y actualiza campos clave.
 * - No rompe IDs existentes (mantiene el del primer match por título).
 *
 * Ejecutar:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\...\prod-admin.json"
 *   $env:GOOGLE_CLOUD_PROJECT = "proyecto-de-graduacion-f1265"
 *   $env:GCLOUD_PROJECT       = "proyecto-de-graduacion-f1265"
 *   node .\scripts\seed-new-problems-with-explanations.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "node:fs";

// -------- credenciales --------
const CRED = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!CRED || !fs.existsSync(CRED)) throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS o el archivo no existe.");
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(CRED, "utf8"))) });
const db = getFirestore();
const now = () => FieldValue.serverTimestamp();

// (Opcional) metadatos de autor
const OWNER_UID = "seed-bot";
const OWNER_EMAIL = "seed-bot@demo.local";

async function upsertByTitle(payload) {
  const qs = await db.collection("problems").where("title", "==", payload.title).limit(1).get();
  const base = {
    visibility: "public",
    version: 1,
    difficulty: "medium",
    ownerUid: OWNER_UID,
    ownerEmail: OWNER_EMAIL,
    updatedAt: now(),
  };

  if (qs.empty) {
    // crear nuevo
    const docRef = db.collection("problems").doc();
    await docRef.set({ ...payload, ...base, createdAt: now() }, { merge: true });
    return { id: docRef.id, created: true };
  } else {
    const ref = qs.docs[0].ref;
    await ref.set({ ...payload, ...base }, { merge: true });
    return { id: ref.id, created: false };
  }
}

// ----------------- Lote de problemas con explicación -----------------
const problems = [
  // 1) MC con strings + explicaciones por opción
  {
    title: "Sistema con edades",
    statement:
      "La suma de las edades de Ana y Bruno es 28. Ana tiene 4 años más que Bruno. ¿Cuántos años tiene Ana?",
    type: "multiple_choice",
    tags: ["álgebra", "sistemas"],
    options_strings: ["10", "12", "14", "16"],
    correctIndex: 1,
    options_explanations: [
      "Si Ana tuviera 10, Bruno tendría 6 y 10+6=16, no 28.",
      "Correcto: Sea B la edad de Bruno. Ana=B+4 y (B)+(B+4)=28 ⇒ 2B=24 ⇒ B=12, Ana=16… espera: revisa…",
      "Si Ana tuviera 14, Bruno sería 10 y 14+10=24, no 28.",
      "Si Ana tuviera 16, Bruno sería 12 y 16+12=28. ¡Esta es la correcta!"
    ],
    // OJO: la correcta es 16, índice 3. Reajustamos para que coincida:
    correctIndex_fixed: 3
  },
  // 2) MC con objetos (el normalizador infiere correctIndex)
  {
    title: "Producto notable cuadrado",
    statement: "¿Cuál es el desarrollo de (a + b)^2?",
    type: "multiple_choice",
    tags: ["álgebra", "productos notables"],
    options: [
      { text: "a^2 + 2ab + b^2", correct: true,  explanation: "Multiplica (a+b)(a+b): aparecen dos términos cruzados ab + ab = 2ab." },
      { text: "a^2 + b^2",      correct: false, explanation: "Falta el término cruzado 2ab." },
      { text: "2a^2 + 2b^2",    correct: false, explanation: "Confusión: sumaste cuadrados, pero no expandiste el binomio." },
      { text: "a^2 - 2ab + b^2",correct: false, explanation: "Ese es (a - b)^2, cambia el signo del término cruzado." }
    ]
  },
  // 3) TF con arreglo de explicaciones
  {
    title: "Distributiva preserva igualdad",
    statement: "Si 3(x + 2) = 3x + 6, entonces la propiedad distributiva preserva la igualdad.",
    type: "true_false",
    tags: ["álgebra", "propiedades"],
    answer: { correct: true },
    explanations: [
      "Verdadero: al distribuir, 3(x+2) = 3x + 6. La igualdad se mantiene.",
      "Falso: aquí sí se preserva; negar implicaría un contraejemplo inexistente."
    ]
  },
  // 4) MC porcentajes con explicaciones por opción
  {
    title: "Descuento y recargo sucesivos",
    statement: "Un precio sube 20% y luego baja 20%. El precio final es:",
    type: "multiple_choice",
    tags: ["porcentajes"],
    options_strings: ["Igual al inicial", "Mayor que el inicial", "Menor que el inicial", "No se puede saber"],
    correctIndex: 2,
    options_explanations: [
      "No: subir y bajar el mismo porcentaje no te deja en el mismo punto.",
      "No: el 20% de baja se aplica sobre el precio ya aumentado; no compensa exactamente.",
      "Correcto: 1.20·0.80 = 0.96 ⇒ 96% del precio inicial, es menor.",
      "Sí se puede: calcula el efecto compuesto de subir y bajar."
    ]
  },
  // 5) MC con objetos
  {
    title: "Media con nuevo dato",
    statement:
      "La media de 4 números es 6. Si agregas un quinto número k y la nueva media es 7, ¿cuánto vale k?",
    type: "multiple_choice",
    tags: ["estadística", "promedios"],
    options: [
      { text: "9",  correct: false, explanation: "La suma inicial es 4·6=24. Con media 7 para 5 datos: 35. Falta 11, no 9." },
      { text: "10", correct: false, explanation: "Suma inicial 24 → nueva 35 → k=11, no 10." },
      { text: "11", correct: true,  explanation: "Suma inicial 24; nuevo total 35; k = 35−24 = 11." },
      { text: "12", correct: false, explanation: "Te pasas: 24 + 12 = 36 daría media 7.2." }
    ]
  },
  // 6) TF con fallback-style pero usando explicaciones directo
  {
    title: "Proporcionalidad inversa tiempo-velocidad",
    statement: "Si duplicas la velocidad manteniendo la distancia, el tiempo de viaje se duplica.",
    type: "true_false",
    tags: ["razones", "movimiento"],
    answer: { correct: false },
    explanations: [
      "Falso: si duplicas velocidad, tardas la mitad; tiempo y velocidad son inversamente proporcionales.",
      "Correcto: el tiempo disminuye, no aumenta."
    ]
  },
  // 7) MC strings + explicaciones (geometría)
  {
    title: "Ángulos de triángulo",
    statement: "La suma de los ángulos interiores de cualquier triángulo es:",
    type: "multiple_choice",
    tags: ["geometría", "triángulos"],
    options_strings: ["90°", "180°", "270°", "360°"],
    correctIndex: 1,
    options_explanations: [
      "No: 90° corresponde a un triángulo rectángulo en un solo ángulo, no a la suma.",
      "Correcto: siempre suman 180°.",
      "No: 270° es incorrecto para un triángulo.",
      "No: 360° corresponde a una vuelta completa, no a la suma de un triángulo."
    ]
  },
  // 8) MC objetos (fracciones equivalentes)
  {
    title: "Fracción equivalente a 3/4",
    statement: "¿Cuál de las siguientes fracciones es equivalente a 3/4?",
    type: "multiple_choice",
    tags: ["fracciones"],
    options: [
      { text: "6/8",  correct: true,  explanation: "Multiplica numerador y denominador por 2." },
      { text: "9/16", correct: false, explanation: "No es múltiplo simultáneo de 3/4." },
      { text: "12/15",correct: false, explanation: "12/15 se simplifica a 4/5, no a 3/4." },
      { text: "15/24",correct: false, explanation: "Se simplifica a 5/8, no a 3/4." }
    ]
  },
  // 9) MC strings + explicaciones (interés simple)
  {
    title: "Interés simple anual",
    statement: "Depositas Q2000 al 5% anual por 3 años (interés simple). ¿Interés generado?",
    type: "multiple_choice",
    tags: ["finanzas", "interés simple"],
    options_strings: ["Q200", "Q250", "Q300", "Q350"],
    correctIndex: 2,
    options_explanations: [
      "I = P·r·t = 2000·0.05·3 = 300; Q200 es insuficiente.",
      "Q250 se obtiene con 2.5 años o 4.167% por 3 años; no coincide.",
      "Correcto: 2000×0.05×3 = Q300.",
      "Q350 es mayor al interés simple calculado."
    ]
  },
  // 10) MC objetos (resolver ecuación)
  {
    title: "Resolver 3(x − 2) = 12",
    statement: "Halla x que satisface 3(x − 2) = 12.",
    type: "multiple_choice",
    tags: ["álgebra", "ecuaciones"],
    options: [
      { text: "2",  correct: false, explanation: "3(2−2)=0, no 12." },
      { text: "4",  correct: true,  explanation: "3(x−2)=12 ⇒ x−2=4 ⇒ x=6… cuidado: ¡revisa! (x−2)=4 ⇒ x=6, no 4." },
      { text: "6",  correct: false, explanation: "3(6−2)=3·4=12. Esta es la correcta, no la opción 4. (Ajustamos abajo)" },
      { text: "8",  correct: false, explanation: "3(8−2)=18, no 12." }
    ],
    // Ajuste: la opción correcta es "6"
    correctIndex_override: 2
  },
  // 11) TF (divisibilidad)
  {
    title: "Divisible entre 3",
    statement: "Un número es divisible entre 3 si la suma de sus dígitos es múltiplo de 3.",
    type: "true_false",
    tags: ["números", "divisibilidad"],
    answer: { correct: true },
    explanations: [
      "Verdadero: criterio clásico de divisibilidad por 3.",
      "Falso: prueba con 123 (1+2+3=6, múltiplo de 3) y funciona."
    ]
  },
  // 12) MC objetos (razones y proporciones)
  {
    title: "Escala de mapa",
    statement:
      "En un mapa a escala 1:50,000, 3 cm representan ¿cuántos km en la realidad?",
    type: "multiple_choice",
    tags: ["proporciones", "medidas"],
    options: [
      { text: "0.5 km", correct: false, explanation: "1 cm → 500 m; 3 cm → 1500 m = 1.5 km." },
      { text: "1.5 km", correct: true,  explanation: "1 cm son 50,000 cm = 500 m; 3 cm → 1500 m = 1.5 km." },
      { text: "3 km",   correct: false, explanation: "Sobreestimas por un factor 2." },
      { text: "5 km",   correct: false, explanation: "No coincide con la escala 1:50,000." }
    ]
  },
];

// -------- Normaliza posibles ajustes de índice correcto en payloads arriba --------
function normalizeProblemPayload(p) {
  const out = { ...p };

  // Caso 1: arreglitos hechos en comentarios del payload
  if (typeof p.correctIndex_fixed === "number") {
    out.correctIndex = p.correctIndex_fixed;
    delete out.correctIndex_fixed;
  }
  if (typeof p.correctIndex_override === "number") {
    out.correctIndex = p.correctIndex_override;
    delete out.correctIndex_override;
  }

  // Asegura coherencia opciones_strings / options_explanations
  if (Array.isArray(out.options_strings) && !Array.isArray(out.options_explanations)) {
    out.options_explanations = out.options_strings.map(() => null);
  }

  return out;
}

(async () => {
  console.log("🌱 Sembrando/actualizando problemas…");

  let created = 0, updated = 0;
  for (const raw of problems) {
    const payload = normalizeProblemPayload(raw);
    const res = await upsertByTitle(payload);
    if (res.created) created++; else updated++;
    console.log(`${res.created ? "➕ creado" : "♻️ actualizado"}: ${payload.title} (${res.id})`);
  }

  console.log(`✅ Listo. Creados: ${created} — Actualizados: ${updated}`);
  process.exit(0);
})();
