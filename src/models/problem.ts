// src/models/problem.ts
import type { Timestamp } from "firebase/firestore";

export type Problem = {
  id?: string;
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  tags?: string[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy?: string | null;
};

export function withProblemDefaults(p: Partial<Problem> = {}): Problem {
  return {
    title: p.title ?? "",
    statement: p.statement ?? "",
    options: p.options && p.options.length ? p.options : ["", "", "", ""],
    correctIndex: p.correctIndex ?? 0,
    tags: p.tags ?? [],
    createdAt: p.createdAt ?? null,
    updatedAt: p.updatedAt ?? null,
    createdBy: p.createdBy ?? null,
    id: p.id,
  };
}

export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const clean = t.trim().toLowerCase();
    if (clean) seen.add(clean);
  }
  return Array.from(seen);
}
