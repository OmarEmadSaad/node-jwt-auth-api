import * as authService from "../services/auth.service.ts";
import * as httpStatusText from "../utils/httpStatusText.ts";
import { asyncWrapper } from "../middleware/asyncWrapper.ts";
import { getUploadedPaths } from "../middleware/upload.ts";
import { currentUser } from "../middleware/verifyToken.ts";

// The routes validate req.body before these run, so the fields are strings;
// the database work is in services/auth.service.ts, and any thrown error
// goes to errorHandler.

export const register = asyncWrapper(async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body;

  const data = await authService.registerUser({
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    ...getUploadedPaths(req), // avatar / document, if they were uploaded
  });
  res.status(201).json({ status: httpStatusText.SUCCESS, data });
});

export const login = asyncWrapper(async (req, res) => {
  const { email, password } = req.body;
  const data = await authService.loginUser(email, password);
  res.json({ status: httpStatusText.SUCCESS, data });
});

// Call this when the access token expires: send { refreshToken },
// get back a new accessToken and a new refreshToken.
export const refresh = asyncWrapper(async (req, res) => {
  const data = await authService.refreshTokens(req.body.refreshToken);
  res.json({ status: httpStatusText.SUCCESS, data });
});

export const logout = asyncWrapper(async (req, res) => {
  await authService.logoutUser(currentUser(req).id);
  res.json({ status: httpStatusText.SUCCESS, data: null });
});
