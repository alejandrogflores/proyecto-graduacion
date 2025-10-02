// src/models/assignment.ts
import type { Timestamp } from "firebase/firestore";

export type AssignmentStatus = "draft" | "open" | "closed";

export type Assignment = {
  id?: string;
  title: string;
  classId: string;          // p.ej. "clase1"
  problemIds: string[];     // p.ej. ["prob1", "prob2"]
  dueAt: Timestamp | null;  // fecha límite
  status: AssignmentStatus; // "open" por defecto
  createdBy: string | null;

  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export function withAssignmentDefaults(a: Partial<Assignment> = {}): Assignment {
  return {
    id: a.id,
    title: a.title ?? "",
    classId: a.classId ?? "",
    problemIds: Array.isArray(a.problemIds) ? a.problemIds : [],
    dueAt: a.dueAt ?? null,
    status: a.status ?? "open",
    createdBy: a.createdBy ?? null,
    createdAt: a.createdAt ?? null,
    updatedAt: a.updatedAt ?? null,
  };
}

export function isOverdue(a: Assignment, nowMs = Date.now()): boolean {
  if (!a.dueAt) return false;
  return a.status === "open" && a.dueAt.toMillis() < nowMs;
}
