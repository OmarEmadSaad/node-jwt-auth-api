import { USER, ADMIN, MANAGER, type Role } from "../../src/utils/userRoles.ts";

// Demo accounts for local testing and the public portfolio demo.
// Created by scripts/seedUsers.ts and listed in docs/DEMO_CREDENTIALS.md
// (test/demoCredentials.test.ts checks that the two match).
// They all use @example.com, a domain reserved for examples, so no real person
// gets these emails. Never reuse this password for a real account.
export const DEMO_PASSWORD = "DemoPass123!";

export interface DemoUser {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: Role;
}

export const demoUsers: DemoUser[] = [
  { firstName: "Sarah", lastName: "Mitchell", email: "sarah.mitchell@example.com", phoneNumber: "+201001234561", role: MANAGER },
  { firstName: "Karim", lastName: "Hassan", email: "karim.hassan@example.com", phoneNumber: "+201112345672", role: ADMIN },
  { firstName: "Emily", lastName: "Chen", email: "emily.chen@example.com", phoneNumber: "+201223456783", role: ADMIN },
  { firstName: "Youssef", lastName: "Mansour", email: "youssef.mansour@example.com", phoneNumber: "+201534567894", role: ADMIN },
  { firstName: "Laila", lastName: "Farouk", email: "laila.farouk@example.com", phoneNumber: "+201045678905", role: USER },
  { firstName: "Daniel", lastName: "Okafor", email: "daniel.okafor@example.com", phoneNumber: "+201156789016", role: USER },
  { firstName: "Mona", lastName: "Adel", email: "mona.adel@example.com", phoneNumber: "+201267890127", role: USER },
  { firstName: "Lucas", lastName: "Silva", email: "lucas.silva@example.com", phoneNumber: "+201578901238", role: USER },
  { firstName: "Nour", lastName: "Ibrahim", email: "nour.ibrahim@example.com", phoneNumber: "+201089012349", role: USER },
  { firstName: "Hannah", lastName: "Weber", email: "hannah.weber@example.com", phoneNumber: "+201190123450", role: USER },
];
