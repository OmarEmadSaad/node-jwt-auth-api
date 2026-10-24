// Makes a user a manager: promotes an existing account, or creates a new one.
// Use it for your own real account; never put real credentials in this file.
//
//   npm run create-manager -- --email you@example.com
//   npm run create-manager -- --email you@example.com --password "a-strong-password"
//   npm run create-manager -- --email new@example.com --password "..." \
//     --first-name Jane --last-name Doe --phone +201000000000
//
// --password is required for a new user and optional for an existing one
// (it replaces their password). It's hashed by the model's pre("save") hook.
import { parseArgs } from "node:util";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.ts";
import { User } from "../src/models/user.model.ts";
import { MANAGER } from "../src/utils/userRoles.ts";

const { values: args } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    "first-name": { type: "string" },
    "last-name": { type: "string" },
    phone: { type: "string" },
  },
});

if (!args.email) {
  console.error("Usage: npm run create-manager -- --email you@example.com [--password ...]");
  process.exit(1);
}

await connectDB();

const email = args.email.trim().toLowerCase();
let user = await User.findOne({ email });

if (!user) {
  const required = ["password", "first-name", "last-name", "phone"] as const;
  const missing = required.filter((key) => !args[key]);
  if (missing.length) {
    console.error(`No user with email ${email}. To create one, also pass: --${missing.join(", --")}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  user = new User({
    firstName: args["first-name"],
    lastName: args["last-name"],
    email,
    phoneNumber: args.phone,
  });
}
if (args.password) {
  user.password = args.password;
}
user.role = MANAGER;
await user.save();

console.log(`${user.firstName} ${user.lastName} <${user.email}> is now a ${user.role}`);
await mongoose.disconnect();
