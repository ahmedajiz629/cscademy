/**
 * Seed script — creates initial admin user + sample track with problems.
 * Run with: node scripts/seed.mjs
 */
import { ConvexHttpClient } from "convex/browser";
import bcrypt from "bcryptjs";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3212";

const client = new ConvexHttpClient(CONVEX_URL);

async function seed() {
  console.log("Seeding database at", CONVEX_URL);

  // 1. Create admin user
  const adminHash = await bcrypt.hash("admin123", 10);
  try {
    const adminId = await client.mutation("users:create", {
      name: "Admin",
      email: "admin@cscademy.com",
      passwordHash: adminHash,
      role: "admin",
    });
    console.log("✓ Admin user created:", adminId);

    // Link CSAcademy account to admin (optional - for testing)
    await client.mutation("csacademyAccounts:upsert", {
      userId: adminId,
      csaEmail: "binoz.daop@gmail.com",
      csaPassword: "aAaA1&1&",
    });
    console.log("✓ CSAcademy account linked to admin");
  } catch (e) {
    console.log("Admin user might already exist:", e.message);
  }

  // 2. Create a sample student
  const studentHash = await bcrypt.hash("student123", 10);
  try {
    const studentId = await client.mutation("users:create", {
      name: "Test Student",
      email: "student@cscademy.com",
      passwordHash: studentHash,
      role: "student",
    });
    console.log("✓ Student user created:", studentId);
  } catch (e) {
    console.log("Student user might already exist:", e.message);
  }

  // 3. Create a sample track
  try {
    const trackId = await client.mutation("tracks:create", {
      name: "Introduction to Programming",
      description: "Basic programming exercises to get started with C++",
      order: 1,
    });
    console.log("✓ Track created:", trackId);

    // 4. Add sample problems
    const problems = [
      {
        name: "Addition",
        slug: "addition",
        contestTaskId: 38,
        description:
          "Given two integers a and b, output their sum.",
        points: 100,
        order: 1,
        sampleInput: "1 2",
        sampleOutput: "3",
        referer: "https://csacademy.com/contest/archive/task/addition/",
      },
      {
        name: "One Letter",
        slug: "one-letter",
        contestTaskId: 680,
        description:
          "You are given a list of N words. From each word you should keep only one letter and discard all the others. Then you should permute the N chosen letters and build a single word by concatenating them. Find the lexicographically smallest word you can obtain.",
        points: 100,
        order: 2,
        sampleInput: "3\nabc\nbcd\ncde",
        sampleOutput: "abc",
        referer: "https://csacademy.com/contest/interview-archive/task/one_letter/",
      },
    ];

    for (const p of problems) {
      await client.mutation("trackProblems:create", {
        trackId,
        ...p,
      });
      console.log(`✓ Problem "${p.name}" created`);
    }
  } catch (e) {
    console.log("Track/problems might already exist:", e.message);
  }

  console.log("\n=== Seed complete ===");
  console.log("Admin login:   admin@cscademy.com / admin123");
  console.log("Student login: student@cscademy.com / student123");
}

seed().catch(console.error);
