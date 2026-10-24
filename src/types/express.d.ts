import type { TokenPayload } from "../utils/generateToken.ts";

// verifyToken puts the access token's payload on the request as req.user.
// It's only set on routes behind verifyToken.
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export {};
