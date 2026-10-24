import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import type { Request } from "express";
import { AppError } from "../utils/appError.ts";
import {
  UPLOADS_DIR,
  MAX_FILE_SIZE,
  fileRules,
  fromRoot,
  isUploadField,
  type UploadField,
} from "../config/uploads.ts";

// Only called for files that passed fileFilter, so the field is known
const ruleFor = (file: Express.Multer.File) => fileRules[file.fieldname as UploadField];

const storage = multer.diskStorage({
  // The folders are gitignored, so create them if a fresh clone lacks them
  destination: (_req, file, cb) => {
    const folder = fromRoot(ruleFor(file).folder);
    fs.mkdir(folder, { recursive: true }, (err) => cb(err, folder));
  },
  // e.g. avatar-1730000000000-<uuid>.png: the prefix says what the file is,
  // the random part stops two uploads called "photo.jpg" overwriting each other.
  // The extension comes from the checked type, not from file.originalname.
  filename: (_req, file, cb) => {
    const ext = ruleFor(file).types[file.mimetype];
    cb(null, `${file.fieldname}-${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (!isUploadField(file.fieldname)) {
    return cb(new AppError(`Unexpected file field: ${file.fieldname}`, 400));
  }
  const rule = fileRules[file.fieldname];
  if (!Object.hasOwn(rule.types, file.mimetype)) {
    return cb(new AppError(rule.error, 400));
  }
  cb(null, true);
};

// Usage in a route: router.post("/", uploadUserFiles, ...)
// Reads a multipart/form-data body: text fields go to req.body,
// files to req.files.avatar[0] and req.files.document[0].
export const uploadUserFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).fields([
  { name: "avatar", maxCount: 1 },
  { name: "document", maxCount: 1 },
]);

export type UploadedPaths = Partial<Record<UploadField, string>>;

// The saved paths of the uploaded files, ready to store on the user
export const getUploadedPaths = (req: Request): UploadedPaths => {
  const paths: UploadedPaths = {};
  // .fields() gives an object keyed by field name
  const files = req.files && !Array.isArray(req.files) ? req.files : {};
  for (const field of Object.keys(fileRules) as UploadField[]) {
    const file = files[field]?.[0];
    if (file) {
      paths[field] = `${fileRules[field].folder}/${file.filename}`;
    }
  }
  return paths;
};

// Deletes a file we saved earlier. Only files under uploads/users/ are ever
// deleted, so the default avatar (or a bad path) is left alone.
export const removeFile = (filePath: string | null | undefined) => {
  if (filePath?.startsWith(`${UPLOADS_DIR}/users/`) && !filePath.includes("..")) {
    fs.rm(fromRoot(filePath), { force: true }, () => {});
  }
};

// If the request fails (bad input, duplicate email...), the files multer
// already saved are useless, so errorHandler calls this to delete them
export const removeUploadedFiles = (req: Request) => {
  Object.values(getUploadedPaths(req)).forEach(removeFile);
};
