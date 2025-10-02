// src/models/classroom.ts

export type AssignmentStatus = "draft" | "published" | "closed";

export type ClassDoc = {
  name: string;
  code: string;           // código para unirse (único legible)
  ownerUid: string;       // uid del docente
  students: string[];     // uids alumnos
  createdAt: any;
};

export type AssignmentDoc = {
  classId: string;        // ref a classes/{id}
  problemIds: string[];   // ids de problems
  dueAt?: any;            // timestamp
  createdBy: string;      // uid del docente
  status: AssignmentStatus;
  createdAt: any;
};

export type SubmissionDoc = {
  assignmentId: string;
  problemId: string;
  studentUid: string;
  answer: number | string | null;
  correct: boolean;
  score?: number;
  submittedAt: any;
  // (opcional) desnormalizados útiles para listados rápidos
  classId?: string;
  assignmentStatus?: AssignmentStatus;
};

export type TagDoc = {
  name: string;
  slug: string;
  description?: string;
};

export type AchievementDoc = {
  name: string;
  criteria: string; // texto/DSL simple (más adelante lo formalizamos)
  icon?: string;    // URL o nombre de recurso
  createdAt: any;
};
