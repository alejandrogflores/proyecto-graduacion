// scripts/seed-problems-critical.mjs
// Siembra 40 problemas (9º) con owner qa.teacher y visibilidad pública.

import admin from "firebase-admin";

// ───────────────────────────────────────────────────────────────────────────────
// Init (usa GOOGLE_APPLICATION_CREDENTIALS ya exportado)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
  });
}
const db = admin.firestore();

async function getUidByEmail(email) {
  const user = await admin.auth().getUserByEmail(email);
  return user.uid;
}

// ───────────────────────────────────────────────────────────────────────────────
// PROBLEMS: 40 items (10 base + 30 adicionales)
// ───────────────────────────────────────────────────────────────────────────────
const PROBLEMS = [
  // ───────────────── Base (10) ─────────────────
  {
    type: "multiple_choice",
    title: "Comparando descuentos",
    statement:
      "Una tienda ofrece un 30% de descuento en un producto de Q200, mientras otra ofrece un descuento directo de Q50. ¿Cuál opción es más conveniente?",
    difficulty: "medium",
    tags: ["porcentajes", "razonamiento"],
    options_strings: [
      "El 30% de descuento es mejor",
      "El descuento de Q50 es mejor",
      "Ambos descuentos son iguales",
      "Depende del tipo de producto",
    ],
    correctIndex: 0,
  },
  {
    type: "multiple_choice",
    title: "El billete falso",
    statement:
      "Un cliente paga con un billete falso de Q100. El vendedor no se da cuenta, da el producto (Q60) y Q40 de cambio. Cuando descubre el engaño, ¿cuánto perdió realmente el vendedor?",
    difficulty: "hard",
    tags: ["razonamiento", "problemas con dinero"],
    options_strings: ["Q60", "Q40", "Q100", "Q140"],
    correctIndex: 2,
  },
  {
    type: "true_false",
    title: "Raíz cuadrada negativa",
    statement:
      "La raíz cuadrada de un número negativo siempre es un número real negativo.",
    difficulty: "medium",
    tags: ["raíces", "números reales"],
    answerCorrect: false,
    explanationCorrect:
      "Las raíces cuadradas de números negativos no pertenecen a los números reales.",
    explanationWrong:
      "Recuerda que √(-1) no es real; pertenece a los números imaginarios.",
  },
  {
    type: "multiple_choice",
    title: "El viaje más rápido",
    statement:
      "Pedro recorre 120 km en 2 horas. Luis recorre 180 km en 3 horas. ¿Quién viaja a mayor velocidad promedio?",
    difficulty: "easy",
    tags: ["razonamiento proporcional", "velocidad"],
    options_strings: ["Pedro", "Luis", "Ambos viajan igual", "No se puede saber"],
    correctIndex: 2,
  },
  {
    type: "true_false",
    title: "Proporcionalidad directa",
    statement:
      "Si el precio de un artículo aumenta en proporción al peso, entonces duplicar el peso duplicará el precio.",
    difficulty: "easy",
    tags: ["proporcionalidad", "razonamiento lógico"],
    answerCorrect: true,
    explanationCorrect:
      "En una relación directamente proporcional, al duplicar una cantidad la otra también se duplica.",
    explanationWrong:
      "Revisa el concepto de proporcionalidad directa: si A ∝ B, entonces A/B es constante.",
  },
  {
    type: "multiple_choice",
    title: "El tanque misterioso",
    statement:
      "Un tanque se llena con dos llaves. La llave A llena el tanque en 4 horas y la llave B en 6 horas. Si se abren juntas, ¿en cuánto tiempo se llenará el tanque?",
    difficulty: "hard",
    tags: ["razonamiento lógico", "problemas de trabajo conjunto"],
    options_strings: ["2 horas", "2.4 horas", "3 horas", "3.5 horas"],
    correctIndex: 1,
  },
  {
    type: "multiple_choice",
    title: "El número escondido",
    statement:
      "Piensa en un número. Si le sumas 5, multiplicas el resultado por 3 y luego restas 9, obtienes 27. ¿Cuál era el número inicial?",
    difficulty: "medium",
    tags: ["álgebra", "razonamiento"],
    options_strings: ["5", "6", "7", "8"],
    correctIndex: 1,
  },
  {
    type: "true_false",
    title: "Divisibilidad por 9",
    statement:
      "Un número es divisible por 9 si la suma de sus cifras también es divisible por 9.",
    difficulty: "medium",
    tags: ["divisibilidad", "aritmética"],
    answerCorrect: true,
    explanationCorrect:
      "La regla de divisibilidad por 9 se basa en la congruencia módulo 9.",
    explanationWrong:
      "Prueba con el número 81: 8 + 1 = 9, y ambos son divisibles por 9.",
  },
  {
    type: "multiple_choice",
    title: "La mesa cuadrada",
    statement:
      "Una mesa cuadrada tiene un perímetro de 8 metros. Si se duplica el largo de cada lado, ¿cómo cambia el perímetro?",
    difficulty: "easy",
    tags: ["geometría", "razonamiento"],
    options_strings: ["Se duplica", "Se cuadruplica", "No cambia", "Se reduce a la mitad"],
    correctIndex: 0,
  },
  {
    type: "true_false",
    title: "Probabilidad justa",
    statement:
      "Si una moneda no está cargada, la probabilidad de obtener cara o cruz es exactamente igual.",
    difficulty: "easy",
    tags: ["probabilidad", "razonamiento"],
    answerCorrect: true,
    explanationCorrect:
      "En una moneda justa, cada resultado tiene probabilidad 1/2.",
    explanationWrong:
      "Recuerda que 'justa' significa que no hay sesgo hacia ningún resultado.",
  },

  // ──────────────── Porcentajes (10) ────────────────
  {
    type: "multiple_choice",
    title: "El precio del descuento",
    statement: "Un pantalón cuesta Q160 y tiene un 25% de descuento. ¿Cuál es el precio final?",
    difficulty: "easy",
    tags: ["porcentajes", "descuentos"],
    options_strings: ["Q120", "Q125", "Q100", "Q140"],
    correctIndex: 0
  },
  {
    type: "true_false",
    title: "Aumento del 50%",
    statement: "Si un producto aumenta un 50%, su nuevo valor es 1.5 veces el original.",
    difficulty: "easy",
    tags: ["porcentajes"],
    answerCorrect: true,
    explanationCorrect: "Un aumento del 50% equivale a multiplicar por 1.5.",
    explanationWrong: "Recuerda que un aumento del 100% equivale a duplicar, por lo tanto, 50% es 1.5 veces."
  },
  {
    type: "multiple_choice",
    title: "Ganancia del comerciante",
    statement: "Un comerciante compra un producto por Q80 y lo vende a Q100. ¿Cuál es su porcentaje de ganancia?",
    difficulty: "medium",
    tags: ["porcentajes", "ganancia"],
    options_strings: ["15%", "20%", "25%", "30%"],
    correctIndex: 1
  },
  {
    type: "multiple_choice",
    title: "Descuento en cadena",
    statement: "Un artículo tiene primero un 10% de descuento y luego un 20% adicional sobre el precio ya rebajado. ¿Cuál es el descuento total aproximado?",
    difficulty: "hard",
    tags: ["porcentajes", "descuentos"],
    options_strings: ["28%", "30%", "32%", "25%"],
    correctIndex: 0
  },
  {
    type: "true_false",
    title: "Porcentaje negativo",
    statement: "Un porcentaje negativo indica una disminución o pérdida.",
    difficulty: "medium",
    tags: ["porcentajes"],
    answerCorrect: true,
    explanationCorrect: "Porcentajes negativos se usan para representar reducciones.",
    explanationWrong: "Piensa en una empresa que pierde 10% de sus ingresos: el cambio es negativo."
  },
  {
    type: "multiple_choice",
    title: "El impuesto escondido",
    statement: "Un artículo cuesta Q150 sin IVA. Si el IVA es del 12%, ¿cuál es el precio con IVA incluido?",
    difficulty: "easy",
    tags: ["porcentajes", "IVA"],
    options_strings: ["Q162", "Q165", "Q168", "Q180"],
    correctIndex: 2 // 150 * 1.12 = 168
  },
  {
    type: "multiple_choice",
    title: "Rebaja equivocada",
    statement: "Si un artículo baja 20% y luego sube 20%, ¿recupera su precio original?",
    difficulty: "medium",
    tags: ["porcentajes", "razonamiento"],
    options_strings: ["Sí, vuelve al mismo precio", "No, queda más barato", "No, queda más caro", "Depende del producto"],
    correctIndex: 1
  },
  {
    type: "true_false",
    title: "Porcentaje de error",
    statement: "Si esperabas ganar 100 puntos y obtuviste 90, el error es del 10%.",
    difficulty: "medium",
    tags: ["porcentajes", "razonamiento"],
    answerCorrect: true,
    explanationCorrect: "La diferencia es 10 sobre 100, lo que equivale al 10%.",
    explanationWrong: "El porcentaje de error se calcula comparando la diferencia con el valor esperado."
  },
  {
    type: "multiple_choice",
    title: "Inversión rentable",
    statement: "Si una inversión de Q500 crece 15% mensual, ¿cuánto tendrás al final del primer mes?",
    difficulty: "easy",
    tags: ["porcentajes", "finanzas"],
    options_strings: ["Q515", "Q550", "Q575", "Q600"],
    correctIndex: 2
  },
  {
    type: "multiple_choice",
    title: "Comparación de rebajas",
    statement: "Una tienda A aplica 25% de descuento y otra 15% más un cupón del 10%. ¿Cuál ofrece mayor rebaja total?",
    difficulty: "hard",
    tags: ["porcentajes", "descuentos"],
    options_strings: ["Tienda A", "Tienda B", "Ambas son iguales", "Depende del producto"],
    correctIndex: 0
  },

  // ──────────────── Álgebra (10) ────────────────
  {
    type: "multiple_choice",
    title: "El número misterioso",
    statement: "Si al triple de un número se le suma 5, se obtiene 26. ¿Cuál es el número?",
    difficulty: "easy",
    tags: ["álgebra", "ecuaciones"],
    options_strings: ["6", "7", "8", "9"],
    correctIndex: 1
  },
  {
    type: "true_false",
    title: "Propiedad distributiva",
    statement: "La expresión 3(x + 4) es igual a 3x + 4.",
    difficulty: "medium",
    tags: ["álgebra", "propiedades"],
    answerCorrect: false,
    explanationCorrect: "Debe multiplicarse todo el paréntesis: 3x + 12.",
    explanationWrong: "Revisa cómo se aplica la propiedad distributiva."
  },
  {
    type: "multiple_choice",
    title: "Ecuación balanceada",
    statement: "Si 2x + 5 = 15, ¿cuál es el valor de x?",
    difficulty: "easy",
    tags: ["álgebra", "ecuaciones"],
    options_strings: ["4", "5", "6", "7"],
    correctIndex: 1 // x = 5
  },
  {
    type: "multiple_choice",
    title: "Simplificando",
    statement: "Simplifica: 4x - 2x + 5x.",
    difficulty: "easy",
    tags: ["álgebra", "simplificación"],
    options_strings: ["11x", "7x", "6x", "9x"],
    correctIndex: 1
  },
  {
    type: "true_false",
    title: "Valor de cero",
    statement: "Si un producto de dos factores es cero, al menos uno de ellos debe ser cero.",
    difficulty: "medium",
    tags: ["álgebra", "propiedad del cero"],
    answerCorrect: true,
    explanationCorrect: "Esta es la propiedad del producto nulo.",
    explanationWrong: "Recuerda que 0 × cualquier número = 0."
  },
  {
    type: "multiple_choice",
    title: "Ecuación cuadrática",
    statement: "Si x² = 49, ¿cuál es el valor de x?",
    difficulty: "medium",
    tags: ["álgebra", "ecuaciones cuadráticas"],
    options_strings: ["7", "-7", "±7", "14"],
    correctIndex: 2
  },
  {
    type: "multiple_choice",
    title: "Factorización básica",
    statement: "Factoriza: x² + 5x.",
    difficulty: "easy",
    tags: ["álgebra", "factorización"],
    options_strings: ["x(x + 5)", "(x + 5)²", "(x + 1)(x + 4)", "x + 5x"],
    correctIndex: 0
  },
  {
    type: "true_false",
    title: "Ecuaciones equivalentes",
    statement: "Multiplicar ambos lados de una ecuación por el mismo número cambia su solución.",
    difficulty: "medium",
    tags: ["álgebra", "ecuaciones"],
    answerCorrect: false,
    explanationCorrect: "Mientras no sea cero, multiplicar ambos lados mantiene la equivalencia.",
    explanationWrong: "Recuerda que solo alterarías la ecuación si multiplicas por 0."
  },
  {
    type: "multiple_choice",
    title: "La edad de Ana",
    statement: "La edad de Ana es el doble de la de su hermano. Si la suma de sus edades es 18, ¿cuántos años tiene Ana?",
    difficulty: "medium",
    tags: ["álgebra", "problemas de edad"],
    options_strings: ["6", "9", "12", "15"],
    correctIndex: 2
  },
  {
    type: "multiple_choice",
    title: "Resolviendo el sistema",
    statement: "Si x + y = 10 y x - y = 2, ¿cuál es el valor de x?",
    difficulty: "hard",
    tags: ["álgebra", "sistemas de ecuaciones"],
    options_strings: ["4", "5", "6", "8"],
    correctIndex: 2
  },

  // ──────────────── Vida real (10) ────────────────
  {
    type: "multiple_choice",
    title: "El agua y el tiempo",
    statement: "Un grifo llena un tanque en 6 horas y otro en 8 horas. Si trabajan juntos, ¿en cuánto tiempo lo llenan?",
    difficulty: "hard",
    tags: ["razonamiento", "vida real"],
    options_strings: ["3.4 h", "3.5 h", "4 h", "7 h"],
    correctIndex: 0 // 1/6 + 1/8 = 7/24 → 24/7 ≈ 3.43 h
  },
  {
    type: "true_false",
    title: "El celular con descuento",
    statement: "Si un celular de Q2000 tiene un descuento del 10%, el precio final será Q1800.",
    difficulty: "easy",
    tags: ["vida real", "porcentajes"],
    answerCorrect: true,
    explanationCorrect: "El 10% de Q2000 es Q200, por lo tanto el precio final es Q1800.",
    explanationWrong: "Revisa la resta: 2000 - 200 = 1800."
  },
  {
    type: "multiple_choice",
    title: "El viaje de regreso",
    statement: "Un autobús viaja 100 km a 50 km/h y regresa a 30 km/h. ¿Cuál es su velocidad promedio total?",
    difficulty: "hard",
    tags: ["vida real", "velocidad promedio"],
    options_strings: ["37.5 km/h", "35 km/h", "40 km/h", "30 km/h"],
    correctIndex: 0 // promedio para tramos iguales: 2ab/(a+b) = 2*50*30/80 = 37.5
  },
  {
    type: "true_false",
    title: "El recibo de luz",
    statement: "Si el precio por kWh sube 10% y tu consumo se mantiene igual, pagarás 10% más.",
    difficulty: "easy",
    tags: ["vida real", "porcentajes"],
    answerCorrect: true,
    explanationCorrect: "El precio unitario influye directamente en el costo total.",
    explanationWrong: "El aumento afecta el costo final si el consumo es el mismo."
  },
  {
    type: "multiple_choice",
    title: "La carrera de bicicletas",
    statement: "Luis tarda 2 horas en recorrer 40 km. Ana recorre 60 km en 3 horas. ¿Quién tiene mayor velocidad promedio?",
    difficulty: "medium",
    tags: ["vida real", "razonamiento"],
    options_strings: ["Luis", "Ana", "Ambos igual", "No se puede saber"],
    correctIndex: 2
  },
  {
    type: "multiple_choice",
    title: "El préstamo bancario",
    statement: "Un préstamo de Q5000 genera 5% de interés mensual simple. ¿Cuánto se pagará solo de interés después de 4 meses?",
    difficulty: "medium",
    tags: ["vida real", "finanzas"],
    options_strings: ["Q1000", "Q1200", "Q800", "Q1500"],
    correctIndex: 0 // 5000 * 0.05 * 4 = 1000
  },
  {
    type: "true_false",
    title: "Tiempo y distancia",
    statement: "Si duplicas la velocidad, el tiempo del recorrido también se duplica.",
    difficulty: "medium",
    tags: ["vida real", "razonamiento"],
    answerCorrect: false,
    explanationCorrect: "El tiempo es inversamente proporcional a la velocidad.",
    explanationWrong: "Recuerda: mayor velocidad, menor tiempo."
  },
  {
    type: "multiple_choice",
    title: "El ahorro inteligente",
    statement: "Si ahorras Q300 al mes durante 2 años, ¿cuánto tendrás al final?",
    difficulty: "easy",
    tags: ["vida real", "finanzas"],
    options_strings: ["Q6000", "Q7200", "Q3600", "Q5400"],
    correctIndex: 1
  },
  {
    type: "multiple_choice",
    title: "El teléfono nuevo",
    statement: "Compras un teléfono en 6 pagos iguales de Q250. Si pagas todo al contado te hacen 10% de descuento. ¿Cuánto pagarías al contado?",
    difficulty: "medium",
    tags: ["vida real", "porcentajes"],
    options_strings: ["Q1350", "Q1400", "Q1450", "Q1500"],
    correctIndex: 0
  },
  {
    type: "true_false",
    title: "El tanque y la fuga",
    statement: "Si un tanque se llena en 4 horas y se vacía en 8, trabajando ambos procesos al mismo tiempo se llenará en menos de 4 horas.",
    difficulty: "hard",
    tags: ["vida real", "razonamiento"],
    answerCorrect: false,
    explanationCorrect: "La fuga reduce el flujo neto, por lo tanto el llenado tarda más de 4 horas.",
    explanationWrong: "Analiza el efecto combinado de llenar y vaciar simultáneamente."
  }
];

// Helpers para mapear al esquema que tu app ya usa/lee
const nowTS = () => admin.firestore.FieldValue.serverTimestamp();

function buildDocBase(ownerUid) {
  return {
    ownerUid,
    visibility: "public", // <- clave para que lo vea david.us y cualquier teacher
    version: 1,
    createdAt: nowTS(),
    updatedAt: nowTS(),
  };
}

function toFirestoreDoc(p, ownerUid) {
  const base = buildDocBase(ownerUid);

  if (p.type === "true_false") {
    return {
      ...base,
      type: "true_false",
      title: p.title,
      statement: p.statement,
      difficulty: p.difficulty,
      tags: p.tags || [],
      answer: { correct: Boolean(p.answerCorrect) },
      explanationCorrect: p.explanationCorrect ?? null,
      explanationWrong: p.explanationWrong ?? null,
      explanations: [p.explanationCorrect ?? "", p.explanationWrong ?? ""],
    };
  }

  // multiple_choice
  const optionsStrings = p.options_strings ?? [];
  const correctIndex = Number(p.correctIndex ?? 0);
  const options = optionsStrings.map((text, i) => ({
    text,
    correct: i === correctIndex,
  }));

  return {
    ...base,
    type: "multiple_choice",
    allowMultiple: false,
    title: p.title,
    statement: p.statement,
    difficulty: p.difficulty,
    tags: p.tags || [],
    options_strings: optionsStrings,
    options,
    correctIndex,
  };
}

async function main() {
  const qaEmail = "qa.teacher@ccb.edu.gt";
  const teacherEmail = "david.us@ccb.edu.gt";

  console.log("🌱 Seed de problemas (crítico 9º) en PRODUCCIÓN…");
  console.log("🔧 PROJECT_ID:", process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT);

  // Validar que existan ambos usuarios (el segundo sólo para informar)
  const qaUid = await getUidByEmail(qaEmail);
  const teacherUid = await getUidByEmail(teacherEmail);

  console.log("👤 Owner (QA):", qaEmail, "→", qaUid);
  console.log("👀 Visibles para teacher:", teacherEmail, "→", teacherUid, "(por visibility=public)");

  let created = 0;
  for (const p of PROBLEMS) {
    const doc = toFirestoreDoc(p, qaUid);
    const ref = db.collection("problems").doc(); // id auto
    await ref.set(doc);
    created++;
    console.log(`✔️  [+] ${p.type} — ${p.title}`);
  }

  console.log(`✅ Listo: ${created} problemas creados como públicos (owner=${qaEmail}).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error en seed:", err);
    process.exit(1);
  });
