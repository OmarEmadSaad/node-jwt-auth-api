// Deletes the users visitors created in the public demo (sandbox: true) and
// their uploaded files. The demo accounts and your own users are not touched.
// Run with: npm run demo:reset (e.g. daily, as a cron job on the host)
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.ts";
import { User } from "../src/models/user.model.ts";
import { removeFile } from "../src/middleware/upload.ts";

await connectDB();

const sandboxUsers = await User.find({ sandbox: true });
for (const user of sandboxUsers) {
  removeFile(user.avatar);
  removeFile(user.document);
}
const { deletedCount } = await User.deleteMany({
  _id: { $in: sandboxUsers.map((user) => user._id) },
});

console.log(`Deleted ${deletedCount} sandbox users and their files`);
await mongoose.disconnect();
