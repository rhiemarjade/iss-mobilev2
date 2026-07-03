const $ = (id) => document.getElementById(id);

const screens = {
    dashboard: $("dashboardScreen"),
    loads: $("loadsScreen"),
    loadDetail: $("loadDetailScreen"),
    corrections: $("correctionsScreen"),
    advisory: $("advisoryScreen"),
    advisoryDetail: $("advisoryDetailScreen"),
    search: $("searchScreen"),
    summary: $("summaryScreen"),
    classes: $("classesScreen"),
    monitoring: $("monitoringScreen"),
    monitoringDetail: $("monitoringDetailScreen"),
    pl: $("plScreen"),
    plDetail: $("plDetailScreen")
};

const titles = {
    dashboard: "Dashboard",
    loads: "My Loads",
    loadDetail: "Grades",
    corrections: "Grade Correction",
    advisory: "Advisory Class",
    advisoryDetail: "Advisory Class",
    search: "Student Search",
    summary: "Enrollment",
    classes: "Classes",
    monitoring: "Grade Monitoring",
    monitoringDetail: "Grade Monitoring",
    pl: "PL Monitoring",
    plDetail: "PL Monitoring"
};

const state = {
    client: null,
    session: null,
    context: null,
    settings: null,
    currentScreen: "dashboard",
    navItems: [],
    loads: [],
    selectedLoad: null,
    gradeRows: [],
    selectedGradeRow: null,
    correctionEligibleTerms: [],
    corrections: [],
    selectedCorrection: null,
    advisoryRows: [],
    advisoryGroups: [],
    selectedAdvisoryGroup: null,
    monitoringCards: [],
    selectedMonitoringClass: null,
    monitoringSubjects: [],
    summaryRows: [],
    classRows: [],
    plRawRows: [],
    plRows: [],
    selectedPlSubject: null,
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

function numberText(value, fallback = "0") {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : fallback;
}

function percentText(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${Math.round(Math.max(0, Math.min(100, number)))}%`;
}

function dateText(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function studentName(row) {
    return [row?.last_name, row?.first_name, row?.middle_name, row?.suffix]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim() || clean(row?.student_name);
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
    const allowed = isPhonePortrait();
    $("phoneGuard").classList.toggle("hidden", allowed);

    if (!allowed) {
        $("loginView").classList.add("hidden");
        $("appView").classList.add("hidden");
        closeDrawer();
        return false;
    }

    if (!state.session) {
        $("loginView").classList.remove("hidden");
    } else {
        $("appView").classList.remove("hidden");
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
    if (error) throw error;
    state.settings = Array.isArray(data) ? data[0] : null;
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

function activeTerm() {
    const term = Number(state.settings?.active_quarter || state.settings?.current_term || 1);
    return Math.max(1, Math.min(3, Number.isFinite(term) ? term : 1));
}

function activeTermLabel() {
    return `Term ${activeTerm()}`;
}

function currentSchoolYearId() {
    return state.settings?.current_school_year_id || state.settings?.school_year_id || null;
}

function currentSchoolYearLabel() {
    return state.settings?.current_school_year || state.settings?.school_year || "Current SY";
}

function hasFullPlAccess(ctx = state.context) {
    return Boolean(ctx?.is_school_head || ctx?.is_registrar || ctx?.is_coordinator || ctx?.is_system_admin);
}

function isManagement(ctx = state.context) {
    return Boolean(ctx?.is_school_head || ctx?.is_registrar || ctx?.is_coordinator || ctx?.is_system_admin);
}

function canUseLoads() {
    return Boolean(state.context?.is_subject_teacher);
}

function canUseAdvisory() {
    return Boolean(state.context?.is_adviser);
}

function canUseGradeMonitoring() {
    return Boolean(canUseAdvisory() || isManagement());
}

function canUseStudentSearch() {
    return isManagement();
}

function canUseSummary() {
    return isManagement();
}

function canUseClasses() {
    return isManagement();
}

function canUseGradeCorrections() {
    return Boolean(canUseLoads() || isManagement());
}

function canReviewGradeCorrections() {
    return isManagement();
}

function loadKey(classId, subjectId) {
    return `${clean(classId)}|${clean(subjectId)}`;
}

function teacherLoadKeys() {
    return new Set((state.loads || [])
        .filter((load) => clean(load.class_id) && clean(load.subject_id))
        .map((load) => loadKey(load.class_id, load.subject_id)));
}

function correctionMatchesTeacherLoad(row, keys = teacherLoadKeys()) {
    if (!row || !keys.size) return false;
    return keys.has(loadKey(row.class_id, row.subject_id));
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
    renderNavItems();
}

function buildNavItems() {
    const items = [{ key: "dashboard", label: "Dashboard" }];
    if (canUseLoads()) items.push({ key: "loads", label: "My Loads" });
    if (canUseGradeCorrections()) items.push({ key: "corrections", label: canReviewGradeCorrections() ? "Grade Correction" : "Correction Status" });
    if (canUseAdvisory()) items.push({ key: "advisory", label: "Advisory Class" });
    if (canUseSummary()) items.push({ key: "summary", label: "Enrollment" });
    if (canUseStudentSearch()) items.push({ key: "search", label: "Student Search" });
    if (canUseClasses()) items.push({ key: "classes", label: "Classes" });
    if (canUseGradeMonitoring()) items.push({ key: "monitoring", label: "Grade Monitoring" });
    if (canUsePl()) items.push({ key: "pl", label: "PL Monitoring" });
    return items;
}

function renderNavItems() {
    state.navItems = buildNavItems();
    $("drawerNav").innerHTML = state.navItems.map((item) => `
        <button type="button" data-screen="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>
    `).join("");
    $("drawerNav").querySelectorAll("button[data-screen]").forEach((button) => {
        button.addEventListener("click", () => {
            closeDrawer();
            showScreen(button.dataset.screen);
        });
    });
    updateActiveNav();
}

function updateActiveNav() {
    document.querySelectorAll("#drawerNav button[data-screen]").forEach((button) => {
        button.classList.toggle("active", button.dataset.screen === state.currentScreen);
    });
}

function openDrawer() {
    $("navOverlay").classList.remove("hidden");
    $("navDrawer").classList.remove("hidden");
}

function closeDrawer() {
    $("navOverlay").classList.add("hidden");
    $("navDrawer").classList.add("hidden");
}

function showLogin() {
    state.session = null;
    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    closeDrawer();
}

function showApp() {
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    showScreen("dashboard");
}

function showScreen(name, skipLoad = false) {
    if (!screens[name]) name = "dashboard";
    Object.entries(screens).forEach(([key, el]) => {
        el.classList.toggle("active-screen", key === name);
    });
    state.currentScreen = name;
    $("viewTitle").textContent = titles[name] || "ISS Mobile";
    updateActiveNav();
    if (!skipLoad) loadScreenData(name);
}

async function loadScreenData(name = state.currentScreen) {
    try {
        if (name === "dashboard") await loadDashboard();
        if (name === "loads") await loadLoads();
        if (name === "corrections") await loadCorrections();
        if (name === "advisory") await loadAdvisory();
        if (name === "summary") await loadEnrollmentSummary();
        if (name === "classes") await loadClassesSummary();
        if (name === "monitoring") await loadGradeMonitoring();
        if (name === "pl") await loadPlMonitoring();
    } catch (error) {
        console.error(error);
        setMessage("dashboardMessage", error.message || "Unable to load.");
    }
}

async function refreshCurrentScreen() {
    await loadSettings().catch(console.warn);
    await loadScreenData(state.currentScreen);
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
        await loadSettings();
        await loadContext();
        renderUserShell();
        showApp();
        setMessage("loginMessage", "");
    } catch (error) {
        console.error(error);
        showLogin();
        setMessage("loginMessage", error.message || "Unable to load account.");
    }
}

function renderDashboardInfo() {
    $("dashboardInfoGrid").innerHTML = `
        <article class="mini-card"><strong>${escapeHtml(currentSchoolYearLabel())}</strong><span>School Year</span></article>
        <article class="mini-card"><strong>${escapeHtml(activeTermLabel())}</strong><span>Current Term</span></article>
        <article class="mini-card"><strong>${escapeHtml(dateText())}</strong><span>Date</span></article>
        <article class="mini-card"><strong>${escapeHtml(String(state.context?.teacher_load_count || state.loads.length || 0))}</strong><span>Loads</span></article>
    `;
}

async function loadDashboard() {
    renderDashboardInfo();
    const container = $("dashboardLoadSummary");
    container.innerHTML = "";
    if (canUseLoads()) {
        if (!state.loads.length) {
            await fetchLoads(false);
        }
        container.innerHTML = state.loads.slice(0, 8).map((load) => `
            <article class="simple-card">
                <p class="card-title">Grade ${escapeHtml(blank(load.grade_level))} ${escapeHtml(blank(load.section_name))}</p>
                <p class="card-meta">${escapeHtml(blank(load.subject_name))}</p>
            </article>
        `).join("");
        setMessage("dashboardMessage", `${state.loads.length} load(s).`);
    } else {
        setMessage("dashboardMessage", "Ready.");
    }
}

async function fetchLoads(showMessage = true) {
    if (!canUseLoads()) return [];
    if (showMessage) setMessage("loadsMessage", "Loading...");
    const { data, error } = await state.client.rpc("get_teacher_load_summary_rows");
    if (error) throw error;
    state.loads = [...(data || [])].sort((a, b) => {
        const grade = Number(a.grade_level || 0) - Number(b.grade_level || 0);
        if (grade !== 0) return grade;
        const section = clean(a.section_name).localeCompare(clean(b.section_name), undefined, { sensitivity: "base" });
        if (section !== 0) return section;
        return clean(a.subject_name).localeCompare(clean(b.subject_name), undefined, { sensitivity: "base" });
    });
    return state.loads;
}

async function loadLoads() {
    if (!canUseLoads()) {
        setMessage("loadsMessage", "Not available for this account.");
        return;
    }
    const container = $("loadsList");
    container.innerHTML = "";
    try {
        await fetchLoads(true);
        setMessage("loadsMessage", `${state.loads.length} load(s).`);
        container.innerHTML = state.loads.map((load, index) => `
            <article class="load-card" data-load-index="${index}">
                <p class="card-title">Grade ${escapeHtml(blank(load.grade_level))} ${escapeHtml(blank(load.section_name))}</p>
                <p class="card-meta">${escapeHtml(blank(load.subject_name))}</p>
                <div class="card-row"><span>${escapeHtml(blank(load.school_year))}</span><span class="badge">Open</span></div>
            </article>
        `).join("");
        container.querySelectorAll("[data-load-index]").forEach((card) => {
            card.addEventListener("click", () => openLoad(state.loads[Number(card.dataset.loadIndex)]));
        });
    } catch (error) {
        setMessage("loadsMessage", error.message);
    }
}

function periodLabel(period) {
    return `Term ${period}`;
}

function gradeValue(row, period) {
    const value = row?.[`q${period}_grade`];
    return value === null || value === undefined || value === "" ? "" : String(value);
}

function gradeVisible(row, period) {
    return row?.[`q${period}_visible`] !== false;
}

function gradeEncodingOpen(row) {
    return row?.grade_encoding_open === true || row?.grade_encoding_open === "true";
}

function activeTermForGradeRow(row) {
    const term = Number(row?.active_quarter || activeTerm());
    return Math.max(1, Math.min(3, Number.isFinite(term) ? term : 1));
}

function periodCanEncode(row, period) {
    return row?.[`q${period}_can_encode`] === true || row?.[`q${period}_can_encode`] === "true";
}

function gradeInputAllowed(row, period) {
    const currentTerm = activeTermForGradeRow(row);
    const periodNumber = Number(period);
    const existingValue = gradeValue(row, periodNumber);

    if (!gradeVisible(row, periodNumber)) return false;
    if (!gradeEncodingOpen(row)) return false;
    if (!periodCanEncode(row, periodNumber)) return false;
    if (periodNumber > currentTerm) return false;
    if (periodNumber === currentTerm) return true;
    if (periodNumber < currentTerm && existingValue === "") return true;
    return false;
}

function canRequestGradeCorrectionFor(row, period) {
    const periodNumber = Number(period);
    if (!row || !periodNumber) return false;
    if (!gradeVisible(row, periodNumber)) return false;
    if (!gradeEncodingOpen(row)) return false;
    if (!periodCanEncode(row, periodNumber)) return false;
    if (!gradeValue(row, periodNumber)) return false;
    return !gradeInputAllowed(row, periodNumber);
}

async function openLoad(load) {
    state.selectedLoad = load;
    $("loadDetailTitle").textContent = `Grade ${load.grade_level} ${load.section_name}`;
    $("loadDetailMeta").textContent = blank(load.subject_name);
    $("gradeRows").innerHTML = "";
    setMessage("gradeMessage", "Loading...");
    showScreen("loadDetail", true);
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

function renderGradeRows() {
    $("gradeRows").innerHTML = state.gradeRows.map((row, index) => {
        const grades = [1, 2, 3].map((period) => `
            <span class="grade-pill">T${period}: ${escapeHtml(gradeVisible(row, period) ? (gradeValue(row, period) || "-") : "-")}</span>
        `).join("");
        return `
            <article class="student-card" data-grade-row-index="${index}">
                <p class="card-title">${escapeHtml(studentName(row))}</p>
                <div class="grade-lines">${grades}</div>
            </article>
        `;
    }).join("");
    $("gradeRows").querySelectorAll("[data-grade-row-index]").forEach((card) => {
        card.addEventListener("click", () => openGradeSheet(state.gradeRows[Number(card.dataset.gradeRowIndex)]));
    });
}

function openGradeSheet(row) {
    state.selectedGradeRow = row;
    state.correctionEligibleTerms = [1, 2, 3].filter((period) => canRequestGradeCorrectionFor(row, period));
    $("gradeSheetName").textContent = studentName(row) || "Learner";
    $("gradeSheetMeta").textContent = `Grade ${blank(row.grade_level)} ${blank(row.section_name)} | ${blank(row.subject_name || state.selectedLoad?.subject_name)}`;
    $("gradeSheetMessage").textContent = "";
    $("gradeSheetBody").innerHTML = [1, 2, 3].map((period) => {
        const value = gradeValue(row, period);
        const editable = gradeInputAllowed(row, period);
        const requestable = canRequestGradeCorrectionFor(row, period);
        const lockHint = requestable ? "Locked, request correction" : editable ? "Editable" : "Locked";
        return `
            <div class="grade-edit-row">
                <label>T${period}</label>
                <div class="grade-input-wrap">
                    <input id="gradeEditT${period}" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(value)}" data-original="${escapeHtml(value)}" aria-label="Term ${period} grade" ${editable ? "" : "disabled"}>
                    ${requestable ? `<button type="button" class="grade-correction-mini-btn" data-correction-term="${period}" title="Request correction" aria-label="Request correction for Term ${period}">✎</button>` : `<span class="grade-lock-hint">${escapeHtml(lockHint)}</span>`}
                </div>
            </div>
        `;
    }).join("");
    $("gradeSheetBody").querySelectorAll("[data-correction-term]").forEach((button) => {
        button.addEventListener("click", () => openCorrectionRequestSheet(Number(button.dataset.correctionTerm || 0)));
    });
    const hasEditable = [1, 2, 3].some((period) => gradeInputAllowed(row, period));
    $("saveSingleGradeBtn").classList.toggle("hidden", !hasEditable);
    $("openGradeCorrectionRequestBtn").classList.add("hidden");
    $("gradeSheet").classList.remove("hidden");
}

function closeGradeSheet() {
    $("gradeSheet").classList.add("hidden");
}

async function saveSingleGrade() {
    const row = state.selectedGradeRow;
    if (!row) return;
    const items = [];
    for (const period of [1, 2, 3]) {
        if (!gradeInputAllowed(row, period)) continue;
        const input = $(`gradeEditT${period}`);
        const value = clean(input?.value);
        const original = clean(input?.dataset.original);
        if (value === original) continue;
        const grade = Number(value);
        if (!Number.isInteger(grade) || grade < 60 || grade > 100) {
            setMessage("gradeSheetMessage", "Grades must be whole numbers from 60 to 100.");
            return;
        }
        items.push({ grade_id: row.grade_id, quarter: period, new_grade: grade, reason: "Mobile encoding" });
    }
    if (!items.length) {
        setMessage("gradeSheetMessage", "No changes.");
        return;
    }
    $("saveSingleGradeBtn").disabled = true;
    setMessage("gradeSheetMessage", "Saving...");
    const { data, error } = await state.client.rpc("save_teacher_grade_batch", { p_items: items });
    $("saveSingleGradeBtn").disabled = false;
    if (error) {
        setMessage("gradeSheetMessage", error.message);
        return;
    }
    const saved = (data || []).filter((item) => item.saved).length;
    setMessage("gradeSheetMessage", `${saved || items.length} saved.`);
    closeGradeSheet();
    await openLoad(state.selectedLoad);
}

function openCorrectionRequestSheet(preferredTerm = null) {
    const row = state.selectedGradeRow;
    const preferred = Number(preferredTerm || 0);
    const eligibleTerms = preferred && state.correctionEligibleTerms.includes(preferred)
        ? [preferred]
        : state.correctionEligibleTerms;
    if (!row || !eligibleTerms.length) return;
    $("gradeCorrectionRequestBody").innerHTML = `
        <div class="info-row"><span>Learner</span><strong>${escapeHtml(studentName(row))}</strong></div>
        <div class="info-row"><span>Subject</span><strong>${escapeHtml(blank(row.subject_name || state.selectedLoad?.subject_name))}</strong></div>
    `;
    $("correctionTermInput").innerHTML = eligibleTerms.map((period) => `
        <option value="${period}">${periodLabel(period)} | Current: ${escapeHtml(gradeValue(row, period))}</option>
    `).join("");
    $("correctionRequestedGradeInput").value = "";
    $("correctionReasonInput").value = "";
    setMessage("correctionRequestMessage", "");
    $("gradeCorrectionRequestSheet").classList.remove("hidden");
}

function closeCorrectionRequestSheet() {
    $("gradeCorrectionRequestSheet").classList.add("hidden");
}

async function submitCorrectionRequest() {
    const row = state.selectedGradeRow;
    const quarter = Number($("correctionTermInput").value || 0);
    const requestedGrade = Number(clean($("correctionRequestedGradeInput").value));
    const reason = clean($("correctionReasonInput").value);
    if (!row?.grade_id || !quarter) {
        setMessage("correctionRequestMessage", "Missing grade details.");
        return;
    }
    if (!Number.isInteger(requestedGrade) || requestedGrade < 60 || requestedGrade > 100) {
        setMessage("correctionRequestMessage", "Corrected grade must be 60 to 100.");
        return;
    }
    if (!reason) {
        setMessage("correctionRequestMessage", "Reason is required.");
        return;
    }
    $("submitCorrectionRequestBtn").disabled = true;
    setMessage("correctionRequestMessage", "Submitting...");
    const { error } = await state.client.rpc("create_grade_correction_request", {
        p_grade_id: row.grade_id,
        p_quarter: quarter,
        p_requested_grade: requestedGrade,
        p_reason: reason
    });
    $("submitCorrectionRequestBtn").disabled = false;
    if (error) {
        setMessage("correctionRequestMessage", error.message);
        return;
    }
    closeCorrectionRequestSheet();
    closeGradeSheet();
    setMessage("gradeMessage", "Grade correction request submitted.");
    await loadCorrections().catch(console.warn);
}

async function loadCorrections() {
    if (!canUseGradeCorrections()) {
        setMessage("correctionMessage", "Not available for this account.");
        return;
    }
    const list = $("correctionList");
    list.innerHTML = "";
    setMessage("correctionMessage", "Loading...");
    const { data, error } = await state.client.rpc("get_grade_correction_requests", {
        p_status: null,
        p_school_year_id: null,
        p_period: null
    });
    if (error) {
        setMessage("correctionMessage", error.message);
        return;
    }
    let rows = data || [];
    if (!canReviewGradeCorrections()) {
        if (canUseLoads() && !state.loads.length) {
            await fetchLoads(false).catch(() => []);
        }
        const keys = teacherLoadKeys();
        rows = rows.filter((row) => correctionMatchesTeacherLoad(row, keys));
    }
    state.corrections = rows;
    setMessage("correctionMessage", `${state.corrections.length} request(s).`);
    list.innerHTML = state.corrections.map((row, index) => {
        const statusClass = clean(row.status).toLowerCase() === "approved" ? "good" : clean(row.status).toLowerCase() === "pending" ? "warn" : "bad";
        return `
            <article class="student-card" data-correction-index="${index}">
                <p class="card-title">${escapeHtml(blank(row.student_name, "Learner"))}</p>
                <p class="card-meta">${escapeHtml(blank(row.subject_name || row.subject_code, "Subject"))}</p>
                <div class="card-row"><strong>${escapeHtml(blank(row.current_grade))} → ${escapeHtml(blank(row.requested_grade))}</strong><span class="badge ${statusClass}">${escapeHtml(blank(row.status, "Pending"))}</span></div>
            </article>
        `;
    }).join("");
    list.querySelectorAll("[data-correction-index]").forEach((card) => {
        card.addEventListener("click", () => openCorrectionActionSheet(state.corrections[Number(card.dataset.correctionIndex)]));
    });
}

function openCorrectionActionSheet(row) {
    state.selectedCorrection = row;
    const pending = clean(row.status || "Pending").toLowerCase() === "pending";
    const canReview = canReviewGradeCorrections() || row.can_review === true || String(row.can_review).toLowerCase() === "true";
    const canCancel = row.can_cancel === true || String(row.can_cancel).toLowerCase() === "true";
    $("correctionActionTitle").textContent = "Grade Correction";
    $("correctionActionBody").innerHTML = `
        <div class="info-row"><span>Learner</span><strong>${escapeHtml(blank(row.student_name))}</strong></div>
        <div class="info-row"><span>Subject</span><strong>${escapeHtml(blank(row.subject_name || row.subject_code))}</strong></div>
        <div class="info-row"><span>Change</span><strong>${escapeHtml(blank(row.current_grade))} → ${escapeHtml(blank(row.requested_grade))}</strong></div>
        <div class="info-row"><span>Status</span><strong>${escapeHtml(blank(row.status, "Pending"))}</strong></div>
        <div class="info-row"><span>Reason</span><strong>${escapeHtml(blank(row.reason))}</strong></div>
    `;
    $("correctionActionNotes").value = "";
    setMessage("correctionActionMessage", pending ? "" : "This request is already closed.");
    const buttons = [];
    if (pending && canReview) {
        buttons.push(`<button class="approve-btn" type="button" data-correction-action="approve">Approve</button>`);
        buttons.push(`<button class="reject-btn" type="button" data-correction-action="reject">Disapprove</button>`);
    } else if (pending && canCancel) {
        buttons.push(`<button class="cancel-btn" type="button" data-correction-action="cancel">Cancel</button>`);
    }
    $("correctionActionButtons").className = buttons.length === 1 ? "action-row one" : "action-row";
    $("correctionActionButtons").innerHTML = buttons.join("");
    $("correctionActionButtons").querySelectorAll("[data-correction-action]").forEach((button) => {
        button.addEventListener("click", () => confirmCorrectionAction(button.dataset.correctionAction));
    });
    $("correctionActionSheet").classList.remove("hidden");
}

function closeCorrectionActionSheet() {
    $("correctionActionSheet").classList.add("hidden");
}

async function confirmCorrectionAction(action) {
    const row = state.selectedCorrection;
    if (!row?.request_id || !action) return;
    const notes = clean($("correctionActionNotes").value) || null;
    let rpcName = "";
    let params = {};
    if (action === "approve") {
        rpcName = "approve_grade_correction_request";
        params = { p_request_id: row.request_id, p_review_notes: notes };
    } else if (action === "reject") {
        rpcName = "reject_grade_correction_request";
        params = { p_request_id: row.request_id, p_review_notes: notes };
    } else {
        rpcName = "cancel_grade_correction_request";
        params = { p_request_id: row.request_id, p_cancel_notes: notes };
    }
    setMessage("correctionActionMessage", "Saving...");
    const { error } = await state.client.rpc(rpcName, params);
    if (error) {
        setMessage("correctionActionMessage", error.message);
        return;
    }
    closeCorrectionActionSheet();
    await loadCorrections();
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
            <div class="card-row"><span>${escapeHtml(blank(row.gender))}</span><span>Grade ${escapeHtml(blank(row.grade_level))} ${escapeHtml(blank(row.section_name || row.section, ""))}</span></div>
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
        <div class="info-row"><span>4Ps</span><strong>${row.pppp_beneficiary ? "Yes" : "No"}</strong></div>
    `;
    $("studentSheet").classList.remove("hidden");
}

async function loadAdvisory() {
    if (!canUseAdvisory()) {
        setMessage("advisoryMessage", "Not available for this account.");
        return;
    }
    setMessage("advisoryMessage", "Loading...");
    $("advisoryCards").innerHTML = "";
    const { data, error } = await state.client.rpc("get_advisory_class_students", { p_search: null });
    if (error) {
        setMessage("advisoryMessage", error.message);
        return;
    }
    state.advisoryRows = sortStudents(data || []);
    const groups = new Map();
    state.advisoryRows.forEach((row) => {
        const key = row.class_id || `${row.grade_level}|${row.section_name}`;
        if (!groups.has(key)) {
            groups.set(key, { key, class_id: row.class_id, grade_level: row.grade_level, section_name: row.section_name, rows: [] });
        }
        groups.get(key).rows.push(row);
    });
    state.advisoryGroups = [...groups.values()].sort((a, b) => {
        const grade = Number(a.grade_level || 0) - Number(b.grade_level || 0);
        if (grade !== 0) return grade;
        return clean(a.section_name).localeCompare(clean(b.section_name), undefined, { sensitivity: "base" });
    });
    setMessage("advisoryMessage", `${state.advisoryGroups.length} advisory class(es).`);
    $("advisoryCards").innerHTML = state.advisoryGroups.map((group, index) => `
        <article class="load-card" data-advisory-group-index="${index}">
            <p class="card-title">Grade ${escapeHtml(blank(group.grade_level))} ${escapeHtml(blank(group.section_name))}</p>
            <div class="card-row"><span>${group.rows.length} learner(s)</span><span class="badge">Open</span></div>
        </article>
    `).join("");
    $("advisoryCards").querySelectorAll("[data-advisory-group-index]").forEach((card) => {
        card.addEventListener("click", () => openAdvisoryGroup(state.advisoryGroups[Number(card.dataset.advisoryGroupIndex)]));
    });
}

function openAdvisoryGroup(group) {
    state.selectedAdvisoryGroup = group;
    $("advisoryDetailTitle").textContent = `Grade ${group.grade_level} ${group.section_name}`;
    $("advisoryDetailMeta").textContent = `${group.rows.length} learner(s)`;
    $("advisoryLearnerList").innerHTML = sortStudents(group.rows).map((row, index) => `
        <article class="student-card" data-advisory-student-index="${index}">
            <p class="card-title">${escapeHtml(studentName(row))}</p>
            <div class="card-row"><span>${escapeHtml(blank(row.gender))}</span><span>${escapeHtml(blank(row.lrn))}</span></div>
        </article>
    `).join("");
    $("advisoryLearnerList").querySelectorAll("[data-advisory-student-index]").forEach((card) => {
        card.addEventListener("click", () => openStudentSheet(sortStudents(group.rows)[Number(card.dataset.advisoryStudentIndex)]));
    });
    showScreen("advisoryDetail", true);
}

async function loadEnrollmentSummary() {
    if (!canUseSummary()) {
        setMessage("summaryMessage", "Not available for this account.");
        return;
    }
    setMessage("summaryMessage", "Loading...");
    $("summaryCards").innerHTML = "";
    const { data, error } = await state.client.rpc("get_enrollment_summary_rows", { p_school_year_id: currentSchoolYearId() });
    if (error) {
        setMessage("summaryMessage", error.message);
        return;
    }
    state.summaryRows = (data || []).filter((row) => clean(row.enrollment_status).toLowerCase() === "enrolled");
    const buckets = new Map();
    state.summaryRows.forEach((row) => {
        const grade = row.grade_level || "Unassigned";
        if (!buckets.has(grade)) buckets.set(grade, { grade, male: 0, female: 0, total: 0 });
        const bucket = buckets.get(grade);
        const gender = clean(row.gender).toLowerCase();
        if (gender.startsWith("m")) bucket.male += 1;
        if (gender.startsWith("f")) bucket.female += 1;
        bucket.total += 1;
    });
    const gradeRows = [...buckets.values()].sort((a, b) => Number(a.grade || 99) - Number(b.grade || 99));
    const overall = gradeRows.reduce((acc, row) => ({ male: acc.male + row.male, female: acc.female + row.female, total: acc.total + row.total }), { male: 0, female: 0, total: 0 });
    $("summaryCards").innerHTML = `
        <article class="mini-card"><strong>${overall.total}</strong><span>Total Enrolled</span></article>
        ${gradeRows.map((row) => `
            <article class="data-card">
                <p class="card-title">Grade ${escapeHtml(row.grade)}</p>
                <div class="card-row"><span>Male</span><strong>${row.male}</strong></div>
                <div class="card-row"><span>Female</span><strong>${row.female}</strong></div>
                <div class="card-row"><span>Total</span><strong>${row.total}</strong></div>
            </article>
        `).join("")}
    `;
    setMessage("summaryMessage", `${gradeRows.length} grade level(s).`);
}

async function loadClassesSummary() {
    if (!canUseClasses()) {
        setMessage("classesMessage", "Not available for this account.");
        return;
    }
    setMessage("classesMessage", "Loading...");
    $("classesList").innerHTML = "";
    const [classesResult, enrollmentResult] = await Promise.all([
        state.client.rpc("get_class_management_rows", { p_school_year_id: currentSchoolYearId(), p_campus: null }),
        state.client.rpc("get_enrollment_summary_rows", { p_school_year_id: currentSchoolYearId() })
    ]);
    if (classesResult.error) {
        setMessage("classesMessage", classesResult.error.message);
        return;
    }
    const enrollmentRows = (enrollmentResult.data || []).filter((row) => clean(row.enrollment_status).toLowerCase() === "enrolled");
    const counts = new Map();
    enrollmentRows.forEach((row) => {
        const key = row.class_id || `${row.grade_level}|${row.section_name}`;
        if (!counts.has(key)) counts.set(key, { male: 0, female: 0, total: 0 });
        const item = counts.get(key);
        const gender = clean(row.gender).toLowerCase();
        if (gender.startsWith("m")) item.male += 1;
        if (gender.startsWith("f")) item.female += 1;
        item.total += 1;
    });
    state.classRows = [...(classesResult.data || [])].sort((a, b) => {
        const grade = Number(a.grade_level || 0) - Number(b.grade_level || 0);
        if (grade !== 0) return grade;
        return clean(a.section_name).localeCompare(clean(b.section_name), undefined, { sensitivity: "base" });
    });
    $("classesList").innerHTML = state.classRows.map((row) => {
        const key = row.class_id || `${row.grade_level}|${row.section_name}`;
        const count = counts.get(key) || { male: 0, female: 0, total: Number(row.enrollment_count || 0) };
        return `
            <article class="data-card">
                <p class="card-title">G${escapeHtml(blank(row.grade_level))} ${escapeHtml(blank(row.section_name))}</p>
                <p class="card-meta">${escapeHtml(blank(row.adviser_name, "No adviser"))}</p>
                <div class="card-row"><span>Male</span><strong>${count.male}</strong></div>
                <div class="card-row"><span>Female</span><strong>${count.female}</strong></div>
                <div class="card-row"><span>Total</span><strong>${count.total}</strong></div>
            </article>
        `;
    }).join("");
    setMessage("classesMessage", `${state.classRows.length} class(es).`);
}

async function fetchGradeMonitoringCards(params) {
    const fast = await state.client.rpc("get_grade_monitoring_class_cards_fast", params);
    if (!fast.error) return fast;
    return await state.client.rpc("get_grade_monitoring_class_cards", params);
}

async function loadGradeMonitoring() {
    if (!canUseGradeMonitoring()) {
        setMessage("monitoringMessage", "Not available for this account.");
        return;
    }
    $("monitoringCards").innerHTML = "";
    setMessage("monitoringMessage", "Loading...");
    const params = {
        p_school_year_id: currentSchoolYearId(),
        p_period: activeTerm(),
        p_campus: null,
        p_grade_level: null
    };
    const { data, error } = await fetchGradeMonitoringCards(params);
    if (error) {
        setMessage("monitoringMessage", error.message);
        return;
    }
    state.monitoringCards = [...(data || [])].sort((a, b) => {
        const grade = Number(a.grade_level || 0) - Number(b.grade_level || 0);
        if (grade !== 0) return grade;
        return clean(a.section_name).localeCompare(clean(b.section_name), undefined, { sensitivity: "base" });
    });
    $("monitoringCards").innerHTML = state.monitoringCards.map((card, index) => {
        const pct = Number(card.completion_percent || 0);
        return `
            <article class="data-card" data-monitoring-index="${index}">
                <p class="card-title">Grade ${escapeHtml(blank(card.grade_level))} ${escapeHtml(blank(card.section_name))}</p>
                <p class="card-meta">${escapeHtml(blank(card.adviser_name, "No adviser"))}</p>
                <div class="card-row"><span>${escapeHtml(activeTermLabel())}</span><strong>${percentText(pct)}</strong></div>
                <div class="progress-line"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>
            </article>
        `;
    }).join("");
    $("monitoringCards").querySelectorAll("[data-monitoring-index]").forEach((card) => {
        card.addEventListener("click", () => openMonitoringClass(state.monitoringCards[Number(card.dataset.monitoringIndex)]));
    });
    setMessage("monitoringMessage", `${state.monitoringCards.length} section(s).`);
}

async function openMonitoringClass(card) {
    state.selectedMonitoringClass = card;
    $("monitoringDetailTitle").textContent = `Grade ${card.grade_level} ${card.section_name}`;
    $("monitoringDetailMeta").textContent = activeTermLabel();
    $("monitoringSubjectList").innerHTML = "";
    setMessage("monitoringDetailMessage", "Loading...");
    showScreen("monitoringDetail", true);
    const { data, error } = await state.client.rpc("get_grade_monitoring_class_subjects", {
        p_class_id: card.class_id,
        p_period: activeTerm()
    });
    if (error) {
        setMessage("monitoringDetailMessage", error.message);
        return;
    }
    state.monitoringSubjects = data || [];
    $("monitoringSubjectList").innerHTML = state.monitoringSubjects.map((row) => {
        const pct = Number(row.completion_percent || 0);
        return `
            <article class="data-card">
                <p class="card-title">${escapeHtml(blank(row.subject_name, "Subject"))}</p>
                <p class="card-meta">${escapeHtml(blank(row.teacher_name, "No teacher"))}</p>
                <div class="card-row"><span>Completion</span><strong>${percentText(pct)}</strong></div>
                <div class="progress-line"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>
            </article>
        `;
    }).join("");
    setMessage("monitoringDetailMessage", `${state.monitoringSubjects.length} subject(s).`);
}

function plStatus(row) {
    if (row?.pl_mobile_status) return row.pl_mobile_status;
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

function plTeacherText(group = []) {
    const names = [...new Set(group.map((row) => clean(row.current_teacher_name || row.teacher_name || row.last_teacher_name)).filter(Boolean))];
    return names.join(", ") || "No teacher";
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
            current_teacher_name: plTeacherText(group),
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
        if (!map.has(subject)) map.set(subject, { subject, total: 0, complete: 0, learners: 0, weighted: 0, above: 0, rows: [] });
        const item = map.get(subject);
        const status = plStatus(row);
        item.total += 1;
        item.rows.push(row);
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

async function loadPlMonitoring() {
    if (!canUsePl()) {
        setMessage("plMessage", "Not available for this account.");
        return;
    }
    setMessage("plMessage", "Loading...");
    $("plSubjectCards").innerHTML = "";
    const { data, error } = await state.client.rpc("get_proficiency_level_monitoring_rows", {
        p_school_year_id: currentSchoolYearId(),
        p_grade_level: null,
        p_term: activeTerm(),
        p_active_only: true
    });
    if (error) {
        setMessage("plMessage", error.message);
        return;
    }
    state.plRawRows = data || [];
    state.plRows = buildPlDisplayRows(state.plRawRows);
    const cards = summarizePlBySubject(state.plRows);
    $("plSubjectCards").innerHTML = cards.map((card, index) => {
        const completion = card.total ? (card.complete / card.total) * 100 : null;
        const pl = card.learners ? card.weighted / card.learners : null;
        return `
            <article class="pl-card" data-pl-subject-index="${index}">
                <p class="card-title">${escapeHtml(card.subject)}</p>
                <div class="card-row"><span>PL</span><strong>${pl === null ? "—" : pl.toFixed(2)}</strong></div>
                <div class="card-row"><span>Completion</span><span class="badge ${completion === 100 ? "good" : completion > 0 ? "warn" : "bad"}">${percentText(completion)}</span></div>
            </article>
        `;
    }).join("");
    $("plSubjectCards").querySelectorAll("[data-pl-subject-index]").forEach((card) => {
        card.addEventListener("click", () => openPlSubject(cards[Number(card.dataset.plSubjectIndex)]));
    });
    setMessage("plMessage", `${cards.length} subject area(s).`);
}

function openPlSubject(card) {
    state.selectedPlSubject = card.subject;
    const rows = card.rows || state.plRows.filter((row) => plSubjectArea(row) === card.subject);
    $("plDetailTitle").textContent = card.subject;
    $("plDetailMeta").textContent = activeTermLabel();
    const gradeGroups = new Map();
    rows.forEach((row) => {
        const grade = row.grade_level || "Unassigned";
        if (!gradeGroups.has(grade)) gradeGroups.set(grade, { grade, total: 0, complete: 0, learners: 0, weighted: 0, above: 0 });
        const group = gradeGroups.get(grade);
        const status = plStatus(row);
        group.total += 1;
        if (status === "Complete") {
            const learners = Number(row.number_of_learners) || 0;
            const mps = Number(row.mps_or_proficiency_level) || 0;
            const above = Number(row.learners_75_mps_above) || 0;
            group.complete += 1;
            group.learners += learners;
            group.weighted += learners * mps;
            group.above += above;
        }
    });
    const gradeCards = [...gradeGroups.values()].sort((a, b) => Number(a.grade || 99) - Number(b.grade || 99));
    $("plGradeCards").innerHTML = gradeCards.map((group) => {
        const pl = group.learners ? group.weighted / group.learners : null;
        return `
            <article class="mini-card">
                <strong>${pl === null ? "—" : pl.toFixed(2)}</strong>
                <span>Grade ${escapeHtml(group.grade)} | ${group.complete} of ${group.total}</span>
            </article>
        `;
    }).join("");
    $("plSectionList").innerHTML = rows.sort((a, b) => {
        const grade = Number(a.grade_level || 0) - Number(b.grade_level || 0);
        if (grade !== 0) return grade;
        return clean(a.section_name).localeCompare(clean(b.section_name), undefined, { sensitivity: "base" });
    }).map((row) => {
        const status = plStatus(row);
        const statusClass = status === "Complete" ? "good" : status === "Missing" ? "bad" : "warn";
        return `
            <article class="data-card">
                <p class="card-title">G${escapeHtml(blank(row.grade_level))} ${escapeHtml(blank(row.section_name))}</p>
                <p class="card-meta">${escapeHtml(blank(row.current_teacher_name || row.teacher_name || row.last_teacher_name, "No teacher"))}</p>
                <div class="card-row"><span>Status</span><span class="badge ${statusClass}">${escapeHtml(status)}</span></div>
            </article>
        `;
    }).join("");
    showScreen("plDetail", true);
}

function bindEvents() {
    $("loginBtn").addEventListener("click", login);
    $("resetPasswordBtn").addEventListener("click", resetPassword);
    $("logoutBtn").addEventListener("click", logout);
    $("refreshBtn").addEventListener("click", refreshCurrentScreen);
    $("openNavBtn").addEventListener("click", openDrawer);
    $("closeNavBtn").addEventListener("click", closeDrawer);
    $("navOverlay").addEventListener("click", closeDrawer);
    $("studentSearchBtn").addEventListener("click", searchStudents);
    $("studentSearchInput").addEventListener("keydown", (event) => { if (event.key === "Enter") searchStudents(); });
    $("backToLoadsBtn").addEventListener("click", () => showScreen("loads"));
    $("backToAdvisoryBtn").addEventListener("click", () => showScreen("advisory"));
    $("backToMonitoringBtn").addEventListener("click", () => showScreen("monitoring"));
    $("backToPlBtn").addEventListener("click", () => showScreen("pl"));
    $("closeStudentSheetBtn").addEventListener("click", () => $("studentSheet").classList.add("hidden"));
    $("closeGradeSheetBtn").addEventListener("click", closeGradeSheet);
    $("saveSingleGradeBtn").addEventListener("click", saveSingleGrade);
    $("openGradeCorrectionRequestBtn").addEventListener("click", openCorrectionRequestSheet);
    $("closeGradeCorrectionRequestBtn").addEventListener("click", closeCorrectionRequestSheet);
    $("submitCorrectionRequestBtn").addEventListener("click", submitCorrectionRequest);
    $("closeCorrectionActionBtn").addEventListener("click", closeCorrectionActionSheet);
}

async function start() {
    bindEvents();
    enforcePhoneSize();
    window.addEventListener("resize", enforcePhoneSize);
    window.addEventListener("orientationchange", () => setTimeout(enforcePhoneSize, 250));
    if ("serviceWorker" in navigator) {
        const swVersion = encodeURIComponent(window.ISS_MOBILE_ASSET_VERSION || "2026.07.03.3");
        navigator.serviceWorker.register(`./service-worker.js?v=${swVersion}`, { updateViaCache: "none" }).catch(console.warn);
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
