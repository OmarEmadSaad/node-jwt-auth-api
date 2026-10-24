// DEMO_MODE=true is for a public portfolio deployment where anyone can log in
// with the demo accounts (see docs/DEMO_CREDENTIALS.md). In demo mode:
// - users created through the API (POST /users, register) are marked sandbox: true
// - only sandbox users can be updated or deleted; the demo accounts and any
//   other existing users are protected, so visitors can't lock others out
// - npm run demo:reset deletes the sandbox users and their files
// Read on each request, because .env is loaded after this module is imported.
export const isDemoMode = () => process.env.DEMO_MODE === "true";
