// Every role a user can have. New users get USER.
export const USER = "user";
export const ADMIN = "admin";
export const MANAGER = "manager";

export const ALL_ROLES = [USER, ADMIN, MANAGER] as const;

export type Role = (typeof ALL_ROLES)[number];
