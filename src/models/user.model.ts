import mongoose, { type HydratedDocument, type Model } from "mongoose";
import validator from "validator";
import bcrypt from "bcryptjs";
import * as userRoles from "../utils/userRoles.ts";
import { DEFAULT_AVATAR } from "../config/uploads.ts";

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  role: userRoles.Role;
  avatar: string;
  document: string | null;
  sandbox?: boolean;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface IUserMethods {
  comparePassword(password: string): Promise<boolean>;
}

type UserModel = Model<IUser, {}, IUserMethods>;
export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new mongoose.Schema<IUser, UserModel, IUserMethods>(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      minlength: [2, "First name must be at least 2 characters"],
      maxlength: [50, "First name must be at most 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      minlength: [2, "Last name must be at least 2 characters"],
      maxlength: [50, "Last name must be at most 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (value: string) => validator.isEmail(value),
        message: "Please enter a valid email",
      },
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      validate: {
        validator: (value: string) => validator.isMobilePhone(value, "any"),
        message: "Please enter a valid phone number",
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: [...userRoles.ALL_ROLES],
        message: "Role must be one of: " + userRoles.ALL_ROLES.join(", "),
      },
      default: userRoles.USER,
    },
    // Paths of uploaded files, served at http://localhost:3000/<path>
    avatar: { type: String, default: DEFAULT_AVATAR },
    document: { type: String, default: null }, // PDF
    // Set only in demo mode, on users created through the API: these are the
    // only users visitors may edit or delete (see src/config/demo.ts)
    sandbox: { type: Boolean },
    // The latest refresh token (see services/auth.service.ts); hidden like password
    refreshToken: { type: String, select: false },
  },
  { versionKey: false, timestamps: true },
);

const SALT_ROUNDS = 10;

// Hash the password whenever it's created or changed (register, POST /users)
userSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  }
});

// Same for PUT/PATCH, which use findByIdAndUpdate and skip the save hook
userSchema.pre("findOneAndUpdate", async function () {
  const update = this.getUpdate() as Partial<IUser> | null;
  if (update?.password) {
    update.password = await bcrypt.hash(update.password, SALT_ROUNDS);
  }
});

userSchema.method("comparePassword", function (password: string) {
  return bcrypt.compare(password, this.password);
});

export const User = mongoose.model<IUser, UserModel>("User", userSchema, "users");
