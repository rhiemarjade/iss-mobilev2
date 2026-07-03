const $ = (id) => document.getElementById(id);

const screens = {
    home: $("homeScreen"),
    search: $("searchScreen"),
    loads: $("loadsScreen"),
    grade: $("gradeScreen"),
    advisory: $("advisoryScreen"),
    pl: $("plScreen")
};

const titles = {
    home: "Home",
    search: "Student Search",
    loads: "My Loads",
    grade: "Grades",
    advisory: "My Advisory",
    pl: "PL Monitoring"
};

const state = {
    client: null,
    session: null,
    context: null,
    settings: null,
    loads: [],
    selectedLoad: null,
    gradeRows: [],
    changedGrades: new Map(),
    advisoryRows: [],
    selectedAdvisoryStudent: null,
    plRows: [],
    canViewPl: false
};

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function clean(value) {
    return String(value ?? "").trim();
}

function blank(value, fallback = "—") {
    const text = clean(value);
    return text || fallback;
}

function studentName(row) {
    return [row?.last_name, row?.first_name, row?.middle_name, row?.suffix]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

function sortStudents(rows = []) {
    const genderRank = (gender) => {
        const g = clean(gender).toLowerCase();
        if (g.startsWith("m")) return 0;
        if (g.startsWith("f")) return 1;
        return 2;
    };

    return [...rows].sort((a, b) => {
        const genderCompare = genderRank(a.gender) - genderRank(b.gender);
        if (genderCompare !== 0) return genderCompare;
        return studentName(a).localeCompare(studentName(b), undefined, { sensitivity: "base" });
    });
}

function normalizeSearchText(value) {
    return clean(value).replace(/,/g, " ").replace(/\s+/g, " ");
}

function isConfigReady() {
    const config = window.ISS_MOBILE_CONFIG || {};
    return Boolean(
        config.supabaseUrl &&
        config.supabaseAnonKey &&
        !config.supabaseUrl.includes("PASTE_") &&
        !config.supabaseAnonKey.includes("PASTE_")
    );
}

function isPhonePortrait() {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    return width <= 560 && height > width && coarsePointer;
}

function enforcePhoneSize() {
    const guard = $("phoneGuard");
    const login = $("loginView");
    const app = $("appView");
    const allowed = isPhonePortrait();

    guard.classList.toggle("hidden", allowed);

    if (!allowed) {
        login.classList.add("hidden");
        app.classList.add("hidden");
        return false;
    }

    if (!state.session) {
        login.classList.remove("hidden");
    }

    return true;
}

function setMessage(id, text) {
    const el = $(id);
    if (el) el.textContent = text || "";
}

function setupSupabase() {
    if (!isConfigReady()) {
        $("loginView").classList.remove("hidden");
        setMessage("loginMessage", "Set Supabase URL and anon key in config.js.");
        return false;
    }

    if (!window.supabase) {
        $("loginView").classList.remove("hidden");
        setMessage("loginMessage", "Supabase library did not load.");
        return false;
    }

    state.client = window.supabase.createClient(
        window.ISS_MOBILE_CONFIG.supabaseUrl,
        window.ISS_MOBILE_CONFIG.supabaseAnonKey
    );
    return true;
}

async function loadSettings() {
    const { data, error } = await state.client
        .from("system_settings_view")
        .select("*")
        .limit(1);

    if (!error) {
        state.settings = Array.isArray(data) ? data[0] : null;
    }

    const active = Number(state.settings?.active_quarter || 1);
    $("plTermFilter").value = String(Math.max(1, Math.min(3, active)));
}

async function loadContext() {
    const { data, error } = await state.client.rpc("get_current_user_context");
    if (error) throw error;

    state.context = Array.isArray(data) ? data[0] : data;
    state.canViewPl = hasFullPlAccess(state.context);

    if (!state.canViewPl) {
        const result = await state.client.rpc("can_view_proficiency_level_monitoring");
        state.canViewPl = result.error ? false : result.data === true;
    }
}

function hasFullPlAccess(ctx = state.context) {
    return Boolean(ctx?.is_school_head || ctx?.is_registrar || ctx?.is_coordinator || ctx?.is_system_admin);
}

function canUseLoads() {
    return Boolean(state.context?.is_subject_teacher);
}

function canUseAdvisory() {
    return Boolean(state.context?.is_adviser);
}

function canUsePl() {
    return Boolean(state.canViewPl);
}

function renderUserShell() {
    const ctx = state.context || {};
    const name = ctx.full_name || ctx.deped_email || "User";
    $("userName").textContent = name;
    $("userInitial").textContent = name.trim().charAt(0).toUpperCase() || "I";
    $("userRoles").textContent = (ctx.roles || []).join(", ") || "Authenticated";
    $("homeLoadsCount").textContent = String(ctx.teacher_load_count || 0);
    $("homeAdvisoryCount").textContent = String(ctx.adviser_class_count || 0);

    document.querySelectorAll(".role-loads").forEach((el) => el.classList.toggle("hidden", !canUseLoads()));
    document.querySelectorAll(".role-advisory").forEach((el) => el.classList.toggle("hidden", !canUseAdvisory()));
    document.querySelectorAll(".role-pl").forEach((el) => el.classList.toggle("hidden", !canUsePl()));

    const visibleButtons = [...document.querySelectorAll("#bottomNav button:not(.hidden)")].length || 1;
    $("bottomNav").style.gridTemplateColumns = `repeat(${visibleButtons}, 1fr)`;
}

function showLogin() {
    state.session = null;
    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
}

function showApp() {
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    showScreen("home");
}

function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
        el.classList.toggle("active-screen", key === name);
    });

    document.querySelectorAll("#bottomNav button").forEach((button) => {
        button.classList.toggle("active", button.dataset.target === name);
    });

    $("viewTitle").textContent = titles[name] || "ISS Mobile";

    if (name === "loads") loadLoads();
    if (name === "advisory") loadAdvisory();
    if (name === "pl") loadPlMonitoring();
}

async function login() {
    if (!state.client) return;

    const email = clean($("loginEmail").value);
    const password = $("loginPassword").value;

    if (!email || !password) {
        setMessage("loginMessage", "Enter email and password.");
        return;
    }

    $("loginBtn").disabled = true;
    setMessage("loginMessage", "Logging in...");

    const { data, error } = await state.client.auth.signInWithPassword({ email, password });
    $("loginBtn").disabled = false;

    if (error) {
        setMessage("loginMessage", error.message);
        return;
    }

    state.session = data.session;
    await bootstrapApp();
}

async function resetPassword() {
    const email = clean($("loginEmail").value);
    if (!email) {
        setMessage("loginMessage", "Enter your email first.");
        return;
    }

    const redirectTo = window.ISS_MOBILE_CONFIG?.passwordResetUrl || window.location.origin;
    const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo });
    setMessage("loginMessage", error ? error.message : "Password reset email sent.");
}

async function logout() {
    await state.client.auth.signOut();
    showLogin();
}

async function bootstrapApp() {
    if (!enforcePhoneSize()) return;

    try {
        setMessage("homeMessage", "Loading...");
        await loadSettings();
        await loadContext();
        renderUserShell();
        showApp();
        setMessage("homeMessage", state.settings?.current_school_year ? `SY ${state.settings.current_school_year}` : "Ready.");
    } catch (error) {
        console.error(error);
        showLogin();
        setMessage("loginMessage", error.message || "Unable to load account.");
    }
}

async function searchStudents() {
    const search = normalizeSearchText($("studentSearchInput").value);
    const container = $("studentResults");
    container.innerHTML = "";

    if (search.length < 2) {
        setMessage("studentSearchMessage", "Type at least 2 characters.");
        return;
    }

    setMessage("studentSearchMessage", "Searching...");
    const { data, error } = await state.client.rpc("search_student_profiles_smart", {
        p_search: search,
        p_limit: 40
    });

    if (error) {
        setMessage("studentSearchMessage", error.message);
        return;
    }

    const rows = sortStudents(data || []);
    setMessage("studentSearchMessage", `${rows.length} found.`);
    container.innerHTML = rows.map((row, index) => `
        <article class="student-card" data-student-index="${index}">
            <p class="card-title">${escapeHtml(studentName(row))}</p>
            <p class="card-meta">${escapeHtml(blank(row.lrn))}</p>
            <div class="card-row">
                <span>${escapeHtml(blank(row.gender))}</span>
                <span>Grade ${escapeHtml(blank(row.grade_level))} ${escapeHtml(blank(row.section_name || row.section, ""))}</span>
            </div>
        </article>
    `).join("");

    container.querySelectorAll("[data-student-index]").forEach((card) => {
        card.addEventListener("click", () => openStudentSheet(rows[Number(card.dataset.studentIndex)]));
    });
}

function openStudentSheet(row) {
    $("studentSheetName").textContent = studentName(row) || "Student";
    $("studentSheetBody").innerHTML = `
        <div class="info-row"><span>LRN</span><strong>${escapeHtml(blank(row.lrn))}</strong></div>
        <div class="info-row"><span>Gender</span><strong>${escapeHtml(blank(row.gender))}</strong></div>
        <div class="info-row"><span>Birthday</span><strong>${escapeHtml(blank(row.birthdate))}</strong></div>
        <div class="info-row"><span>Class</span><strong>Grade ${escapeHtml(blank(row.grade_level))} ${escapeHtml(blank(row.section_name || row.section, ""))}</strong></div>
        <div class="info-row"><span>Status</span><strong>${escapeHtml(blank(row.enrollment_status))}</strong></div>
        <div class="info-row"><span>Mother</span><strong>${escapeHtml(blank(row.mother_name))}</strong></div>
        <div class="info-row"><span>Father</span><strong>${escapeHtml(blank(row.father_name))}</strong></div>
        <div class="info-row"><span>Address</span><strong>${escapeHtml([row.address_sitio, row.address_barangay, row.address_municipality].filter(Boolean).join(", ") || "—")}</strong></div>
    `;
    $("studentSheet").classList.remove("hidden");
}

async function loadLoads() {
    if (!canUseLoads()) {
        setMessage("loadsMessage", "Not available for this account.");
        return;
    }

    const container = $("loadsList");
    container.innerHTML = "";
    setMessage("loadsMessage", "Loading...");

    const { data, error } = await state.client.rpc("get_teacher_load_summary_rows");
    if (error) {
        setMessage("loadsMessage", error.message);
        return;
    }

    state.loads = [...(data || [])].sort((a, b) => {
        const grade = Number(a.grade_level || 0) - Number(b.grade_level || 0);
        if (grade !== 0) return grade;
        const section = clean(a.section_name).localeCompare(clean(b.section_name), undefined, { sensitivity: "base" });
        if (section !== 0) return section;
        return clean(a.subject_name).localeCompare(clean(b.subject_name), undefined, { sensitivity: "base" });
    });

    setMessage("loadsMessage", `${state.loads.length} load(s).`);
    container.innerHTML = state.loads.map((load, index) => `
        <article class="load-card" data-load-index="${index}">
            <p class="card-title">Grade ${escapeHtml(blank(load.grade_level))} ${escapeHtml(blank(load.section_name))}</p>
            <p class="card-meta">${escapeHtml(blank(load.subject_name))}</p>
            <div class="card-row">
                <span>${escapeHtml(blank(load.school_year))}</span>
                <span class="badge">Open</span>
            </div>
        </article>
    `).join("");

    container.querySelectorAll("[data-load-index]").forEach((card) => {
        card.addEventListener("click", () => openLoad(state.loads[Number(card.dataset.loadIndex)]));
    });
}

function periodLabel(period) {
    return `T${period}`;
}

async function openLoad(load) {
    state.selectedLoad = load;
    state.changedGrades.clear();
    $("gradeTitle").textContent = `Grade ${load.grade_level} ${load.section_name}`;
    $("gradeSubtitle").textContent = blank(load.subject_name);
    $("gradeRows").innerHTML = "";
    setMessage("gradeMessage", "Loading...");
    showScreen("grade");

    const { data, error } = await state.client.rpc("get_teacher_grade_encoding_rows", {
        p_class_id: load.class_id,
        p_subject_id: load.subject_id
    });

    if (error) {
        setMessage("gradeMessage", error.message);
        return;
    }

    state.gradeRows = sortStudents(data || []);
    renderGradeRows();
    setMessage("gradeMessage", `${state.gradeRows.length} learner(s).`);
}

function gradeInputAllowed(row, period) {
    return row[`q${period}_can_encode`] === true && row.grade_encoding_open === true;
}

function renderGradeRows() {
    const filter = normalizeSearchText($("gradeSearchInput").value).toLowerCase();
    const rows = state.gradeRows.filter((row) => !filter || studentName(row).toLowerCase().includes(filter) || clean(row.lrn).includes(filter));

    $("gradeRows").innerHTML = rows.map((row) => {
        const cells = [1, 2, 3].map((period) => {
            const value = row[`q${period}_grade`] ?? "";
            const disabled = gradeInputAllowed(row, period) ? "" : "disabled";
            return `
                <div class="grade-input-wrap">
                    <label>${periodLabel(period)}</label>
                    <input inputmode="numeric" pattern="[0-9]*" ${disabled} value="${escapeHtml(value)}"
                        data-grade-id="${escapeHtml(row.grade_id)}" data-quarter="${period}" data-original="${escapeHtml(value)}">
                </div>
            `;
        }).join("");

        return `
            <article class="grade-row">
                <div class="grade-row-head">
                    <div>
                        <div class="grade-row-name">${escapeHtml(studentName(row))}</div>
                        <div class="grade-row-lrn">${escapeHtml(blank(row.lrn))}</div>
                    </div>
                    <span class="badge">${escapeHtml(blank(row.gender))}</span>
                </div>
                <div class="grade-input-grid">${cells}</div>
            </article>
        `;
    }).join("");

    $("gradeRows").querySelectorAll("input[data-grade-id]").forEach((input) => {
        input.addEventListener("input", () => {
            const key = `${input.dataset.gradeId}:${input.dataset.quarter}`;
            const value = clean(input.value);
            if (!value || value === input.dataset.original) {
                state.changedGrades.delete(key);
            } else {
                state.changedGrades.set(key, input);
            }
        });
    });
}

async function saveGrades() {
    const items = [];

    for (const input of state.changedGrades.values()) {
        const value = clean(input.value);
        const grade = Number(value);
        if (!Number.isInteger(grade) || grade < 60 || grade > 100) {
            setMessage("gradeMessage", "Grades must be 60 to 100.");
            return;
        }
        items.push({
            grade_id: input.dataset.gradeId,
            quarter: Number(input.dataset.quarter),
            new_grade: grade,
            reason: "Mobile encoding"
        });
    }

    if (!items.length) {
        setMessage("gradeMessage", "No changes.");
        return;
    }

    $("saveGradesBtn").disabled = true;
    setMessage("gradeMessage", "Saving...");

    const { data, error } = await state.client.rpc("save_teacher_grade_batch", { p_items: items });
    $("saveGradesBtn").disabled = false;

    if (error) {
        setMessage("gradeMessage", error.message);
        return;
    }

    const rows = data || [];
    const saved = rows.filter((row) => row.saved).length;
    const failed = rows.length - saved;
    setMessage("gradeMessage", failed ? `${saved} saved, ${failed} failed.` : `${saved} saved.`);
    await openLoad(state.selectedLoad);
}

async function loadAdvisory() {
    if (!canUseAdvisory()) {
        setMessage("advisoryMessage", "Not available for this account.");
        return;
    }

    setMessage("advisoryMessage", "Loading...");
    const { data, error } = await state.client.rpc("get_advisory_class_students", { p_search: null });
    if (error) {
        setMessage("advisoryMessage", error.message);
        return;
    }

    state.advisoryRows = sortStudents(data || []);
    renderAdvisoryRows();
}

function renderAdvisoryRows() {
    const filter = normalizeSearchText($("advisorySearchInput").value).toLowerCase();
    const rows = state.advisoryRows.filter((row) => !filter || studentName(row).toLowerCase().includes(filter) || clean(row.lrn).includes(filter));

    setMessage("advisoryMessage", `${rows.length} learner(s).`);
    $("advisoryList").innerHTML = rows.map((row, index) => `
        <article class="student-card" data-advisory-index="${index}">
            <p class="card-title">${escapeHtml(studentName(row))}</p>
            <p class="card-meta">${escapeHtml(blank(row.lrn))}</p>
            <div class="card-row">
                <span>${escapeHtml(blank(row.gender))}</span>
                <span>Grade ${escapeHtml(blank(row.grade_level))} ${escapeHtml(blank(row.section_name))}</span>
            </div>
        </article>
    `).join("");

    $("advisoryList").querySelectorAll("[data-advisory-index]").forEach((card) => {
        card.addEventListener("click", () => openAdvisorySheet(rows[Number(card.dataset.advisoryIndex)]));
    });
}

function openAdvisorySheet(row) {
    state.selectedAdvisoryStudent = row;
    $("advisorySheetName").textContent = studentName(row) || "Learner";
    $("advisorySheetMessage").textContent = "";
    $("advisorySheetBody").innerHTML = `
        <div class="form-grid">
            <label>LRN</label><input id="advLrn" value="${escapeHtml(row.lrn || "")}">
            <label>First Name</label><input id="advFirst" value="${escapeHtml(row.first_name || "")}">
            <label>Middle Name</label><input id="advMiddle" value="${escapeHtml(row.middle_name || "")}">
            <label>Last Name</label><input id="advLast" value="${escapeHtml(row.last_name || "")}">
            <label>Extension</label><input id="advSuffix" value="${escapeHtml(row.suffix || "")}">
            <label>Birthday</label><input id="advBirthdate" type="date" value="${escapeHtml(row.birthdate || "")}">
            <label>Gender</label>
            <select id="advGender">
                <option value="">Select</option>
                <option value="Male" ${clean(row.gender).toLowerCase().startsWith("m") ? "selected" : ""}>Male</option>
                <option value="Female" ${clean(row.gender).toLowerCase().startsWith("f") ? "selected" : ""}>Female</option>
            </select>
            <label>Sitio</label><input id="advSitio" value="${escapeHtml(row.address_sitio || "")}">
            <label>Barangay</label><input id="advBarangay" value="${escapeHtml(row.address_barangay || "")}">
            <label>Municipality</label><input id="advMunicipality" value="${escapeHtml(row.address_municipality || "")}">
            <label>Mother</label><input id="advMother" value="${escapeHtml(row.mother_name || "")}">
            <label>Father</label><input id="advFather" value="${escapeHtml(row.father_name || "")}">
            <label>Guardian</label><input id="advGuardian" value="${escapeHtml(row.guardian_name || "")}">
            <label><input id="adv4ps" type="checkbox" ${row.pppp_beneficiary ? "checked" : ""} style="width:auto;min-height:auto"> 4Ps</label>
        </div>
    `;
    $("advisorySheet").classList.remove("hidden");
}

function nullableInput(id) {
    const text = clean($(id)?.value);
    return text || null;
}

async function saveAdvisoryProfile() {
    const row = state.selectedAdvisoryStudent;
    if (!row) return;

    $("saveAdvisoryProfileBtn").disabled = true;
    setMessage("advisorySheetMessage", "Saving...");

    const { data, error } = await state.client.rpc("save_advisory_student_profile", {
        p_student_id: row.student_id,
        p_lrn: nullableInput("advLrn"),
        p_last_name: nullableInput("advLast"),
        p_first_name: nullableInput("advFirst"),
        p_middle_name: nullableInput("advMiddle"),
        p_suffix: nullableInput("advSuffix"),
        p_birthdate: $("advBirthdate").value || null,
        p_gender: $("advGender").value || null,
        p_address_sitio: nullableInput("advSitio"),
        p_address_barangay: nullableInput("advBarangay"),
        p_address_municipality: nullableInput("advMunicipality"),
        p_mother_name: nullableInput("advMother"),
        p_father_name: nullableInput("advFather"),
        p_guardian_name: nullableInput("advGuardian"),
        p_pppp_beneficiary: $("adv4ps").checked
    });

    $("saveAdvisoryProfileBtn").disabled = false;

    if (error) {
        setMessage("advisorySheetMessage", error.message);
        return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    setMessage("advisorySheetMessage", result?.message || "Saved.");
    await loadAdvisory();
}

function plStatus(row) {
    const learners = Number(row.number_of_learners);
    const mps = Number(row.mps_or_proficiency_level);
    const above = Number(row.learners_75_mps_above);
    if (!row.entry_status || row.entry_status === "Missing") return "Missing";
    if (!Number.isFinite(mps)) return "Non numeric";
    if (!Number.isFinite(learners) || learners <= 0 || !Number.isFinite(above)) return "Incomplete";
    return "Complete";
}

function plSubjectArea(row) {
    return row.subject_area || row.subject_area_name || row.subject_group || row.subject_name || "Subject";
}

function plIsMapeh(row) {
    const text = [plSubjectArea(row), row.subject_name, row.card_name, row.subject_code].filter(Boolean).join(" ").toLowerCase();
    return text.includes("mapeh") || text.includes("music") || text.includes("arts") || text.includes("physical") || text.includes("health");
}

function plSectionKey(row) {
    return [row.school_year_id, row.grade_level, row.section_name, row.class_id].map((x) => clean(x).toLowerCase()).join("|");
}

function buildPlDisplayRows(rows) {
    const normal = [];
    const mapehGroups = new Map();

    rows.forEach((row) => {
        if (!plIsMapeh(row)) {
            normal.push(row);
            return;
        }
        const key = plSectionKey(row);
        if (!mapehGroups.has(key)) mapehGroups.set(key, []);
        mapehGroups.get(key).push(row);
    });

    mapehGroups.forEach((group) => {
        const complete = group.filter((row) => plStatus(row) === "Complete");
        const allMissing = group.every((row) => plStatus(row) === "Missing");
        const base = group[0] || {};

        const avg = (values) => {
            const nums = values.map(Number).filter(Number.isFinite);
            if (!nums.length) return null;
            return nums.reduce((a, b) => a + b, 0) / nums.length;
        };

        normal.push({
            ...base,
            subject_area: "MAPEH",
            subject_name: "MAPEH",
            number_of_learners: complete.length === group.length ? avg(complete.map((row) => row.number_of_learners)) : null,
            mps_or_proficiency_level: complete.length === group.length ? avg(complete.map((row) => row.mps_or_proficiency_level)) : null,
            learners_75_mps_above: complete.length === group.length ? avg(complete.map((row) => row.learners_75_mps_above)) : null,
            pl_mobile_status: complete.length === group.length ? "Complete" : allMissing ? "Missing" : "Incomplete"
        });
    });

    return normal;
}

function summarizePlBySubject(rows) {
    const map = new Map();

    rows.forEach((row) => {
        const subject = plSubjectArea(row);
        if (!map.has(subject)) {
            map.set(subject, { subject, total: 0, complete: 0, learners: 0, weighted: 0, above: 0 });
        }
        const item = map.get(subject);
        const status = row.pl_mobile_status || plStatus(row);
        item.total += 1;
        if (status === "Complete") {
            const learners = Number(row.number_of_learners) || 0;
            const mps = Number(row.mps_or_proficiency_level) || 0;
            const above = Number(row.learners_75_mps_above) || 0;
            item.complete += 1;
            item.learners += learners;
            item.weighted += learners * mps;
            item.above += above;
        }
    });

    return [...map.values()].sort((a, b) => a.subject.localeCompare(b.subject, undefined, { sensitivity: "base" }));
}

function percent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${Math.round(n)}%`;
}

async function loadPlMonitoring() {
    if (!canUsePl()) {
        setMessage("plMessage", "Not available for this account.");
        return;
    }

    setMessage("plMessage", "Loading...");
    $("plSubjectCards").innerHTML = "";

    const { data, error } = await state.client.rpc("get_proficiency_level_monitoring_rows", {
        p_school_year_id: state.settings?.current_school_year_id || null,
        p_grade_level: null,
        p_term: Number($("plTermFilter").value || 1),
        p_active_only: true
    });

    if (error) {
        setMessage("plMessage", error.message);
        return;
    }

    const rows = buildPlDisplayRows(data || []);
    const cards = summarizePlBySubject(rows);
    setMessage("plMessage", `${cards.length} subject area(s).`);

    $("plSubjectCards").innerHTML = cards.map((card) => {
        const completion = card.total ? (card.complete / card.total) * 100 : null;
        const pl = card.learners ? card.weighted / card.learners : null;
        const abovePct = card.learners ? (card.above / card.learners) * 100 : null;
        return `
            <article class="pl-card">
                <p class="card-title">${escapeHtml(card.subject)}</p>
                <p class="card-meta">${card.complete} of ${card.total} complete</p>
                <div class="card-row"><span>PL</span><strong>${pl === null ? "—" : pl.toFixed(2)}</strong></div>
                <div class="card-row"><span>75% and above</span><strong>${percent(abovePct)}</strong></div>
                <div class="card-row"><span>Completion</span><span class="badge ${completion === 100 ? "good" : completion > 0 ? "warn" : "bad"}">${percent(completion)}</span></div>
            </article>
        `;
    }).join("");
}

function bindEvents() {
    $("loginBtn").addEventListener("click", login);
    $("resetPasswordBtn").addEventListener("click", resetPassword);
    $("logoutBtn").addEventListener("click", logout);
    $("studentSearchBtn").addEventListener("click", searchStudents);
    $("studentSearchInput").addEventListener("keydown", (event) => { if (event.key === "Enter") searchStudents(); });
    $("gradeSearchInput").addEventListener("input", renderGradeRows);
    $("backToLoadsBtn").addEventListener("click", () => showScreen("loads"));
    $("saveGradesBtn").addEventListener("click", saveGrades);
    $("advisorySearchInput").addEventListener("input", renderAdvisoryRows);
    $("plTermFilter").addEventListener("change", loadPlMonitoring);
    $("closeStudentSheetBtn").addEventListener("click", () => $("studentSheet").classList.add("hidden"));
    $("closeAdvisorySheetBtn").addEventListener("click", () => $("advisorySheet").classList.add("hidden"));
    $("saveAdvisoryProfileBtn").addEventListener("click", saveAdvisoryProfile);

    document.querySelectorAll("#bottomNav button").forEach((button) => {
        button.addEventListener("click", () => showScreen(button.dataset.target));
    });
}

async function start() {
    bindEvents();
    enforcePhoneSize();
    window.addEventListener("resize", enforcePhoneSize);
    window.addEventListener("orientationchange", () => setTimeout(enforcePhoneSize, 250));

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
    }

    if (!setupSupabase()) return;

    const { data } = await state.client.auth.getSession();
    state.session = data.session;

    state.client.auth.onAuthStateChange((_event, session) => {
        state.session = session;
        if (!session) showLogin();
    });

    if (state.session) {
        await bootstrapApp();
    } else {
        showLogin();
    }
}

start().catch((error) => {
    console.error(error);
    setMessage("loginMessage", error.message || "Unable to start ISS Mobile.");
});
