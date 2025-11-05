// ======================== Configuración Google APIs ========================
const clientId = "64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com";
const SPREADSHEET_ID = "1T8YifEIUU7a6ugf_Xn5_1edUUMoYfM9loDuOQU1u2-8";
const SHEET_NAME_OBAMACARE = "Pólizas";
const SHEET_NAME_CIGNA = "Cigna Complementario";
const SHEET_NAME_PAGOS = "Pagos";
const SHEET_NAME_DRAFTS = "Borrador";
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

async function ensureAuthenticated({interactive = true} = {}) {
  const auth = getAuthState();

  if (!auth.sessionActive || !auth.authProvider || !auth.userInfo) {
    if (interactive) {
      promptAndRedirectToLogin("Sesión expirada. Por favor, inicia sesión nuevamente.");
    }
    return false;
  }

  // Solo verificar expiración para Google
  if (auth.authProvider === 'google') {
    const tokenExpiry = auth.tokenExpiry;
    if (tokenExpiry) {
      const timeUntilExpiry = tokenExpiry - Date.now();
      
      // Si queda menos de 5 minutos, intentar renovar
      if (timeUntilExpiry < 5 * 60 * 1000) {
        console.log('⏰ Token próximo a expirar, renovando...');
        
        // Evitar múltiples renovaciones simultáneas
        if (!window.isRefreshingToken) {
          try {
            const refreshed = await refreshAccessToken();
            if (!refreshed) {
              if (interactive) {
                promptAndRedirectToLogin("Sesión expirada. Por favor, inicia sesión nuevamente.");
              }
              return false;
            }
          } catch (error) {
            console.error('❌ Error renovando token:', error);
            if (interactive) {
              promptAndRedirectToLogin("Error renovando sesión. Por favor, inicia sesión nuevamente.");
            }
            return false;
          }
        }
      }
    }
  }
  
  return true;
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
      
      // Si es error 401, intentar renovar token SOLO UNA VEZ
      if (response.status === 401 && attempt === 0) {
        console.log(`🔄 Error 401 detectado, intentando renovar token...`);
        
        // Intentar renovar token solo si no estamos ya renovando
        if (!window.isRefreshingToken) {
          try {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
              // Actualizar token en headers y reintentar
              const newAuthState = getAuthState();
              headers['Authorization'] = `Bearer ${newAuthState.accessToken}`;
              continue; // Reintentar con nuevo token
            }
          } catch (error) {
            console.error('❌ Error renovando en authenticatedFetch:', error);
          }
        }
        
        // Si no se pudo renovar, redirigir al login
        promptAndRedirectToLogin("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
        throw new Error('Token expirado y no se pudo renovar');
      }
      
      return response;
      
    } catch (error) {
      console.error(`❌ Error en intento ${attempt + 1}:`, error);
            
            if (attempt === retries - 1) {
                throw error;
            }
      
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
async function refreshAccessToken() {
  console.log('🔄 Intentando renovar token...');
  
  // Verificar si ya hay una renovación en progreso
  if (window.isRefreshingToken) {
    console.log('⏳ Ya hay una renovación en progreso, esperando...');
    return false;
  }
  
  // Marcar que estamos renovando
  window.isRefreshingToken = true;
  
  try {
    const refreshToken = localStorage.getItem('google_refresh_token');
    if (!refreshToken) {
      console.error('❌ No hay refresh token disponible');
      throw new Error('No refresh token available');
    }
    
    const clientId = "64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com";
    
    console.log('🌐 Haciendo petición de renovación...');
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });
    
    const tokens = await response.json();
    
    if (!response.ok || tokens.error) {
      console.error('❌ Error renovando token:', tokens.error || response.status);
      
      // Si el refresh token es inválido, limpiar todo y redirigir
      if (tokens.error === 'invalid_grant' || response.status === 400) {
        localStorage.clear();
        promptAndRedirectToLogin("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
        return false;
      }
      
      throw new Error(tokens.error_description || tokens.error || 'Error renovando token');
    }
    
    // Actualizar tokens
    localStorage.setItem('google_access_token', tokens.access_token);
    localStorage.setItem('token_expiry_time', Date.now() + (tokens.expires_in * 1000));
    
    // Si viene un nuevo refresh token, actualizarlo
    if (tokens.refresh_token) {
      localStorage.setItem('google_refresh_token', tokens.refresh_token);
    }
    
    console.log('✅ Token renovado exitosamente');
    return true;
    
  } catch (error) {
    console.error('❌ Error crítico renovando token:', error);
    
    // En caso de error, limpiar sesión y redirigir
    localStorage.clear();
    promptAndRedirectToLogin("Error renovando sesión. Por favor, inicia sesión nuevamente.");
    return false;
    
  } finally {
    // Siempre limpiar el flag de renovación
    window.isRefreshingToken = false;
  }
}

// Hacer disponible globalmente
// window.refreshAccessToken = refreshAccessToken;

window.refreshFormAccessToken = refreshAccessToken; // Alias

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
  if (document.getElementById('estadoMigratorio').value === 'Ciudadano') {
    requiredFields['#SSN'] = 'El campo SSN es obligatorio';
  }
  requiredFields['#email'] = 'El campo email es obligatorio';
  requiredFields['#telefono'] = 'El campo teléfono es obligatorio';
  requiredFields['#ingresos'] = 'El campo ingresos es obligatorio';
  requiredFields['#nacionalidad'] = 'El campo nacionalidad es obligatorio';
  requiredFields['#ocupación'] = 'El campo ocupación es obligatorio';
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
export const $ = (sel, root = document) => root.querySelector(sel);
export const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function showStatus(msg, type = "info") {
  const box = $("#statusMessage");
  if (!box) {
    console.error("Elemento #statusMessage no encontrado");
    return;
  }
  
  box.innerHTML = '';

  const msgText = document.createElement('span');
  msgText.textContent = msg;
  msgText.style.flexGrow = 1;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'x';
  closeBtn.className = "close-status-btn";
  closeBtn.setAttribute('aria-label', 'Cerrar mensaje');

  closeBtn.addEventListener('click', () => {
    box.style.display = 'none';
    clearTimeout(box.timer);
  });

  box.appendChild(msgText);
  box.appendChild(closeBtn);

  box.className = `status-message ${type}`;
  box.style.display = "flex";
  
  const timeout = type === "error" ? 8000 : 5000;

  if (box.timer) clearTimeout(box.timer);

  box.timer = setTimeout(() => {
    box.style.display = "none"; 
  }, timeout);
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

// ========================== Dependientes (sección colapsable) ==========================
window.currentDependentsData = window.currentDependentsData || [];

// Función para toggle (expandir/colapsar) la sección de dependientes
function toggleDependentsSection() {
  const section = document.querySelector(".dependents-section");
  const content = $("#dependentsContent");
  const toggleBtn = $("#toggleDependentsBtn");
  
  if (!content) return;
  
  if (content.classList.contains('show')) {
    content.classList.remove('show');
    content.style.display = 'none';
    section?.classList.remove('expanded');
  } else {
    content.classList.add('show');
    content.style.display = 'block';
    section?.classList.add('expanded');
  }
}

// Función para abrir/expandir la sección de dependientes
function openDependentsSection() {
  const container = $("#dependentsContainer");
  const content = $("#dependentsContent");
  const section = document.querySelector(".dependents-section");
  
  if (!container) return;

  // Intenta restaurar borrador
  const draft = localStorage.getItem('dependentsDraft');
  if (draft) {
    try {
      window.currentDependentsData = JSON.parse(draft);
    } catch (e) {
      window.currentDependentsData = [];
    }
  }
  
  // Si hay dependientes guardados, cargarlos
  if (window.currentDependentsData.length) {
    container.innerHTML = "";
    window.currentDependentsData.forEach((d) => addDependentField(d));
  }

  // Expandir la sección si no está expandida
  if (!content.classList.contains('show')) {
    content.classList.add('show');
    content.style.display = 'block';
    section?.classList.add('expanded');
  }
  
  updateDependentsCount();
}

// Función de compatibilidad con código antiguo
function closeDependentsModal() {
  // Mantener para compatibilidad, pero ya no cierra nada automáticamente
  saveDependentsData();
}

function updateDependentsCount() {
  const cant = $("#cantidadDependientes");
  const container = $("#dependentsContainer");
  const badge = $("#dependentsCountBadge");
  
  if (!container) return;
  
  const count = container.querySelectorAll(".dependent-item-formal").length;
  
  if (cant) {
    cant.value = String(count);
  }
  
  if (badge) {
    badge.textContent = String(count);
  }
}

function saveDependentsData() {
  const container = $("#dependentsContainer");
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
  if (!ok) return false;

  window.currentDependentsData = data;
  localStorage.setItem('dependentsDraft', JSON.stringify(data));
  updateDependentsCount();
  showStatus(`✅ ${data.length} dependiente(s) guardado(s)`, "success");
  return true;
}

function saveDependentsDraft() {
  const container = document.getElementById("dependentsContainer");
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
      estadoMigratorio,
      aplica
    });
  });
  localStorage.setItem('dependentsDraft', JSON.stringify(data));
}
function addDependentField(existingData = null) {
  const container = $("#dependentsContainer");
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
        <input type="text" class="form-input-formal dependent-fecha form-control" name="FechaNacimientoDependiente" value="${d.fechaNacimiento}" placeholder="mm/dd/aaaa" maxlength="10" required>
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
  if (d.estadoMigratorio) {
    const estadoEl = card.querySelector('.dependent-estado-migratorio');
    if (estadoEl) {
      estadoEl.value = d.estadoMigratorio;
    }
  }
  setupDependentValidation(card);
  updateDependentNumbers();
  updateDependentsCount();

  card.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", saveDependentsDraft);
    el.addEventListener("change", saveDependentsDraft);
  });
  
  // Expandir automáticamente la sección cuando se agrega un dependiente
  const content = $("#dependentsContent");
  const section = document.querySelector(".dependents-section");
  if (!content.classList.contains('show')) {
    content.classList.add('show');
    content.style.display = 'block';
    section?.classList.add('expanded');
  }
}

function removeDependentField(buttonOrCard) {
  const container = $("#dependentsContainer");
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
  saveDependentsDraft();
}

function updateDependentNumbers() {
  const container = $("#dependentsContainer");
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
  const container = $("#dependentsContainer");
  if (!container) return;
  const cur = container.querySelectorAll(".dependent-item-formal").length;
  if (n > cur) {
    for (let i = 0; i < n - cur; i++) addDependentField();
  } else if (n < cur) {
    const allCards = Array.from(container.querySelectorAll(".dependent-item-formal"));
    for (let i = cur - 1; i >= n; i--) allCards[i]?.remove();
  }
  updateDependentNumbers();
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
    telefono2: $("#telefono2")?.value.trim() || "",
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
    pagoObservacionTarjeta: $("#pagoObservacionTarjeta")?.value?.trim() || "",
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
const BACKEND_URL = "https://asesoriasth-backend-88xb.onrender.com"; // Cambia esto a tu URL real

async function sendFormDataToSheets(data) {
  console.log("Enviando datos al Backend...", data);
  showStatus("Enviando datos al servidor...", "info");

  try {
    const response = await fetch(`${BACKEND_URL}/api/submit-form-data`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Error del backend:', result.error);
      throw new Error(result.error || `Error al guardar datos. Código: ${response.status}`);
    }

    console.log('Datos guardados por el backend exitosamente. ID de cliente:', result.clientId);
    return result
   } catch (error) {
    console.error('Error detallado en sendFormDataToSheets:', error);
    throw new Error(`Error enviando datos: ${error.message}`);
  }
}

async function uploadFilesToBackend(files, folderNameFromSheets) {
  if (files.length === 0) return;

  showStatus("Creando carpeta en Drive...", "info");
  // 1. Crear la carpeta en Drive
  let folderId = null;
  try {
    // const nombre = window.lastFormData?.nombre || "";
    // const apellidos = window.lastFormData?.apellidos || "";
    // const folderName = `${nombre} ${apellidos} ${window.lastFormData?.telefono || ""}`.trim();
    const folderName = folderNameFromSheets;

    if (!folderName) throw new Error("No se puedo generar el nombre de la carpeta");

    const res = await fetch(`${BACKEND_URL}/api/create-folder`, {
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
    const response = await fetch(`${BACKEND_URL}/api/upload-files`, {
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
  e.stopPropagation();

  const submitBtn = document.getElementById('submitBtn');

  if (submitBtn) {
    if (submitBtn.disabled) {
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    submitBtn.classList.add('btn-loading');
  }
  
  showLoaderBar(true);
  
  try {
    // Validar datos del cliente
    if (!validateClientData()) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar datos';
        submitBtn.classList.remove('btn-loading');
      }
      showLoaderBar(false);
      return;
    }

    // Recolectar todos los datos
    const data = collectData();
    data.cignaPlans = collectAllCignaPlansWithDynamicFields();
    data.dependents = window.currentDependentsData || [];

    // Validar campos esenciales
    if (!data.nombre || !data.apellidos) {
      showStatus("Los campos 'Nombres' y 'Apellidos' son obligatorios.", "error");
      showLoaderBar(false);
      return;
    }
    
    // Recolectar archivos
    const fileInputs = document.querySelectorAll("#customUploadContainer .upload-input");
    const filesToUpload = [];
    
    fileInputs.forEach(input => {
      if (input.files && input.files.length > 0) {
        const file = input.files[0];
        const driveFileName = input.closest(".upload-field").querySelector(".archivo-nombre").value;
        if (driveFileName) {
          filesToUpload.push({ file: file, name: driveFileName });
        }
      }
    });

    console.log('📋 Enviando datos:', {
      nombre: data.nombre,
      dependientes: data.dependents?.length || 0,
      cignaPlans: data.cignaPlans?.length || 0,
      archivos: filesToUpload.length
    });


    // Enviar datos del formulario
    showStatus("Enviando datos del formulario...", "info");
    // const clientId = await sendFormDataToSheets(data); // Se usaba para enviar por el frontend
    const sheetResult = await sendFormDataToSheets(data);
    const clientId = sheetResult.clientId;
    const folderName = sheetResult.folderName;

    console.log('✅ Formulario enviado con ID:', clientId);
    
    // Guardar datos para upload de archivos
    window.lastFormData = data;
    
    // Subir archivos si hay
    if (filesToUpload.length > 0) {
      showStatus("enviando archivos...", "info", );
      await uploadFilesToBackend(filesToUpload, folderName);
    }

    // Eliminar borrador guardado
    await clearAllDraftsAfterSubmit(clientId);

    // Resetear formulario
    resetFormState();
    showStatus("✅ Formulario y archivos procesados exitosamente!", "success");

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar datos';
      submitBtn.classList.remove('btn-loading');
    }

  } catch (error) {
    console.error("❌ Error completo en onSubmit:", error);
    showStatus(`Error procesando formulario: ${error.message}`, "error");

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar datos';
      submitBtn.classList.remove('brn-loading');
    }

  } finally {
    showLoaderBar(false);
  }
}

// Funcion para borrar el draft
async function clearAllDraftsAfterSubmit(clientId) {
  console.log("Limpiando borradores...");
  try {
    const localDraftExists = localStorage.getItem('obamacareDraft');
    if (localDraftExists) {
      localStorage.removeItem('obamacareDraft');
      console.log("✅ Borrador local eliminado");
    }
    // Marcar el borrador en Sheets como enviado
    await markDraftsAsSentInSheets(clientId);

    // Limpiar auto-guardado
    if (window.autoSaveInterval) {
      clearInterval(window.autoSaveInterval);
      window.autoSaveInterval = null;
      console.log("✅ Auto-guardado detenido");
    }

    // Limpiar flags de borrador
    window.hasDraftBeenModified = false;
    window.lastAutosaveData = null;

    console.log("✅ Proceso de limpieza de borradores completado");
  } catch (error) {
    console.error("Error limpiando borradores:", error);
  }
}

async function markDraftsAsSentInSheets(clientId) {
  console.log('📝 Marcando borradores como enviados en Sheets...');
  
  try {
    // Obtener todos los borradores actuales
    const draftsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Borrador!A:S`;
    
    const response = await authenticatedFetch(draftsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.log('⚠️ No se pudo acceder a la hoja de borradores');
      return;
    }

    const result = await response.json();
    const rows = result.values || [];

    if (rows.length <= 1) { // Solo encabezados o vacío
      console.log('ℹ️ No hay borradores para marcar');
      return;
    }

    // Buscar borradores activos y marcarlos como enviados
    const updates = [];
    
    for (let i = 1; i < rows.length; i++) { // Empezar desde 1 para saltar encabezados
      const row = rows[i];
      const estado = row[18]; // Columna S (Estado)
      
      // Si el borrador está "Activo", marcarlo como "Enviado"
      if (estado === 'Activo') {
        const rowIndex = i + 1; // +1 porque las filas de Sheets empiezan en 1
        updates.push({
          range: `Borrador!S${rowIndex}`,
          values: [['Enviado']]
        });
        
        // También actualizar con información del envío
        const timestampRange = `Borrador!T${rowIndex}`;
        updates.push({
          range: timestampRange,
          values: [[`Enviado: ${new Date().toLocaleString('es-ES')} | Client ID: ${clientId}`]]
        });
      }
    }

    // Aplicar actualizaciones en lote si hay alguna
    if (updates.length > 0) {
      const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`;
      
      const batchUpdateResponse = await authenticatedFetch(batchUpdateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updates
        }),
      });

      if (batchUpdateResponse.ok) {
        console.log(`✅ ${updates.length / 2} borradores marcados como enviados en Sheets`);
      } else {
        console.log('⚠️ Error marcando borradores en Sheets');
      }
    } else {
      console.log('ℹ️ No hay borradores activos para marcar');
    }

  } catch (error) {
    console.error('⚠️ Error marcando borradores como enviados:', error);
    // No lanzar error para no interrumpir el flujo principal
  }
}

// AGREGAR función para resetear el formulario:
function resetFormState() {
  try {
    // Resetear formulario
    const form = document.getElementById('dataForm');
    if (form) form.reset();
    
    // Limpiar dependientes
    window.currentDependentsData = [];
    localStorage.removeItem("dependentsDraft");

    // Limpiar planes borradores
    localStorage.removeItem('formDraft');
    
    // Resetear uploads (mantener solo el primero)
    const uploadContainer = document.getElementById('customUploadContainer');
    if (uploadContainer) {
      const uploadFields = uploadContainer.querySelectorAll(".upload-field:not(:first-child)");
      uploadFields.forEach(field => field.remove());
      
      // Limpiar el primer campo
      const firstField = uploadContainer.querySelector('.upload-field');
      if (firstField) {
        const fileInput = firstField.querySelector('.upload-input');
        const nameInput = firstField.querySelector('.archivo-nombre');
        const infoDiv = firstField.querySelector('.file-info');
        
        if (fileInput) fileInput.value = '';
        if (nameInput) {
          nameInput.value = '';
          nameInput.disabled = true;
        }
        if (infoDiv) infoDiv.style.display = 'none';
      }
    }
    
    // Resetear PO Box
    const poBoxCheck = document.getElementById("poBoxcheck");
    if (poBoxCheck) {
      poBoxCheck.checked = false;
      initPOBox(); // Reinicializar lógica
    }

    // Limpiar planes borradores
    window.hasDraftBeenModified = false;
    window.lastAutosaveData = null;
    
    // Volver a la primera pestaña
    const firstTab = document.querySelector('.tabs-nav .tab-button');
    if (firstTab) firstTab.click();
    
    console.log('✅ Formulario reseteado exitosamente');
    
  } catch (error) {
    console.error('Error reseteando formulario:', error);
  }
}

// =============================== Init global ==============================
document.addEventListener("DOMContentLoaded", async () => {
  console.log('🚀 Iniciando aplicación...');
  
  try {
    // Verificar autenticación inicial
    const isAuthenticated = await ensureAuthenticated({interactive: true});
    if (!isAuthenticated) {
      console.log('❌ Usuario no autenticado, redirigiendo...');
      return;
    }
    
    console.log('✅ Usuario autenticado correctamente');
    
    // Configurar verificación periódica (cada 10 minutos en lugar de cada minuto)    
  } catch (error) {
    console.error('❌ Error crítico en inicialización:', error);
    promptAndRedirectToLogin("Error iniciando aplicación. Por favor, inicia sesión nuevamente.");
    return;
  }
  
  // Resto de la inicialización...
  localStorage.removeItem('dependentsDraft');
  addSignOutButton();

  // Mostrar información del usuario
  const authState = getAuthState();
  if (authState.userInfo) {
    const userName = document.getElementById("userName");
    if (userName) {
      userName.textContent = authState.userInfo.name;
    }
  }

  initTabs();
  initPOBox();
  initPayment();
  attachSSNFormatting();
  attachCurrencyFormatting();
  initUploads();
  initCignaPlans();
  attachDateInputMask('#fechaNacimiento');

  // ===== Configurar botones de borrador =====
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', (e) => {
      e.preventDefault();
      saveDraft();
    });
    console.log('✅ Botón "Guardar borrador" configurado');
  }

  // Verificar si hay borrador existente
  setTimeout(() => {
    checkForExistingDraft();
  }, 1000); // Esperar un segundo para que la página esté completamente cargada

  // Configurar auto-guardado
  setupAutoSave();
  console.log('✅ Auto-guardado configurado');

  const addBtn = $("#addDependentsBtn");
  const toggleBtn = $("#toggleDependentsBtn");
  const container = $("#dependentsContainer");
  const cantidad = $("#cantidadDependientes");

  // Event listener para agregar dependiente
  if (addBtn) addBtn.addEventListener("click", () => {
    addDependentField();
    openDependentsSection();
  });
  
  // Event listener para toggle (expandir/colapsar)
  if (toggleBtn) toggleBtn.addEventListener("click", toggleDependentsSection);
  
  // También hacer que el header completo sea clickeable para toggle
  const header = $("#dependentsToggleHeader");
  if (header) {
    header.addEventListener("click", (e) => {
      // No hacer toggle si se clickeó el botón de agregar
      if (!e.target.closest('#addDependentsBtn') && !e.target.closest('#toggleDependentsBtn')) {
        toggleDependentsSection();
      }
    });
  }

  // Event listener para eliminar dependientes
  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-remove-dependent");
      if (btn) removeDependentField(btn);
    });
  }
  
  // Deshabilitar el campo cantidad (ahora es solo lectura)
  if (cantidad) {
    cantidad.readOnly = true;
  }

function closeDependentsModal() {
  // Mantener para compatibilidad con código antiguo
  saveDependentsData();
}

  // Configurar evento del formulario principal
  const dataForm = document.getElementById('dataForm');
  if (dataForm) {
    dataForm.addEventListener('submit', onSubmit);
    dataForm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.target.tagName.toLoweCase() === 'textarea') {
          return;
        }

        const formElements = Array.from(dataForm.elements);
        const currentElementIndex = formElements.indexOf(e.target);
        const nextElement = formElements[currentElementIndex + 1];

        if (nextElement && nextElement.tagname.toLoweCase() !== 'button') {
          nextElement.focus();
        }
      }
    })
  } else {
    console.error('❌ No se encontró el formulario con id "dataForm"');
  }

  console.log('✅ Aplicación inicializada correctamente');
});

// ========================== Funciones de Borrador ==========================

// Guardar borrador del formulario
async function saveDraft() {
  try {
    console.log('💾 Iniciando guardado de borrador...');
    
    const data = collectData();
    data.dependents = window.currentDependentsData || [];
    data.cignaPlans = collectAllCignaPlansWithDynamicFields();
    
    // Agregar timestamp e ID
    data.draftTimestamp = new Date().toISOString();
    data.draftId = `DRAFT-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    
    console.log('📋 Datos recolectados:', {
      id: data.draftId,
      timestamp: data.draftTimestamp,
      nombre: data.nombre || 'N/A',
      apellidos: data.apellidos || 'N/A',
      telefono: data.telefono || 'N/A',
      dependents: data.dependents?.length || 0,
      cignaPlans: data.cignaPlans?.length || 0,
      totalFields: Object.keys(data).length
    });
    
    // Mostrar indicador de guardado
    showStatus('💾 Guardando borrador...', 'info');

    // Guardar en localStorage primero (respaldo)
    localStorage.setItem('formDraft', JSON.stringify(data));
    console.log('✅ Borrador guardado en localStorage');
    showStatus('Guardado localmente', 'success')
    
  } catch (error) {
    console.error('❌ Error guardando borrador:', error);
    showStatus('❌ Error crítico: No se pudo guardar el borrador', 'error');
  }
}

//Funcion para calcular porcentaje de completado:
function calculateCompletionPercentage(data) {
  let completed = 0;
  let total = 20; // Base de campos importantes
  
  const requiredFields = [
    'nombre', 'apellidos', 'telefono', 'correo', 'fechaNacimiento',
    'estadoMigratorio', 'compania', 'plan', 'operador', 'fechaRegistro'
  ];

  const optionalFields = [
    'sexo', 'telefono2', 'ssn', 'ingresos', 'ocupación', 'nacionalidad',
    'aplica', 'direccion', 'casaApartamento', 'condado', 'ciudad',
    'estado', 'codigoPostal', 'creditoFiscal', 'prima', 'link', 
    'tipoVenta', 'claveSeguridad', 'observaciones'
  ];

  // Contar campos obligatorios completados (peso 2)
  requiredFields.forEach(field => {
    if (data[field] && data[field].toString().trim() !== '') {
      completed += 2; // Campos obligatorios valen más
    }
    total += 2;
  });

  // Contar campos opcionales completados (peso 1)
  optionalFields.forEach(field => {
    if (data[field] && data[field].toString().trim() !== '') {
      completed += 1;
    }
    total += 1;
  });

  // Bonus por dependientes
  if (data.dependents && data.dependents.length > 0) {
    completed += data.dependents.length;
    total += Math.max(1, data.dependents.length);
  }

  // Bonus por planes Cigna
  if (data.cignaPlans && data.cignaPlans.length > 0) {
    completed += data.cignaPlans.length;
    total += Math.max(1, data.cignaPlans.length);
  }

  // Bonus por método de pago
  if (data.metodoPago) {
    completed += 2;
    total += 2;
  }

  const percentage = Math.min(100, Math.round((completed / total) * 100));
  return `${percentage}%`;
}
// Agregar funcion para obtener secciones completas
function getCompletedSections(data) {
  const sections = [];

  // Datos personales básicos
  if (data.nombre && data.apellidos && data.telefono) {
    sections.push('Datos Personales');
  }

  // Información adicional
  if (data.fechaNacimiento && data.estadoMigratorio) {
    sections.push('Información Personal');
  }

  // Dirección
  if (data.direccion || data.poBox) {
    sections.push('Dirección');
  }

  // Seguro
  if (data.compania && data.plan) {
    sections.push('Seguro de Salud');
  }

  // Dependientes
  if (data.dependents && data.dependents.length > 0) {
    sections.push(`Dependientes (${data.dependents.length})`);
  }

  // Planes Cigna
  if (data.cignaPlans && data.cignaPlans.length > 0) {
    sections.push(`Planes Cigna (${data.cignaPlans.length})`);
  }

  // Método de Pago
  if (data.metodoPago) {
    sections.push('Método de Pago');
  }

  // Documentos (si hay archivos seleccionados)
  const fileInputs = document.querySelectorAll("#customUploadContainer .upload-input");
  let hasFiles = false;
  fileInputs.forEach(input => {
    if (input.files && input.files.length > 0) {
      hasFiles = true;
    }
  });
  if (hasFiles) {
    sections.push('Documentos');
  }

  return sections; // ¡IMPORTANTE: Agregar return!
}
// Cargar borrador del formulario
function loadDraft() {
  try {
    const savedDraft = localStorage.getItem('formDraft');
    
    if (!savedDraft) {
      showStatus('ℹ️ No hay borrador guardado', 'info');
      return false;
    }
    
    console.log('📂 Cargando borrador...');
    const data = JSON.parse(savedDraft);
    
    // Mostrar información del borrador
    const draftDate = data.draftTimestamp ? new Date(data.draftTimestamp).toLocaleString() : 'Fecha desconocida';
    const confirmLoad = confirm(
      `¿Deseas cargar el borrador guardado?\n\n` +
      `📅 Guardado: ${draftDate}\n` +
      `👥 Dependientes: ${data.dependents?.length || 0}\n` +
      `🏥 Planes Cigna: ${data.cignaPlans?.length || 0}\n\n` +
      `Esto reemplazará los datos actuales del formulario.`
    );
    
    if (!confirmLoad) {
      return false;
    }
    
    // Cargar datos principales
    fillFormWithData(data);
    
    // Cargar dependientes
    if (data.dependents && data.dependents.length > 0) {
      window.currentDependentsData = data.dependents;
      const cantidadInput = document.getElementById('cantidadDependientes');
      if (cantidadInput) {
        cantidadInput.value = data.dependents.length;
      }
      
      // Cargar dependientes en la UI
      const container = $("#dependentsContainer");
      if (container) {
        container.innerHTML = "";
        data.dependents.forEach((dep) => addDependentField(dep));
      }
      
      // Actualizar el badge
      updateDependentsCount();
    }
    
    // Cargar planes Cigna
    if (data.cignaPlans && data.cignaPlans.length > 0) {
      loadCignaPlansFromData(data.cignaPlans);
    }
    
    showStatus('✅ Borrador cargado exitosamente', 'success');
    console.log('✅ Borrador cargado:', data.draftId);
    
    return true;
    
  } catch (error) {
    console.error('❌ Error cargando borrador:', error);
    showStatus('❌ Error al cargar borrador: ' + error.message, 'error');
    return false;
  }
}

// Llenar formulario con datos
function fillFormWithData(data) {
  console.log('📝 Rellenando formulario con datos...');
  
  // Campos principales del formulario
  const fieldMap = {
    'fechaRegistro': 'fechaRegistro',
    'Nombre': 'nombre',
    'Apellidos': 'apellidos',
    'sexo': 'sexo',
    'correo': 'correo',
    'telefono': 'telefono',
    'telefono2': 'telefono2',
    'fechaNacimiento': 'fechaNacimiento',
    'estadoMigratorio': 'estadoMigratorio',
    'SSN': 'ssn',
    'ingresos': 'ingresos',
    'ocupación': 'ocupación',
    'nacionalidad': 'nacionalidad',
    'aplica': 'aplica',
    'cantidadDependientes': 'cantidadDependientes',
    'direccion': 'direccion',
    'casaApartamento': 'casaApartamento',
    'condado': 'condado',
    'ciudad': 'ciudad',
    'estado': 'estado',
    'codigoPostal': 'codigoPostal',
    'compania': 'compania',
    'plan': 'plan',
    'creditoFiscal': 'creditoFiscal',
    'prima': 'prima',
    'link': 'link',
    'observaciones': 'observaciones'
  };
  
  Object.entries(fieldMap).forEach(([fieldId, dataKey]) => {
    const element = document.getElementById(fieldId);
    if (element && data[dataKey] !== undefined && data[dataKey] !== null) {
      element.value = data[dataKey];
      
      // Trigger events para campos especiales
      if (['ingresos', 'prima', 'creditoFiscal'].includes(fieldId)) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
  
  // Manejar checkboxes especiales
  const poBoxCheck = document.getElementById('poBoxcheck');
  if (poBoxCheck && data.poBox) {
    poBoxCheck.checked = true;
    poBoxCheck.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  // Manejar método de pago
  if (data.metodoPago) {
    const metodoRadio = document.querySelector(`input[name="metodoPago"][value="${data.metodoPago}"]`);
    if (metodoRadio) {
      metodoRadio.checked = true;
      metodoRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // Cargar datos específicos del método de pago
    if (data.metodoPago === 'banco' && data.pagoBanco) {
      fillPaymentData('banco', data.pagoBanco);
    } else if (data.metodoPago === 'tarjeta' && data.pagoTarjeta) {
      fillPaymentData('tarjeta', data.pagoTarjeta);
    }
  }
}

// Llenar datos de pago
function fillPaymentData(method, paymentData) {
  const prefix = method === 'banco' ? 'banco' : 'tarjeta';
  
  Object.entries(paymentData).forEach(([key, value]) => {
    const element = document.getElementById(`pago${prefix.charAt(0).toUpperCase() + prefix.slice(1)}${key.charAt(0).toUpperCase() + key.slice(1)}`);
    if (element && value !== undefined && value !== null) {
      element.value = value;
    }
  });
}

// Cargar planes Cigna desde datos
function loadCignaPlansFromData(cignaPlans) {
  console.log('🏥 Cargando planes Cigna desde borrador...');
  
  const container = document.getElementById('cignaPlansContainer');
  if (!container) return;
  
  // Limpiar planes existentes
  container.innerHTML = '';
  
  // Agregar cada plan
  cignaPlans.forEach((plan, index) => {
    const planElement = createCignaFormSection(index);
    container.appendChild(planElement);
    
    // Llenar datos del plan
    Object.entries(plan).forEach(([key, value]) => {
      const element = planElement.querySelector(`[name="cigna_${key}"]`);
      if (element && value !== undefined && value !== null) {
        element.value = value;
      }
    });
  });
}

// Eliminar borrador
function deleteDraft() {
  const confirmDelete = confirm('¿Estás seguro de que deseas eliminar el borrador guardado?');
  
  if (confirmDelete) {
    localStorage.removeItem('formDraft');
    showStatus('🗑️ Borrador eliminado', 'info');
    console.log('🗑️ Borrador eliminado');
  }
}

// Verificar si hay borrador al cargar
function checkForExistingDraft() {
  const savedDraft = localStorage.getItem('formDraft');
  
  if (savedDraft) {
    try {
      const data = JSON.parse(savedDraft);
      const draftDate = data.draftTimestamp ? new Date(data.draftTimestamp).toLocaleString() : 'Fecha desconocida';
      
      // Mostrar notificación discreta
      const notification = document.createElement('div');
      notification.className = 'draft-notification';
      notification.innerHTML = `
        <div class="draft-notification-header">
          <span style="font-size: 20px;">💾</span>
          <span>Borrador Disponible</span>
          <button class="draft-notification-close" onclick="this.closest('.draft-notification').remove()">×</button>
        </div>
        <div class="draft-notification-content">
          📅 ${draftDate}<br>
          👥 ${data.dependents?.length || 0} dependientes<br>
          🏥 ${data.cignaPlans?.length || 0} planes Cigna
        </div>
        <div class="draft-notification-actions">
          <button class="btn-load" onclick="loadDraft(); this.closest('.draft-notification').remove();">
            Cargar
          </button>
          <button class="btn-delete" onclick="deleteDraft(); this.closest('.draft-notification').remove();">
            Eliminar
          </button>
        </div>
      `;
      
      document.body.appendChild(notification);
      
      // Auto-ocultar después de 10 segundos
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 10000);
      
    } catch (error) {
      console.error('Error verificando borrador existente:', error);
    }
  }
}

// Alternar menú de borrador
function toggleDraftMenu() {
  const menu = document.getElementById('draftMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
  
  // Cerrar menú al hacer clic fuera
  setTimeout(() => {
    document.addEventListener('click', function closeDraftMenu(e) {
      const draftControls = e.target.closest('.draft-controls');
      if (!draftControls) {
        const menu = document.getElementById('draftMenu');
        if (menu) menu.style.display = 'none';
        document.removeEventListener('click', closeDraftMenu);
      }
    });
  }, 0);
}

// Exportar borrador como archivo JSON
function exportDraft() {
  try {
    const savedDraft = localStorage.getItem('formDraft');
    
    if (!savedDraft) {
      showStatus('ℹ️ No hay borrador para exportar', 'info');
      return;
    }
    
    const data = JSON.parse(savedDraft);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `borrador_formulario_${data.draftId || Date.now()}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showStatus('📤 Borrador exportado exitosamente', 'success');
    
    // Cerrar menú
    const menu = document.getElementById('draftMenu');
    if (menu) menu.style.display = 'none';
    
  } catch (error) {
    console.error('Error exportando borrador:', error);
    showStatus('❌ Error al exportar borrador: ' + error.message, 'error');
  }
}

// Mostrar información del borrador
function showDraftInfo() {
  try {
    const savedDraft = localStorage.getItem('formDraft');
    
    if (!savedDraft) {
      showStatus('ℹ️ No hay borrador guardado', 'info');
      return;
    }
    
    const data = JSON.parse(savedDraft);
    const draftDate = data.draftTimestamp ? new Date(data.draftTimestamp).toLocaleString() : 'Fecha desconocida';
    
    const infoModal = document.createElement('div');
    infoModal.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      " onclick="this.remove()">
        <div style="
          background: var(--bg-card);
          border-radius: var(--border-radius);
          padding: 24px;
          max-width: 500px;
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: var(--shadow-modal);
          color: var(--text-light);
        " onclick="event.stopPropagation()">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
            <span style="font-size: 24px;">💾</span>
            <h3>Información del Borrador</h3>
            <button onclick="this.closest('div[onclick*=\"remove()\"]').remove()" 
                    style="margin-left: auto; background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted);">×</button>
          </div>
          
          <div style="line-height: 1.6;">
            <p><strong>📅 Fecha de guardado:</strong> ${draftDate}</p>
            <p><strong>🆔 ID del borrador:</strong> ${data.draftId || 'N/A'}</p>
            <p><strong>👥 Dependientes:</strong> ${data.dependents?.length || 0}</p>
            <p><strong>🏥 Planes Cigna:</strong> ${data.cignaPlans?.length || 0}</p>
            <p><strong>📝 Campos completados:</strong> ${Object.keys(data).filter(key => 
              data[key] && data[key] !== '' && !['draftTimestamp', 'draftId'].includes(key)
            ).length}</p>
            <p><strong>💾 Tamaño:</strong> ${(JSON.stringify(data).length / 1024).toFixed(2)} KB</p>
          </div>
          
          <div style="margin-top: 20px; display: flex; gap: 12px; justify-content: center;">
            <button onclick="loadDraft(); this.closest('div[onclick*=\"remove()\"]').remove();" 
                    style="background: #2196f3; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">
              📂 Cargar Borrador
            </button>
            <button onclick="exportDraft(); this.closest('div[onclick*=\"remove()\"]').remove();" 
                    style="background: #4caf50; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">
              📤 Exportar
            </button>
            <button onclick="if(confirm('¿Eliminar borrador?')) { deleteDraft(); this.closest('div[onclick*=\"remove()\"]').remove(); }" 
                    style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">
              🗑️ Eliminar
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(infoModal);
    
    // Cerrar menú
    const menu = document.getElementById('draftMenu');
    if (menu) menu.style.display = 'none';
    
  } catch (error) {
    console.error('Error mostrando info del borrador:', error);
    showStatus('❌ Error al mostrar información: ' + error.message, 'error');
  }
}

// Auto-guardado cada 2 minutos
function setupAutoSave() {
  let autoSaveInterval;
  
  const startAutoSave = () => {
    autoSaveInterval = setInterval(() => {
      // Solo auto-guardar si hay cambios en el formulario
      const currentData = collectData();
      const hasData = Object.values(currentData).some(value => 
        value && value.toString().trim() !== '' && value.toString().trim() !== '0'
      );
      
      if (hasData) {
        saveDraft();
        showAutoSaveIndicator();
      }
    }, 2 * 60 * 1000); // 2 minutos
  };
  
  const stopAutoSave = () => {
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
      autoSaveInterval = null;
    }
  };
  
  // Iniciar auto-guardado cuando el usuario comience a escribir
  let typingTimer;
  const formInputs = document.querySelectorAll('input, select, textarea');
  
  formInputs.forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(typingTimer);
      
      if (!autoSaveInterval) {
        startAutoSave();
      }
      
      // Reiniciar timer si el usuario deja de escribir por 5 minutos
      typingTimer = setTimeout(() => {
        stopAutoSave();
      }, 5 * 60 * 1000);
    });
  });
  
  return { start: startAutoSave, stop: stopAutoSave };
}

// Mostrar indicador de auto-guardado
function showAutoSaveIndicator() {
  let indicator = document.getElementById('autoSaveIndicator');
  
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'autoSaveIndicator';
    indicator.className = 'auto-save-indicator';
    document.body.appendChild(indicator);
  }
  
  indicator.innerHTML = '💾 Borrador guardado automáticamente';
  indicator.classList.add('show');
  
  setTimeout(() => {
    indicator.classList.remove('show');
  }, 2000);
}

// ========================== Funciones Globales ==========================

// Compatibilidad por si quedaran handlers inline antiguos:
window.addDependentField = addDependentField;
window.removeDependentField = removeDependentField;
window.saveDependentsData = saveDependentsData;
window.saveDraft = saveDraft;
window.loadDraft = loadDraft;
window.deleteDraft = deleteDraft;
window.toggleDraftMenu = toggleDraftMenu;
window.exportDraft = exportDraft;

window.showDraftInfo = showDraftInfo;