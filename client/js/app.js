// Live demo: every action calls the real API.
// Tokens are kept in memory only (never in storage, the page or the console),
// so reloading the page logs you out.

const $ = (selector) => document.querySelector(selector);

// ---------- API address (see config.js) ----------
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const resolveApiBase = () => {
  const configured = (window.APP_CONFIG?.API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (LOCAL_HOSTS.includes(location.hostname) || location.protocol === "file:") {
    return "http://localhost:3000";
  }
  return "";
};

const API_BASE = resolveApiBase();
const DEMO_PASSWORD = "DemoPass123!";
const DEMO_ACCOUNTS = [
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
let session = null; // { user, accessToken, refreshToken }
let users = [];
let demoMode = false;
let apiOnline = false;
let selectedUser = null; // the user shown in the details dialog
let editingUser = null; // null = creating

// ---------- Small DOM helpers ----------
// Builds elements with textContent only, so API data can't inject HTML
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
  return node;
};

const roleBadge = (role) => el("span", { class: `role role-${role}` }, role);

const fileUrl = (path) => `${API_BASE}/${path}`;

const setAvatar = (img, user) => {
  img.onerror = () => {
    img.onerror = null;
    img.src = "assets/avatar.svg";
  };
  img.src = user?.avatar ? fileUrl(user.avatar) : "assets/avatar.svg";
};

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "–";

const toast = (message, type = "ok") => {
  const node = el("div", { class: `toast toast-${type}`, role: type === "error" ? "alert" : "status" }, message);
  $("#toasts").append(node);
  setTimeout(() => node.remove(), type === "error" ? 7000 : 4000);
};

const showFormError = (form, message, details) => {
  const box = form.querySelector("[data-error]");
  box.replaceChildren(message);
  if (Array.isArray(details) && details.length > 1) {
    box.replaceChildren(
      el("strong", {}, "Please fix:"),
      el("ul", {}, ...details.map((detail) => el("li", {}, detail.msg))),
    );
  }
  box.hidden = false;
};

const clearFormError = (form) => {
  const box = form.querySelector("[data-error]");
  box.hidden = true;
  box.replaceChildren();
};

// Disables a button while its action runs and shows a busy label
const busy = async (button, label, action) => {
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
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const SLOW_MS = 4000;

// Sends a request and returns the parsed JSON body, or throws an ApiError.
// body: a plain object (sent as JSON) or FormData (sent as multipart, for files)
const request = async (path, { method = "GET", body, token } = {}) => {
  if (!API_BASE) {
    throw new ApiError("The demo backend isn't configured yet.", 0);
  }
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
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

  let res;
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

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json.message || `Request failed (${res.status})`, res.status, json.data);
  }
  return json;
};

// One refresh at a time, even if several requests get a 401 together
let refreshing = null;
const refreshSession = () => {
  refreshing ??= request("/auth/refresh", {
    method: "POST",
    body: { refreshToken: session.refreshToken },
  })
    .then(({ data }) => {
      session.accessToken = data.accessToken;
      session.refreshToken = data.refreshToken;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

// Calls a protected route. On 401 it refreshes the tokens once and retries;
// if that fails too, the session is over and the visitor is logged out.
const authed = async (path, options = {}) => {
  if (!session) throw new ApiError("Please log in first.", 401);
  try {
    return await request(path, { ...options, token: session.accessToken });
  } catch (err) {
    if (err.status !== 401) throw err;
    try {
      await refreshSession();
    } catch {
      endSession("Your session expired. Please log in again.");
      throw new ApiError("Your session expired. Please log in again.", 401);
    }
    return request(path, { ...options, token: session.accessToken });
  }
};

// Turns an error into a message for the visitor
const describeError = (err) => {
  if (err.status === 403) return `Not allowed: ${err.message}`;
  if (err.status === 429) return err.message;
  return err.message;
};

// ---------- API status ----------
const setApiStatus = (state, text) => {
  const box = $("#api-status");
  box.dataset.state = state;
  $("#api-status-text").textContent = text;
};

const checkHealth = async () => {
  if (!API_BASE) {
    setApiStatus(
      "offline",
      "The demo backend isn't configured yet. Set API_BASE_URL in client/js/config.js (see the README).",
    );
    setFormsEnabled(false);
    return;
  }
  try {
    const { data } = await request("/health");
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

const setFormsEnabled = (enabled) => {
  document
    .querySelectorAll("#auth-panel input, #auth-panel select, #auth-panel button")
    .forEach((control) => (control.disabled = !enabled));
};

// ---------- Permissions (mirror the API's rules, which are the real check) ----------
const myRole = () => session?.user.role;
const canCreate = () => ["admin", "manager"].includes(myRole());

// Returns null if allowed, or the reason it isn't
const whyCantModify = (target) => {
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

const CAN_DO = {
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
const startSession = (data) => {
  session = { user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken };
  renderSession();
  loadUsers();
};

const endSession = (message) => {
  session = null;
  users = [];
  renderSession();
  if (message) toast(message, "error");
};

const renderSession = () => {
  const loggedIn = Boolean(session);
  $("#auth-panel").hidden = loggedIn;
  $("#session-panel").hidden = !loggedIn;
  $("#toolbar").hidden = !loggedIn;
  $("#new-user-btn").hidden = !loggedIn || !canCreate();
  $("#new-user-note").hidden = !loggedIn || canCreate();

  if (!loggedIn) {
    $("#users-count").textContent = "";
    $("#users").replaceChildren(
      el("p", { class: "empty" }, "Log in to load users from ", el("code", {}, "GET /api/users"), "."),
    );
    document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
    return;
  }

  const { user } = session;
  setAvatar($("#me-avatar"), user);
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
    const { data } = await authed("/users");
    users = data.users;
    renderUsers();
  } catch (err) {
    if (!session) return;
    $("#users").replaceChildren(el("p", { class: "empty error" }, describeError(err)));
  }
};

const renderUsers = () => {
  const query = $("#search").value.trim().toLowerCase();
  const role = $("#role-filter").value;
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
      const isMe = user._id === session.user._id;
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
            isMe ? el("span", { class: "tag" }, "you") : null,
          ),
          el("span", { class: "email" }, user.email),
        ),
      );
    }),
  );
};

// ---------- Details ----------
const openDetails = async (id) => {
  const dialog = $("#details-dialog");
  try {
    const { data } = await authed(`/users/${id}`); // GET /api/users/:id
    selectedUser = data.user;
  } catch (err) {
    toast(describeError(err), "error");
    if (err.status === 404) loadUsers();
    return;
  }
  const user = selectedUser;

  setAvatar($("#details-avatar"), user);
  $("#details-name").textContent = `${user.firstName} ${user.lastName}`;
  $("#details-badges").replaceChildren(
    ...[
      roleBadge(user.role),
      user._id === session.user._id && el("span", { class: "tag" }, "you"),
      demoMode && !user.sandbox && el("span", { class: "tag" }, "protected demo account"),
      user.sandbox && el("span", { class: "tag" }, "created in the demo"),
    ].filter(Boolean),
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
  $("#edit-btn").disabled = Boolean(reason);
  $("#delete-btn").disabled = Boolean(reason);
  $("#details-note").hidden = !reason;
  $("#details-note").textContent = reason || "";

  if (!dialog.open) dialog.showModal();
};

// ---------- Create / edit ----------
const openUserForm = (user = null) => {
  editingUser = user;
  const form = $("#user-form");
  form.reset();
  clearFormError(form);

  const isManager = myRole() === "manager";
  $("#user-form-title").textContent = user ? `Edit ${user.firstName} ${user.lastName}` : "New user";
  $("#user-form-submit").textContent = user ? "Save changes" : "Create user";
  $("#user-form-hint").textContent = user
    ? "Only the fields you change are sent (PATCH)."
    : "All fields except the files are required.";
  $("#uf-password-note").textContent = user ? "leave empty to keep it" : "8-72 characters";
  $("#uf-role-wrap").hidden = !isManager;
  $("#uf-role-note").hidden = isManager || Boolean(user);

  for (const field of ["firstName", "lastName", "email", "phoneNumber"]) {
    form.elements[field].value = user?.[field] ?? "";
    form.elements[field].required = !user;
  }
  form.elements.password.required = !user;
  form.elements.role.value = user?.role ?? "user";

  $("#details-dialog").close();
  $("#user-dialog").showModal();
  form.elements.firstName.focus();
};

// FormData with only what should be sent: every filled field when creating,
// only changed fields when editing. Files go as multipart/form-data.
const buildUserForm = (form) => {
  const body = new FormData();
  for (const field of ["firstName", "lastName", "email", "phoneNumber"]) {
    const value = form.elements[field].value.trim();
    if (editingUser ? value !== (editingUser[field] ?? "") : value) body.append(field, value);
  }
  if (form.elements.password.value) body.append("password", form.elements.password.value);
  if (myRole() === "manager" && (!editingUser || form.elements.role.value !== editingUser.role)) {
    body.append("role", form.elements.role.value);
  }
  for (const field of ["avatar", "document"]) {
    const file = form.elements[field].files[0];
    if (file) body.append(field, file);
  }
  return body;
};

const MAX_FILE = 5 * 1024 * 1024;
const checkFiles = (form) => {
  for (const field of ["avatar", "document"]) {
    const file = form.elements[field].files[0];
    if (file && file.size > MAX_FILE) return `${file.name} is larger than 5 MB.`;
  }
  return null;
};

$("#user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  clearFormError(form);
  const fileError = checkFiles(form);
  if (fileError) return showFormError(form, fileError);

  const body = buildUserForm(form);
  if (editingUser && [...body.keys()].length === 0) {
    return showFormError(form, "Nothing changed.");
  }

  await busy($("#user-form-submit"), editingUser ? "Saving…" : "Creating…", async () => {
    try {
      const { data } = editingUser
        ? await authed(`/users/${editingUser._id}`, { method: "PATCH", body })
        : await authed("/users", { method: "POST", body });
      $("#user-dialog").close();
      toast(editingUser ? "User updated." : `Created ${data.user.firstName} ${data.user.lastName}.`);
      if (editingUser && data.user._id === session.user._id) {
        session.user = { ...session.user, ...data.user };
        renderSession();
      }
      await loadUsers();
      openDetails(data.user._id);
    } catch (err) {
      if (session) showFormError(form, describeError(err), err.details);
    }
  });
});

// ---------- Delete ----------
$("#delete-btn").addEventListener("click", () => {
  const user = selectedUser;
  $("#confirm-text").textContent = `${user.firstName} ${user.lastName} (${user.email}) and their uploaded files will be deleted. This can't be undone.`;
  clearFormError($("#confirm-dialog"));
  $("#confirm-dialog").showModal();
});

$("#confirm-delete-btn").addEventListener("click", async (event) => {
  const user = selectedUser;
  await busy(event.currentTarget, "Deleting…", async () => {
    try {
      await authed(`/users/${user._id}`, { method: "DELETE" });
      $("#confirm-dialog").close();
      $("#details-dialog").close();
      toast(`Deleted ${user.firstName} ${user.lastName}.`);
      if (user._id === session.user._id) {
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
const demoSelect = $("#demo-account");
for (const role of ["manager", "admin", "user"]) {
  const group = el("optgroup", { label: `${role[0].toUpperCase()}${role.slice(1)}s` });
  for (const [name, email, accountRole] of DEMO_ACCOUNTS) {
    if (accountRole === role) group.append(el("option", { value: email }, `${name} (${role})`));
  }
  demoSelect.append(group);
}
demoSelect.addEventListener("change", () => {
  if (!demoSelect.value) return;
  $("#login-email").value = demoSelect.value;
  $("#login-password").value = DEMO_PASSWORD;
});

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  clearFormError(form);
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if (!email || !password) return showFormError(form, "Enter an email and password, or choose a demo account.");

  await busy(form.querySelector('[type="submit"]'), "Logging in…", async () => {
    try {
      const { data } = await request("/auth/login", { method: "POST", body: { email, password } });
      form.reset();
      startSession(data);
      toast(`Logged in as ${data.user.firstName} (${data.user.role}).`);
    } catch (err) {
      showFormError(form, describeError(err));
    }
  });
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  clearFormError(form);
  const fileError = checkFiles(form);
  if (fileError) return showFormError(form, fileError);

  const body = new FormData();
  for (const field of ["firstName", "lastName", "email", "phoneNumber"]) {
    body.append(field, form.elements[field].value.trim());
  }
  body.append("password", form.elements.password.value);
  for (const field of ["avatar", "document"]) {
    const file = form.elements[field].files[0];
    if (file) body.append(field, file);
  }

  await busy(form.querySelector('[type="submit"]'), "Creating…", async () => {
    try {
      const { data } = await request("/auth/register", { method: "POST", body });
      form.reset();
      selectTab("login");
      startSession(data);
      toast(`Welcome, ${data.user.firstName}! Your account was created.`);
    } catch (err) {
      showFormError(form, describeError(err), err.details);
    }
  });
});

$("#logout-btn").addEventListener("click", async (event) => {
  await busy(event.currentTarget, "Logging out…", async () => {
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
const selectTab = (name) => {
  for (const tab of ["login", "register"]) {
    const selected = tab === name;
    const button = $(`#tab-${tab}`);
    button.setAttribute("aria-selected", selected);
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
document.querySelectorAll("[data-close]").forEach((button) =>
  button.addEventListener("click", () => button.closest("dialog").close()),
);
// Click on the dark backdrop closes a dialog
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }),
);

renderSession();
checkHealth();
