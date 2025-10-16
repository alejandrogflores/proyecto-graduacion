// src/models/problem.ts
import type { Timestamp } from "firebase/firestore";

/* =========================
   Tipos de problema
========================= */
export type ProblemType =
  | "multiple_choice"
  | "true_false"
  | "short_text"
  | "numeric"
  | "ordering"
  | "matching"
  | "open_rubric";

/** Múltiple opción */
export type MCOption = { text: string; correct?: boolean; };

export type ProblemBase = {
  id?: string;
  ownerUid?: string | null;      // opcional (por si lo usas)
  title: string;
  statement: string;             // markdown permitido
  type: ProblemType;
  points?: number;               // default 1
  tags?: string[];

  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy?: string | null;
};

/** True/False */
export type TFOption = { correct: boolean };

/** Short text */
export type ShortTextMode = "exact" | "regex" | "levenshtein";
export type ShortTextSpec = {
  mode: ShortTextMode;
  answers: string[];          // exactas o patrones
  threshold?: number;         // distancia máx (levenshtein)
  caseSensitive?: boolean;
  trim?: boolean;
};

/** Numeric */
export type NumericSpec = {
  mode: "value" | "range" | "tolerance";
  value?: number;
  min?: number;
  max?: number;
  tolerance?: number;
  precision?: number;         // redondeo de input
};

/** Ordering / Matching / Open rubric (placeholders) */
export type OrderingSpec = { items: string[]; shuffleOnPlay?: boolean };
export type MatchingPair = { left: string; right: string };
export type MatchingSpec = { pairs: MatchingPair[]; shuffleOnPlay?: boolean };
export type RubricLevel = { label: string; points: number; description?: string };
export type OpenRubricSpec = { maxPoints: number; criteria?: RubricLevel[] };

/** Unión completa de problemas soportados */
export type Problem =
  | (ProblemBase & { type: "multiple_choice"; options: MCOption[]; allowMultiple?: boolean })
  | (ProblemBase & { type: "true_false";    answer: TFOption })
  | (ProblemBase & { type: "short_text";    spec: ShortTextSpec })
  | (ProblemBase & { type: "numeric";       spec: NumericSpec })
  | (ProblemBase & { type: "ordering";      spec: OrderingSpec })
  | (ProblemBase & { type: "matching";      spec: MatchingSpec })
  | (ProblemBase & { type: "open_rubric";   spec: OpenRubricSpec });

/* =========================
   Compatibilidad Legacy
   (tu formato anterior)
========================= */
export type LegacyProblem = {
  id?: string;
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  tags?: string[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy?: string | null;
  ownerUid?: string | null;
};

/** Detecta si un objeto parece ser legacy (sin `type`) */
export function isLegacyProblem(p: any): p is LegacyProblem {
  return p && !p.type && Array.isArray(p.options) && typeof p.correctIndex === "number";
}

/** Convierte Legacy → nuevo esquema (multiple_choice) */
export function upgradeLegacyProblem(p: LegacyProblem): Problem {
  const idx = Math.max(0, Math.min(p.options.length - 1, p.correctIndex ?? 0));
  const opts: MCOption[] = (p.options || []).map((t, i) => ({ text: t ?? "", correct: i === idx }));
  return {
    id: p.id,
    ownerUid: p.ownerUid ?? null,
    title: p.title ?? "",
    statement: p.statement ?? "",
    type: "multiple_choice",
    points: 1,
    options: opts,
    allowMultiple: false,
    tags: normalizeTags(p.tags),
    createdAt: p.createdAt ?? null,
    updatedAt: p.updatedAt ?? null,
    createdBy: p.createdBy ?? null,
  };
}

/* =========================
   Helpers de creación
========================= */

/**
 * withProblemDefaults:
 * - Si pasas un objeto `Problem`, completa defaults.
 * - Si pasas un objeto legacy, lo actualiza a `multiple_choice`.
 */
export function withProblemDefaults(p: Partial<Problem> | Partial<LegacyProblem> = {}): Problem {
  // Legacy → upgrade
  if (isLegacyProblem(p)) {
    return upgradeLegacyProblem(p as LegacyProblem);
  }

  // Nuevo esquema
  const base: ProblemBase = {
    id: (p as any).id,
    ownerUid: (p as any).ownerUid ?? null,
    title: (p as any).title ?? "",
    statement: (p as any).statement ?? "",
    type: (p as any).type ?? "multiple_choice",
    points: (p as any).points ?? 1,
    tags: normalizeTags((p as any).tags),
    createdAt: (p as any).createdAt ?? null,
    updatedAt: (p as any).updatedAt ?? null,
    createdBy: (p as any).createdBy ?? null,
  };

  // Defaults por tipo
  switch (base.type) {
    case "multiple_choice":
      return {
        ...base,
        type: "multiple_choice",
        options:
          (p as any).options && Array.isArray((p as any).options) && (p as any).options.length
            ? (p as any).options
            : [
                { text: "", correct: true },
                { text: "", correct: false },
                { text: "", correct: false },
                { text: "", correct: false },
              ],
        allowMultiple: (p as any).allowMultiple ?? false,
      };

    case "true_false":
      return {
        ...base,
        type: "true_false",
        answer: (p as any).answer ?? { correct: true },
      };

    case "short_text":
      return {
        ...base,
        type: "short_text",
        spec:
          (p as any).spec ?? {
            mode: "exact",
            answers: [""],
            threshold: 1,
            caseSensitive: false,
            trim: true,
          },
      };

    case "numeric":
      return {
        ...base,
        type: "numeric",
        spec:
          (p as any).spec ?? {
            mode: "value",
            value: 0,
            tolerance: 0,
            precision: 2,
          },
      };

    case "ordering":
      return {
        ...base,
        type: "ordering",
        spec: (p as any).spec ?? { items: ["A", "B", "C"], shuffleOnPlay: true },
      };

    case "matching":
      return {
        ...base,
        type: "matching",
        spec: (p as any).spec ?? {
          pairs: [
            { left: "A", right: "1" },
            { left: "B", right: "2" },
          ],
          shuffleOnPlay: true,
        },
      };

    case "open_rubric":
      return {
        ...base,
        type: "open_rubric",
        spec: (p as any).spec ?? {
          maxPoints: base.points ?? 1,
          criteria: [{ label: "Calidad general", points: base.points ?? 1 }],
        },
      };
  }
}

/** Normaliza tags a minúsculas únicas */
export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const clean = t.trim().toLowerCase();
    if (clean) seen.add(clean);
  }
  return Array.from(seen);
}

