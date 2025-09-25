// ======================== Configuración Google APIs ========================
const clientId = "64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com";
const SPREADSHEET_ID = "1T8YifEIUU7a6ugf_Xn5_1edUUMoYfM9loDuOQU1u2-8";
const SHEET_NAME_OBAMACARE = "Pólizas";
const SHEET_NAME_CIGNA = "Cigna Complementario";
const SHEET_NAME_PAGOS = "Pagos";
const DRIVE_FOLDER_ID = "1zxpiKTAgF6ZPDF3hi40f7CRWY8QXVqRE";
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";

// ========================= Auth Guard + fetch wrapper ======================
const LOGIN_URL = "./index.html";
const AUTH_SKEW_MS = 30_000; // 30 segundos de margen
const MAX_RETRIES = 3;

function getAuthState() {
  const sessionActive = localStorage.getItem('sessionActive');
  const authProvider = localStorage.getItem('authProvider');
  const userInfo = localStorage.getItem('userInfo');
  const tokenExpiry = localStorage.getItem('token_expiry_time');

  return {
    sessionActive: sessionActive === 'true',
    authProvider,
    userInfo: userInfo ? JSON.parse(userInfo) : null,
    accessToken: authProvider === 'google' ? 
      localStorage.getItem('google_access_token') :
      localStorage.getItem('msAccessToken'),
    tokenExpiry: tokenExpiry ? parseInt(tokenExpiry) : null
  };
}

function isTokenValid(skew = AUTH_SKEW_MS) {
  const authState = getAuthState();

  if (!authState.sessionActive) return false;

  // Para Google, verificamos expiración
  if (authState.authProvider === 'google' && authState.tokenExpiry) {
    return Date.now() < (authState.tokenExpiry - skew);
  }

  // para microsoft, asumimos que el token es válido (no tenemos expiración guardada)
  return authState.sessionActive;
}

function ensureAuthenticated ({interactive = true} = {}) {
  const auth = getAuthState();

  if (auth.sessionActive && auth.authProvider && auth.userInfo) {
    // Verificar si el token está próximo a expirar
    if (auth.authProvider === 'google' && auth.tokenExpiry) {
      const timeUntilExpiry = auth.tokenExpiry - Date.now();
            
      // Si queda menos de 5 minutos, intentar renovar
      if (timeUntilExpiry < 5 * 60 * 1000) {
        console.log('Token próximo a expirar, renovando...');
        if (typeof refreshAccessToken === 'function') {
          refreshAccessToken();
        }
      }
    }
    return true;
  }

  if (interactive) {
    promptAndRedirectToLogin("Sesión expirada. Por favor, inicia sesión nuevamente.");
  }

  return false;
}
// Wrapper para fetch con manejo automático de errores de autenticación
async function authenticatedFetch(url, options = {}, retries = MAX_RETRIES) {
    const authState = getAuthState();
    
    if (!authState.accessToken) {
        throw new Error('No hay token de acceso disponible');
    }
    
    // Configurar headers de autorización
    const headers = {
        'Authorization': `Bearer ${authState.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            // Si es error 401, intentar renovar token y reintentar
            if (response.status === 401 && attempt < retries - 1) {
                console.log(`Intento ${attempt + 1}: Error 401, renovando token...`);
                
                // Intentar renovar token
                if (typeof refreshAccessToken === 'function') {
                    await new Promise((resolve) => {
                        refreshAccessToken();
                        // Esperar un poco para que se renueve el token
                        setTimeout(resolve, 2000);
                    });
                    
                    // Actualizar token en headers
                    const newAuthState = getAuthState();
                    if (newAuthState.accessToken) {
                        headers['Authorization'] = `Bearer ${newAuthState.accessToken}`;
                        continue; // Reintentar con nuevo token
                    }
                }
                
                // Si no se puede renovar, redirigir al login
                promptAndRedirectToLogin("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
                throw new Error('Token expirado y no se pudo renovar');
            }
            
            return response;
            
        } catch (error) {
            console.error(`Error en intento ${attempt + 1}:`, error);
            
            if (attempt === retries - 1) {
                throw error;
            }
            
            // Esperar antes del siguiente intento
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
    }
}

// Redirige al login con un mensaje opcional
function promptAndRedirectToLogin(message) {
  showStatus(message, "error");
  setTimeout(() => {
    window.location.href = LOGIN_URL
  }, 2000)
}

// Funcion para cerrar sesión
function signOut() {
  // Limpiar intervalo de auto-refresh si existe
  if (window.tokenRefreshInterval) {
    clearInterval(window.tokenRefreshInterval);
  }
  
  // Limpiar toda la información de sesión
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_refresh_token');      // AGREGAR
  localStorage.removeItem('token_expiry_time');         // AGREGAR
  localStorage.removeItem('session_start_time');        // AGREGAR
  localStorage.removeItem('google_user_info');
  localStorage.removeItem('authProvider');
  localStorage.removeItem('userInfo');
  localStorage.removeItem('sessionActive');
  localStorage.removeItem('msAccessToken');
  localStorage.removeItem('dependentsDraft');

  showStatus("Has cerrado sesión.", "success");

  setTimeout(() => {
    window.location.href = "./index.html";
  }, 1500);
}

window.signOut = signOut; // hacer global para usar en HTML

// Función global para refrescar token (referenciada en ensureAuthenticated)
function refreshAccessToken() {
  console.log('Función refreshAccessToken llamada desde formulario.js');
  
  // Si la función existe en login.js, llamarla
  if (typeof window.refreshAccessToken === 'function') {
    return window.refreshAccessToken();
  } else {
    console.warn('refreshAccessToken no disponible, redirigiendo al login');
    promptAndRedirectToLogin("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
  }
}

// Hacer disponible globalmente
window.refreshAccessToken = refreshAccessToken;

// Funcion para crear el boton de cerrar sesión al formulario
function addSignOutButton() {
  const authState = getAuthState();
  if (!authState.sessionActive) return;

  // Crear botón de cerrar sesión
  const signOutBtn = document.createElement("button");
  signOutBtn.innerHTML = `
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
            <path fill-rule="evenodd" d="m15.854 8.354-3-3a.5.5 0 0 0-.708.708L14.293 8H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708z"/>
        </svg>
        Cerrar Sesión
  `;
  signOutBtn.className = "btn btn-outline-danger";
  signOutBtn.style.cssText = ` 
    position: fixed;
    top: 20px;  
    right: 20px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background-color: #dc3545;
    color: white;
    border: 1px solid #dc3545;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
  `;

  signOutBtn.addEventListener('mouseover', () => {
    signOutBtn.style.background = '#c82333';
    signOutBtn.style.borderColor = '#bd2130';
  });

  signOutBtn.addEventListener('mouseout', () => {
    signOutBtn.style.background = '#dc3545';
    signOutBtn.style.borderColor = '#dc3545';
  });
  signOutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm("¿Estás seguro que deseas cerrar sesión?")) {
      signOut();
    }
  });

document.body.appendChild(signOutBtn)
}



// =========================== Funcion para pasar entre pestañas ============================
function activateTab(tabId) {
  document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove('active'));

  const btn = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
  const tab = document.getElementById(`tab-${tabId}`);
  if (btn) btn.classList.add('active');
  if (tab) tab.classList.add('active');
}

// ============================ Pasar pagina a pagos ========================
function handlebtnSiguientePagos() {
  if (!validateObamacareFields()) return;
  activateTab("pagos");
}
document.getElementById("btnSiguientePagos")?.addEventListener("click", handlebtnSiguientePagos);

// ========================= Pasar pagina a Documentos ======================
function handlebtnSiguienteDocumentos() {
  if (!validatePagosFields()) return;
  activateTab("documentos");
}
document.getElementById("btnSiguienteDocumentos")?.addEventListener("click", handlebtnSiguienteDocumentos);

// ============================ Validaciones por pestaña =======================
function validateObamacareFields() {
  const requiredFields = {};
  
  const poBoxCheck = document.getElementById('poBoxcheck');
  if (poBoxCheck && poBoxCheck.checked) {
    requiredFields['#poBox'] = 'El campo PO Box es obligatorio';
  } else {
    requiredFields['#direccion'] = 'El campo dirección es obligatorio';
    requiredFields['#casaApartamento'] = 'El campo casa/apartamento es obligatorio';
    requiredFields['#condado'] = 'El campo condado es obligatorio';
    requiredFields['#Ciudad'] = 'El campo ciudad es obligatorio';
    requiredFields['#estado'] = 'El campo estado es obligatorio';
    requiredFields['#codigoPostal'] = 'El campo código postal es obligatorio';
  }

  requiredFields['#fechaRegistro'] = 'El campo fecha de registro es obligatorio';
  requiredFields['#Nombre'] = 'El campo nombre es obligatorio';
  requiredFields['#Apellidos'] = 'El campo apellidos es obligatorio';
  requiredFields['#sexo'] = 'El campo sexo es obligatorio';
  requiredFields['#fechaNacimiento'] = 'El campo fecha de nacimiento es obligatorio';
  requiredFields['#estadoMigratorio'] = 'El campo estado migratorio es obligatorio';
  requiredFields['#compania'] = 'El campo compañía aseguradora es obligatorio';
  requiredFields['#plan'] = 'El campo plan es obligatorio';
  requiredFields['#operador'] = 'El campo operador es obligatorio';

  return validateFields(requiredFields);
}

function validatePagosFields() {
  const metodoPago = document.querySelector('input[name="metodoPago"]:checked');
  
  if (!metodoPago) {
    return true;
  }

  let requiredFields = {};
  if (metodoPago.value === 'banco') {
    requiredFields = {
      '#numCuenta': 'El número de cuenta es obligatorio',
      '#numRuta': 'El número de ruta es obligatorio',
      '#nombreBanco': 'El nombre del banco es obligatorio',
      '#titularCuenta': 'El titular de la cuenta es obligatorio'
    };
  } else if (metodoPago.value === 'tarjeta') {
    requiredFields = {
      '#numTarjeta': 'El número de tarjeta es obligatorio',
      '#fechaVencimiento': 'La fecha de vencimiento es obligatoria',
      '#cvc': 'El CVC/CVV es obligatorio',
      '#titularTarjeta': 'El titular de la tarjeta es obligatorio'
    };
  }

  return validateFields(requiredFields);
}

function validateFields(requiredFields) {
  for (const selector in requiredFields) {
    const el = document.querySelector(selector);
    
    if (el && !el.disabled) {
      const value = el.value ? el.value.trim() : '';
      
      if (!value) {
        showStatus(requiredFields[selector], 'error');
        
        setTimeout(() => {
          el.focus();
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('invalid');
          setTimeout(() => el.classList.remove('invalid'), 3000);
        }, 100);
        
        return false;
      }
    }
  }
  return true;
}

// ========================= Formato fecha estados unidos ========================
function formatDateToUS(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
  
window.addEventListener("storage", (e) => {
  if (e.key === "google_access_token" && !e.newValue) {
    promptAndRedirectToLogin("Sesión finalizada en otra pestaña. Inicia sesión nuevamente.");
  }
});

// =============================== Utilidades ===============================
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function showStatus(msg, type = "info") {
  const box = $("#statusMessage");
  if (!box) {
    console.error("Elemento #statusMessage no encontrado");
    return;
  }
  
  box.className = `status-message ${type}`;
  box.textContent = msg;
  box.style.display = "block";
  
  const timeout = type === "error" ? 8000 : 5000;
  setTimeout(() => box.style.display = "none", timeout);
}

// Barra de carga para uploads
function showLoaderBar(show = true) {
  const loader = document.getElementById('loaderBar');
  if (!loader) return;
  loader.style.display = show ? 'flex' : 'none';
}

// Convertir formato de fecha de MM/DD/AAAA a ISO YYYY-MM-DD
function usToIso(us) {
  if (!us) return "";
  const [m, d, y] = us.split("/");
  return `${y}-${m}-${d}`;
}

// ================================ Pestañas ================================
function initTabs() {
  const buttons = $all(".tab-button");
  const contents = $all(".tab-content");
  if (!buttons.length || !contents.length) return;

  const getTargetEl = id => document.getElementById(`tab-${id}`) || document.getElementById(id);

  function activate(tabId) {
    const target = getTargetEl(tabId);
    buttons.forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
    contents.forEach(c => c.classList.toggle("active", c === target));
    if (target) target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  buttons.forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    const id = btn.dataset.tab;
    if (id) activate(id);
  }));

  const first = buttons[0]?.dataset.tab;
  if (first) activate(first);
}

// ========================== Dependientes (modal) ==========================
window.currentDependentsData = window.currentDependentsData || [];

function openDependentsModal() {
  const modal = $("#dependentsModal");
  const container = $("#modalDependentsContainer");
  if (!modal || !container) return;

  //intenta restaurar borrador
  const draft = localStorage.getItem('dependentsDraft');
  if (draft) {
    try {
      window.currentDependentsData = JSON.parse(draft);
    } catch (e) {
      window.currentDependentsData = [];
    }
  }
  container.innerHTML = "";
  if (window.currentDependentsData.length) {
    window.currentDependentsData.forEach((d) => addDependentField(d));
  } else {
    addDependentField();
  }

  const desired = parseInt($("#cantidadDependientes")?.value || "0", 10);
  if (Number.isFinite(desired) && desired >= 0) ensureDependentsCards(desired);

  modal.style.display = "block";
  updateDependentsCount();
}

function closeDependentsModal() {
  const modal = $("#dependentsModal");
  if (modal) modal.style.display = "none";
}

function updateDependentsCount() {
  const cant = $("#cantidadDependientes");
  const container = $("#modalDependentsContainer");
  if (!cant || !container) return;
  cant.value = String(container.querySelectorAll(".dependent-item-formal").length);
}

function saveDependentsData() {
  const container = $("#modalDependentsContainer");
  if (!container) return;
  const items = container.querySelectorAll(".dependent-item-formal");
  const data = [];
  let ok = true;

  items.forEach((card, i) => {
    const nombre = card.querySelector(".dependent-nombre")?.value.trim();
    const apellido = card.querySelector(".dependent-apellido")?.value.trim();
    const fechaNacimiento = card.querySelector(".dependent-fecha")?.value || "";
    const parentesco = card.querySelector(".dependent-parentesco")?.value || "";
    const ssn = card.querySelector(".dependent-ssn")?.value.trim() || "";
    const estadoMigratorio = card.querySelector(`.dependent-estado-migratorio`)?.value || "";

    if (fechaNacimiento && !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaNacimiento)) {
      ok = false;
      alert(`Formato de fecha incorrecto para Dependiente #${i+1}. Use MM/DD/AAAA.`);
      return;
    }

    const aplica = card.querySelector(".dependent-aplica")?.value || "";
    if (!nombre || !apellido || !fechaNacimiento || !parentesco || !aplica) {
      ok = false;
      alert(`Completa los campos requeridos para el Dependiente #${i+1}.`);
      return;
    }
    data.push({
      nombre,
      apellido,
      fechaNacimiento,
      parentesco,
      ssn,
      aplica,
      estadoMigratorio
    });
  });
  if (!ok) return;

  window.currentDependentsData = data;
  localStorage.setItem('dependentsDraft', JSON.stringify(data)); // <-- Guarda el draft
  updateDependentsCount();
  closeDependentsModal();
  showStatus(`✅ ${data.length} dependiente(s) guardado(s)`, "success");
}

function saveDependentsDraft() {
  const container = document.getElementById("modalDependentsContainer");
  if (!container) return;
  const items = container.querySelectorAll(".dependent-item-formal");
  const data = [];
  items.forEach((card) => {
    const nombre = card.querySelector(".dependent-nombre")?.value.trim();
    const apellido = card.querySelector(".dependent-apellido")?.value.trim();
    const fechaNacimiento = card.querySelector(".dependent-fecha")?.value || "";
    const parentesco = card.querySelector(".dependent-parentesco")?.value || "";
    const ssn = card.querySelector(".dependent-ssn")?.value.trim() || "";
    const estadoMigratorio = card.querySelector(`.dependent-estado-migratorio`)?.value || "";
    const aplica = card.querySelector(".dependent-aplica")?.value || "";

    data.push({
      nombre,
      apellido,
      fechaNacimiento,
      parentesco,
      ssn,
      estadoMigratorio
    });
  });
  localStorage.setItem('dependentsDraft', JSON.stringify(data));
}
function addDependentField(existingData = null) {
  const container = $("#modalDependentsContainer");
  if (!container) return;
  const idx = container.children.length;
  const d = existingData || {
    nombre: "",
    apellido: "",
    fechaNacimiento: "",
    parentesco: "",
    estadoMigratorio: "",
    ssn: "",
    aplica: ""
  };

  const card = document.createElement("div");
  card.className = "dependent-item-formal";
  card.setAttribute("data-index", idx);
  card.innerHTML = `
    <div class="dependent-header-formal" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--border-color);padding-bottom:10px;">
      <div class="dependent-title-formal" style="display:flex;gap:10px;align-items:center;">
        <span class="dependent-number" style="background:var(--primary-color);color:#fff;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-weight:700;">${idx + 1}</span>
        <h4 style="margin:0;">Dependiente ${idx + 1}</h4>
      </div>
      <button type="button" class="btn-remove-dependent btn btn-secondary">Eliminar</button>
    </div>

    <div class="dependent-form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">
      <div class="form-group-formal">
        <label class="form-label-formal">Nombre <span class="required-asterisk">*</span></label>
        <input type="text" class="form-input-formal dependent-nombre form-control" name="NombreDependiente" value="${d.nombre}" required>
      </div>
      <div class="form-group-formal">
        <label class="form-label-formal">Apellido <span class="required-asterisk">*</span></label>
        <input type="text" class="form-input-formal dependent-apellido form-control" name="ApellidoDependiente" value="${d.apellido}" required>
      </div>
    </div>

    <div class="dependent-form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">
      <div class="form-group-formal">
        <label class="form-label-formal">Fecha de Nacimiento (mm/dd/aaaa) <span class="required-asterisk">*</span></label>
        <input type="text" class="form-input-formal dependent-fecha form-control" name="FechaNacimientoDependiente" value="${d.fechaNacimiento}" placeholder="MM/DD/AAAA" maxlength="10" required>
      </div>
      <div class="form-group-formal">
        <label class="form-label-formal">Parentesco <span class="required-asterisk">*</span></label>
        <select class="form-input-formal dependent-parentesco form-select" name="ParentescoDependiente" required>
          <option value="">Seleccione el parentesco...</option>
          <option value="Cónyuge" ${d.parentesco === "Cónyuge" ? "selected" : ""}>Cónyuge</option>
          <option value="Hijo" ${d.parentesco === "Hijo" ? "selected" : ""}>Hijo</option>
          <option value="Hija" ${d.parentesco === "Hija" ? "selected" : ""}>Hija</option>
          <option value="Padre" ${d.parentesco === "Padre" ? "selected" : ""}>Padre</option>
          <option value="Madre" ${d.parentesco === "Madre" ? "selected" : ""}>Madre</option>
          <option value="Hermano" ${d.parentesco === "Hermano" ? "selected" : ""}>Hermano</option>
          <option value="Hermana" ${d.parentesco === "Hermana" ? "selected" : ""}>Hermana</option>
          <option value="Abuelo" ${d.parentesco === "Abuelo" ? "selected" : ""}>Abuelo/a</option>
          <option value="Abuela" ${d.parentesco === "Abuela" ? "selected" : ""}>Abuela</option>
          <option value="Otro" ${d.parentesco === "Otro" ? "selected" : ""}>Otro</option>
        </select>
      </div>
      <div class="grid-item">
        <label for="estadoMigratorio" class="form-label">Estado migratorio:</label>
        <select name="estadoMigratorio" class="form-select dependent-estado-migratorio">
          <option value="">Selecciona...</option>
          <option value="Ciudadano">Ciudadano</option>
          <option value="Residente Permanente">Residente Permanente</option>
          <option value="Permiso de trabajo">Permiso de trabajo</option>
          <option value="Asilo politico">Asilo politico</option>
          <option value="I-94">I-94</option>
          <option value="Otro">Otro</option>
        </select>  
      </div>
    </div>

    <div class="dependent-form-grid-full" style="margin-bottom:12px;">
      <div class="form-group-formal">
        <label class="form-label-formal">Número de Seguro Social (SSN)</label>
        <input type="text" class="form-input-formal dependent-ssn form-control" name="SSNDependiente" value="${d.ssn}" placeholder="###-##-####" maxlength="11">
      </div>
    </div>
    <div class="form-group-formal">
      <label class="form-label-formal">Aplica? <span class="required-asterisk">*</span></label>
      <select class="form-input-formal dependent-aplica form-select" name="AplicaDependiente" required>
        <option value="" ${d.aplica ? "selected" : ""}>Seleccione...</option>
        <option value="Si" ${d.aplica === "Si" ? "selected" : ""}>Sí</option>
        <option value="No" ${d.aplica === "No" ? "selected" : ""}>No</option>
      </select>
    </div>
  `;
  container.appendChild(card);
  setupDependentValidation(card);
  updateDependentNumbers();
  updateDependentsCount();

  card.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", saveDependentsDraft);
    el.addEventListener("change", saveDependentsDraft);
  });
}

function removeDependentField(buttonOrCard) {
  const container = $("#modalDependentsContainer");
  if (!container) return;
  const item = buttonOrCard.closest?.(".dependent-item-formal") || buttonOrCard;
  if (!item) return;
  if (container.children.length <= 1) {
    alert("Debe mantener al menos un dependiente en el formulario.");
    return;
  }
  item.remove();
  updateDependentNumbers();
  updateDependentsCount();
}

function updateDependentNumbers() {
  const container = $("#modalDependentsContainer");
  if (!container) return;
  container.querySelectorAll(".dependent-item-formal").forEach((it, i) => {
    it.setAttribute("data-index", i);
    it.querySelector(".dependent-number").textContent = i + 1;
    it.querySelector("h4").textContent = `Dependiente ${i + 1}`;
  });
}

function setupDependentValidation(card) {
  card.querySelectorAll(".form-input-formal[required]").forEach((el) => {
    el.addEventListener("input", () => {
      el.classList.toggle("invalid", !el.value.trim());
      el.classList.toggle("valid", !!el.value.trim());
    });
  });
  const ssn = card.querySelector(".dependent-ssn");
  if (ssn) {
    ssn.addEventListener("input", (e) => {
      const v = e.target.value.replace(/\D/g, "").slice(0, 9);
      if (v.length <= 3) e.target.value = v;
      else if (v.length <= 5) e.target.value = `${v.slice(0, 3)}-${v.slice(3)}`;
      else e.target.value = `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5)}`;
    });
  }
}

function ensureDependentsCards(n) {
  const container = $("#modalDependentsContainer");
  if (!container) return;
  const cur = container.querySelectorAll(".dependent-item-formal").length;
  if (n > cur) {
    for (let i = cur; i < n; i++) addDependentField();
  } else if (n < cur) {
    const items = Array.from(container.querySelectorAll(".dependent-item-formal")).reverse();
    for (let i = 0; i < cur - n && items[i]; i++) removeDependentField(items[i]);
  }
  updateDependentsCount();
}

// ================================ PO Box ==================================
function initPOBox() {
    const chk = $("#poBoxcheck");
    const poBoxInput = $("#poBox");
    const addressInputs = $all('#direccion, #casaApartamento, #condado, #Ciudad, #codigoPostal');
    
    if (!chk || !poBoxInput) return;
    
    const toggle = () => {
        const isChecked = chk.checked;
        poBoxInput.disabled = !isChecked;
        poBoxInput.required = isChecked;

        addressInputs.forEach(el => {
            el.disabled = isChecked;
            el.required = !isChecked;
            if(isChecked) el.value = '';
        });
    };
    
    chk.addEventListener("change", toggle);
    toggle();
}

// ================================ Pagos ===================================
function initPayment() {
  const rbBanco = $("#pagoBanco");
  const rbTarjeta = $("#pagoTarjeta");
  const boxBanco = $("#pagoBancoContainer");
  const boxTarjeta = $("#pagoTarjetaContainer");
  if (!rbBanco || !rbTarjeta || !boxBanco || !boxTarjeta) return;
  const refresh = () => {
    boxBanco.classList.toggle("active", rbBanco.checked);
    boxTarjeta.classList.toggle("active", rbTarjeta.checked);
  };
  rbBanco.addEventListener("change", refresh);
  rbTarjeta.addEventListener("change", refresh);
  refresh();

  const clearPaymentBtn = $("#clearPaymentBtn");
  if (clearPaymentBtn) {
    clearPaymentBtn.addEventListener("click", () => {
      rbBanco.checked = false;
      rbTarjeta.checked = false;
      refresh();

      const bankInputs = boxBanco.querySelectorAll("input");
      const cardInputs = boxTarjeta.querySelectorAll("input");

      bankInputs.forEach(input => input.value = "");
      cardInputs.forEach(input => input.value = "");

      showStatus("✅ Datos de pago limpiados", "success");
    });
  }
  refresh();
}

// ========================= Formateos básicos ==============================
function attachSSNFormatting() {
  ["#SSN", "#socialCuenta"].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener("input", (e) => {
      const v = e.target.value.replace(/\D/g, "").slice(0, 9);
      if (v.length <= 3) e.target.value = v;
      else if (v.length <= 5) e.target.value = `${v.slice(0, 3)}-${v.slice(3)}`;
      else e.target.value = `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5)}`;
    });
  });
}

function attachCurrencyFormatting() {
  ["#ingresos", "#prima", "#creditoFiscal", "#cignaDeducible", "#cignaPrima", "#beneficioDiario"].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener("input", (e) => {
        let val = e.target.value.replace(/[^0-9,.]/g, "");
        const parts = val.split('.');
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
        e.target.value = val;
    });
    el.addEventListener("blur", (e) => {
      const num = parseFloat(e.target.value.replace(/,/g, ''));
      if (isNaN(num)) {
        e.target.value = '';
        return;
      }
      e.target.value = `$${num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
    });
    el.addEventListener("focus", (e) => {
      e.target.value = e.target.value.replace(/[^0-9.]/g, '');
    });
  });
}

// Lógica de máscara de fecha para el formato mm/dd/aaaa
function attachDateInputMask(selector) {
  const el = $(selector);
  if (!el) return;
  el.addEventListener('input', function(e) {
      let value = e.target.value.replace(/\D/g, '');
      let formattedValue = '';
      if (value.length > 0) {
          formattedValue = value.substring(0, 2);
          if (value.length > 2) {
              formattedValue += '/' + value.substring(2, 4);
          }
          if (value.length > 4) {
              formattedValue += '/' + value.substring(4, 8);
          }
      }
      e.target.value = formattedValue;
  });
  el.addEventListener('blur', function(e) {
      const value = e.target.value.replace(/\D/g, '');
      if (value.length > 0 && value.length !== 8) {
          e.target.value = '';
          showStatus("Formato de fecha incorrecto. Use MM/DD/AAAA.", 'error');
      }
  });
}

// =================== Documentos y Audio (uploads) ========================
function initUploads() {
  const addBtn = $("#addUploadFieldBtn");
  const container = $("#customUploadContainer");
  if (!addBtn || !container) return;

// Funcion para mostrar el tamaño del archivo de una forma en que se pueda entender mejor KB MB GB
  function fileSizeHuman(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024,
      sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

// Funcion para eliminar un campo de carga
  function removeField(field) {
    const total = $all(".upload-field", container).length;
    // Verifica si hay más de un campo, si no, muestra un mensaje de error porque siempre debe haber uno
    if (total <= 1) {
      alert("Debe mantener al menos un archivo.");
      return;
    }
    field.remove();
    renumber();
  }

  // Muestra el nombre del archivo
  function onFileChange(input, nombreEl, infoEl) {
    if (input.files && input.files[0]) {
      const f = input.files[0];
      infoEl.textContent = `${f.name} — ${fileSizeHuman(f.size)}`;
      infoEl.style.display = "block";
      nombreEl.disabled = false;
      nombreEl.required = true;
    } else {
      infoEl.textContent = "";
      infoEl.style.display = "none";
      nombreEl.disabled = true;
      nombreEl.required = false;
      nombreEl.value = "";
    }
  }

  // Agrega un nuevo campo de carga
  function addField() {
    const idx = $all(".upload-field", container).length;
    const field = document.createElement("div");
    field.className = "upload-field grid-item full-width";
    field.innerHTML = `
      <div class="upload-field-formal">
        <div class="upload-header">
          <label class="form-label-formal upload-title">Archivo ${idx + 1}</label>
          <button type="button" class="delete-upload-field-btn btn btn-secondary">Eliminar</button>
        </div>
        <div class="form-group-upload">
          <label class="form-label-formal">Nombre del archivo en Drive <span class="required-asterisk">*</span></label>
          <input type="text" class="form-input-formal archivo-nombre"
                 name="driveFileName[${idx}]" placeholder="Ej: Identificación Juan Perez" disabled>
          <div class="form-hint">Se usará como nombre final en Drive</div>
        </div>
        <div class="form-group-upload">
          <label class="form-label-formal">Seleccionar archivo <span class="required-asterisk">*</span></label>
          <input type="file" class="form-control upload-input"
                 name="uploadFiles[${idx}]" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.mp3,.wav,.m4a">
          <div class="file-info" style="display:none"></div>
        </div>
      </div>
    `;
    const delBtn = field.querySelector(".delete-upload-field-btn");
    const fileEl = field.querySelector(".upload-input");
    const nameEl = field.querySelector(".archivo-nombre");
    const infoEl = field.querySelector(".file-info");

    delBtn.addEventListener("click", () => removeField(field));
    fileEl.addEventListener("change", () => onFileChange(fileEl, nameEl, infoEl));
    nameEl.addEventListener("input", (e) => {
      e.target.classList.toggle("invalid", !e.target.value.trim());
      e.target.classList.toggle("valid", !!e.target.value.trim());
    });

    container.insertBefore(field, addBtn.parentElement);
  }

  function renumber() {
    $all(".upload-field", container).forEach((f, i) => {
      f.querySelector(".upload-title").textContent = `Archivo ${i + 1}`;
      f.querySelector(".archivo-nombre").name = `driveFileName[${i}]`;
      f.querySelector(".upload-input").name = `uploadFiles[${i}]`;
    });
  }

  addBtn.addEventListener("click", (e) => {
    e.preventDefault();
    addField();
    renumber();
  });
  if (!$all(".upload-field", container).length) addField();
}

function validateUploadsOrThrow() {
  const blocks = $all("#customUploadContainer .upload-field");
  for (const b of blocks) {
    const file = b.querySelector(".upload-input")?.files?.[0];
    const name = b.querySelector(".archivo-nombre");
    if (file) {
      if (!name.value.trim()) {
        document.querySelector('.tab-button[data-tab="documentos"]')?.click();
        name.focus();
        throw new Error("Ingrese el nombre para el archivo seleccionado.");
      }
    }
  }
}

// ====================== Cigna: tarjetas dinámicas =========================
function initCignaPlans() {
  const addBtn = $("#addCignaPlanBtn");
  const container = $("#cignaPlanContainer");
  if (!addBtn || !container) return;

  let counter = 0;

  addBtn.addEventListener("click", () => {
    const i = counter++;
    const card = document.createElement("div");
    card.className = "cigna-plan-card card";
    card.innerHTML = `
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h2>Plan Cigna ${i + 1}</h2>
        <button type="button" class="btn btn-secondary cigna-remove">Eliminar</button>
      </div>
      <div class="card-body form-grid">
        <div class="grid-item">
          <label class="form-label">Tipo de plan</label>
          <select id="cignaPlanTipo_${i}" class="form-select cigna-tipo">
            <option value="">Seleccione…</option>
            <option value="Dental">Dental</option>
            <option value="Accidente">Accidente</option>
            <option value="Hospitalario">Hospitalario</option>
          </select>
        </div>
        <div class="grid-item">
          <label class="form-label">Tipo de cobertura</label>
          <input id="cignaCoberturaTipo_${i}" class="form-control" placeholder="Ej: Individual / Familiar">
        </div>
        <div class="grid-item">
          <label class="form-label">Beneficio</label>
          <input id="cignaBeneficio_${i}" class="form-control" placeholder="Ej: $1000 anual">
        </div>
        <div class="grid-item">
          <label class="form-label">Deducible</label>
          <input type="text" id="cignaDeducible_${i}" class="form-control" placeholder="Ej: 200.00">
        </div>
        <div class="grid-item">
          <label class="form-label">Prima</label>
          <input type="text" id="cignaPrima_${i}" class="form-control" placeholder="Ej: 25.00">
        </div>
        <div class="grid-item full-width">
          <label class="form-label">Comentarios</label>
          <textarea id="cignaComentarios_${i}" class="form-control" placeholder="Notas del plan"></textarea>
        </div>
        <div class="grid-item hospitalario-only" style="display:none;">
          <label class="form-label">Beneficio por día (hospitalario)</label>
          <input type="text" id="beneficioDiario_${i}" class="form-control" placeholder="Ej: 150.00">
        </div>
        <div class="grid-item full-width accidente-only" style="display:none;">
          <div class="form-grid">
            <div class="grid-item">
              <label class="form-label">Beneficiario nombre</label>
              <input id="beneficiarioNombre_${i}" class="form-control">
            </div>
            <div class="grid-item">
              <label class="form-label">Fecha nacimiento</label>
              <input type="text" id="beneficiarioFechaNacimiento_${i}" class="form-control" placeholder="MM/DD/AAAA" maxlength="10">
            </div>
            <div class="grid-item">
              <label class="form-label">Dirección</label>
              <input id="beneficiarioDireccion_${i}" class="form-control">
            </div>
            <div class="grid-item">
              <label class="form-label">Relación</label>
              <input id="beneficiarioRelacion_${i}" class="form-control" placeholder="Cónyuge, Hijo/a…">
            </div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);

    const tipoSel = card.querySelector(".cigna-tipo");
    const hosp = card.querySelector(".hospitalario-only");
    const acc = card.querySelector(".accidente-only");
    const onTipoChange = () => {
      const v = tipoSel.value;
      hosp.style.display = v === "Hospitalario" ? "" : "none";
      acc.style.display = v === "Accidente" ? "" : "none";
    };
    tipoSel.addEventListener("change", onTipoChange);
    attachCurrencyFormatting();
    attachDateInputMask(`#beneficiarioFechaNacimiento_${i}`);

    card.querySelector(".cigna-remove").addEventListener("click", () => {
      card.remove();
      [...container.querySelectorAll(".cigna-plan-card")].forEach((el, idx2) => {
        const h2 = el.querySelector(".card-header h2");
        if (h2) h2.textContent = `Plan Cigna ${idx2 + 1}`;
      });
    });
  });
}

function collectAllCignaPlansWithDynamicFields() {
  const plans = [];
  const cards = document.querySelectorAll(".cigna-plan-card");
  cards.forEach((card, index) => {
    const plan = {
      tipo: card.querySelector(`.cigna-tipo`)?.value || "",
      coberturaTipo: card.querySelector(`#cignaCoberturaTipo_${index}`)?.value || "",
      beneficio: card.querySelector(`#cignaBeneficio_${index}`)?.value || "",
      deducible: card.querySelector(`#cignaDeducible_${index}`)?.value || "",
      prima: card.querySelector(`#cignaPrima_${index}`)?.value || "",
      comentarios: card.querySelector(`#cignaComentarios_${index}`)?.value || "",
      beneficioDiario: card.querySelector(`#beneficioDiario_${index}`)?.value || "",
      beneficiarioNombre: card.querySelector(`#beneficiarioNombre_${index}`)?.value || "",
      beneficiarioFechaNacimiento: card.querySelector(`#beneficiarioFechaNacimiento_${index}`)?.value || "",
      beneficiarioDireccion: card.querySelector(`#beneficiarioDireccion_${index}`)?.value || "",
      beneficiarioRelacion: card.querySelector(`#beneficiarioRelacion_${index}`)?.value || "",
    };
    if (plan.tipo) plans.push(plan);
  });
  return plans;
}

// ============================ Recolección general =========================
function collectData() {
  const data = {
    fechaRegistro: formatDateToUS($("#fechaRegistro")?.value) || "",
    nombre: $("#Nombre")?.value?.trim() || "",
    apellidos: $("#Apellidos")?.value?.trim() || "",
    sexo: $("#sexo")?.value || "",
    correo: $("#correo")?.value?.trim() || "",
    telefono: $("#telefono")?.value?.trim() || "",
    fechaNacimiento: $("#fechaNacimiento")?.value || "",
    estadoMigratorio: $("#estadoMigratorio")?.value || "",
    ssn: $("#SSN")?.value || "",
    ingresos: $("#ingresos")?.value || "",
    ocupación: $("#ocupación")?.value?.trim() || "",
    nacionalidad: $("#nacionalidad")?.value?.trim() || "",
    aplica: $("#aplica")?.value || "",
    cantidadDependientes: $("#cantidadDependientes")?.value || "0",
    direccion: $("#direccion")?.value?.trim() || "",
    casaApartamento: $("#casaApartamento")?.value?.trim() || "",
    condado: $("#condado")?.value?.trim() || "",
    ciudad: $("#Ciudad")?.value?.trim() || "",
    estado: $("#estado")?.value || "",
    codigoPostal: $("#codigoPostal")?.value?.trim() || "",
    poBox: $("#poBoxcheck")?.checked ? $("#poBox")?.value?.trim() || "" : "",
    compania: $("#compania")?.value || "",
    plan: $("#plan")?.value?.trim() || "",
    creditoFiscal: $("#creditoFiscal")?.value || "",
    prima: $("#prima")?.value || "",
    link: $("#link")?.value?.trim() || "",
    tipoVenta: $("#tipoVenta")?.value || "",
    operador: $("#operador")?.value || "",
    claveSeguridad: $("#claveSeguridad")?.value?.trim() || "",
    observaciones: $("#observaciones")?.value?.trim() || "",
    metodoPago: $("#pagoBanco")?.checked ? "banco" : $("#pagoTarjeta")?.checked ? "tarjeta" : "",
    pagoBanco: {
      numCuenta: $("#numCuenta")?.value?.trim() || "",
      numRuta: $("#numRuta")?.value?.trim() || "",
      nombreBanco: $("#nombreBanco")?.value?.trim() || "",
      titularCuenta: $("#titularCuenta")?.value?.trim() || "",
      socialCuenta: $("#socialCuenta")?.value || "",
    },
    pagoTarjeta: {
      numTarjeta: $("#numTarjeta")?.value?.trim() || "",
      fechaVencimiento: $("#fechaVencimiento")?.value?.trim() || "",
      cvc: $("#cvc")?.value?.trim() || "",
      titularTarjeta: $("#titularTarjeta")?.value?.trim() || "",
    },
  };
  return data;
}

// ============================ Validaciones de datos obligatorios =======================
function validateClientData() {
  // Validar Obamacare
  if (!validateObamacareFields()) {
    activateTab('obamacare');
    return false;
  }

  // Validar Pagos
  if (!validatePagosFields()) {
    activateTab('pagos');
    return false;
  }

  // Validar documentos
  try {
    validateUploadsOrThrow();
  } catch (error) {
    activateTab('documentos');
    showStatus(error.message, 'error');
    return false;
  }

  return true;
}

// =================================== API ===================================
const BACKEND_URL = "https://asesoriasth-backend.onrender.com/api"; // Cambia esto a tu URL real

async function sendFormDataToSheets(data) {
  if (!ensureAuthenticated({
      interactive: true
    })) {
    throw new Error("No estás autenticado. Por favor, inicia sesión de nuevo.");
  }

  const accessToken = localStorage.getItem("google_access_token");
  if (!accessToken) {
    throw new Error("Token de acceso no disponible. Inicia sesión.");
  }
  
  const clientId = `CLI-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

  const obamacareData = [
    data.operador,
    data.fechaRegistro,
    data.tipoVenta,
    data.claveSeguridad,
    'Titular',
    data.nombre,
    data.apellidos,
    data.sexo,
    data.correo,
    data.telefono,
    data.fechaNacimiento,
    data.estadoMigratorio,
    data.ssn,
    data.ingresos,
    data.ocupación,
    data.nacionalidad,
    data.aplica,
    data.cantidadDependientes,
    data.poBox || (data.direccion + (data.casaApartamento ? ', ' + data.casaApartamento : '') + ', ' + data.condado + ', ' + data.ciudad + ', ' + data.estado + ', ' + data.codigoPostal),
    data.compania,
    data.plan,
    data.creditoFiscal,
    data.prima,
    data.link,
    data.observaciones,
    clientId,
  ];

  const obamacareUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME_OBAMACARE}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await fetch(obamacareUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [obamacareData]
      }),
    })
    .then((res) => {
      if (!res.ok) throw new Error("Error al guardar datos de Obamacare.");
      return res.json();
    });
  
  if (data.dependents && data.dependents.length > 0) {
    const dependentsRows = data.dependents.map(dep => [
        data.operador || '', 
        data.fechaRegistro || '',
        data.tipoVenta || '',
        data.claveSeguridad || '',
        dep.parentesco || '',
        dep.nombre || '',
        dep.apellido || '',
        '', // Sexo
        '', // Correo
        '', // Teléfono
        dep.fechaNacimiento || '',
        dep.estadoMigratorio || '',
        dep.ssn || '',
        '', // Ingresos
        '', // Ocupación
        '', // Nacionalidad
        dep.aplica || '',
        '', // Cantidad de dependientes
        '', // Dirección completa
        '', // Compañía
        '',
        '',
        '',
        '',
        '',
        clientId
    ]);
    const dependentsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME_OBAMACARE}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    await fetch(dependentsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values: dependentsRows })
    })
    .then(res => {
      if (!res.ok) throw new Error("Error al guardar los dependientes en la hoja.");
      return res.json();
    });
  }

  if (data.cignaPlans && data.cignaPlans.length > 0) {
    const cignaValues = data.cignaPlans.map((p) => [
        clientId,
        new Date().toLocaleDateString('es-ES'),
        p.parentesco || '',
        `${data.nombre} ${data.apellidos}`,
        data.telefono || '',
        data.sexo || '',
        p.fechaNacimiento || '',
        data.poBox || (data.direccion + (data.casaApartamento ? ', ' + data.casaApartamento : '') + ', ' + data.condado + ', ' + data.ciudad + ', ' + data.codigoPostal),
        data.correo || '',
        data.estadoMigratorio || '',
        data.ssn || '',
        `${p.beneficiarioNombre || ''} / ${p.beneficiarioFechaNacimiento || ''} / ${p.beneficiarioDireccion || ''} / ${p.beneficiarioRelacion || ''}`,
        p.tipo,
        p.coberturaTipo,
        p.beneficio,
        p.beneficioDiario,
        p.deducible,
        p.prima,
        p.comentarios,
    ]);

    const cignaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME_CIGNA}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    await fetch(cignaUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: cignaValues
        }),
      })
      .then((res) => {
        if (!res.ok) throw new Error("Error al guardar datos de Cigna.");
        return res.json();
      });
  }

  if (data.metodoPago) {
    let pagoData = [
        clientId,
        `${data.nombre} ${data.apellidos}`,
        data.telefono,
        data.metodoPago,
    ];
    if (data.metodoPago === "banco") {
        pagoData = pagoData.concat([
            data.pagoBanco.numCuenta,
            data.pagoBanco.numRuta,
            data.pagoBanco.nombreBanco,
            data.pagoBanco.titularCuenta,
            data.pagoBanco.socialCuenta,
            data.observaciones,
        ]);
    } else if (data.metodoPago === "tarjeta") {
        pagoData = pagoData.concat([
            data.pagoTarjeta.numTarjeta,
            data.pagoTarjeta.fechaVencimiento,
            data.pagoTarjeta.titularTarjeta,
            data.pagoTarjeta.cvc,
            data.observaciones,
        ]);
    }

    const pagosUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME_PAGOS}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    await fetch(pagosUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [pagoData]
        }),
      })
      .then((res) => {
        if (!res.ok) throw new Error("Error al guardar datos de pagos.");
        return res.json();
      });
  }

  return clientId;
}

async function uploadFilesToBackend(files) {
  if (files.length === 0) return;

  showStatus("Creando carpeta en Drive...", "info");
  // 1. Crear la carpeta en Drive
  let folderId = null;
  try {
    const nombre = window.lastFormData?.nombre || "";
    const apellidos = window.lastFormData?.apellidos || "";
    const folderName = `${nombre} ${apellidos} ${window.lastFormData?.telefono || ""}`.trim();
    const res = await fetch(`${BACKEND_URL}/create-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName })
    });
    const data = await res.json();
    if (!res.ok || !data.folderId) {
      throw new Error(data.error || "No se pudo crear la carpeta en Drive.");
    }
    folderId = data.folderId;
  } catch (error) {
    showStatus("Error al crear la carpeta en Drive: " + error.message, "error");
    await new Promise(resolve => setTimeout(resolve, 3000));
    return;
  }

  // 2. Subir archivos a la carpeta creada
  showStatus("Subiendo archivos...", "info");
  const formData = new FormData();
  files.forEach(fileData => {
    formData.append("files", fileData.file, fileData.name);
  });
  formData.append("folderId", folderId);
  formData.append("nombre", window.lastFormData?.nombre || "");
  formData.append("apellidos", window.lastFormData?.apellidos || "");
  formData.append("telefono", window.lastFormData?.telefono || "");

  try {
    const response = await fetch(`${BACKEND_URL}/upload-files`, {
      method: "POST",
      body: formData
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Error desconocido al subir archivos.");
    }
    showStatus("✅ Archivos subidos a Drive correctamente.", "success");
    await new Promise(resolve => setTimeout(resolve, 1500));
  } catch (error) {
    showStatus("Ocurrió un error al procesar tu solicitud: " + error.message, "error");
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
async function onSubmit(e) {
  e.preventDefault();
  
  if (!validateClientData()) {
    return;
  }

  const data = collectData();
  data.cignaPlans = collectAllCignaPlansWithDynamicFields();
  data.dependents = window.currentDependentsData;

  const fileInputs = document.querySelectorAll("#customUploadContainer .upload-input");
  const filesToUpload = [];
  fileInputs.forEach(input => {
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const driveFileName = input.closest(".upload-field").querySelector(".archivo-nombre").value;
      filesToUpload.push({ file: file, name: driveFileName || file.name });
    }
  });

  if (!data.nombre || !data.apellidos) {
    showStatus("Los campos 'Nombres' y 'Apellidos' son obligatorios.", "error");
    return;
  }
  
  try {
    showStatus("Enviando datos del formulario a Google Sheets...", "info");
    const clientId = await sendFormDataToSheets(data);
    // Store last form data for file upload
    window.lastFormData = data;
    if (filesToUpload.length > 0) {
      await uploadFilesToBackend(filesToUpload);
    }
    function resetFormState() {
        document.getElementById('dataForm').reset();
        window.currentDependentsData = [];
        localStorage.removeItem("dependentsDraft");
        const uploadFields = $all(".upload-field:not(:first-child)");
        uploadFields.forEach(field => field.remove());
        const poBoxCheck = $("#poBoxcheck");
        if (poBoxCheck) poBoxCheck.checked = false;
        initPOBox();
        document.querySelector('.tabs-nav .tab-button').click();
        showStatus("✅ Formulario y archivos procesados exitosamente!", "success");
    }
    resetFormState();
  } catch (error) {
    console.error("Error al enviar el formulario:", error);
    showStatus("Ocurrió un error al procesar tu solicitud: " + error.message, "error");
  }
}

// =============================== Init global ==============================
document.addEventListener("DOMContentLoaded", () => {
ensureAuthenticated({
    interactive: true
  });
  setInterval(() => ensureAuthenticated({
    interactive: false
  }), 60_000);
  localStorage.removeItem('dependentsDraft'); // Limpia el borrador de dependientes al cargar la página
  addSignOutButton();

  // Mostrar información del usuario
  const authState = getAuthState();
  if (authState.userInfo) {
    const userName = document.getElementById("userName");
    if (userName) {
      userName.textContent = authState.userInfo.name;
    }
  };

  initTabs();
  initPOBox();
  initPayment();
  attachSSNFormatting();
  attachCurrencyFormatting();
  initUploads();
  initCignaPlans();
  attachDateInputMask('#fechaNacimiento');

  const addBtn = $("#addDependentsBtn");
  const editBtn = $("#editDependentsBtn");
  const closeBtn = $("#closeDependentsModal");
  const modal = $("#dependentsModal");
  const container = $("#modalDependentsContainer");
  const cantidad = $("#cantidadDependientes");

  if (addBtn) addBtn.addEventListener("click", openDependentsModal);
  if (editBtn) editBtn.addEventListener("click", openDependentsModal);
  if (closeBtn) closeBtn.addEventListener("click", closeDependentsModal);
  if (modal) modal.addEventListener("click", (e) => {
    if (e.target === modal) closeDependentsModal();
  });

  const modalBody = modal?.querySelector(".modal-body");
  if (modalBody && !modalBody.querySelector("#addDependent") && !modalBody.querySelector("#saveDependentsBtn")) {
    const actions = document.createElement("div");
    actions.className = "grid-item full-width button-dependent-section";
    actions.innerHTML = `
          <button type="button" id="addDependent" class="btn btn-primary">Añadir otro</button>
          <button type="button" id="saveDependentsBtn" class="btn btn-success">Guardar</button>
      `;
    modalBody.appendChild(actions);
  }
  if ($("#addDependent")) $("#addDependent").addEventListener("click", () => addDependentField());
  if ($("#saveDependentsBtn")) $("#saveDependentsBtn").addEventListener("click", saveDependentsData);

  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-remove-dependent");
      if (btn) removeDependentField(btn);
    });
  }
  if (cantidad) {
    cantidad.addEventListener("change", () => {
      const n = Math.max(0, parseInt(cantidad.value || "0", 10) || 0);
      const container = document.getElementById("modalDependentsContainer");
      if (n === 0) {
        // Elimina todos los dependientes del DOM y del draft
        if (container) container.innerHTML = "";
        window.currentDependentsData = [];
        localStorage.removeItem("dependentsDraft");
      } else {
        const cur = (window.currentDependentsData || []).length;
        if (n > cur) {
          for (let i = cur; i < n; i++)
            window.currentDependentsData.push({
              nombre: "",
              apellido: "",
              fechaNacimiento: "",
              parentesco: "",
              ssn: "",
              aplica: "",
              estadoMigratorio: ""
            });
        } else if (n < cur) {
          window.currentDependentsData = window.currentDependentsData.slice(0, n);
        }
      }
    });
  }
function closeDependentsModal() {
  const modal = $("#dependentsModal");
  const cantidad = $("#cantidadDependientes");
  if (modal) modal.style.display = "none";
  if (cantidad && parseInt(cantidad.value, 10) === 0) {
    const container = document.getElementById("modalDependentsContainer");
    if (container) container.innerHTML = "";
    window.currentDependentsData = [];
    localStorage.removeItem("dependentsDraft");
  }
}

  const form = document.getElementById("dataForm");
  if (form) {
    form.addEventListener("submit", onSubmit);
  } else {
    console.error("No se encontró el formulario con id 'dataForm'. Verifica el HTML.");
  }
});

// Compatibilidad por si quedaran handlers inline antiguos:
window.addDependentField = addDependentField;
window.removeDependentField = removeDependentField;
window.saveDependentsData = saveDependentsData;
