import type { Request } from "express";
import * as userService from "../services/user.service.ts";
import * as httpStatusText from "../utils/httpStatusText.ts";
import { asyncWrapper } from "../middleware/asyncWrapper.ts";
import { MANAGER } from "../utils/userRoles.ts";
import { getUploadedPaths } from "../middleware/upload.ts";
import { currentUser } from "../middleware/verifyToken.ts";

// The routes validate req.params.id and req.body (validationSchema) before
// these run; the database work and permission rules are in
// services/user.service.ts, and any thrown error goes to errorHandler.

// :id is validated as a MongoId by the route, so it is a single string
const idParam = (req: Request): string => String(req.params.id);

const userFields = ["firstName", "lastName", "email", "phoneNumber", "password"] as const;

// Copy only the allowed fields that were actually sent.
// Only a manager may set someone's role; for anyone else it's ignored.
const pickUserFields = (req: Request): userService.UserFields => {
  const fields: userService.UserFields = {};
  for (const key of userFields) {
    if (req.body[key] !== undefined) {
      fields[key] = req.body[key];
    }
  }
  if (req.body.role !== undefined && currentUser(req).role === MANAGER) {
    fields.role = req.body.role;
  }
  return { ...fields, ...getUploadedPaths(req) };
};

export const getUsers = asyncWrapper(async (_req, res) => {
  const users = await userService.listUsers();
  res.json({ status: httpStatusText.SUCCESS, data: { users } });
});

export const getUserById = asyncWrapper(async (req, res) => {
  const user = await userService.getUser(idParam(req));
  res.json({ status: httpStatusText.SUCCESS, data: { user } });
});

export const createUser = asyncWrapper(async (req, res) => {
  const user = await userService.createUser(pickUserFields(req));
  res.status(201).json({ status: httpStatusText.SUCCESS, data: { user } });
});

// PUT and PATCH both use this: only the fields that were sent are changed
export const updateUser = asyncWrapper(async (req, res) => {
  const user = await userService.updateUser(
    idParam(req),
    pickUserFields(req),
    currentUser(req),
  );
  res.json({ status: httpStatusText.SUCCESS, data: { user } });
});

export const deleteUser = asyncWrapper(async (req, res) => {
  await userService.deleteUser(idParam(req), currentUser(req));
  res.json({ status: httpStatusText.SUCCESS, data: null });
});
