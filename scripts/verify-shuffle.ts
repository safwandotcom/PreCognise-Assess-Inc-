import {
  seededPermutation,
  applySeededShuffle,
  pickNextQuestion,
  translateDisplayIndexToCanonical,
} from "../lib/shuffle";

let failures = 0;
function check(label: string, condition: boolean) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

// 1. Same seed -> same permutation
const permA = seededPermutation(8, "candidate-1");
const permB = seededPermutation(8, "candidate-1");
check("same seed produces identical permutation", JSON.stringify(permA) === JSON.stringify(permB));

// 2. Permutation is a full covering of 0..n-1 with no duplicates
const sorted = [...permA].sort((a, b) => a - b);
check(
  "permutation of length 8 contains every index 0-7 exactly once",
  JSON.stringify(sorted) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7]),
);

// 3. Different seeds usually produce different permutations
const permC = seededPermutation(8, "candidate-2");
check("different seeds produce different permutations", JSON.stringify(permA) !== JSON.stringify(permC));

// 4. applySeededShuffle reorders an arbitrary array consistently with seededPermutation
const items = ["a", "b", "c", "d"];
const shuffled = applySeededShuffle(items, "seed-x");
const perm = seededPermutation(4, "seed-x");
const expected = perm.map((i) => items[i]);
check("applySeededShuffle matches seededPermutation mapping", JSON.stringify(shuffled) === JSON.stringify(expected));

// 5. pickNextQuestion: shuffle disabled -> returns first unanswered in given order
const qs = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
const noShuffle = pickNextQuestion(qs, [], "candidate-1", false);
check("shuffle disabled returns first question unchanged", noShuffle?.id === "q1");

const skipFirst = pickNextQuestion(qs, ["q1"], "candidate-1", false);
check("shuffle disabled skips answered questions in order", skipFirst?.id === "q2");

// 6. pickNextQuestion: shuffle enabled -> two different candidate seeds can get different first questions
const firstForCandidateA = pickNextQuestion(qs, [], "candidate-A", true);
const firstForCandidateB = pickNextQuestion(qs, [], "candidate-B", true);
console.log(
  `Candidate A first question: ${firstForCandidateA?.id}, Candidate B first question: ${firstForCandidateB?.id}`,
);
check("pickNextQuestion returns a valid question id for candidate A", qs.some((q) => q.id === firstForCandidateA?.id));
check("pickNextQuestion returns a valid question id for candidate B", qs.some((q) => q.id === firstForCandidateB?.id));

// 7. pickNextQuestion: shuffle enabled -> same candidate always gets the same first question across repeated calls
const repeat1 = pickNextQuestion(qs, [], "candidate-A", true);
const repeat2 = pickNextQuestion(qs, [], "candidate-A", true);
check("same candidate gets stable order across repeated calls", repeat1?.id === repeat2?.id);

// 8. translateDisplayIndexToCanonical round-trips correctly
const optionSeed = "candidate-1:question-1";
const optionPerm = seededPermutation(4, optionSeed);
const displayIndexToCheck = 2;
const canonical = translateDisplayIndexToCanonical(displayIndexToCheck, 4, optionSeed);
check(
  "translateDisplayIndexToCanonical matches seededPermutation directly",
  canonical === optionPerm[displayIndexToCheck],
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll shuffle checks passed.");
