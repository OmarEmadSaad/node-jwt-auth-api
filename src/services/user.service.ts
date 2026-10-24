import { User, type IUser, type UserDocument } from "../models/user.model.ts";
import { AppError } from "../utils/appError.ts";
import { isDemoMode } from "../config/demo.ts";
import { USER, MANAGER } from "../utils/userRoles.ts";
import type { TokenPayload } from "../utils/generateToken.ts";
import { removeFile } from "../middleware/upload.ts";
import { hidePassword } from "./auth.service.ts";

// The fields a create or update request may set (controllers pick them from the body)
export type UserFields = Partial<
  Pick<
    IUser,
    "firstName" | "lastName" | "email" | "phoneNumber" | "password" | "role" | "avatar" | "document"
  >
>;

const userNotFound = () => new AppError("User not found", 404);

const updateOptions = { returnDocument: "after", runValidators: true } as const;

// Who may change or delete whom (the route already allows only admins and managers):
// - a manager: anyone
// - an admin: users with the "user" role, and themselves. Otherwise an admin
//   could set a manager's password and log in as that manager.
// In demo mode, only users created during the demo (sandbox) can be changed.
const assertCanModify = (actor: TokenPayload, target: UserDocument) => {
  const isSelf = String(target._id) === String(actor.id);
  if (actor.role !== MANAGER && target.role !== USER && !isSelf) {
    throw new AppError(
      "Only a manager can change or delete admins and managers",
      403,
    );
  }
  if (isDemoMode() && !target.sandbox) {
    throw new AppError(
      "This account is protected in the public demo. Create a user to try editing and deleting.",
      403,
    );
  }
};

const findUserOrFail = async (id: string) => {
  const user = await User.findById(id);
  if (!user) {
    throw userNotFound();
  }
  return user;
};

export const listUsers = () => User.find();

export const getUser = findUserOrFail;

export const createUser = async (fields: UserFields) => {
  const user = await User.create({
    ...fields,
    ...(isDemoMode() && { sandbox: true }),
  });
  return hidePassword(user);
};

// PUT and PATCH both use this: only the fields that were sent are changed
export const updateUser = async (id: string, changes: UserFields, actor: TokenPayload) => {
  const oldUser = await findUserOrFail(id);
  assertCanModify(actor, oldUser);

  const user = await User.findByIdAndUpdate(id, changes, updateOptions);

  // A new avatar/document replaced the old one, so delete the old file
  if (changes.avatar) removeFile(oldUser.avatar);
  if (changes.document) removeFile(oldUser.document);
  return user;
};

export const deleteUser = async (id: string, actor: TokenPayload) => {
  const user = await findUserOrFail(id);
  assertCanModify(actor, user);

  await user.deleteOne();
  removeFile(user.avatar);
  removeFile(user.document);
};
