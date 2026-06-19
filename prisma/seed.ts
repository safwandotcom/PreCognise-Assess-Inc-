// prisma/seed.ts
import { PrismaClient, CandidateStatus, QuestionType, SessionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Wipe existing demo data so this script is safely re-runnable.
  await prisma.response.deleteMany();
  await prisma.question.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.session.deleteMany();

  const session = await prisma.session.create({
    data: { status: SessionStatus.WAITING },
  });
  console.log(`Created session ${session.id}`);

  // ---------------------------------------------------------------------
  // CANDIDATES — 20 total, password "demo123" for all (bcrypt-hashed).
  // rollNumber doubles as the login identifier alongside email.
  // ---------------------------------------------------------------------
  const passwordHash = await bcrypt.hash("demo123", 10);

  const candidateNames: { name: string; country: string }[] = [
    { name: "Aisha Rahman", country: "Bangladesh" },
    { name: "Tanvir Hasan", country: "Bangladesh" },
    { name: "Priya Sharma", country: "India" },
    { name: "Arjun Mehta", country: "India" },
    { name: "Liam O'Connor", country: "Ireland" },
    { name: "Sophia Müller", country: "Germany" },
    { name: "Carlos Mendes", country: "Brazil" },
    { name: "Yuki Tanaka", country: "Japan" },
    { name: "Fatima Al-Sayed", country: "UAE" },
    { name: "Daniel Kim", country: "South Korea" },
    { name: "Emma Wilson", country: "UK" },
    { name: "Noah Anderson", country: "USA" },
    { name: "Mei Lin", country: "China" },
    { name: "Omar Farouk", country: "Egypt" },
    { name: "Isabella Rossi", country: "Italy" },
    { name: "Lucas Silva", country: "Brazil" },
    { name: "Hannah Schmidt", country: "Germany" },
    { name: "Ravi Kumar", country: "India" },
    { name: "Sara Ahmed", country: "Pakistan" },
    { name: "Ethan Brown", country: "USA" },
  ];

  const candidates = await Promise.all(
    candidateNames.map((c, i) => {
      const rollNumber = `PCG-${String(i + 1).padStart(3, "0")}`;
      const email = `${c.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`;
      return prisma.candidate.create({
        data: {
          rollNumber,
          email,
          passwordHash,
          name: c.name,
          country: c.country,
          status: CandidateStatus.REGISTERED,
          sessionId: session.id,
        },
      });
    })
  );
  console.log(`Created ${candidates.length} candidates (password: demo123)`);

  // ---------------------------------------------------------------------
  // QUESTIONS — 20 total, hiring/aptitude-screen themed.
  // Mix: 12 MCQ, 4 psychometric, 4 rating. No image type this round.
  // correctOption is the index into `options` (0-based).
  // ---------------------------------------------------------------------
  type SeedQuestion = {
    type: QuestionType;
    text: string;
    options: (string | number)[];
    correctOption: number | null;
    timeLimitSec: number;
    basePoints: number;
    speedBonusMax: number;
  };

  const questions: SeedQuestion[] = [
    // --- MCQ: numerical / logical reasoning (hiring aptitude staples) ---
    {
      type: QuestionType.mcq,
      text: "A project budget of $48,000 is split across 3 teams in the ratio 2:3:3. What is the largest team's budget?",
      options: ["$12,000", "$18,000", "$20,000", "$24,000"],
      correctOption: 1,
      timeLimitSec: 45,
      basePoints: 10,
      speedBonusMax: 5,
    },
    {
      type: QuestionType.mcq,
      text: "If a task that normally takes 8 hours is split evenly between 4 team members, and one member is 50% faster than the others, how should hours be reassigned for the fastest finish?",
      options: [
        "Give everyone equal hours",
        "Give the faster member more hours, others less",
        "Give the faster member fewer hours",
        "It doesn't matter, total time is fixed",
      ],
      correctOption: 1,
      timeLimitSec: 60,
      basePoints: 15,
      speedBonusMax: 8,
    },
    {
      type: QuestionType.mcq,
      text: "Which of these best completes the pattern: 3, 6, 11, 18, 27, ?",
      options: ["36", "38", "40", "33"],
      correctOption: 1,
      timeLimitSec: 40,
      basePoints: 10,
      speedBonusMax: 5,
    },
    {
      type: QuestionType.mcq,
      text: "Two candidates are equally qualified, but one has more relevant project experience and the other has stronger references. As a hiring manager, what should weigh more heavily by default?",
      options: [
        "Relevant project experience",
        "Strength of references",
        "Neither — flip a coin",
        "Whoever interviewed first",
      ],
      correctOption: 0,
      timeLimitSec: 30,
      basePoints: 10,
      speedBonusMax: 3,
    },
    {
      type: QuestionType.mcq,
      text: "A spreadsheet shows Q1 revenue grew 12%, Q2 grew 8%, Q3 declined 5%. Which statement is accurate?",
      options: [
        "Revenue at the end of Q3 is lower than at the start of the year",
        "Revenue grew every quarter",
        "Overall revenue still increased from start of Q1 to end of Q3",
        "Cannot be determined without exact figures",
      ],
      correctOption: 2,
      timeLimitSec: 50,
      basePoints: 12,
      speedBonusMax: 6,
    },
    {
      type: QuestionType.mcq,
      text: "Which word does NOT belong with the others: Negotiate, Mediate, Arbitrate, Dictate",
      options: ["Negotiate", "Mediate", "Arbitrate", "Dictate"],
      correctOption: 3,
      timeLimitSec: 30,
      basePoints: 8,
      speedBonusMax: 4,
    },
    {
      type: QuestionType.mcq,
      text: "A client emails asking for a deadline extension the day before delivery. What's the most professional first response?",
      options: [
        "Grant it immediately without discussion",
        "Decline and explain it's too late to change",
        "Acknowledge the request and propose a quick call to assess impact",
        "Ignore until the deadline passes",
      ],
      correctOption: 2,
      timeLimitSec: 35,
      basePoints: 10,
      speedBonusMax: 5,
    },
    {
      type: QuestionType.mcq,
      text: "If 'all senior engineers attended the workshop' and 'no one who attended the workshop skipped the quiz', which conclusion is valid?",
      options: [
        "All senior engineers skipped the quiz",
        "No senior engineer skipped the quiz",
        "All quiz-takers are senior engineers",
        "No conclusion can be drawn",
      ],
      correctOption: 1,
      timeLimitSec: 45,
      basePoints: 12,
      speedBonusMax: 6,
    },
    {
      type: QuestionType.mcq,
      text: "Which metric is generally the BEST single indicator of team productivity over raw output volume?",
      options: [
        "Total hours logged",
        "Number of tasks closed",
        "Value delivered relative to effort spent",
        "Number of meetings attended",
      ],
      correctOption: 2,
      timeLimitSec: 30,
      basePoints: 10,
      speedBonusMax: 4,
    },
    {
      type: QuestionType.mcq,
      text: "A coworker takes credit for your idea in a meeting. What's the most constructive next step?",
      options: [
        "Call them out publicly in the same meeting",
        "Say nothing and let it go",
        "Speak with them privately afterward to clarify",
        "Complain to other coworkers",
      ],
      correctOption: 2,
      timeLimitSec: 30,
      basePoints: 10,
      speedBonusMax: 4,
    },
    {
      type: QuestionType.mcq,
      text: "You have 3 tasks: one urgent but low-impact, one important but not urgent, one neither urgent nor important. What should you do first?",
      options: [
        "The urgent, low-impact task",
        "The important, non-urgent task",
        "The neither urgent nor important task",
        "Whichever is fastest to finish",
      ],
      correctOption: 1,
      timeLimitSec: 35,
      basePoints: 10,
      speedBonusMax: 5,
    },
    {
      type: QuestionType.mcq,
      text: "Complete the analogy: Mentor is to Guidance as Auditor is to ___",
      options: ["Compliance", "Verification", "Sales", "Design"],
      correctOption: 1,
      timeLimitSec: 30,
      basePoints: 8,
      speedBonusMax: 4,
    },

    // --- Psychometric: 5-point sad-to-happy scale, no correct answer ---
    {
      type: QuestionType.psychometric,
      text: "How do you feel about taking on tasks outside your usual job description?",
      options: ["😞", "🙁", "😐", "🙂", "😄"],
      correctOption: null,
      timeLimitSec: 20,
      basePoints: 10,
      speedBonusMax: 0,
    },
    {
      type: QuestionType.psychometric,
      text: "How comfortable are you giving direct feedback to a peer about their work?",
      options: ["😞", "🙁", "😐", "🙂", "😄"],
      correctOption: null,
      timeLimitSec: 20,
      basePoints: 10,
      speedBonusMax: 0,
    },
    {
      type: QuestionType.psychometric,
      text: "How do you feel when a project's requirements change midway through?",
      options: ["😞", "🙁", "😐", "🙂", "😄"],
      correctOption: null,
      timeLimitSec: 20,
      basePoints: 10,
      speedBonusMax: 0,
    },
    {
      type: QuestionType.psychometric,
      text: "How energized do you feel working in a fast-paced, deadline-driven environment?",
      options: ["😞", "🙁", "😐", "🙂", "😄"],
      correctOption: null,
      timeLimitSec: 20,
      basePoints: 10,
      speedBonusMax: 0,
    },

    // --- Rating: 1-10 scale, no correct answer ---
    {
      type: QuestionType.rating,
      text: "On a scale of 1-10, how would you rate your comfort working independently with minimal supervision?",
      options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      correctOption: null,
      timeLimitSec: 20,
      basePoints: 10,
      speedBonusMax: 0,
    },
    {
      type: QuestionType.rating,
      text: "On a scale of 1-10, how would you rate your ability to manage multiple competing deadlines?",
      options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      correctOption: null,
      timeLimitSec: 20,
      basePoints: 10,
      speedBonusMax: 0,
    },
    {
      type: QuestionType.rating,
      text: "On a scale of 1-10, how confident are you presenting ideas to senior stakeholders?",
      options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      correctOption: null,
      timeLimitSec: 20,
      basePoints: 10,
      speedBonusMax: 0,
    },
    {
      type: QuestionType.rating,
      text: "On a scale of 1-10, how would you rate your adaptability to new tools or processes?",
      options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      correctOption: null,
      timeLimitSec: 20,
      basePoints: 10,
      speedBonusMax: 0,
    },
  ];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await prisma.question.create({
      data: {
        type: q.type,
        text: q.text,
        imageUrl: null,
        options: q.options,
        correctOption: q.correctOption,
        timeLimitSec: q.timeLimitSec,
        basePoints: q.basePoints,
        speedBonusMax: q.speedBonusMax,
        orderIndex: i,
        sessionId: session.id,
      },
    });
  }
  console.log(`Created ${questions.length} questions`);

  console.log("Seed complete.");
  console.log(`Login with any roll number PCG-001 through PCG-020, password "demo123", OTP "123456".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });