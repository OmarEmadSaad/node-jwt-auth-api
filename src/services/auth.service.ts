import jwt from "jsonwebtoken";
import { User, type IUser, type UserDocument } from "../models/user.model.ts";
import { AppError } from "../utils/appError.ts";
import { isDemoMode } from "../config/demo.ts";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken.ts";

export type RegisterFields = Pick<
  IUser,
  "firstName" | "lastName" | "email" | "phoneNumber" | "password"
> &
  Partial<Pick<IUser, "avatar" | "document">>;

// Creates a new token pair and saves the refresh token on the user,
// so only the latest one works (an old or stolen one is rejected).
// timestamps: false keeps updatedAt for real profile changes, not logins.
const issueTokens = async (user: UserDocument) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  await User.updateOne({ _id: user._id }, { refreshToken }, { timestamps: false });
  return { accessToken, refreshToken };
};

// Never send the password hash back, even though it was just loaded or set
export const hidePassword = (user: UserDocument) => {
  user.set("password", undefined);
  return user;
};

// role isn't accepted here: everyone signs up as "user".
// The password is hashed by the model's pre("save") hook.
export const registerUser = async (fields: RegisterFields) => {
  const user = await User.create({
    ...fields,
    ...(isDemoMode() && { sandbox: true }),
  });
  return { user: hidePassword(user), ...(await issueTokens(user)) };
};

export const loginUser = async (email: string, password: string) => {
  // password has select: false, so ask for it explicitly
  const user = await User.findOne({ email }).select("+password");

  // Same message for both cases, so attackers can't tell which emails exist
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }
  return { user: hidePassword(user), ...(await issueTokens(user)) };
};

export const refreshTokens = async (refreshToken: string) => {
  const invalid = () => new AppError("Invalid or expired refresh token", 401);

  let payload: { id: string };
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!, {
      algorithms: ["HS256"],
    }) as { id: string };
  } catch {
    throw invalid();
  }

  const user = await User.findById(payload.id).select("+refreshToken");
  if (!user || user.refreshToken !== refreshToken) {
    throw invalid();
  }
  return issueTokens(user);
};

// Deletes the saved refresh token, so it can't be used again
export const logoutUser = (userId: string) =>
  User.updateOne(
    { _id: userId },
    { $unset: { refreshToken: 1 } },
    { timestamps: false },
  );
