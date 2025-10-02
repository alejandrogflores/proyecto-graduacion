// src/models/attempts.ts
import type { Timestamp } from "firebase/firestore";

/**
 * Representa un intento de un alumno para resolver un problema
 * dentro de una asignación.
 */
export type Attempt = {
  id?: string;

  userId: string;           // uid del alumno
  assignmentId: string;     // asignación a la que pertenece
  problemId: string;        // problema respondido

  // Respuesta dada por el alumno (ajústalo según tu app)
  answer: unknown;          // string | number | string[] | { ... }

  // Evaluación (si aplica)
  isCorrect?: boolean;
  score?: number;           // 0..1 o 0..100, a tu elección

  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export function withAttemptDefaults(a: Partial<Attempt> = {}): Attempt {
  return {
    id: a.id,
    userId: a.userId ?? "",
    assignmentId: a.assignmentId ?? "",
    problemId: a.problemId ?? "",
    answer: a.answer ?? null,
    isCorrect: a.isCorrect ?? undefined,
    score: a.score ?? undefined,
    createdAt: a.createdAt ?? null,
    updatedAt: a.updatedAt ?? null,
  };
}
