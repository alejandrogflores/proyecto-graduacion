// src/utils/eval.ts
import type { Problem } from "@/models/problem";
import type { UserAnswer } from "@/models/answer";

function norm(s: string, caseSensitive?: boolean, trim = true) {
  let t = trim ? s.trim() : s;
  return caseSensitive ? t : t.toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
      );
  return dp[m][n];
}

export function evaluate(problem: Problem, answer: UserAnswer): { correct: boolean | null; score: number | null } {
  const points = problem.points ?? 1;

  switch (problem.type) {
    case "multiple_choice": {
      const correctIdx = problem.options
        .map((o, i) => (o.correct ? i : -1))
        .filter(i => i >= 0)
        .sort();
      const sel = (answer.type === "multiple_choice" ? answer.selected : []).slice().sort();
      const ok = JSON.stringify(sel) === JSON.stringify(correctIdx);
      return { correct: ok, score: ok ? points : 0 };
    }

    case "true_false": {
      const ok = answer.type === "true_false" && answer.value === problem.answer.correct;
      return { correct: ok, score: ok ? points : 0 };
    }

    case "short_text": {
      if (answer.type !== "short_text") return { correct: false, score: 0 };
      const spec = problem.spec;
      const val = answer.value ?? "";
      if (spec.mode === "exact") {
        const ok = spec.answers.some(a => norm(a, spec.caseSensitive, spec.trim) === norm(val, spec.caseSensitive, spec.trim));
        return { correct: ok, score: ok ? points : 0 };
      }
      if (spec.mode === "regex") {
        const ok = spec.answers.some(pat => {
          const re = new RegExp(pat, spec.caseSensitive ? "" : "i");
          return re.test(spec.trim ? val.trim() : val);
        });
        return { correct: ok, score: ok ? points : 0 };
      }
      const thr = spec.threshold ?? 1;
      const input = spec.trim ? val.trim() : val;
      const ok = spec.answers.some(a => levenshtein(norm(a, !spec.caseSensitive, false), norm(input, !spec.caseSensitive, false)) <= thr);
      return { correct: ok, score: ok ? points : 0 };
    }

    case "numeric": {
      if (answer.type !== "numeric" || typeof answer.value !== "number") return { correct: false, score: 0 };
      const v = problem.spec;
      let x = answer.value;
      if (v.precision != null) {
        const p = Math.pow(10, v.precision);
        x = Math.round(x * p) / p;
      }
      let ok = false;
      if (v.mode === "value" && typeof v.value === "number") {
        const tol = v.tolerance ?? 0;
        ok = Math.abs(x - v.value) <= tol;
      } else if (v.mode === "range" && typeof v.min === "number" && typeof v.max === "number") {
        ok = x >= v.min && x <= v.max;
      } else if (v.mode === "tolerance" && typeof v.value === "number" && typeof v.tolerance === "number") {
        ok = Math.abs(x - v.value) <= v.tolerance;
      }
      return { correct: ok, score: ok ? points : 0 };
    }

    case "ordering":
    case "matching":
      return { correct: null, score: null }; // v2

    case "open_rubric": {
      const sc = (answer.type === "open_rubric" && typeof answer.score === "number") ? answer.score : null;
      return { correct: sc != null ? sc > 0 : null, score: sc };
    }
  }
}
