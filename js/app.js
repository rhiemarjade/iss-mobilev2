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
    proficiencyRows: [],
    proficiencyReady: false,
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
    plSubjectCards: [],
    selectedPlSubject: null,
    selectedPlSubjectCard: null,
    selectedPlGradeCards: [],
    selectedPlGradeGroup: null,
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

function numericValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function firstNumericValue(row, keys = []) {
    for (const key of keys) {
        const value = numericValue(row?.[key]);
        if (value !== null) return value;
    }
    return null;
}

const LOAD_TOTAL_COUNT_KEYS = [
    "mobile_total_students",
    "mobile_learner_count",
    "enrolled_learner_count",
    "total_students",
    "total_learners",
    "learner_count",
    "enrollment_count",
    "total_enrollment_count",
    "active_class_enrollment_count",
    "total_class_enrollment_count"
];

const LOAD_MALE_COUNT_KEYS = [
    "mobile_male_count",
    "male_count",
    "male_students",
    "male_learners",
    "male_enrollment_count",
    "male_total"
];

const LOAD_FEMALE_COUNT_KEYS = [
    "mobile_female_count",
    "female_count",
    "female_students",
    "female_learners",
    "female_enrollment_count",
    "female_total"
];

function learnerGenderCounts(rows = []) {
    return rows.reduce((counts, row) => {
        const gender = clean(row?.gender).toLowerCase();
        if (gender.startsWith("m")) counts.male += 1;
        if (gender.startsWith("f")) counts.female += 1;
        counts.total += 1;
        return counts;
    }, { male: 0, female: 0, total: 0 });
}

function loadLearnerCounts(load = {}) {
    let total = firstNumericValue(load, LOAD_TOTAL_COUNT_KEYS);
    const male = firstNumericValue(load, LOAD_MALE_COUNT_KEYS);
    const female = firstNumericValue(load, LOAD_FEMALE_COUNT_KEYS);

    if (total === null && (male !== null || female !== null)) {
        total = (male || 0) + (female || 0);
    }

    return { total, male, female };
}

function formatLoadLearnerSummary(load = {}) {
    const counts = loadLearnerCounts(load);
    const total = counts.total === null ? "—" : numberText(counts.total);
    const male = counts.male === null ? "—" : numberText(counts.male);
    const female = counts.female === null ? "—" : numberText(counts.female);
    return `${total} learner(s), ${male} male, ${female} female`;
}

async function hydrateLoadLearnerCounts(loads = []) {
    const hydratedLoads = await Promise.all(loads.map(async (load) => {
        const counts = loadLearnerCounts(load);
        if (counts.total !== null && counts.male !== null && counts.female !== null) {
            return load;
        }

        if (!load?.class_id || !load?.subject_id) {
            return load;
        }

        try {
            const { data, error } = await state.client.rpc("get_teacher_grade_encoding_rows", {
                p_class_id: load.class_id,
                p_subject_id: load.subject_id
            });

            if (error) throw error;

            const genderCounts = learnerGenderCounts(data || []);
            return {
                ...load,
                mobile_total_students: genderCounts.total,
                mobile_learner_count: genderCounts.total,
                mobile_male_count: genderCounts.male,
                mobile_female_count: genderCounts.female
            };
        } catch (error) {
            console.warn("Unable to load learner counts for teacher load.", error);
            return load;
        }
    }));

    return hydratedLoads;
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
    closeProficiencySheet();
    state.loads = [];
    state.selectedLoad = null;
    state.gradeRows = [];
    state.selectedGradeRow = null;
    state.proficiencyRows = [];
    state.proficiencyReady = false;
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

async function fetchLoads(showMessage = true, includeLearnerCounts = false) {
    if (!canUseLoads()) return [];
    if (showMessage) setMessage("loadsMessage", "Loading...");
    const { data, error } = await state.client.rpc("get_teacher_load_summary_rows");
    if (error) throw error;
    const sortedLoads = [...(data || [])].sort((a, b) => {
        const grade = Number(a.grade_level || 0) - Number(b.grade_level || 0);
        if (grade !== 0) return grade;
        const section = clean(a.section_name).localeCompare(clean(b.section_name), undefined, { sensitivity: "base" });
        if (section !== 0) return section;
        return clean(a.subject_name).localeCompare(clean(b.subject_name), undefined, { sensitivity: "base" });
    });
    state.loads = includeLearnerCounts ? await hydrateLoadLearnerCounts(sortedLoads) : sortedLoads;
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
        await fetchLoads(true, true);
        setMessage("loadsMessage", `${state.loads.length} load(s).`);
        container.innerHTML = state.loads.map((load, index) => `
            <article class="load-card" data-load-index="${index}">
                <p class="card-title">Grade ${escapeHtml(blank(load.grade_level))} ${escapeHtml(blank(load.section_name))}</p>
                <p class="card-meta">${escapeHtml(blank(load.subject_name))}</p>
                <div class="card-row"><span>${escapeHtml(formatLoadLearnerSummary(load))}</span><span class="badge">Open</span></div>
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

function selectedLoadId() {
    return state.selectedLoad?.load_id || state.selectedLoad?.teacher_load_id || null;
}

function proficiencyInputs() {
    return Array.from(document.querySelectorAll(".proficiency-input"));
}

function proficiencyInput(term, field) {
    return document.querySelector(`.proficiency-input[data-term="${term}"][data-proficiency-field="${field}"]`);
}

function setProficiencyInputsDisabled(disabled) {
    proficiencyInputs().forEach((input) => {
        input.disabled = disabled;
    });
}

function updateProficiencySaveState() {
    const button = $("saveProficiencyBtn");
    if (!button) return;
    const sheetOpen = !$("proficiencySheet")?.classList.contains("hidden");
    button.disabled = !sheetOpen || !state.proficiencyReady || !selectedLoadId();
}

function clearProficiencyInputs() {
    proficiencyInputs().forEach((input) => {
        input.value = "";
    });
}

function fillProficiencyInput(term, field, value) {
    const input = proficiencyInput(term, field);
    if (!input) return;
    input.value = value === null || value === undefined ? "" : String(value);
}

function setProficiencySheetHeader(row = null) {
    const load = state.selectedLoad || {};
    const gradeSection = [row?.grade_level ?? load.grade_level, row?.section_name ?? load.section_name]
        .filter((value) => clean(value))
        .join(" ");
    $("proficiencySheetMeta").textContent = `${gradeSection ? `Grade ${gradeSection}` : "Selected load"} | ${blank(row?.subject_name || load.subject_name, "Subject")} | SY ${blank(row?.school_year || load.school_year, "Not set")}`;
}

function populateProficiencySheet(rows = []) {
    state.proficiencyRows = rows || [];
    clearProficiencyInputs();
    const firstRow = state.proficiencyRows[0] || null;
    setProficiencySheetHeader(firstRow);
    const enrolledCount = firstRow?.enrolled_learner_count ?? state.selectedLoad?.total_students ?? state.selectedLoad?.enrollment_count ?? null;
    setMessage("proficiencyLearnerHint", enrolledCount === null || enrolledCount === undefined
        ? "Learner count is not available. Enter the learner count manually."
        : `Current learner count from enrollment records: ${enrolledCount}. Use this value only if it applies to the term.`);
    state.proficiencyRows.forEach((row) => {
        const term = Number(row.term || 0);
        if (!term) return;
        fillProficiencyInput(term, "number_of_learners", row.number_of_learners);
        fillProficiencyInput(term, "mps_or_proficiency_level", row.mps_or_proficiency_level);
        fillProficiencyInput(term, "learners_75_mps_above", row.learners_75_mps_above);
    });
}

async function loadProficiencyForSelectedLoad() {
    const loadId = selectedLoadId();
    if (!loadId) throw new Error("Open a teaching load before adding PL.");
    const { data, error } = await state.client.rpc("get_teacher_load_proficiency", {
        p_teacher_load_id: loadId
    });
    if (error) throw error;
    populateProficiencySheet(data || []);
}

async function openProficiencySheet() {
    if (!state.selectedLoad) {
        setMessage("gradeMessage", "Open a teaching load before adding PL.");
        return;
    }
    if (!selectedLoadId()) {
        setMessage("gradeMessage", "This teaching load has no load ID for PL encoding.");
        return;
    }
    state.proficiencyReady = false;
    setProficiencySheetHeader();
    clearProficiencyInputs();
    setMessage("proficiencyLearnerHint", "Loading learner count and saved entries...");
    setMessage("proficiencyMessage", "Loading PL data...");
    $("proficiencySheet").classList.remove("hidden");
    setProficiencyInputsDisabled(true);
    updateProficiencySaveState();
    try {
        await loadProficiencyForSelectedLoad();
        state.proficiencyReady = true;
        setProficiencyInputsDisabled(false);
        setMessage("proficiencyMessage", "Ready.");
    } catch (error) {
        console.error(error);
        setMessage("proficiencyMessage", error.message || "Unable to load PL data.");
    } finally {
        updateProficiencySaveState();
    }
}

function closeProficiencySheet() {
    const sheet = $("proficiencySheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
    state.proficiencyRows = [];
    state.proficiencyReady = false;
}

function parseOptionalWholeNumber(value, label) {
    const text = clean(value);
    if (text === "") return null;
    const number = Number(text);
    if (!Number.isInteger(number) || number < 0) {
        throw new Error(`${label} must be a whole number, 0 or higher.`);
    }
    return number;
}

function collectProficiencyItems() {
    const items = [];
    for (const term of [1, 2, 3]) {
        const numberOfLearners = parseOptionalWholeNumber(
            proficiencyInput(term, "number_of_learners")?.value,
            `Term ${term} number of learners`
        );
        const mpsOrProficiencyLevel = clean(proficiencyInput(term, "mps_or_proficiency_level")?.value);
        const learners75MpsAbove = parseOptionalWholeNumber(
            proficiencyInput(term, "learners_75_mps_above")?.value,
            `Term ${term} number of learners with 75 percent MPS and above`
        );
        if (numberOfLearners !== null && learners75MpsAbove !== null && learners75MpsAbove > numberOfLearners) {
            throw new Error(`Term ${term}: learners with 75 percent MPS and above cannot be greater than the number of learners.`);
        }
        if (mpsOrProficiencyLevel.length > 80) {
            throw new Error(`Term ${term}: MPS or PL value is too long.`);
        }
        items.push({
            term,
            number_of_learners: numberOfLearners,
            mps_or_proficiency_level: mpsOrProficiencyLevel || null,
            learners_75_mps_above: learners75MpsAbove
        });
    }
    return items;
}

async function saveProficiency() {
    const loadId = selectedLoadId();
    if (!loadId) {
        setMessage("proficiencyMessage", "Open a teaching load before saving PL data.");
        return;
    }
    let items = [];
    try {
        items = collectProficiencyItems();
    } catch (error) {
        setMessage("proficiencyMessage", error.message);
        return;
    }
    $("saveProficiencyBtn").disabled = true;
    setProficiencyInputsDisabled(true);
    setMessage("proficiencyMessage", "Saving PL data...");
    const { data, error } = await state.client.rpc("save_teacher_load_proficiency", {
        p_teacher_load_id: loadId,
        p_items: items
    });
    if (error) {
        setProficiencyInputsDisabled(false);
        setMessage("proficiencyMessage", error.message);
        updateProficiencySaveState();
        return;
    }
    const results = data || [];
    const failed = results.filter((row) => !row.saved);
    try {
        await loadProficiencyForSelectedLoad();
    } catch (reloadError) {
        console.warn(reloadError);
    }
    setProficiencyInputsDisabled(false);
    setMessage("proficiencyMessage", failed.length
        ? `${results.length - failed.length} term(s) saved, ${failed.length} failed. First error: ${failed[0].message}`
        : "PL data saved successfully.");
    updateProficiencySaveState();
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

const PL_SUBJECT_DEFINITIONS = [
    { key: "general_subjects", label: "General Subjects", rank: 1, match: (text) => text.includes("general subject") || text === "general" || text.includes("general subjects") },
    { key: "filipino", label: "Filipino", rank: 2, match: (text) => /\bfilipino\b/.test(text) },
    { key: "english", label: "English", rank: 3, match: (text) => /\benglish\b/.test(text) },
    { key: "math", label: "Mathematics", rank: 4, match: (text) => /\bmath\b/.test(text) || /\bmathematics\b/.test(text) },
    { key: "science", label: "Science", rank: 5, match: (text) => /\bscience\b/.test(text) },
    { key: "ap", label: "Araling Panlipunan", rank: 6, match: (text) => /\bap\b/.test(text) || text.includes("araling panlipunan") || text.includes("social studies") },
    { key: "values", label: "Values Education", rank: 7, match: (text) => /\bvalues\b/.test(text) || /\besp\b/.test(text) || text.includes("edukasyon sa pagpapakatao") || text.includes("gmrc") },
    { key: "tle", label: "Technology and Livelihood Education", rank: 8, match: (text) => /\btle\b/.test(text) || /\bepp\b/.test(text) || text.includes("technology and livelihood") || text.includes("livelihood education") },
    { key: "mapeh", label: "MAPEH", rank: 9, match: (text) => /\bmapeh\b/.test(text) || text.includes("music and arts") || text.includes("music arts") || text.includes("physical education") || /\bpe\b/.test(text) || text.includes("health") }
];

function plNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function plMpsNumber(value) {
    if (value === null || value === undefined) return null;
    const cleaned = String(value).trim().replace(/%$/, "");
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
}

function plFormatNumber(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return number.toLocaleString("en-PH", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function plFormatLearners(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    const isWhole = Math.abs(number - Math.round(number)) < 0.000001;
    return number.toLocaleString("en-PH", {
        minimumFractionDigits: isWhole ? 0 : 2,
        maximumFractionDigits: isWhole ? 0 : 2
    });
}

function plFormatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${number.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function plNormalizedText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/\bgrade\s*\d+\b/g, " ")
        .replace(/\bgrades\s*\d+\b/g, " ")
        .replace(/\b(7|8|9|10)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function plRawSubjectText(row) {
    return [
        row?.subject_area,
        row?.subject_area_name,
        row?.subject_group,
        row?.sf_learning_area,
        row?.card_name,
        row?.subject_name,
        row?.subject_code
    ].filter(Boolean).join(" ");
}

function plCleanSubjectName(row) {
    const raw = clean(row?.subject_area || row?.subject_area_name || row?.subject_group || row?.sf_learning_area || row?.card_name || row?.subject_name || "Subject");
    const cleaned = raw
        .replace(/\bGrade\s*\d+\b/gi, "")
        .replace(/\s+\d+\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || raw || "Subject";
}

function plSubjectDefinition(row) {
    const text = plNormalizedText(plRawSubjectText(row));
    const match = PL_SUBJECT_DEFINITIONS.find((definition) => definition.match(text));
    if (match) return match;
    const fallback = plCleanSubjectName(row);
    const key = fallback.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "subject";
    return { key, label: fallback, rank: 99, match: () => false };
}

function plSubjectArea(row) {
    return plSubjectDefinition(row).label;
}

function plSubjectKey(row) {
    return plSubjectDefinition(row).key;
}

function plSubjectRank(subjectKey) {
    const item = PL_SUBJECT_DEFINITIONS.find((definition) => definition.key === subjectKey);
    return item?.rank || 99;
}

function plStatus(row) {
    if (row?.pl_mobile_status) return row.pl_mobile_status;
    if (row?.pl_monitoring_status_override) return row.pl_monitoring_status_override;
    if (row?.has_entry === false) return "Missing";
    if (row?.entry_status === "Missing") return "Missing";

    const learners = plNumber(row.number_of_learners);
    const mpsText = clean(row.mps_or_proficiency_level);
    const mps = plMpsNumber(mpsText);
    const above = plNumber(row.learners_75_mps_above);

    if (!row?.has_entry && !row?.entry_status && learners === null && !mpsText && above === null) return "Missing";
    if (learners === null || learners <= 0 || !mpsText || above === null) return "Incomplete";
    if (mps === null) return "Non numeric";
    return "Complete";
}

function plStatusClass(status) {
    const normalized = clean(status).toLowerCase();
    if (normalized === "complete") return "good";
    if (normalized === "missing") return "bad";
    return "warn";
}

function plIsMapeh(row) {
    return plSubjectKey(row) === "mapeh";
}

function plSectionKey(row) {
    return [row.school_year_id, row.grade_level, row.section_name, row.class_id, row.term].map((x) => clean(x).toLowerCase()).join("|");
}

function plTeacherName(row) {
    return clean(row?.current_teacher_name || row?.teacher_name || row?.last_teacher_name) || "No teacher";
}

function plTeacherText(group = []) {
    const names = [...new Set(group.map(plTeacherName).filter(Boolean))];
    return names.join(", ") || "No teacher";
}

function plMapehComponentLabel(row) {
    const text = plNormalizedText([row?.subject_name, row?.card_name, row?.subject_code].filter(Boolean).join(" "));
    if (text.includes("physical education") || /\bpe\b/.test(text) || text.includes("health")) return "PE and Health";
    if (text.includes("music") || text.includes("arts")) return "Music and Arts";
    return row?.subject_name || row?.card_name || "MAPEH Component";
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
        const hasNonNumeric = group.some((row) => plStatus(row).toLowerCase().includes("numeric"));
        const base = group[0] || {};
        const avg = (values) => {
            const nums = values.map(plMpsNumber).filter((value) => Number.isFinite(value));
            if (!nums.length) return null;
            return nums.reduce((a, b) => a + b, 0) / nums.length;
        };
        const avgLearners = (values) => {
            const nums = values.map(plNumber).filter((value) => Number.isFinite(value));
            if (!nums.length) return null;
            return nums.reduce((a, b) => a + b, 0) / nums.length;
        };
        const completeAll = complete.length === group.length && group.length > 0;
        normal.push({
            ...base,
            subject_area: "MAPEH",
            subject_area_name: "MAPEH",
            sf_learning_area: "MAPEH",
            card_name: "MAPEH",
            subject_name: "MAPEH",
            subject_code: "MAPEH",
            source_rows: group,
            current_teacher_name: plTeacherText(group),
            number_of_learners: completeAll ? avgLearners(complete.map((row) => row.number_of_learners)) : null,
            mps_or_proficiency_level: completeAll ? avg(complete.map((row) => row.mps_or_proficiency_level)) : null,
            learners_75_mps_above: completeAll ? avgLearners(complete.map((row) => row.learners_75_mps_above)) : null,
            pl_mobile_status: completeAll ? "Complete" : allMissing ? "Missing" : hasNonNumeric ? "Non numeric" : "Incomplete"
        });
    });
    return normal;
}

function plExpandedRows(rows = []) {
    return rows.flatMap((row) => row?.source_rows || [row]);
}

function summarizePlRows(rows) {
    const total = rows.length;
    let complete = 0;
    let missing = 0;
    let incomplete = 0;
    let learners = 0;
    let weighted = 0;
    let above = 0;

    rows.forEach((row) => {
        const status = plStatus(row);
        if (status === "Complete") {
            const learnerCount = plNumber(row.number_of_learners) || 0;
            const mps = plMpsNumber(row.mps_or_proficiency_level) || 0;
            const aboveCount = plNumber(row.learners_75_mps_above) || 0;
            complete += 1;
            learners += learnerCount;
            weighted += learnerCount * mps;
            above += aboveCount;
        } else if (status === "Missing") {
            missing += 1;
        } else {
            incomplete += 1;
        }
    });

    return {
        total,
        complete,
        missing,
        incomplete,
        learners,
        weighted,
        above,
        pl: learners ? weighted / learners : null,
        abovePercent: learners ? (above / learners) * 100 : null,
        completion: total ? (complete / total) * 100 : null
    };
}

function summarizePlBySubject(rows) {
    const map = new Map();
    rows.forEach((row) => {
        const key = plSubjectKey(row);
        const subject = plSubjectArea(row);
        if (!map.has(key)) map.set(key, { key, subject, rank: plSubjectRank(key), rows: [] });
        map.get(key).rows.push(row);
    });
    return [...map.values()]
        .map((item) => ({ ...item, ...summarizePlRows(item.rows) }))
        .sort((a, b) => (a.rank - b.rank) || a.subject.localeCompare(b.subject, undefined, { sensitivity: "base" }));
}

async function loadPlMonitoring() {
    if (!canUsePl()) {
        setMessage("plMessage", "Not available for this account.");
        return;
    }
    setMessage("plMessage", "Loading...");
    $("plSubjectCards").innerHTML = "";
    state.selectedPlSubject = null;
    state.selectedPlSubjectCard = null;
    state.selectedPlGradeGroup = null;
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
    state.plSubjectCards = cards;
    $("plSubjectCards").innerHTML = cards.map((card, index) => {
        return `
            <article class="pl-card tappable-card" data-pl-subject-index="${index}">
                <p class="card-title">${escapeHtml(card.subject)}</p>
                <p class="card-meta">${escapeHtml(activeTermLabel())} | ${card.total} subject section(s)</p>
                <div class="card-row"><span>PL</span><strong>${card.pl === null ? "—" : plFormatNumber(card.pl)}</strong></div>
                <div class="card-row"><span>75% and above</span><strong>${card.abovePercent === null ? "—" : plFormatPercent(card.abovePercent)}</strong></div>
                <div class="card-row"><span>Completion</span><span class="badge ${card.completion === 100 ? "good" : card.complete > 0 ? "warn" : "bad"}">${percentText(card.completion)}</span></div>
            </article>
        `;
    }).join("");
    $("plSubjectCards").querySelectorAll("[data-pl-subject-index]").forEach((card) => {
        card.addEventListener("click", () => openPlSubject(cards[Number(card.dataset.plSubjectIndex)]));
    });
    setMessage("plMessage", `${cards.length} subject area(s).`);
}

function plGradeLabel(grade) {
    return grade === "not_set" ? "Grade not set" : `Grade ${grade}`;
}

function buildPlGradeGroups(rows = []) {
    const groups = new Map();
    rows.forEach((row) => {
        const grade = clean(row.grade_level) || "not_set";
        if (!groups.has(grade)) groups.set(grade, { grade, rows: [] });
        groups.get(grade).rows.push(row);
    });
    return [...groups.values()]
        .map((group) => ({ ...group, ...summarizePlRows(group.rows) }))
        .sort((a, b) => {
            const gradeA = a.grade === "not_set" ? 99 : Number(a.grade);
            const gradeB = b.grade === "not_set" ? 99 : Number(b.grade);
            return gradeA - gradeB;
        });
}

function plCompletionSubtitle(group) {
    return `Completion: ${group.complete} of ${group.total} complete`;
}

function renderPlGradeCards(gradeCards) {
    $("plGradeCards").innerHTML = gradeCards.map((group, index) => {
        return `
            <article class="pl-grade-card tappable-card" data-pl-grade-index="${index}">
                <div class="pl-grade-main">
                    <p class="card-title">${escapeHtml(plGradeLabel(group.grade))}</p>
                    <p class="card-meta">${escapeHtml(plCompletionSubtitle(group))}</p>
                </div>
                <div class="pl-grade-value">
                    <span>Computed PL</span>
                    <strong>${group.pl === null ? "—" : plFormatNumber(group.pl)}</strong>
                </div>
            </article>
        `;
    }).join("");
    $("plGradeCards").querySelectorAll("[data-pl-grade-index]").forEach((card) => {
        card.addEventListener("click", () => openPlGrade(gradeCards[Number(card.dataset.plGradeIndex)]));
    });
}

function openPlSubject(card) {
    if (!card) return;
    state.selectedPlSubject = card.key;
    state.selectedPlSubjectCard = card;
    state.selectedPlGradeGroup = null;
    $("backToPlBtn").textContent = "Back";
    $("plDetailTitle").textContent = card.subject;
    $("plDetailMeta").textContent = `${activeTermLabel()} | PL by grade level`;
    const gradeCards = buildPlGradeGroups(card.rows || []);
    state.selectedPlGradeCards = gradeCards;
    renderPlGradeCards(gradeCards);
    $("plSectionList").innerHTML = gradeCards.length
        ? `<p class="message compact">Tap a grade level to view subject teachers.</p>`
        : `<p class="message compact">No grade level records found.</p>`;
    showScreen("plDetail", true);
}

function plSectionLabel(row) {
    const grade = clean(row.grade_level) ? `G${row.grade_level}` : "Grade not set";
    return `${grade} ${clean(row.section_name) || "Section not set"}`;
}

function plTeacherGroups(rows = []) {
    const groups = new Map();
    plExpandedRows(rows).forEach((row) => {
        const key = clean(row.current_teacher_employee_id || row.teacher_employee_id || row.current_teacher_name || row.teacher_name || row.last_teacher_name) || "no_teacher";
        if (!groups.has(key)) groups.set(key, { key, teacherName: plTeacherName(row), rows: [] });
        groups.get(key).rows.push(row);
    });
    return [...groups.values()]
        .map((group) => ({ ...group, ...summarizePlRows(group.rows) }))
        .sort((a, b) => a.teacherName.localeCompare(b.teacherName, undefined, { sensitivity: "base" }));
}

function openPlGrade(group) {
    if (!group || !state.selectedPlSubjectCard) return;
    state.selectedPlGradeGroup = group;
    $("backToPlBtn").textContent = "Back to Grades";
    $("plDetailTitle").textContent = `${state.selectedPlSubjectCard.subject} ${plGradeLabel(group.grade)}`;
    $("plDetailMeta").textContent = `${activeTermLabel()} | Subject teachers`;
    $("plGradeCards").innerHTML = `
        <article class="pl-grade-card">
            <div class="pl-grade-main">
                <p class="card-title">${escapeHtml(plGradeLabel(group.grade))}</p>
                <p class="card-meta">${escapeHtml(plCompletionSubtitle(group))}</p>
            </div>
            <div class="pl-grade-value">
                <span>Computed PL</span>
                <strong>${group.pl === null ? "—" : plFormatNumber(group.pl)}</strong>
            </div>
        </article>
    `;

    const teachers = plTeacherGroups(group.rows || []);
    $("plSectionList").innerHTML = teachers.length ? teachers.map((teacher) => {
        const statusClass = teacher.completion === 100 ? "good" : teacher.complete > 0 ? "warn" : "bad";
        const sections = [...new Set(teacher.rows.map((row) => {
            const component = row?.source_rows ? "" : plIsMapeh(row) ? ` | ${plMapehComponentLabel(row)}` : "";
            return `${plSectionLabel(row)}${component}`;
        }))].join("; ");
        return `
            <article class="data-card">
                <p class="card-title">${escapeHtml(teacher.teacherName)}</p>
                <p class="card-meta">${escapeHtml(sections || "No section record")}</p>
                <div class="card-row"><span>PL</span><strong>${teacher.pl === null ? "—" : plFormatNumber(teacher.pl)}</strong></div>
                <div class="card-row"><span>75% and above</span><strong>${teacher.abovePercent === null ? "—" : plFormatPercent(teacher.abovePercent)}</strong></div>
                <div class="card-row"><span>Completion</span><span class="badge ${statusClass}">${percentText(teacher.completion)}</span></div>
                <div class="card-row"><span>Status</span><span>${teacher.complete} complete, ${teacher.missing + teacher.incomplete} missing or incomplete</span></div>
            </article>
        `;
    }).join("") : `<p class="message compact">No teacher load records found for this grade level.</p>`;
}

function handlePlBack() {
    if (state.selectedPlGradeGroup && state.selectedPlSubjectCard) {
        openPlSubject(state.selectedPlSubjectCard);
        return;
    }
    showScreen("pl");
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
    $("addProficiencyBtn").addEventListener("click", openProficiencySheet);
    $("closeProficiencySheetBtn").addEventListener("click", closeProficiencySheet);
    $("cancelProficiencyBtn").addEventListener("click", closeProficiencySheet);
    $("saveProficiencyBtn").addEventListener("click", saveProficiency);
    $("proficiencySheet").addEventListener("input", (event) => {
        if (event.target.classList.contains("proficiency-input")) setMessage("proficiencyMessage", "Ready to save.");
        updateProficiencySaveState();
    });
    $("backToAdvisoryBtn").addEventListener("click", () => showScreen("advisory"));
    $("backToMonitoringBtn").addEventListener("click", () => showScreen("monitoring"));
    $("backToPlBtn").addEventListener("click", handlePlBack);
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
