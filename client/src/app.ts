// Live demo: every action calls the real API.
// Tokens are kept in memory only (never in storage, the page or the console),
// so reloading the page logs you out.
// Compiled to js/app.js by npm run build:client.

// ---------- Types (the API's JSON) ----------
type Role = "user" | "admin" | "manager";

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: Role;
  avatar: string;
  document: string | null;
  sandbox?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface Session extends Tokens {
  user: User;
}

interface ApiBody<T> {
  status: "success" | "fail" | "error";
  data: T;
  message?: string;
}

// One invalid field, from a 400 response's data array
interface FieldError {
  path?: string;
  msg: string;
}

type EditableField = "firstName" | "lastName" | "email" | "phoneNumber";
const EDITABLE_FIELDS: EditableField[] = ["firstName", "lastName", "email", "phoneNumber"];
const FILE_FIELDS = ["avatar", "document"] as const;

// ---------- DOM lookups ----------
// The page's elements always exist, so a missing one is a bug in index.html
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
};

// A named control inside a form, e.g. input(form, "email")
const input = (form: HTMLFormElement, name: string) =>
  form.elements.namedItem(name) as HTMLInputElement;

// ---------- API address (see config.ts) ----------
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const LIVE_SERVER_PORTS = ["5500", "5501"];

const resolveApiBase = () => {
  const configured = (window.APP_CONFIG?.API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  // Opened as a file, or from VS Code Live Server (ports 5500/5501)
  if (location.protocol === "file:") return "http://localhost:3000";
  if (LOCAL_HOSTS.includes(location.hostname) && LIVE_SERVER_PORTS.includes(location.port)) {
    return "http://localhost:3000";
  }
  // Served by the API itself (http://localhost:3000/ or the deployed URL)
  return location.origin;
};

const API_BASE = resolveApiBase();
const DEMO_PASSWORD = "DemoPass123!";
const DEMO_ACCOUNTS: [name: string, email: string, role: Role][] = [
  ["Sarah Mitchell", "sarah.mitchell@example.com", "manager"],
  ["Karim Hassan", "karim.hassan@example.com", "admin"],
  ["Emily Chen", "emily.chen@example.com", "admin"],
  ["Youssef Mansour", "youssef.mansour@example.com", "admin"],
  ["Laila Farouk", "laila.farouk@example.com", "user"],
  ["Daniel Okafor", "daniel.okafor@example.com", "user"],
  ["Mona Adel", "mona.adel@example.com", "user"],
  ["Lucas Silva", "lucas.silva@example.com", "user"],
  ["Nour Ibrahim", "nour.ibrahim@example.com", "user"],
  ["Hannah Weber", "hannah.weber@example.com", "user"],
];

// ---------- State ----------
let session: Session | null = null;
let users: User[] = [];
let demoMode = false;
let apiOnline = false;
let selectedUser: User | null = null; // the user shown in the details dialog
let editingUser: User | null = null; // null = creating

// ---------- Small DOM helpers ----------
type Child = Node | string | null | undefined | false;

// Builds elements with textContent only, so API data can't inject HTML.
// Props that are element properties (onclick, href...) are set directly;
// anything else (aria-label...) becomes an attribute.
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = String(value);
    else if (key in node) (node as unknown as Record<string, unknown>)[key] = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children.filter((child): child is Node | string => child !== null && child !== undefined && child !== false));
  return node;
};

const roleBadge = (role: Role) => el("span", { class: `role role-${role}` }, role);

const fileUrl = (path: string) => `${API_BASE}/${path}`;

const setAvatar = (img: HTMLImageElement, user: Pick<User, "avatar"> | null) => {
  img.onerror = () => {
    img.onerror = null;
    img.src = "assets/avatar.svg";
  };
  img.src = user?.avatar ? fileUrl(user.avatar) : "assets/avatar.svg";
};

const formatDate = (value: string | undefined) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "–";

const toast = (message: string, type: "ok" | "error" = "ok") => {
  const node = el("div", { class: `toast toast-${type}`, role: type === "error" ? "alert" : "status" }, message);
  $("#toasts").append(node);
  setTimeout(() => node.remove(), type === "error" ? 7000 : 4000);
};

const errorBox = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-error]")!;

const showFormError = (container: HTMLElement, message: string, details?: unknown) => {
  const box = errorBox(container);
  box.replaceChildren(message);
  if (Array.isArray(details) && details.length > 1) {
    box.replaceChildren(
      el("strong", {}, "Please fix:"),
      el("ul", {}, ...(details as FieldError[]).map((detail) => el("li", {}, detail.msg))),
    );
  }
  box.hidden = false;
};

const clearFormError = (container: HTMLElement) => {
  const box = errorBox(container);
  box.hidden = true;
  box.replaceChildren();
};

// Disables a button while its action runs and shows a busy label
const busy = async <T>(button: HTMLButtonElement, label: string, action: () => Promise<T>) => {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
};

// ---------- API calls ----------
class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const SLOW_MS = 4000;

interface RequestOptions {
  method?: string;
  body?: object | FormData; // a plain object is sent as JSON, FormData as multipart (files)
  token?: string;
}

// Sends a request and returns the parsed JSON body, or throws an ApiError
const request = async <T>(path: string, { method = "GET", body, token }: RequestOptions = {}): Promise<ApiBody<T>> => {
  if (!API_BASE) {
    throw new ApiError("The demo backend isn't configured yet.", 0);
  }
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  // Free hosting sleeps when idle; tell the visitor if the first call is slow
  const slowTimer = setTimeout(
    () => setApiStatus("waking", "The API is waking up. Free hosting can take up to a minute…"),
    SLOW_MS,
  );

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: payload });
  } catch {
    setApiStatus("offline", `Can't reach the API at ${API_BASE}.`);
    throw new ApiError(
      `Can't reach the API at ${API_BASE}. It may be offline, or this page's address may be missing from the backend's CORS_ORIGINS.`,
      0,
    );
  } finally {
    clearTimeout(slowTimer);
  }
  // The API answered after being unreachable: update the status line
  if (!apiOnline && path !== "/health") checkHealth();

  const json = (await res.json().catch(() => ({}))) as Partial<ApiBody<T>>;
  if (!res.ok) {
    throw new ApiError(json.message || `Request failed (${res.status})`, res.status, json.data);
  }
  return json as ApiBody<T>;
};

// One refresh at a time, even if several requests get a 401 together
let refreshing: Promise<void> | null = null;
const refreshSession = () => {
  const current = session!;
  refreshing ??= request<Tokens>("/auth/refresh", {
    method: "POST",
    body: { refreshToken: current.refreshToken },
  })
    .then(({ data }) => {
      current.accessToken = data.accessToken;
      current.refreshToken = data.refreshToken;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

// Calls a protected route. On 401 it refreshes the tokens once and retries;
// if that fails too, the session is over and the visitor is logged out.
const authed = async <T>(path: string, options: RequestOptions = {}): Promise<ApiBody<T>> => {
  if (!session) throw new ApiError("Please log in first.", 401);
  try {
    return await request<T>(path, { ...options, token: session.accessToken });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    try {
      await refreshSession();
    } catch {
      endSession("Your session expired. Please log in again.");
      throw new ApiError("Your session expired. Please log in again.", 401);
    }
    return request<T>(path, { ...options, token: session!.accessToken });
  }
};

// Turns an error into a message for the visitor
const describeError = (err: unknown) => {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  if (err.status === 403) return `Not allowed: ${err.message}`;
  return err.message;
};

const errorDetails = (err: unknown) => (err instanceof ApiError ? err.details : undefined);

// ---------- API status ----------
const setApiStatus = (state: "online" | "waking" | "offline", text: string) => {
  $("#api-status").dataset.state = state;
  $("#api-status-text").textContent = text;
};

const checkHealth = async () => {
  if (!API_BASE) {
    setApiStatus(
      "offline",
      "The demo backend isn't configured yet. Set API_BASE_URL in client/src/config.ts (see the README).",
    );
    setFormsEnabled(false);
    return;
  }
  try {
    const { data } = await request<{ database: string; demoMode: boolean }>("/health");
    apiOnline = data.database === "connected";
    demoMode = data.demoMode;
    setApiStatus(
      apiOnline ? "online" : "offline",
      apiOnline
        ? `API online at ${API_BASE}${demoMode ? " · public demo mode: demo accounts are protected" : ""}`
        : "The API is up, but its database isn't connected.",
    );
  } catch {
    apiOnline = false;
  }
};

const setFormsEnabled = (enabled: boolean) => {
  document
    .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      "#auth-panel input, #auth-panel select, #auth-panel button",
    )
    .forEach((control) => (control.disabled = !enabled));
};

// ---------- Permissions (mirror the API's rules, which are the real check) ----------
const myRole = () => session?.user.role;
const canCreate = () => myRole() === "admin" || myRole() === "manager";

// Returns null if allowed, or the reason it isn't
const whyCantModify = (target: User): string | null => {
  if (!session) return "Log in first.";
  if (myRole() === "user") return "Only admins and managers can edit or delete users.";
  const isSelf = target._id === session.user._id;
  if (myRole() === "admin" && target.role !== "user" && !isSelf) {
    return "Only a manager can edit or delete admins and managers.";
  }
  if (demoMode && !target.sandbox) {
    return "Demo accounts are protected in the public demo. Create a user to try editing and deleting.";
  }
  return null;
};

const CAN_DO: Record<Role, string[]> = {
  user: ["See all users and their details", "Can't create, edit or delete users"],
  admin: [
    "See all users and their details",
    "Create users (always with the user role)",
    "Edit and delete accounts with the user role",
    "Can't change roles or touch admins and managers",
  ],
  manager: [
    "See all users and their details",
    "Create users with any role",
    "Edit and delete anyone, including admins",
    "Change roles",
  ],
};

// ---------- Session ----------
const startSession = (data: Session) => {
  session = { user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken };
  renderSession();
  loadUsers();
};

const endSession = (message?: string) => {
  session = null;
  users = [];
  renderSession();
  if (message) toast(message, "error");
};

const renderSession = () => {
  $("#auth-panel").hidden = Boolean(session);
  $("#session-panel").hidden = !session;
  $("#toolbar").hidden = !session;
  $("#new-user-btn").hidden = !session || !canCreate();
  $("#new-user-note").hidden = !session || canCreate();

  if (!session) {
    $("#users-count").textContent = "";
    $("#users").replaceChildren(
      el("p", { class: "empty" }, "Log in to load users from ", el("code", {}, "GET /api/users"), "."),
    );
    document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((dialog) => dialog.close());
    return;
  }

  const { user } = session;
  setAvatar($<HTMLImageElement>("#me-avatar"), user);
  $("#me-name").textContent = `${user.firstName} ${user.lastName}`;
  $("#me-email").textContent = user.email;
  $("#me-role").replaceChildren(roleBadge(user.role));
  $("#can-list").replaceChildren(
    ...CAN_DO[user.role].map((text) =>
      el("li", { class: text.startsWith("Can't") ? "cannot" : "can" }, text),
    ),
  );
};

// ---------- Users list ----------
const loadUsers = async () => {
  $("#users").replaceChildren(el("p", { class: "empty" }, "Loading users…"));
  try {
    const { data } = await authed<{ users: User[] }>("/users");
    users = data.users;
    renderUsers();
  } catch (err) {
    if (!session) return;
    $("#users").replaceChildren(el("p", { class: "empty error" }, describeError(err)));
  }
};

const renderUsers = () => {
  if (!session) return;
  const me = session.user;
  const query = $<HTMLInputElement>("#search").value.trim().toLowerCase();
  const role = $<HTMLSelectElement>("#role-filter").value;
  const visible = users.filter((user) => {
    const text = `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
    return (!role || user.role === role) && (!query || text.includes(query));
  });

  $("#users-count").textContent = `${visible.length} of ${users.length}`;
  if (!visible.length) {
    $("#users").replaceChildren(el("p", { class: "empty" }, "No users match."));
    return;
  }

  $("#users").replaceChildren(
    ...visible.map((user) => {
      const img = el("img", { alt: "", width: 44, height: 44, loading: "lazy" });
      setAvatar(img, user);
      return el(
        "button",
        {
          type: "button",
          class: "user-card",
          "aria-label": `View ${user.firstName} ${user.lastName}`,
          onclick: () => openDetails(user._id),
        },
        img,
        el(
          "span",
          { class: "info" },
          el(
            "span",
            { class: "name" },
            el("span", {}, `${user.firstName} ${user.lastName}`),
            roleBadge(user.role),
            user._id === me._id && el("span", { class: "tag" }, "you"),
          ),
          el("span", { class: "email" }, user.email),
        ),
      );
    }),
  );
};

// ---------- Details ----------
const openDetails = async (id: string) => {
  const dialog = $<HTMLDialogElement>("#details-dialog");
  let user: User;
  try {
    const { data } = await authed<{ user: User }>(`/users/${id}`); // GET /api/users/:id
    user = data.user;
  } catch (err) {
    toast(describeError(err), "error");
    if (err instanceof ApiError && err.status === 404) loadUsers();
    return;
  }
  selectedUser = user;

  setAvatar($<HTMLImageElement>("#details-avatar"), user);
  $("#details-name").textContent = `${user.firstName} ${user.lastName}`;
  $("#details-badges").replaceChildren(
    ...[
      roleBadge(user.role),
      user._id === session?.user._id && el("span", { class: "tag" }, "you"),
      demoMode && !user.sandbox && el("span", { class: "tag" }, "protected demo account"),
      user.sandbox && el("span", { class: "tag" }, "created in the demo"),
    ].filter((badge): badge is HTMLSpanElement => Boolean(badge)),
  );
  $("#details-email").textContent = user.email;
  $("#details-phone").textContent = user.phoneNumber;
  $("#details-document").replaceChildren(
    user.document
      ? el("a", { href: fileUrl(user.document), target: "_blank", rel: "noopener" }, "Open PDF")
      : "None",
  );
  $("#details-created").textContent = formatDate(user.createdAt);
  $("#details-updated").textContent = formatDate(user.updatedAt);

  const reason = whyCantModify(user);
  $<HTMLButtonElement>("#edit-btn").disabled = Boolean(reason);
  $<HTMLButtonElement>("#delete-btn").disabled = Boolean(reason);
  $("#details-note").hidden = !reason;
  $("#details-note").textContent = reason || "";

  if (!dialog.open) dialog.showModal();
};

// ---------- Create / edit ----------
const userForm = $<HTMLFormElement>("#user-form");

const openUserForm = (user: User | null = null) => {
  editingUser = user;
  userForm.reset();
  clearFormError(userForm);

  const isManager = myRole() === "manager";
  $("#user-form-title").textContent = user ? `Edit ${user.firstName} ${user.lastName}` : "New user";
  $("#user-form-submit").textContent = user ? "Save changes" : "Create user";
  $("#user-form-hint").textContent = user
    ? "Only the fields you change are sent (PATCH)."
    : "All fields except the files are required.";
  $("#uf-password-note").textContent = user ? "leave empty to keep it" : "8-72 characters";
  $("#uf-role-wrap").hidden = !isManager;
  $("#uf-role-note").hidden = isManager || Boolean(user);

  for (const field of EDITABLE_FIELDS) {
    input(userForm, field).value = user?.[field] ?? "";
    input(userForm, field).required = !user;
  }
  input(userForm, "password").required = !user;
  input(userForm, "role").value = user?.role ?? "user";

  $<HTMLDialogElement>("#details-dialog").close();
  $<HTMLDialogElement>("#user-dialog").showModal();
  input(userForm, "firstName").focus();
};

// FormData with only what should be sent: every filled field when creating,
// only changed fields when editing. Files go as multipart/form-data.
const buildUserForm = (form: HTMLFormElement) => {
  const body = new FormData();
  for (const field of EDITABLE_FIELDS) {
    const value = input(form, field).value.trim();
    if (editingUser ? value !== (editingUser[field] ?? "") : value) body.append(field, value);
  }
  const password = input(form, "password").value;
  if (password) body.append("password", password);
  const role = input(form, "role").value;
  if (myRole() === "manager" && (!editingUser || role !== editingUser.role)) {
    body.append("role", role);
  }
  appendFiles(form, body);
  return body;
};

const appendFiles = (form: HTMLFormElement, body: FormData) => {
  for (const field of FILE_FIELDS) {
    const file = input(form, field).files?.[0];
    if (file) body.append(field, file);
  }
};

const MAX_FILE = 5 * 1024 * 1024;
const checkFiles = (form: HTMLFormElement) => {
  for (const field of FILE_FIELDS) {
    const file = input(form, field).files?.[0];
    if (file && file.size > MAX_FILE) return `${file.name} is larger than 5 MB.`;
  }
  return null;
};

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormError(userForm);
  const fileError = checkFiles(userForm);
  if (fileError) return showFormError(userForm, fileError);

  const body = buildUserForm(userForm);
  const editing = editingUser;
  if (editing && [...body.keys()].length === 0) {
    return showFormError(userForm, "Nothing changed.");
  }

  await busy($<HTMLButtonElement>("#user-form-submit"), editing ? "Saving…" : "Creating…", async () => {
    try {
      const { data } = editing
        ? await authed<{ user: User }>(`/users/${editing._id}`, { method: "PATCH", body })
        : await authed<{ user: User }>("/users", { method: "POST", body });
      $<HTMLDialogElement>("#user-dialog").close();
      toast(editing ? "User updated." : `Created ${data.user.firstName} ${data.user.lastName}.`);
      if (editing && session && data.user._id === session.user._id) {
        session.user = { ...session.user, ...data.user };
        renderSession();
      }
      await loadUsers();
      openDetails(data.user._id);
    } catch (err) {
      if (session) showFormError(userForm, describeError(err), errorDetails(err));
    }
  });
});

// ---------- Delete ----------
$("#delete-btn").addEventListener("click", () => {
  if (!selectedUser) return;
  const user = selectedUser;
  $("#confirm-text").textContent = `${user.firstName} ${user.lastName} (${user.email}) and their uploaded files will be deleted. This can't be undone.`;
  clearFormError($("#confirm-dialog"));
  $<HTMLDialogElement>("#confirm-dialog").showModal();
});

$<HTMLButtonElement>("#confirm-delete-btn").addEventListener("click", async (event) => {
  const user = selectedUser;
  if (!user) return;
  await busy(event.currentTarget as HTMLButtonElement, "Deleting…", async () => {
    try {
      await authed(`/users/${user._id}`, { method: "DELETE" });
      $<HTMLDialogElement>("#confirm-dialog").close();
      $<HTMLDialogElement>("#details-dialog").close();
      toast(`Deleted ${user.firstName} ${user.lastName}.`);
      if (user._id === session?.user._id) {
        endSession();
        toast("You deleted your own account, so you were logged out.");
        return;
      }
      loadUsers();
    } catch (err) {
      if (session) showFormError($("#confirm-dialog"), describeError(err));
    }
  });
});

// ---------- Login / register / logout ----------
const demoSelect = $<HTMLSelectElement>("#demo-account");
for (const role of ["manager", "admin", "user"] as const) {
  const group = el("optgroup", { label: `${role[0].toUpperCase()}${role.slice(1)}s` });
  for (const [name, email, accountRole] of DEMO_ACCOUNTS) {
    if (accountRole === role) group.append(el("option", { value: email }, `${name} (${role})`));
  }
  demoSelect.append(group);
}
const fillDemoAccount = () => {
  if (!demoSelect.value) return;
  $<HTMLInputElement>("#login-email").value = demoSelect.value;
  $<HTMLInputElement>("#login-password").value = DEMO_PASSWORD;
};
demoSelect.addEventListener("change", fillDemoAccount);
// Visitors can log in straight away: the first demo account is pre-filled
demoSelect.value = DEMO_ACCOUNTS[0][1];
fillDemoAccount();

const loginForm = $<HTMLFormElement>("#login-form");
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormError(loginForm);
  const email = $<HTMLInputElement>("#login-email").value.trim();
  const password = $<HTMLInputElement>("#login-password").value;
  if (!email || !password) {
    return showFormError(loginForm, "Enter an email and password, or choose a demo account.");
  }

  await busy(loginForm.querySelector<HTMLButtonElement>('[type="submit"]')!, "Logging in…", async () => {
    try {
      const { data } = await request<Session>("/auth/login", { method: "POST", body: { email, password } });
      loginForm.reset();
      startSession(data);
      toast(`Logged in as ${data.user.firstName} (${data.user.role}).`);
    } catch (err) {
      showFormError(loginForm, describeError(err));
    }
  });
});

const registerForm = $<HTMLFormElement>("#register-form");
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormError(registerForm);
  const fileError = checkFiles(registerForm);
  if (fileError) return showFormError(registerForm, fileError);

  const body = new FormData();
  for (const field of EDITABLE_FIELDS) {
    body.append(field, input(registerForm, field).value.trim());
  }
  body.append("password", input(registerForm, "password").value);
  appendFiles(registerForm, body);

  await busy(registerForm.querySelector<HTMLButtonElement>('[type="submit"]')!, "Creating…", async () => {
    try {
      const { data } = await request<Session>("/auth/register", { method: "POST", body });
      registerForm.reset();
      selectTab("login");
      startSession(data);
      toast(`Welcome, ${data.user.firstName}! Your account was created.`);
    } catch (err) {
      showFormError(registerForm, describeError(err), errorDetails(err));
    }
  });
});

$<HTMLButtonElement>("#logout-btn").addEventListener("click", async (event) => {
  await busy(event.currentTarget as HTMLButtonElement, "Logging out…", async () => {
    try {
      await authed("/auth/logout", { method: "POST" });
      toast("Logged out. Your refresh token was revoked on the server.");
    } catch (err) {
      // Still log out locally; the tokens are forgotten either way
      if (session) toast(`Logged out here, but the server said: ${describeError(err)}`, "error");
    }
    if (session) endSession();
  });
});

// ---------- Tabs ----------
const selectTab = (name: "login" | "register") => {
  for (const tab of ["login", "register"] as const) {
    const selected = tab === name;
    const button = $(`#tab-${tab}`);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`#${tab}-form`).hidden = !selected;
  }
};
$("#tab-login").addEventListener("click", () => selectTab("login"));
$("#tab-register").addEventListener("click", () => selectTab("register"));
$(".tabs").addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const next = $("#tab-login").getAttribute("aria-selected") === "true" ? "register" : "login";
  selectTab(next);
  $(`#tab-${next}`).focus();
});

// ---------- Other wiring ----------
$("#new-user-btn").addEventListener("click", () => openUserForm());
$("#edit-btn").addEventListener("click", () => openUserForm(selectedUser));
$("#search").addEventListener("input", renderUsers);
$("#role-filter").addEventListener("change", renderUsers);
document.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((button) =>
  button.addEventListener("click", () => button.closest("dialog")?.close()),
);
// Click on the dark backdrop closes a dialog
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }),
);

renderSession();
checkHealth();
