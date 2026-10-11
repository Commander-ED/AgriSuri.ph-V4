// ============================================================
// auth.js — Logic ng Login at Register Forms
// Ginagamit ng auth.html
// ============================================================

// ── GLOBAL STATE ─────────────────────────────────────────────
// Sinisigurado nito kung anong tab ang currently active
// 'login' o 'register' — ginagamit sa handleFormSubmit()
let currentTab = 'login';

// ── FUNCTION: switchTab(tab) ─────────────────────────────────
// Tinatawag kapag nag-click ang user ng "Mag-login" o "Mag-register" tab
// Itinatago o ipinapakita ang mga extra fields (Name, Confirm Password)
// depende sa kung anong tab ang pinili
function switchTab(tab) {
    currentTab = tab; // I-update ang global state

    // Kunin ang mga HTML elements na kailangan nating baguhin
    const loginBtn     = document.getElementById('tab-login');
    const regBtn       = document.getElementById('tab-register');
    const nameGroup    = document.getElementById('group-name');       // Name field
    const confirmGroup = document.getElementById('group-confirm');    // Confirm password field
    const confirmInput = document.getElementById('input-confirm');
    const nameInput    = document.getElementById('input-name');

    if (tab === 'login') {
        // ── LOGIN TAB ─────────────────────────────────────────
        // Itago ang Name at Confirm Password — hindi kailangan sa login
        loginBtn.classList.add('active');
        regBtn.classList.remove('active');
        nameGroup.classList.add('hidden');
        confirmGroup.classList.add('hidden');

        // Alisin ang 'required' para hindi mag-block ang form validation
        confirmInput.removeAttribute('required');
        if (nameInput) nameInput.removeAttribute('required');

    } else {
        // ── REGISTER TAB ──────────────────────────────────────
        // Ipakita ang Name at Confirm Password — kailangan sa pagpaparehistro
        regBtn.classList.add('active');
        loginBtn.classList.remove('active');
        nameGroup.classList.remove('hidden');
        confirmGroup.classList.remove('hidden');

        // Idagdag ang 'required' para hindi makapag-submit nang walang laman
        confirmInput.setAttribute('required', 'true');
        if (nameInput) nameInput.setAttribute('required', 'true');
    }
}

// ── FUNCTION: togglePasswordVisibility(inputId, btn) ─────────
// Tinatawag kapag nag-click ang user ng Eye icon sa password field
// Nagpapalit ng password field mula sa hidden (●●●) papunta sa visible text
// at vice versa — kasama ang pagpapalit ng Eye icon mismo
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId); // Kunin ang password input
    const svg   = btn.querySelector('svg');          // Kunin ang Eye icon SVG

    if (input.type === 'password') {
        // ── SHOW PASSWORD ─────────────────────────────────────
        input.type = 'text'; // I-convert sa plain text — makikita na ang password
        btn.setAttribute('aria-label', 'Hide password');

        // Palitan ang icon ng Eye-Off (slashed eye) para ipakita na "visible" na
        svg.innerHTML = `
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
            <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
            <line x1="2" y1="2" x2="22" y2="22"></line>
        `;
    } else {
        // ── HIDE PASSWORD ─────────────────────────────────────
        input.type = 'password'; // I-convert pabalik sa hidden
        btn.setAttribute('aria-label', 'Show password');

        // Palitan ang icon ng normal Eye para ipakita na "hidden" na ulit
        svg.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
    }
}

// ── FUNCTION: clearForm() ─────────────────────────────────────
// Tinatawag kapag nag-click ang user ng "Clear" button
// Nililinis ang lahat ng form fields at iri-reset ang password visibility
function clearForm() {
    document.getElementById('auth-form').reset(); // Built-in HTML form reset

    // I-reset ang lahat ng password fields pabalik sa hidden mode
    // (Baka may nag-click ng Eye button bago mag-clear)
    const passInputs = document.querySelectorAll('.password-wrapper input');
    passInputs.forEach(input => input.type = 'password');

    showToast('Form fields cleared'); // Ipakita ang confirmation message
}

// ── FUNCTION: handleFormSubmit(e) ────────────────────────────
// Tinatawag kapag nag-click ang user ng "Submit" button
// Nag-va-validate ng form data bago mag-process
// TODO: Palitan ng actual Supabase auth calls
function handleFormSubmit(e) {
    e.preventDefault(); // Pigilan ang default browser form submission (page reload)

    const email = document.getElementById('input-email').value;

    if (currentTab === 'register') {
        // ── REGISTER VALIDATION ───────────────────────────────
        const pass    = document.getElementById('input-password').value;
        const confirm = document.getElementById('input-confirm').value;

        // I-check kung magkatugma ang password at confirm password
        if (pass !== confirm) {
            showToast('Hindi magkatugma ang password!');
            return; // Ihinto ang execution — huwag mag-proceed
        }

        // TODO: Dagdag dito ang Supabase signUp() call
        // await supabase.auth.signUp({ email, password: pass })
        showToast(`Matagumpay na na-register: ${email}`);

    } else {
        // ── LOGIN ─────────────────────────────────────────────
        // TODO: Dagdag dito ang Supabase signInWithPassword() call
        // await supabase.auth.signInWithPassword({ email, password })
        showToast(`Matagumpay na naka-login: ${email}`);
    }
}

// ── FUNCTION: showToast(message) ─────────────────────────────
// Nagpapakita ng temporary notification sa ibaba ng screen
// Awtomatikong nawawala pagkatapos ng 3 segundo
// Ginagamit ng clearForm() at handleFormSubmit()
function showToast(message) {
    const toast = document.getElementById('toast-msg');
    toast.textContent = message;       // Ilagay ang message text
    toast.classList.add('show');       // I-trigger ang CSS animation (slide up)

    // Awtomatikong itago pagkatapos ng 3 segundo (3000 milliseconds)
    setTimeout(() => {
        toast.classList.remove('show'); // I-trigger ang hide animation (slide down)
    }, 3000);
}
