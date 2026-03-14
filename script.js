// Primary LocalStorage key where the normalized app database is persisted.
const STORAGE_KEY = "ipt_demo_v1";

// LocalStorage keys used by this prototype. Changing these names changes where data/session is read from.
const KEYS = {
  authToken: "authToken",
  authUser: "authUser"
};

const API_BASE_URL = "http://localhost:3000/api";

// Hash routes mapped to section element IDs. This controls which page block is shown.
const ROUTES = {
  "#/": "homeSection",
  "#/home": "homeSection",
  "#/register": "registerSection",
  "#/login": "loginSection",
  "#/profile": "profileSection",
  "#/requests": "requestsSection",
  "#/employees": "employeesSection",
  "#/accounts": "accountsSection",
  "#/departments": "departmentsSection"
};

// Seed data guarantees at least one admin account exists after first load/migration.
const SEEDED_ADMINS = [
  { id: 1, firstName: "System", lastName: "Admin", email: "admin@example.com", password: "Password123!", role: "admin", verified: true },
  { id: 2, firstName: "Local", lastName: "Admin", email: "admin@app.local", password: "admin123", role: "admin", verified: true }
];

// Default departments inserted during first-time initialization.
const SEEDED_DEPARTMENTS = [
  { id: 1, name: "Engineering", description: "Software team" },
  { id: 2, name: "HR", description: "Human Resources" }
];

// In-memory app state. Most UI actions mutate this object, then `saveDB()` persists it.
const state = { db: { accounts: [], departments: [], employees: [], requests: [] } };
// Kept for debugging/legacy references so existing code can use `window.db`.
window.db = state.db;
// Holds the currently authenticated account object for UI rendering and guards.
let currentUser = null;
// Short helper to fetch DOM elements by id.
const $ = (id) => document.getElementById(id);
// Canonical email normalization used before storing/comparing account emails.
const toEmail = (v) => String(v || "").trim().toLowerCase();

// Data normalizers enforce stable object shapes and default values across migrations/forms.
const normalizeAccount = (a) => ({ ...a, email: toEmail(a.email), role: a.role || "user", verified: typeof a.verified === "boolean" ? a.verified : true });
const normalizeDepartment = (d) => ({ id: d.id || Date.now(), name: String(d.name || "").trim(), description: String(d.description || "").trim() });
const normalizeEmployee = (e) => ({
  id: String(e.id || "").trim(),
  userId: Number(e.userId || 0),
  userEmail: toEmail(e.userEmail),
  departmentId: Number(e.departmentId),
  position: String(e.position || "").trim(),
  hireDate: String(e.hireDate || "").trim()
});
const normalizeRequest = (r) => ({
  id: r.id || Date.now(),
  employeeEmail: toEmail(r.employeeEmail),
  type: r.type || "Equipment",
  items: Array.isArray(r.items) ? r.items : [],
  leaveStart: String(r.leaveStart || "").trim(),
  leaveEnd: String(r.leaveEnd || "").trim(),
  leaveReason: String(r.leaveReason || "").trim(),
  status: r.status || "pending",
  createdAt: r.createdAt || Date.now()
});

// ===== Storage Helpers =====
function readSessionJSON(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } }
// Removes duplicate accounts by normalized email and keeps first seen entry.
function dedupeAccounts(accounts) {
  const seen = new Set();
  return accounts.filter((a) => {
    if (!a.email || seen.has(a.email)) return false;
    seen.add(a.email);
    return true;
  });
}

// Persists the whole in-memory database into the primary storage key.
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(window.db));
}

// Saves current DB to local storage.
function saveDB() {
  saveToStorage();
}

// ===== UI Feedback =====
// Shows a Bootstrap toast message for user feedback.
function showToast(message, type = "info", position = "top-center", delay = 1000) {
  const container = $("appToastContainer");
  if (!container || !window.bootstrap) return;
  container.classList.remove("toast-pos-top-right", "toast-pos-top-center");
  container.classList.add(position === "top-center" ? "toast-pos-top-center" : "toast-pos-top-right");
  const tone = ({ success: "text-bg-success", warning: "text-bg-warning", danger: "text-bg-danger", info: "text-bg-primary" })[type] || "text-bg-primary";
  const toast = document.createElement("div");
  toast.className = `toast align-items-center border-0 ${tone}`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-atomic", "true");
  toast.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div></div>`;
  container.appendChild(toast);
  const inst = new window.bootstrap.Toast(toast, { delay });
  toast.addEventListener("hidden.bs.toast", () => toast.remove());
  inst.show();
}

// Returns or creates a small inline error node right after a field.
function ensureFieldErrorNode(field) {
  if (!(field instanceof HTMLElement)) return null;
  const next = field.nextElementSibling;
  if (next && next.classList.contains("field-error")) return next;
  const node = document.createElement("div");
  node.className = "field-error";
  field.insertAdjacentElement("afterend", node);
  return node;
}

// Shows inline validation message for one input/select field.
function setFieldError(field, message) {
  if (!(field instanceof HTMLElement)) return;
  const node = ensureFieldErrorNode(field);
  if (!node) return;
  field.classList.add("is-invalid");
  node.textContent = message;
}

// Clears inline validation message for one field.
function clearFieldError(field) {
  if (!(field instanceof HTMLElement)) return;
  field.classList.remove("is-invalid");
  const next = field.nextElementSibling;
  if (next && next.classList.contains("field-error")) next.textContent = "";
}

// Clears all inline validation messages inside a form.
function clearFormErrors(form) {
  if (!(form instanceof HTMLFormElement)) return;
  form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
  form.querySelectorAll(".field-error").forEach((el) => { el.textContent = ""; });
}

// ===== Data Bootstrap =====
// Initializes state from LocalStorage and performs migration from older keys/formats.
// Side effect: always writes normalized data back to storage through `saveDB()`.
function loadFromStorage() {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== "object") {
    state.db = {
      accounts: SEEDED_ADMINS.map(normalizeAccount),
      departments: SEEDED_DEPARTMENTS.map(normalizeDepartment),
      employees: [],
      requests: []
    };
    window.db = state.db;
    saveToStorage();
    return;
  }

  state.db = {
    accounts: Array.isArray(parsed.accounts) ? dedupeAccounts(parsed.accounts.map(normalizeAccount)) : SEEDED_ADMINS.map(normalizeAccount),
    departments: Array.isArray(parsed.departments) && parsed.departments.length ? parsed.departments.map(normalizeDepartment) : SEEDED_DEPARTMENTS.map(normalizeDepartment),
    employees: Array.isArray(parsed.employees) ? parsed.employees.map(normalizeEmployee) : [],
    requests: Array.isArray(parsed.requests) ? parsed.requests.map(normalizeRequest) : []
  };

  SEEDED_ADMINS.forEach((seed) => {
    if (!state.db.accounts.some((a) => a.email === seed.email)) {
      state.db.accounts = [normalizeAccount(seed), ...state.db.accounts];
    }
  });

  window.db = state.db;
  saveToStorage();
}

// Public bootstrap helper to initialize app data.
function initDB() {
  loadFromStorage();
}

// ===== Session/Auth =====
// Resolves currently logged-in user from API session data.
function getCurrentUser() {
  const token = sessionStorage.getItem(KEYS.authToken);
  const storedUser = readSessionJSON(KEYS.authUser);
  if (token && storedUser) {
    const email = toEmail(storedUser.email);
    const account = state.db.accounts.find((a) => a.email === email);
    return account ? { ...account, ...storedUser } : storedUser;
  }
  return null;
}

function getApiSessionUser(loginValue, apiUser) {
  const normalizedLogin = toEmail(loginValue);
  const apiEmail = toEmail(apiUser.email);
  const fallbackEmail = apiEmail || normalizedLogin || toEmail(`${apiUser.username}@app.local`);
  const matchedAccount = state.db.accounts.find((account) => {
    if (apiEmail && account.email === apiEmail) return true;
    if (account.email === normalizedLogin) return true;
    return account.email === toEmail(`${apiUser.username}@app.local`);
  });

  if (matchedAccount) return normalizeAccount({ ...matchedAccount, ...apiUser, email: matchedAccount.email || fallbackEmail });
  const account = normalizeAccount({
    id: Date.now(),
    firstName: apiUser.firstName || apiUser.username,
    lastName: apiUser.lastName || "",
    email: fallbackEmail,
    role: apiUser.role,
    verified: true,
    username: apiUser.username
  });
  state.db.accounts.push(account);
  saveDB();
  return account;
}

function getAuthHeader() {
  const token = sessionStorage.getItem(KEYS.authToken);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function updateRoleUI(user = currentUser) {
  const isAdmin = Boolean(user && user.role === "admin");
  document.querySelectorAll(".role-admin").forEach((node) => {
    node.style.display = isAdmin ? "" : "none";
  });
}

function showDashboard(user) {
  setAuthState(true, user);
  updateRoleUI(user);
  renderProfile(user);
  renderMyRequests(user);
  renderAdminRequests(user);
  if (user.role === "admin") renderAdminViews(user);
}

async function login(username, password) {
  try {
    const response = await fetch("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      const user = getApiSessionUser(username, data.user);
      sessionStorage.setItem(KEYS.authToken, data.token);
      sessionStorage.setItem(KEYS.authUser, JSON.stringify(user));
      showDashboard(user);
      return { ok: true, user };
    }

    alert("Login failed: " + data.error);
    return { ok: false };
  } catch (err) {
    alert("Network error");
    return { ok: false, error: err };
  }
}

async function loadProfileFromApi() {
  const token = sessionStorage.getItem(KEYS.authToken);
  if (!token) return null;

  const response = await fetch(`${API_BASE_URL}/profile`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    clearSession();
    return null;
  }

  const data = await response.json();
  const loginValue = data.user?.username || data.user?.email || "";
  const user = getApiSessionUser(loginValue, data.user);
  sessionStorage.setItem(KEYS.authUser, JSON.stringify(user));
  return user;
}

// Example: Fetch admin data
async function loadAdminDashboard() {
  const res = await fetch("http://localhost:3000/api/admin/dashboard", {
    headers: getAuthHeader()
  });
  if (res.ok) {
    const data = await res.json();
    if ($("content")) $("content").innerText = data.message;
  } else {
    if ($("content")) $("content").innerText = "Access denied!";
  }
}

// Stores active session in sessionStorage.
function setSession(user, token = "") {
  if (token) sessionStorage.setItem(KEYS.authToken, token);
  sessionStorage.setItem(KEYS.authUser, JSON.stringify(user));
}

// Clears all persisted session keys.
function clearSession() {
  sessionStorage.removeItem(KEYS.authToken);
  sessionStorage.removeItem(KEYS.authUser);
}

// Toggles authentication/role CSS flags and updates `currentUser`.
function setAuthState(isAuth, user = null) {
  currentUser = isAuth ? (user || currentUser) : null;
  document.body.classList.toggle("not-authenticated", !isAuth);
  document.body.classList.toggle("authenticated", isAuth);
  document.body.classList.toggle("is-authenticated", isAuth);
  document.body.classList.toggle("is-admin", Boolean(isAuth && currentUser && currentUser.role === "admin"));
  updateRoleUI(currentUser);
}

// ===== View Rendering =====
// Loads current profile values into the floating profile form.
function fillProfileEditForm(user = currentUser) {
  if (!user) return;
  if ($("profileFirstNameInput")) $("profileFirstNameInput").value = user.firstName || "";
  if ($("profileLastNameInput")) $("profileLastNameInput").value = user.lastName || "";
  if ($("profileEmailInput")) $("profileEmailInput").value = user.email || "";
  if ($("profileRoleInput")) $("profileRoleInput").value = user.role || "";
}

// Opens the floating profile edit form.
function openProfileEditForm(user = currentUser) {
  const pop = $("profileEditPopover");
  if (!pop || !user) return;
  fillProfileEditForm(user);
  pop.classList.add("active");
  pop.setAttribute("aria-hidden", "false");
  $("profileFirstNameInput")?.focus();
}

// Closes the floating profile edit form.
function closeProfileEditForm() {
  const pop = $("profileEditPopover");
  if (!pop) return;
  pop.classList.remove("active");
  pop.setAttribute("aria-hidden", "true");
}

// Renders the Profile section and wires profile edit action for the current account.
function renderProfile(user = currentUser) {
  const node = $("profileMessage");
  if (!node) return;
  const existingBtn = $("editProfileBtn");
  if (!user) {
    node.textContent = "No active user.";
    if (existingBtn) existingBtn.remove();
    closeProfileEditForm();
    return;
  }
  node.textContent = `Name: ${user.firstName} ${user.lastName} | Email: ${user.email} | Role: ${user.role}`;
  if (existingBtn) return;
  const btn = document.createElement("button");
  btn.id = "editProfileBtn";
  btn.type = "button";
  btn.className = "btn btn-outline-primary btn-sm mt-2";
  btn.textContent = "Edit Profile";
  btn.addEventListener("click", () => {
    const active = getCurrentUser();
    if (!active) return showToast("Login required.", "warning");
    openProfileEditForm(active);
  });
  node.insertAdjacentElement("afterend", btn);
}

// Returns a valid route hash, defaulting to home when route is unknown.
function normalizeHash(hash) { return ROUTES[hash] ? hash : "#/"; }
// Updates browser hash to trigger route navigation.
function navigateTo(hash) { window.location.hash = hash; }
// Route guard that blocks unauthenticated and non-admin users from protected/admin pages.
function guardHash(hash, user) {
  const protectedRoutes = new Set(["#/profile", "#/requests", "#/employees", "#/accounts", "#/departments"]);
  const adminRoutes = new Set(["#/employees", "#/accounts", "#/departments"]);
  if (protectedRoutes.has(hash) && !user) return "#/";
  if (adminRoutes.has(hash) && user && user.role !== "admin") return "#/";
  return hash;
}

// ===== Navigation/Route UI =====
// Highlights the active page section and current nav link.
function setActiveRoute(hash) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const pageId = ROUTES[hash];
  if ($(pageId)) $(pageId).classList.add("active");
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("route-active"));
  const link = document.querySelector(`.nav-link[href='${hash}']`);
  if (link) link.classList.add("route-active");
}

// Looks up readable department name from department id.
function departmentNameById(id) {
  return state.db.departments.find((d) => Number(d.id) === Number(id))?.name || "Unknown";
}

// Renders account rows and binds per-row actions.
// Side effects: can edit account data, reset passwords, and delete linked account/employee data.
function renderAccountsTable(currentUser) {
  const tbody = $("accountsTableBody");
  if (!tbody) return;
  if (!state.db.accounts.length) {
    tbody.innerHTML = `<tr class="table-empty-row"><td colspan="5">No accounts yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.db.accounts.map((a) => `<tr><td>${a.firstName || ""} ${a.lastName || ""}</td><td>${a.email}</td><td>${a.role}</td><td>${a.verified ? "Yes" : "No"}</td><td><button class="btn btn-sm btn-outline-success me-1" data-account-action="edit" data-email="${a.email}">Edit</button><button class="btn btn-sm btn-outline-primary me-1" data-account-action="reset" data-email="${a.email}">Reset Password</button><button class="btn btn-sm btn-outline-danger" data-account-action="delete" data-email="${a.email}">Delete</button></td></tr>`).join("");
  tbody.querySelectorAll("button[data-account-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-account-action");
      const email = toEmail(btn.getAttribute("data-email"));
      const target = state.db.accounts.find((a) => a.email === email);
      if (!target) return;
      if (action === "edit") { fillAccountForm(target); return; }
      if (action === "reset") {
        const pw = prompt(`New password for ${target.email} (min 6 chars):`);
        if (pw === null) return;
        if (pw.length < 6) return showToast("Password must be at least 6 characters.", "warning");
        target.password = pw; saveDB(); showToast("Password updated.", "success"); return;
      }
      if (currentUser && currentUser.email === target.email && currentUser.role === "admin") return showToast("Safety rule: admin cannot delete their own account.", "warning");
      if (!confirm(`Delete account: ${target.email}?`)) return;
      state.db.accounts = state.db.accounts.filter((a) => a.email !== target.email);
      state.db.employees = state.db.employees.filter((e) => e.userEmail !== target.email);
      saveDB();
      renderAccountsTable(currentUser);
      populateEmployeeOptions();
      renderEmployeesTable();
    });
  });
}

// Thin wrapper for account list rendering to keep naming consistent.
function renderAccountsList(user) {
  renderAccountsTable(user);
}

// Clears the account form inputs and edit state.
function resetAccountForm() {
  const form = $("accountForm");
  if (form instanceof HTMLFormElement) clearFormErrors(form);
  if ($("accountEditEmail")) $("accountEditEmail").value = "";
  if ($("accountFirstNameInput")) $("accountFirstNameInput").value = "";
  if ($("accountLastNameInput")) $("accountLastNameInput").value = "";
  if ($("accountEmailInput")) $("accountEmailInput").value = "";
  if ($("accountPasswordInput")) $("accountPasswordInput").value = "";
  if ($("accountRoleSelect")) $("accountRoleSelect").value = "user";
  if ($("accountVerifiedCheck")) $("accountVerifiedCheck").checked = false;
}

// Loads account data into the account form for editing.
function fillAccountForm(a) {
  if ($("accountEditEmail")) $("accountEditEmail").value = a.email;
  if ($("accountFirstNameInput")) $("accountFirstNameInput").value = a.firstName || "";
  if ($("accountLastNameInput")) $("accountLastNameInput").value = a.lastName || "";
  if ($("accountEmailInput")) $("accountEmailInput").value = a.email;
  if ($("accountPasswordInput")) $("accountPasswordInput").value = "";
  if ($("accountRoleSelect")) $("accountRoleSelect").value = a.role || "user";
  if ($("accountVerifiedCheck")) $("accountVerifiedCheck").checked = Boolean(a.verified);
}

// Renders departments list and binds edit/delete row actions.
function renderDepartmentsTable() {
  const tbody = $("departmentsTableBody");
  if (!tbody) return;
  if (!state.db.departments.length) {
    tbody.innerHTML = `<tr class="table-empty-row"><td colspan="3">No departments yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.db.departments.map((d) => `<tr><td>${d.name}</td><td>${d.description || ""}</td><td><button class="btn btn-sm btn-outline-primary me-1" data-dept-action="edit" data-dept-id="${d.id}">Edit</button><button class="btn btn-sm btn-outline-danger" data-dept-action="delete" data-dept-id="${d.id}">Delete</button></td></tr>`).join("");
  tbody.querySelectorAll("button[data-dept-action]").forEach((btn) => btn.addEventListener("click", () => {
    const action = btn.getAttribute("data-dept-action");
    const deptId = Number(btn.getAttribute("data-dept-id"));
    const dept = state.db.departments.find((d) => Number(d.id) === deptId);
    if (!dept) return;
    if (action === "edit") return fillDepartmentForm(dept);
    // Prevent delete when employees still reference this department.
    if (state.db.employees.some((e) => Number(e.departmentId) === deptId)) return showToast("Department is linked to employees.", "warning");
    state.db.departments = state.db.departments.filter((d) => Number(d.id) !== deptId);
    saveDB();
    renderDepartmentsTable();
    populateEmployeeOptions();
    resetDepartmentForm();
  }));
}

// Clears department form values and edit id state.
function resetDepartmentForm() {
  const form = $("departmentForm");
  if (form instanceof HTMLFormElement) clearFormErrors(form);
  if ($("departmentEditId")) $("departmentEditId").value = "";
  if ($("departmentNameInput")) $("departmentNameInput").value = "";
  if ($("departmentDescriptionInput")) $("departmentDescriptionInput").value = "";
}

// Loads selected department data into the department form.
function fillDepartmentForm(d) {
  if ($("departmentEditId")) $("departmentEditId").value = String(d.id);
  if ($("departmentNameInput")) $("departmentNameInput").value = d.name;
  if ($("departmentDescriptionInput")) $("departmentDescriptionInput").value = d.description || "";
}

// Populates employee form options from current accounts and departments.
function populateEmployeeOptions() {
  const emails = $("employeeUserEmailOptions");
  const dept = $("employeeDepartmentSelect");
  if (!emails || !dept) return;
  emails.innerHTML = state.db.accounts.filter((a) => a.role !== "admin").map((a) => `<option value="${a.email}"></option>`).join("");
  dept.innerHTML = state.db.departments.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
}

// Calculates next employee ID from existing employee data (highest numeric suffix + 1).
function getNextEmployeeId() {
  const ids = state.db.employees.map((e) => String(e.id || "").trim()).filter(Boolean);
  const numericParts = ids.map((id) => {
    const match = id.match(/(\d+)$/);
    return match ? Number(match[1]) : null;
  }).filter((n) => Number.isFinite(n));
  const next = (numericParts.length ? Math.max(...numericParts) : 0) + 1;
  const allNumeric = ids.length > 0 && ids.every((id) => /^\d+$/.test(id));
  if (allNumeric) return String(next);
  return `EMP-${String(next).padStart(3, "0")}`;
}

// Clears employee form values and edit state.
function resetEmployeeForm() {
  const form = $("employeeForm");
  if (form instanceof HTMLFormElement) clearFormErrors(form);
  if ($("employeeEditId")) $("employeeEditId").value = "";
  if ($("employeeIdInput")) {
    $("employeeIdInput").value = getNextEmployeeId();
    $("employeeIdInput").readOnly = true;
  }
  if ($("employeeUserEmailInput")) $("employeeUserEmailInput").value = "";
  if ($("employeePositionInput")) $("employeePositionInput").value = "";
  if ($("employeeHireDateInput")) $("employeeHireDateInput").value = "";
  if ($("employeeDepartmentSelect") && $("employeeDepartmentSelect").options.length > 0) $("employeeDepartmentSelect").selectedIndex = 0;
}

// Renders employees list and binds edit/delete actions for each row.
function renderEmployeesTable() {
  const tbody = $("employeesTableBody");
  if (!tbody) return;
  if (!state.db.employees.length) {
    tbody.innerHTML = `<tr class="table-empty-row"><td colspan="6">No employees yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.db.employees.map((e) => `<tr><td>${e.id}</td><td>${e.userEmail}</td><td>${e.position}</td><td>${departmentNameById(e.departmentId)}</td><td>${e.hireDate || ""}</td><td><button class="btn btn-sm btn-outline-success me-1" data-emp-action="edit" data-emp-id="${e.id}">Edit</button><button class="btn btn-sm btn-outline-danger" data-emp-action="delete" data-emp-id="${e.id}">Delete</button></td></tr>`).join("");
  tbody.querySelectorAll("button[data-emp-action]").forEach((btn) => btn.addEventListener("click", () => {
    const action = btn.getAttribute("data-emp-action");
    const id = String(btn.getAttribute("data-emp-id") || "").trim();
    const row = state.db.employees.find((e) => String(e.id) === id);
    if (!row) return;
    // Delete removes only the employee row; linked account remains unchanged.
    if (action === "delete") {
      state.db.employees = state.db.employees.filter((e) => String(e.id) !== id);
      saveDB();
      return renderEmployeesTable();
    }
    // Switch form to edit mode and unlock employee ID input.
    if ($("employeeEditId")) $("employeeEditId").value = String(row.id);
    if ($("employeeIdInput")) {
      $("employeeIdInput").value = String(row.id);
      $("employeeIdInput").readOnly = false;
    }
    if ($("employeeUserEmailInput")) $("employeeUserEmailInput").value = row.userEmail;
    if ($("employeeDepartmentSelect")) $("employeeDepartmentSelect").value = String(row.departmentId);
    if ($("employeePositionInput")) $("employeePositionInput").value = row.position;
    if ($("employeeHireDateInput")) $("employeeHireDateInput").value = row.hireDate || "";
  }));
}

// Maps request status to Bootstrap badge classes.
function statusBadgeClass(status) { return status === "approved" ? "bg-success" : status === "rejected" ? "bg-danger" : "bg-warning text-dark"; }

// Formats YYYY-MM-DD into a readable date label for request details.
function formatHumanDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Calculates inclusive leave days between start and end dates.
function leaveDayCount(start, end) {
  const a = new Date(`${String(start || "").trim()}T00:00:00`);
  const b = new Date(`${String(end || "").trim()}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((b - a) / msPerDay) + 1;
}

// Creates one dynamic request item row node used in request builder modal.
function createRequestItemRow(item = { name: "", quantity: 1 }) {
  const row = document.createElement("div");
  row.className = "row g-2 align-items-center mb-2 request-item-row";
  row.innerHTML = `<div class="col-md-7"><input type="text" class="form-control request-item-name" placeholder="Item name" value="${item.name || ""}" required></div><div class="col-md-3"><input type="number" min="1" class="form-control request-item-qty" placeholder="Qty" value="${item.quantity || 1}" required></div><div class="col-md-2 d-grid"><button type="button" class="btn btn-outline-danger remove-request-item-btn">Remove</button></div>`;
  return row;
}

// Toggles request modal fields between Equipment (items) and Leave (dates/reason).
function toggleRequestTypeFields() {
  const type = String($("requestType")?.value || "Equipment");
  const itemsBlock = $("requestItemsBlock");
  const leaveBlock = $("requestLeaveBlock");
  // Disable item inputs when type is Leave to avoid submitting mixed data.
  if (itemsBlock) itemsBlock.style.display = type === "Leave" ? "none" : "block";
  if (leaveBlock) leaveBlock.style.display = type === "Leave" ? "block" : "none";
  const itemInputs = document.querySelectorAll("#requestItemsContainer .request-item-name, #requestItemsContainer .request-item-qty");
  itemInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.disabled = type === "Leave";
  });
  if ($("leaveStartDate")) {
    $("leaveStartDate").disabled = type !== "Leave";
    $("leaveStartDate").required = type === "Leave";
  }
  if ($("leaveEndDate")) {
    $("leaveEndDate").disabled = type !== "Leave";
    $("leaveEndDate").required = type === "Leave";
  }
  if ($("leaveReason")) $("leaveReason").disabled = type !== "Leave";
  if ($("addRequestItemBtn")) $("addRequestItemBtn").disabled = type === "Leave";
}

// Builds human-readable details text for request tables.
function requestDetailsText(r) {
  if (r.type === "Leave") {
    const startLabel = formatHumanDate(r.leaveStart);
    const endLabel = formatHumanDate(r.leaveEnd);
    const range = startLabel && endLabel ? `${startLabel} to ${endLabel}` : "No leave dates";
    const days = leaveDayCount(r.leaveStart, r.leaveEnd);
    const daysLabel = days > 0 ? ` (${days} day${days > 1 ? "s" : ""})` : "";
    const reason = r.leaveReason ? ` | Reason: ${r.leaveReason}` : "";
    return `${range}${daysLabel}${reason}`;
  }
  return r.items.map((i) => `${i.name} x${i.quantity}`).join(", ");
}

// Resets request modal fields to defaults and adds one starter item row.
function resetRequestBuilder() {
  const form = $("requestForm");
  if (form instanceof HTMLFormElement) clearFormErrors(form);
  if ($("requestType")) $("requestType").value = "Equipment";
  const container = $("requestItemsContainer");
  if ($("leaveStartDate")) $("leaveStartDate").value = "";
  if ($("leaveEndDate")) $("leaveEndDate").value = "";
  if ($("leaveReason")) $("leaveReason").value = "";
  if (!container) return;
  container.innerHTML = "";
  container.appendChild(createRequestItemRow());
  toggleRequestTypeFields();
}

// Renders request history for the currently logged-in user.
function renderMyRequests(user) {
  const tbody = $("requestsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!user) return;
  // User view only shows requests created by the logged-in email.
  const myRows = state.db.requests.filter((r) => r.employeeEmail === user.email).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  if (!myRows.length) {
    tbody.innerHTML = `<tr class="table-empty-row"><td colspan="4">No requests yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = myRows.map((r) => {
    const details = requestDetailsText(r);
    return `<tr><td>${new Date(r.createdAt).toLocaleString()}</td><td>${r.type}</td><td>${details}</td><td><span class="badge ${statusBadgeClass(r.status)}">${String(r.status).toUpperCase()}</span></td></tr>`;
  }).join("");
}

// Renders full request table for admins and wires approve/reject actions.
function renderAdminRequests(user) {
  const tbody = $("adminRequestsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!user || user.role !== "admin") return;
  if (!state.db.requests.length) {
    tbody.innerHTML = `<tr class="table-empty-row"><td colspan="6">No requests yet.</td></tr>`;
    return;
  }
  // Admin action updates status in-place, then refreshes both request tables.
  tbody.innerHTML = state.db.requests.slice().sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).map((r) => {
    const details = requestDetailsText(r);
    return `<tr><td>${r.employeeEmail}</td><td>${new Date(r.createdAt).toLocaleString()}</td><td>${r.type}</td><td>${details}</td><td><span class="badge ${statusBadgeClass(r.status)}">${String(r.status).toUpperCase()}</span></td><td class="request-actions-cell"><div class="request-actions"><button class="btn btn-sm btn-outline-success" data-request-action="approve" data-request-id="${r.id}">Approve</button><button class="btn btn-sm btn-outline-danger" data-request-action="reject" data-request-id="${r.id}">Reject</button></div></td></tr>`;
  }).join("");
  tbody.querySelectorAll("button[data-request-action]").forEach((btn) => btn.addEventListener("click", () => {
    const action = btn.getAttribute("data-request-action");
    const id = Number(btn.getAttribute("data-request-id"));
    const req = state.db.requests.find((r) => Number(r.id) === id);
    if (!req) return;
    req.status = action === "approve" ? "approved" : "rejected";
    saveDB();
    renderMyRequests(user);
    renderAdminRequests(user);
    showToast(`Request ${action === "approve" ? "approved" : "rejected"}.`, action === "approve" ? "success" : "danger");
  }));
}

// Renders all admin-managed views together (accounts, departments, employees).
function renderAdminViews(user) {
  renderAccountsList(user);
  renderDepartmentsTable();
  populateEmployeeOptions();
  renderEmployeesTable();
  // Keep add-mode form prefilled with the next auto ID whenever admin panels refresh.
  if (!$("employeeEditId")?.value) resetEmployeeForm();
}

// Runs per-route view rendering hooks after route activation.
// Route-specific render hooks keep each page light and on-demand.
function renderRoute(hash, user) {
  if (hash === "#/profile") renderProfile(user);
  if (hash === "#/requests") { renderMyRequests(user); renderAdminRequests(user); }
  if (hash === "#/employees" || hash === "#/accounts" || hash === "#/departments") renderAdminViews(user);
}

// Central router: resolves user/session, applies guards, then renders view.

function handleRouting() {
  const user = getCurrentUser();// Always sync profile card first so auth changes are visible immediately.
  setAuthState(Boolean(user), user);
  renderProfile(currentUser);
  const hash = normalizeHash(window.location.hash || "#/");
  const guarded = guardHash(hash, currentUser);//
  if (guarded !== hash) { navigateTo(guarded); return; }
  if (hash !== "#/profile") closeProfileEditForm();
  setActiveRoute(hash);
  renderRoute(hash, currentUser);
}

// Logs user out and returns UI to home state.
function logout() {
  clearSession();
  setAuthState(false);
  updateRoleUI(null);
  if ($("content")) $("content").innerText = "Admin content will appear here after login.";
  renderProfile(null);
  navigateTo("#/");
}

// ===== Event Bindings =====
// Central event wiring for forms/buttons. Most create/update/delete behavior starts here.
function bindEvents() {
  // Input listener:
  // When a user types into a field that was marked invalid, clear its inline error state immediately.
  document.addEventListener("input", (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.classList.contains("is-invalid")) clearFieldError(target);
  });

  // Profile/session listeners:
  // Handles logout click, profile edit cancel, and profile update submit actions.
  $("logoutLink")?.addEventListener("click", (e) => { e.preventDefault(); logout(); });
  $("cancelProfileEditBtn")?.addEventListener("click", closeProfileEditForm);
  $("profileEditForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const active = getCurrentUser();
    if (!active) return showToast("Login required.", "warning");
    const cleanFirst = String($("profileFirstNameInput")?.value || "").trim();
    const cleanLast = String($("profileLastNameInput")?.value || "").trim();
    if (!cleanFirst || !cleanLast) return showToast("First and last name are required.", "warning");

    const target = state.db.accounts.find((a) => a.email === active.email);
    if (!target) return showToast("Account not found.", "danger");
    target.firstName = cleanFirst;
    target.lastName = cleanLast;
    saveDB();
    setSession(target, sessionStorage.getItem(KEYS.authToken) || "");
    showDashboard(target);
    fillProfileEditForm(target);
    closeProfileEditForm();
    showToast("Profile updated.", "success", "top-center");
  });

  // Registration listener:
  // Validates required registration fields, then creates the user through the backend API.
  $("registerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const registerForm = $("registerForm");
    if (registerForm instanceof HTMLFormElement) clearFormErrors(registerForm);
    const firstName = String($("firstName")?.value || "").trim();
    const lastName = String($("lastName")?.value || "").trim();
    const email = toEmail($("email")?.value);
    const password = String($("password")?.value || "");
    const username = email;

    if (!firstName) {
      setFieldError($("firstName"), "First name is required.");
      return showToast("First name is required.", "warning");
    }
    if (!lastName) {
      setFieldError($("lastName"), "Last name is required.");
      return showToast("Last name is required.", "warning");
    }
    if (!email) {
      setFieldError($("email"), "Email is required.");
      return showToast("Email is required.", "warning");
    }
    if (password.length < 6) {
      setFieldError($("password"), "Password must be at least 6 characters.");
      return showToast("Password must be at least 6 characters.", "warning");
    }
    if (state.db.accounts.some((a) => a.email === email)) {
      setFieldError($("email"), "This email is already in use.");
      return showToast("Email is already in use.", "warning");
    }

    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, firstName, lastName, role: "user" })
      });
      const data = await response.json();

      if (!response.ok) {
        setFieldError($("email"), data.error || "Registration failed.");
        return showToast(data.error || "Registration failed.", "danger");
      }

      state.db.accounts.push(normalizeAccount({
        id: Date.now(),
        firstName,
        lastName,
        email,
        password,
        role: "user",
        verified: true,
        username
      }));
      saveDB();
      $("registerForm")?.reset();
      showToast("Registration successful. You can now log in with your email.", "success", "top-center", 1500);
      navigateTo("#/login");
    } catch (err) {
      showToast("Network error during registration.", "danger");
    }
  });

  // Login listener:
  // Sends credentials to the backend login API and stores the returned JWT in session storage.
  $("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const loginForm = $("loginForm");
    if (loginForm instanceof HTMLFormElement) clearFormErrors(loginForm);
    const username = String($("loginEmail")?.value || "").trim();
    const password = String($("loginPassword")?.value || "");

    if (!username) {
      setFieldError($("loginEmail"), "Username is required.");
      return showToast("Username is required.", "warning");
    }
    if (!password) {
      setFieldError($("loginPassword"), "Password is required.");
      return showToast("Password is required.", "warning");
    }
    const result = await login(username, password);
    if (result.ok) {
      $("loginForm")?.reset();
      if (result.user.role === "admin") {
        await loadAdminDashboard();
      }
      navigateTo("#/profile");
      return;
    }
    setFieldError($("loginPassword"), "Login failed. Check your username or password.");
    if ($("loginPassword")) $("loginPassword").value = "";
  });

  // Account admin listeners:
  // Handles add/edit account form state and account create/update actions with admin safety rules.
  $("addAccountBtn")?.addEventListener("click", resetAccountForm);
  $("cancelAccountEditBtn")?.addEventListener("click", resetAccountForm);
  $("accountForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const accountForm = $("accountForm");
    if (accountForm instanceof HTMLFormElement) clearFormErrors(accountForm);
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") return showToast("Admin access required.", "danger");

    const originalEmail = toEmail($("accountEditEmail")?.value);
    const email = toEmail($("accountEmailInput")?.value);
    const firstName = String($("accountFirstNameInput")?.value || "").trim();
    const lastName = String($("accountLastNameInput")?.value || "").trim();
    const password = String($("accountPasswordInput")?.value || "");
    const role = String($("accountRoleSelect")?.value || "user");
    const verified = Boolean($("accountVerifiedCheck")?.checked);
    const isEdit = Boolean(originalEmail);

    if (!firstName) {
      setFieldError($("accountFirstNameInput"), "First name is required.");
      return showToast("First name is required.", "warning");
    }
    if (!lastName) {
      setFieldError($("accountLastNameInput"), "Last name is required.");
      return showToast("Last name is required.", "warning");
    }
    if (!email) {
      setFieldError($("accountEmailInput"), "Email is required.");
      return showToast("Email is required.", "warning");
    }
    if (!["user", "admin"].includes(role)) {
      setFieldError($("accountRoleSelect"), "Role must be user or admin.");
      return showToast("Role must be user or admin.", "warning");
    }
    // Enforce unique email while allowing the same value during edit.
    if (state.db.accounts.some((a) => a.email === email && a.email !== originalEmail)) {
      setFieldError($("accountEmailInput"), "Email is already in use.");
      return showToast("Email is already in use.", "warning");
    }

    if (isEdit) {
      const target = state.db.accounts.find((a) => a.email === originalEmail);
      if (!target) return showToast("Account not found.", "danger");
      if (currentUser.email === target.email && role !== "admin") return showToast("Safety rule: admin cannot remove own admin role.", "warning");
      if (currentUser.email === target.email && email !== originalEmail) return showToast("Safety rule: cannot change your own login email.", "warning");
      if (password && password.length < 6) {
        setFieldError($("accountPasswordInput"), "Password must be at least 6 characters.");
        return showToast("Password must be at least 6 characters.", "warning");
      }
      const previousEmail = target.email;

      target.firstName = firstName;
      target.lastName = lastName;
      target.email = email;
      target.role = role;
      target.verified = verified;
      if (password) target.password = password;
      if (email !== previousEmail) {
        // Keep cross-table links in sync when the account email changes.
        state.db.employees.forEach((e2) => {
          if (e2.userEmail === previousEmail) e2.userEmail = email;
        });
        state.db.requests.forEach((r) => {
          if (r.employeeEmail === previousEmail) r.employeeEmail = email;
        });
      }
      if (currentUser.email === target.email) setSession(target);
      saveDB();
      renderAdminViews(currentUser);
      resetAccountForm();
      return showToast("Account updated.", "success");
    }

    if (password.length < 6) {
      setFieldError($("accountPasswordInput"), "Password must be at least 6 characters.");
      return showToast("Password must be at least 6 characters.", "warning");
    }
    state.db.accounts.push(normalizeAccount({ id: Date.now(), firstName, lastName, email, password, role, verified }));
    saveDB();
    renderAdminViews(currentUser);
    resetAccountForm();
    showToast("Account created.", "success");
  });

  // Department admin listeners:
  // Handles add/cancel edit actions and create/update operations for departments.
  $("addDepartmentBtn")?.addEventListener("click", () => {
    resetDepartmentForm();
    if ($("departmentNameInput")) $("departmentNameInput").focus();
    showToast("Ready to add a new department.", "info");
  });
  $("cancelDepartmentEditBtn")?.addEventListener("click", resetDepartmentForm);
  $("departmentForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const departmentForm = $("departmentForm");
    if (departmentForm instanceof HTMLFormElement) clearFormErrors(departmentForm);
    const editId = Number($("departmentEditId")?.value || 0);
    const name = String($("departmentNameInput")?.value || "").trim();
    const description = String($("departmentDescriptionInput")?.value || "").trim();
    if (!name) {
      setFieldError($("departmentNameInput"), "Department name is required.");
      return;
    }
    if (!description) {
      setFieldError($("departmentDescriptionInput"), "Department description is required.");
      return;
    }
    if (state.db.departments.some((d) => d.name.toLowerCase() === name.toLowerCase() && Number(d.id) !== editId)) {
      setFieldError($("departmentNameInput"), "Department already exists.");
      return showToast("Department already exists.", "warning");
    }
    if (editId) {
      const target = state.db.departments.find((d) => Number(d.id) === editId);
      if (!target) return showToast("Department not found.", "danger");
      target.name = name;
      target.description = description;
    } else {
      state.db.departments.push(normalizeDepartment({ id: Date.now(), name, description }));
    }
    saveDB();
    renderDepartmentsTable();
    populateEmployeeOptions();
    resetDepartmentForm();
    showToast(editId ? "Department updated." : "Department added.", "success");
  });

  // Employee admin listeners:
  // Handles add/cancel edit actions and create/update employee rows linked to existing non-admin accounts.
  $("addEmployeeBtn")?.addEventListener("click", resetEmployeeForm);
  $("cancelEmployeeEditBtn")?.addEventListener("click", resetEmployeeForm);
  $("employeeForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const employeeForm = $("employeeForm");
    if (employeeForm instanceof HTMLFormElement) clearFormErrors(employeeForm);
    const editId = String($("employeeEditId")?.value || "").trim();
    const employeeId = String($("employeeIdInput")?.value || "").trim();
    const userEmail = toEmail($("employeeUserEmailInput")?.value);
    const departmentId = Number($("employeeDepartmentSelect")?.value);
    const position = String($("employeePositionInput")?.value || "").trim();
    const hireDate = String($("employeeHireDateInput")?.value || "");
    if (!userEmail || !departmentId || !position || !hireDate) {
      if (!userEmail) setFieldError($("employeeUserEmailInput"), "User email is required.");
      if (!departmentId) setFieldError($("employeeDepartmentSelect"), "Department is required.");
      if (!position) setFieldError($("employeePositionInput"), "Position is required.");
      if (!hireDate) setFieldError($("employeeHireDateInput"), "Hire date is required.");
      return showToast("Complete all employee fields.", "warning");
    }
    // In edit mode, ID can be changed manually; in add mode ID is auto-generated.
    if (editId && !employeeId) {
      setFieldError($("employeeIdInput"), "Employee ID is required.");
      return showToast("Employee ID is required.", "warning");
    }
    // Employee rows must link to an existing non-admin user account.
    const linkedAccount = state.db.accounts.find((a) => a.email === userEmail && a.role !== "admin");
    if (!linkedAccount) {
      setFieldError($("employeeUserEmailInput"), "Use an existing non-admin account email.");
      return showToast("User email must match an existing non-admin account.", "warning");
    }

    if (editId) {
      const target = state.db.employees.find((e2) => String(e2.id) === editId);
      if (!target) return;
      if (employeeId !== editId && state.db.employees.some((e2) => String(e2.id) === employeeId)) {
        setFieldError($("employeeIdInput"), "Employee ID already exists.");
        return showToast("Employee ID already exists.", "warning");
      }
      target.id = employeeId;
      target.userId = Number(linkedAccount.id);
      target.userEmail = userEmail;
      target.departmentId = departmentId;
      target.position = position;
      target.hireDate = hireDate;
    } else {
      // Always compute next ID from current employee data to avoid manual ID mistakes.
      const nextEmployeeId = getNextEmployeeId();
      if (state.db.employees.some((e2) => String(e2.id) === nextEmployeeId)) return showToast("Employee ID already exists.", "warning");
      state.db.employees.push(normalizeEmployee({ id: nextEmployeeId, userId: Number(linkedAccount.id), userEmail, departmentId, position, hireDate }));
    }
    saveDB();
    renderEmployeesTable();
    resetEmployeeForm();
    showToast("Employee saved.", "success");
  });

  // Request builder listeners:
  // Handles modal reset, request-type switching, and dynamic item row add/remove controls.
  $("openRequestModalBtn")?.addEventListener("click", resetRequestBuilder);
  $("requestType")?.addEventListener("change", toggleRequestTypeFields);
  $("addRequestItemBtn")?.addEventListener("click", () => $("requestItemsContainer")?.appendChild(createRequestItemRow()));
  $("requestItemsContainer")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("remove-request-item-btn")) return;
    const rows = document.querySelectorAll("#requestItemsContainer .request-item-row");
    if (rows.length <= 1) return showToast("At least one item is required.", "warning");
    target.closest(".request-item-row")?.remove();
  });

  // Request submit listener:
  // Validates leave/equipment inputs, stores the request, refreshes request tables, and closes the modal.
  $("requestForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const requestForm = $("requestForm");
    if (requestForm instanceof HTMLFormElement) clearFormErrors(requestForm);
    const user = getCurrentUser();
    if (!user) { showToast("Login required.", "warning"); navigateTo("#/login"); return; }
    const type = String($("requestType")?.value || "Equipment");
    if (type === "Leave") {
      const leaveStart = String($("leaveStartDate")?.value || "");
      const leaveEnd = String($("leaveEndDate")?.value || "");
      const leaveReason = String($("leaveReason")?.value || "").trim();
      if (!leaveStart || !leaveEnd) {
        if (!leaveStart) setFieldError($("leaveStartDate"), "Start date is required.");
        if (!leaveEnd) setFieldError($("leaveEndDate"), "End date is required.");
        return showToast("Start and end date are required for leave.", "warning");
      }
      if (new Date(leaveEnd) < new Date(leaveStart)) {
        setFieldError($("leaveEndDate"), "End date cannot be earlier than start date.");
        return showToast("Leave end date cannot be earlier than start date.", "warning");
      }
      state.db.requests.push(normalizeRequest({ id: Date.now(), employeeEmail: user.email, type, items: [], leaveStart, leaveEnd, leaveReason, status: "pending", createdAt: Date.now() }));
    } else {
      const rows = Array.from(document.querySelectorAll("#requestItemsContainer .request-item-row"));
      const items = rows.map((row) => ({
        name: String(row.querySelector(".request-item-name")?.value || "").trim(),
        quantity: Number(row.querySelector(".request-item-qty")?.value || 0)
      })).filter((i) => i.name && i.quantity > 0);
      // Ignore blank/invalid item rows; require at least one valid request item.
      if (!items.length) {
        const firstNameInput = document.querySelector("#requestItemsContainer .request-item-name");
        if (firstNameInput instanceof HTMLElement) setFieldError(firstNameInput, "Add at least one valid item.");
        return showToast("Add at least one valid item.", "warning");
      }
      state.db.requests.push(normalizeRequest({ id: Date.now(), employeeEmail: user.email, type, items, status: "pending", createdAt: Date.now() }));
    }
    saveDB();
    renderMyRequests(user);
    renderAdminRequests(user);
    resetRequestBuilder();
    showToast("Request submitted.", "success");
    if ($("newRequestModal") && window.bootstrap) {
      const modal = window.bootstrap.Modal.getInstance($("newRequestModal"));
      if (modal) modal.hide();
    }
  });
}

// Boot sequence: load data, attach events, and sync UI to current hash route.
document.addEventListener("DOMContentLoaded", async () => {
  initDB();
  bindEvents();
  window.addEventListener("hashchange", handleRouting);
  if (!window.location.hash) navigateTo("#/");
  const apiUser = await loadProfileFromApi();
  if (apiUser && apiUser.role === "admin") {
    await loadAdminDashboard();
  }
  handleRouting();
});
