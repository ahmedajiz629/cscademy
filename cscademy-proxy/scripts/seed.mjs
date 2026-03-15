/**
 * Seed script — creates initial admin + student users.
 * Tracks and problems are defined as code modules in lib/tracks/.
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

    // Link CSAcademy account to admin (for testing)
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

  console.log("\n=== Seed complete ===");
  console.log("Admin login:   admin@cscademy.com / admin123");
  console.log("Student login: student@cscademy.com / student123");
  console.log("\nTracks & problems are defined in lib/tracks/ (code modules).");
}

seed().catch(console.error);
