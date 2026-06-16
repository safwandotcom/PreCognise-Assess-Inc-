import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Wipe existing rows first so this script is safe to re-run
  await prisma.response.deleteMany();
  await prisma.question.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.session.deleteMany();

  const session = await prisma.session.create({
    data: { status: "WAITING" },
  });

  const passwordHash = await bcrypt.hash("demo123", 10);

  const candidates = [
    { rollNumber: "PC-1001", email: "amina.rahman@example.com", name: "Amina Rahman", country: "Bangladesh" },
    { rollNumber: "PC-1002", email: "rohan.gupta@example.com", name: "Rohan Gupta", country: "India" },
    { rollNumber: "PC-1003", email: "maria.santos@example.com", name: "Maria Santos", country: "Philippines" },
    { rollNumber: "PC-1004", email: "ali.hassan@example.com", name: "Ali Hassan", country: "Pakistan" },
    { rollNumber: "PC-1005", email: "nadia.perera@example.com", name: "Nadia Perera", country: "Sri Lanka" },
  ];

  for (const c of candidates) {
    await prisma.candidate.create({
      data: { ...c, passwordHash, sessionId: session.id },
    });
  }

  await prisma.question.createMany({
    data: [
      {
        type: "mcq",
        text: "A teammate consistently misses deadlines. What's the best first step?",
        options: [
          "Report them to HR immediately",
          "Talk to them privately to understand what's going on",
          "Ignore it and do their work for them",
          "Complain to other teammates",
        ],
        correctOption: 1,
        timeLimitSec: 30,
        basePoints: 10,
        speedBonusMax: 5,
        orderIndex: 0,
        sessionId: session.id,
      },
      {
        type: "mcq",
        text: "Train A leaves at 60 km/h. Train B leaves 30 minutes later on the same track at 90 km/h. Which reaches a point 180 km away first?",
        options: ["Train A", "Train B", "They arrive at the same time", "Cannot be determined"],
        correctOption: 1,
        timeLimitSec: 45,
        basePoints: 15,
        speedBonusMax: 5,
        orderIndex: 1,
        sessionId: session.id,
      },
      {
        type: "psychometric",
        text: "How do you feel about working under tight deadlines?",
        options: [1, 2, 3, 4, 5],
        correctOption: null,
        timeLimitSec: 20,
        basePoints: 10,
        speedBonusMax: 0,
        orderIndex: 2,
        sessionId: session.id,
      },
      {
        type: "rating",
        text: "On a scale of 1 to 10, how confident are you presenting to a large group?",
        options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        correctOption: null,
        timeLimitSec: 20,
        basePoints: 10,
        speedBonusMax: 0,
        orderIndex: 3,
        sessionId: session.id,
      },
      {
        type: "image",
        text: "Which shape completes the pattern shown in the image?",
        imageUrl: "https://placehold.co/600x400/1e293b/ffffff?text=Pattern+Sequence",
        options: ["Circle", "Triangle", "Square", "Hexagon"],
        correctOption: 2,
        timeLimitSec: 30,
        basePoints: 15,
        speedBonusMax: 5,
        orderIndex: 4,
        sessionId: session.id,
      },
    ],
  });

  console.log("Seed complete: 1 session, 5 candidates (password: demo123), 5 questions.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });