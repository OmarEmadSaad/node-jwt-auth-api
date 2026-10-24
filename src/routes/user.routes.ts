import { Router } from "express";

import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/user.controller.ts";

import {
  userIdSchema,
  createUserSchema,
  updateUserSchema,
} from "../validators/user.schema.ts";

import { validationSchema } from "../middleware/validationSchema.ts";
import { methodNotAllowed } from "../middleware/errorHandler.ts";
import { verifyToken } from "../middleware/verifyToken.ts";
import { allowedTo } from "../middleware/allowedTo.ts";
import { ADMIN, MANAGER } from "../utils/userRoles.ts";
import { uploadUserFiles } from "../middleware/upload.ts";

const router = Router();

// Every /api/users route needs a valid token (get one from /api/auth/login).
// Any logged-in user can read; only admins and managers can change users.
// PUT and PATCH both accept any subset of fields, e.g. just { "role": "admin" }.
router.use(verifyToken);

router
  .route("/")
  .get(getUsers)
  .post(
    allowedTo(ADMIN, MANAGER),
    uploadUserFiles,
    validationSchema(createUserSchema),
    createUser,
  )
  .all(methodNotAllowed(["GET", "POST"]));

router
  .route("/:id")
  .get(validationSchema(userIdSchema), getUserById)
  .put(
    allowedTo(ADMIN, MANAGER),
    uploadUserFiles,
    validationSchema({ ...userIdSchema, ...updateUserSchema }),
    updateUser,
  )
  .patch(
    allowedTo(ADMIN, MANAGER),
    uploadUserFiles,
    validationSchema({ ...userIdSchema, ...updateUserSchema }),
    updateUser,
  )
  .delete(allowedTo(ADMIN, MANAGER), validationSchema(userIdSchema), deleteUser)
  .all(methodNotAllowed(["GET", "PUT", "PATCH", "DELETE"]));

export default router;
