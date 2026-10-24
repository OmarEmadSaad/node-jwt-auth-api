// Adds the 10 demo users from scripts/data/demoUsers.js.
// Run with: npm run seed
//
// Safe to run again: a user whose email or phone number already exists is
// skipped, never changed. Add --reset (npm run seed:reset) to delete the demo
// users first and create them fresh, e.g. after a demo password was changed.
// Only the demo emails are ever deleted; your own users are left alone.
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.ts";
import { User } from "../src/models/user.model.ts";
import { demoUsers, DEMO_PASSWORD } from "./data/demoUsers.ts";

await connectDB();
// Builds the unique indexes (email, phoneNumber) and reports any error
await User.init();

if (process.argv.includes("--reset")) {
  const { deletedCount } = await User.deleteMany({
    email: { $in: demoUsers.map((user) => user.email) },
  });
  console.log(`Deleted ${deletedCount} demo users`);
}

let created = 0;
for (const demoUser of demoUsers) {
  const existing = await User.exists({
    $or: [{ email: demoUser.email }, { phoneNumber: demoUser.phoneNumber }],
  });
  if (existing) {
    console.log(`skip   ${demoUser.email} (already exists)`);
    continue;
  }

  // create() runs the schema validators and the pre("save") password hash
  await User.create({ ...demoUser, password: DEMO_PASSWORD });
  console.log(`create ${demoUser.email} (${demoUser.role})`);
  created++;
}

console.log(`Done: ${created} created, ${demoUsers.length - created} skipped`);
await mongoose.disconnect();
