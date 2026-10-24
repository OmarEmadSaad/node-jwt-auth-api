import { Router } from "express";

import {
  register,
  login,
  refresh,
  logout,
} from "../controllers/auth.controller.ts";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from "../validators/auth.schema.ts";
import { validationSchema } from "../middleware/validationSchema.ts";
import { methodNotAllowed } from "../middleware/errorHandler.ts";
import { verifyToken } from "../middleware/verifyToken.ts";
import { uploadUserFiles } from "../middleware/upload.ts";
import { rateLimit } from "../middleware/rateLimit.ts";

const router = Router();

// One shared limit for the routes that accept passwords or refresh tokens
const authLimit = rateLimit();

router
  .route("/register")
  .post(authLimit, uploadUserFiles, validationSchema(registerSchema), register)
  .all(methodNotAllowed(["POST"]));

router
  .route("/login")
  .post(authLimit, validationSchema(loginSchema), login)
  .all(methodNotAllowed(["POST"]));

router
  .route("/refresh")
  .post(authLimit, validationSchema(refreshSchema), refresh)
  .all(methodNotAllowed(["POST"]));

router
  .route("/logout")
  .post(verifyToken, logout)
  .all(methodNotAllowed(["POST"]));

export default router;
