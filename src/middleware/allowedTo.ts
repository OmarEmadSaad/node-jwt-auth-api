import type { RequestHandler } from "express";
import { AppError } from "../utils/appError.ts";
import type { Role } from "../utils/userRoles.ts";
import { currentUser } from "./verifyToken.ts";

// Use after verifyToken: router.delete("/:id", allowedTo(ADMIN, MANAGER), ...)
// Lets the request through only if the logged-in user has one of these roles.
export const allowedTo =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!roles.includes(currentUser(req).role)) {
      return next(
        new AppError("You don't have permission to do this action", 403),
      );
    }
    next();
  };
