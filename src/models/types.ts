export type Difficulty = "easy" | "medium" | "hard";
export type Visibility = "public" | "private" | "archived";

export type Problem = {
  id?: string;
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  difficulty?: Difficulty;
  tags?: string[];
  visibility?: Visibility;
  version?: number;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
};

export type ClassRoom = {
  id?: string;
  name: string;
  code: string;
  ownerUid: string;
  students: string[];     // uids
  createdAt?: any;
};

export type Assignment = {
  id?: string;
  classId: string;
  title: string;
  problemIds: string[];    // o {problemId, points}
  status: "draft" | "open" | "closed";
  dueAt: any;              // Firestore Timestamp
  createdBy: string;
  createdAt?: any;
};

export type Submission = {
  id?: string;
  assignmentId: string;
  problemId: string;
  studentUid: string;
  answer?: number | string;
  correct?: boolean;
  score?: number;
  submittedAt?: any;
};

export type Tag = {
  id?: string;
  name: string;
  slug: string;
  description?: string;
};
