# Demo credentials

> **These are public demo accounts, not real users.** They exist only so anyone can try
> the API and the portfolio page. Every email uses `example.com`, a domain reserved for
> examples, and the password is used for nothing else. Never reuse it, and never give a
> demo account access to real data.

The accounts are created by `npm run seed` from [`scripts/data/demoUsers.ts`](../scripts/data/demoUsers.ts).
MongoDB stores only bcrypt hashes of the password, never the password itself.
`npm test` checks that this table matches the seed data.

**Password for every demo account:** `DemoPass123!`

| # | Name | Email | Role | Phone |
|---|------|-------|------|-------|
| 1 | Sarah Mitchell | sarah.mitchell@example.com | manager | +201001234561 |
| 2 | Karim Hassan | karim.hassan@example.com | admin | +201112345672 |
| 3 | Emily Chen | emily.chen@example.com | admin | +201223456783 |
| 4 | Youssef Mansour | youssef.mansour@example.com | admin | +201534567894 |
| 5 | Laila Farouk | laila.farouk@example.com | user | +201045678905 |
| 6 | Daniel Okafor | daniel.okafor@example.com | user | +201156789016 |
| 7 | Mona Adel | mona.adel@example.com | user | +201267890127 |
| 8 | Lucas Silva | lucas.silva@example.com | user | +201578901238 |
| 9 | Nour Ibrahim | nour.ibrahim@example.com | user | +201089012349 |
| 10 | Hannah Weber | hannah.weber@example.com | user | +201190123450 |

## What each role can do

| Action | user | admin | manager |
|--------|:----:|:-----:|:-------:|
| Log in, refresh token, log out | ✅ | ✅ | ✅ |
| List users, view a user | ✅ | ✅ | ✅ |
| Create a user | ❌ | ✅ (always as *user*) | ✅ (any role) |
| Edit or delete a *user*-role account | ❌ | ✅ | ✅ |
| Edit or delete an admin or manager | ❌ | only themselves | ✅ |
| Change someone's role | ❌ | ❌ | ✅ |

## In the public demo (`DEMO_MODE=true`)

The 10 accounts above are **protected**: nobody can edit or delete them, so the
credentials keep working for every visitor. To try editing and deleting, first create a
user (as an admin or manager) or register a new account. Those are *sandbox* users, and
`npm run demo:reset` deletes them.
