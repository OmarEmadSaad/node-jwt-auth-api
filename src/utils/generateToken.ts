import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { Types } from "mongoose";
import type { Role } from "./userRoles.ts";

// What verifyToken reads back from an access token, as req.user
export interface TokenPayload {
  id: string;
  email: string;
  role: Role;
}

interface TokenUser {
  _id: Types.ObjectId | string;
  email: string;
  role: Role;
}

type ExpiresIn = SignOptions["expiresIn"];

// Access token: sent with every request (Authorization: Bearer ...), short-lived.
// verifyToken reads its payload back as req.user.
export const generateAccessToken = (user: TokenUser) =>
  jwt.sign(
    { id: String(user._id), email: user.email, role: user.role } satisfies TokenPayload,
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || "10m") as ExpiresIn },
  );

// Refresh token: only sent to POST /api/auth/refresh to get a new access token.
// Signed with a different secret, so it can't be used as an access token.
// The random jwtid makes every token unique: without it, two tokens made in
// the same second are identical, and the "old" one would keep working.
export const generateRefreshToken = (user: Pick<TokenUser, "_id">) =>
  jwt.sign({ id: String(user._id) }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as ExpiresIn,
    jwtid: crypto.randomUUID(),
  });
