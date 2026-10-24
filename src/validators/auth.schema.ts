// Validation schemas for the auth routes (express-validator's checkSchema)
import type { Schema } from "express-validator";

export { createUserSchema as registerSchema } from "./user.schema.ts";

export const loginSchema: Schema = {
  email: {
    in: ["body"],
    trim: true,
    isEmail: { errorMessage: "Valid email is required" },
    normalizeEmail: true,
  },
  password: {
    in: ["body"],
    isString: { errorMessage: "Password must be text" },
    notEmpty: { errorMessage: "Password is required" },
  },
};

export const refreshSchema: Schema = {
  refreshToken: {
    in: ["body"],
    isString: { errorMessage: "refreshToken must be text" },
    notEmpty: { errorMessage: "refreshToken is required" },
  },
};
