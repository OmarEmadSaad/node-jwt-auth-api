import path from "node:path";
import { fileURLToPath } from "node:url";

// Every uploaded file lives under uploads/, served at http://localhost:3000/uploads/...
//
// uploads/
// ├── defaults/avatar.svg     used when a user has no avatar (kept in git)
// └── users/
//     ├── avatars/            avatar-<timestamp>-<uuid>.png|jpg|webp
//     └── documents/          document-<timestamp>-<uuid>.pdf
//
// Paths are stored on the user relative to the project root
// (e.g. "uploads/users/avatars/avatar-1730000000000-<uuid>.png"),
// so this works no matter which folder the app is started from.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const fromRoot = (relativePath: string) => path.join(ROOT, relativePath);

export const UPLOADS_DIR = "uploads";
export const DEFAULT_AVATAR = `${UPLOADS_DIR}/defaults/avatar.svg`;
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per file

export type UploadField = "avatar" | "document";

interface FileRule {
  folder: string;
  types: Record<string, string>; // accepted MIME type -> saved extension
  error: string;
}

// Which form field takes which files, and where they are saved.
// The field name is also the file name prefix. The saved extension comes from
// the accepted type, never from the uploaded name, so "page.html" sent as
// image/png is saved (and served) as .png.
export const fileRules: Record<UploadField, FileRule> = {
  avatar: {
    folder: `${UPLOADS_DIR}/users/avatars`,
    types: { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" },
    error: "Avatar must be a JPG, PNG or WEBP image",
  },
  document: {
    folder: `${UPLOADS_DIR}/users/documents`,
    types: { "application/pdf": ".pdf" },
    error: "Document must be a PDF file",
  },
};

export const isUploadField = (field: string): field is UploadField =>
  Object.hasOwn(fileRules, field);
