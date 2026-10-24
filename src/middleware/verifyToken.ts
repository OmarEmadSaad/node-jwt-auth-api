import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { AppError } from "../utils/appError.ts";
import type { TokenPayload } from "../utils/generateToken.ts";

// Protects a route: expects the header "Authorization: Bearer <token>".
// On success the token's payload ({ id, email, role }) is available as req.user.
export const verifyToken: RequestHandler = (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization || "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new AppError("Token is required", 401));
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!, {
      algorithms: ["HS256"],
    }) as TokenPayload;
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
};

// The logged-in user, for handlers behind verifyToken
export const currentUser = (req: Express.Request): TokenPayload => {
  if (!req.user) {
    throw new AppError("Token is required", 401);
  }
  return req.user;
};
