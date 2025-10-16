// src/models/answer.ts
export type UserAnswer =
  | { type: "multiple_choice"; selected: number[] }
  | { type: "true_false"; value: boolean }
  | { type: "short_text"; value: string }
  | { type: "numeric"; value: number }
  | { type: "ordering"; order: number[] }
  | { type: "matching"; pairs: Array<{ left: number; right: number }> }
  | { type: "open_rubric"; text: string; score?: number };
