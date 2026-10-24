import * as userService from "../services/user.service.ts";
import * as httpStatusText from "../utils/httpStatusText.ts";
import { asyncWrapper } from "../middleware/asyncWrapper.ts";
import { MANAGER } from "../utils/userRoles.ts";
import { getUploadedPaths } from "../middleware/upload.ts";

// The routes validate req.params.id and req.body (validationSchema) before
// these run; the database work and permission rules are in
// services/user.service.js, and any thrown error goes to errorHandler.

const userFields = ["firstName", "lastName", "email", "phoneNumber", "password"];

// Copy only the allowed fields that were actually sent.
// Only a manager may set someone's role; for anyone else it's ignored.
const pickUserFields = (req) => {
  const fields = {};
  for (const key of userFields) {
    if (req.body[key] !== undefined) {
      fields[key] = req.body[key];
    }
  }
  if (req.body.role !== undefined && req.user.role === MANAGER) {
    fields.role = req.body.role;
  }
  return { ...fields, ...getUploadedPaths(req) };
};

export const getUsers = asyncWrapper(async (req, res) => {
  const users = await userService.listUsers();
  res.json({ status: httpStatusText.SUCCESS, data: { users } });
});

export const getUserById = asyncWrapper(async (req, res) => {
  const user = await userService.getUser(req.params.id);
  res.json({ status: httpStatusText.SUCCESS, data: { user } });
});

export const createUser = asyncWrapper(async (req, res) => {
  const user = await userService.createUser(pickUserFields(req));
  res.status(201).json({ status: httpStatusText.SUCCESS, data: { user } });
});

// PUT and PATCH both use this: only the fields that were sent are changed
export const updateUser = asyncWrapper(async (req, res) => {
  const user = await userService.updateUser(
    req.params.id,
    pickUserFields(req),
    req.user,
  );
  res.json({ status: httpStatusText.SUCCESS, data: { user } });
});

export const deleteUser = asyncWrapper(async (req, res) => {
  await userService.deleteUser(req.params.id, req.user);
  res.json({ status: httpStatusText.SUCCESS, data: null });
});
