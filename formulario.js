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
const AUTH_SKEW_MS = 30_000;

function getAuthState() {
  const accessToken = localStorage.getItem("google_access_token");
  const expiryStr = localStorage.getItem("google_token_expiry");
  const expiryMs = expiryStr ? parseInt(expiryStr, 10) : 0;
  return {
    accessToken,
    expiryMs
  };
}

function isTokenValid(skew = AUTH_SKEW_MS) {
  const {
    accessToken,
    expiryMs
  } = getAuthState();
  return !!accessToken && Date.now() + skew < expiryMs;
}

function promptAndRedirectToLogin(msg = "Tu sesión ha expirado. Debes iniciar sesión nuevamente.") {
  localStorage.removeItem("google_access_token");
  localStorage.removeItem("google_token_expiry");
  localStorage.removeItem("google_user_info");
  try {
    alert(msg);
  } catch (_) {}
  window.location.href = LOGIN_URL;
}

function ensureAuthenticated({
  interactive = true
} = {}) {
  if (!isTokenValid()) {
    const msg = "Tu sesión ha expirado. Inicia sesión para continuar.";
    if (interactive) promptAndRedirectToLogin(msg);
    else promptAndRedirectToLogin();
    return false;
  }
  return true;
}
document.addEventListener("DOMContentLoaded", () => {
  ensureAuthenticated({
    interactive: true
  });
  setInterval(() => ensureAuthenticated({
    interactive: false
  }), 60_000);
});
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
  if (!box) return;
  box.textContent = msg;
  box.className = `status-message ${type}`;
  box.style.display = "block";
  if (type !== "error") setTimeout(() => (box.style.display = "none"), 4500);
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

    if (fechaNacimiento && !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaNacimiento)) {
      ok = false;
      alert(`Formato de fecha incorrecto para Dependiente #${i+1}. Use MM/DD/AAAA.`);
      return;
    }

    if (!nombre || !apellido || !fechaNacimiento || !parentesco) {
      ok = false;
      alert(`Completa los campos requeridos para el Dependiente #${i+1}.`);
      return;
    }
    data.push({
      nombre,
      apellido,
      fechaNacimiento,
      parentesco,
      ssn
    });
  });
  if (!ok) return;

  window.currentDependentsData = data;
  updateDependentsCount();
  closeDependentsModal();
  showStatus(`✅ ${data.length} dependiente(s) guardado(s)`, "success");
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
    ssn: ""
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
        <input type="text" class="form-input-formal dependent-nombre form-control" value="${d.nombre}" required>
      </div>
      <div class="form-group-formal">
        <label class="form-label-formal">Apellido <span class="required-asterisk">*</span></label>
        <input type="text" class="form-input-formal dependent-apellido form-control" value="${d.apellido}" required>
      </div>
    </div>

    <div class="dependent-form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">
      <div class="form-group-formal">
        <label class="form-label-formal">Fecha de Nacimiento (mm/dd/aaaa) <span class="required-asterisk">*</span></label>
        <input type="text" class="form-input-formal dependent-fecha form-control" value="${d.fechaNacimiento}" placeholder="MM/DD/AAAA" maxlength="10" required>
      </div>
      <div class="form-group-formal">
        <label class="form-label-formal">Parentesco <span class="required-asterisk">*</span></label>
        <select class="form-input-formal dependent-parentesco form-select" required>
          <option value="">Seleccione el parentesco...</option>
          <option value="Cónyuge" ${d.parentesco === "Cónyuge" ? "selected" : ""}>Cónyuge</option>
          <option value="Hijo/a" ${d.parentesco === "Hijo/a" ? "selected" : ""}>Hijo/a</option>
          <option value="Padre" ${d.parentesco === "Padre" ? "selected" : ""}>Padre</option>
          <option value="Madre" ${d.parentesco === "Madre" ? "selected" : ""}>Madre</option>
          <option value="Hermano/a" ${d.parentesco === "Hermano/a" ? "selected" : ""}>Hermano/a</option>
          <option value="Abuelo/a" ${d.parentesco === "Abuelo/a" ? "selected" : ""}>Abuelo/a</option>
          <option value="Otro" ${d.parentesco === "Otro" ? "selected" : ""}>Otro</option>
        </select>
      </div>
    </div>

    <div class="dependent-form-grid-full" style="margin-bottom:12px;">
      <div class="form-group-formal">
        <label class="form-label-formal">Número de Seguro Social (SSN)</label>
        <input type="text" class="form-input-formal dependent-ssn form-control" value="${d.ssn}" placeholder="###-##-####" maxlength="11">
      </div>
    </div>
  `;
  container.appendChild(card);
  setupDependentValidation(card);
  updateDependentNumbers();
  updateDependentsCount();
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

  function fileSizeHuman(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024,
      sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  function removeField(field) {
    const total = $all(".upload-field", container).length;
    if (total <= 1) {
      alert("Debe mantener al menos un archivo.");
      return;
    }
    field.remove();
    renumber();
  }

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
    nombre: $("#Nombre")?.value?.trim() || "",
    apellidos: $("#Apellidos")?.value?.trim() || "",
    sexo: $("#sexo")?.value || "",
    correo: $("#correo")?.value?.trim() || "",
    telefono: $("#telefono")?.value?.trim() || "",
    fechaNacimiento: $("#fechaNacimiento")?.value || "",
    estadoMigratorio: $("#estadoMigratorio")?.value || "",
    ssn: $("#SSN")?.value || "",
    ingresos: $("#ingresos")?.value || "",
    aplica: $("#aplica")?.value || "",
    cantidadDependientes: $("#cantidadDependientes")?.value || "0",
    direccion: $("#direccion")?.value?.trim() || "",
    casaApartamento: $("#casaApartamento")?.value?.trim() || "",
    condado: $("#condado")?.value?.trim() || "",
    ciudad: $("#Ciudad")?.value?.trim() || "",
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

// =================================== API ===================================
const BACKEND_URL = "https://asesoriasth-backend.onrender.com/api";

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
    new Date().toLocaleDateString('es-ES'),
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
    data.aplica,
    data.cantidadDependientes,
    data.poBox || (data.direccion + (data.casaApartamento ? ', ' + data.casaApartamento : '') + ', ' + data.condado + ', ' + data.ciudad + ', ' + data.codigoPostal),
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
        new Date().toLocaleDateString('es-ES'),
        data.tipoVenta || '',
        data.claveSeguridad || '',
        dep.parentesco || '',
        dep.nombre || '',
        dep.apellido || '',
        '',
        '',
        '',
        dep.fechaNacimiento || '',
        '',
        dep.ssn || '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        clientId,
        ''
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

async function uploadFilesToBackend(files, nombre, apellidos, clientId) {
  if (files.length === 0) return;

  showStatus("Subiendo archivos...", "info");
  const formData = new FormData();
  formData.append("nombre", nombre);
  formData.append("apellidos", apellidos);
  formData.append("clientId", clientId);
  files.forEach(fileData => {
    formData.append("files", fileData.file, fileData.name);
  });
  
  const response = await fetch(`${BACKEND_URL}/upload-files`, {
    method: "POST",
    body: formData
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Error desconocido al subir archivos.");
  }
  showStatus("✅ Archivos subidos a Drive correctamente.", "success");
}

async function onSubmit(e) {
  e.preventDefault();
  
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
    
    if (filesToUpload.length > 0) {
      await uploadFilesToBackend(filesToUpload, data.nombre, data.apellidos, clientId);
    }
    
    function resetFormState() {
        document.getElementById('dataForm').reset();
        window.currentDependentsData = [];
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
      const cur = (window.currentDependentsData || []).length;
      if (n > cur) {
        for (let i = cur; i < n; i++)
          window.currentDependentsData.push({
            nombre: "",
            apellido: "",
            fechaNacimiento: "",
            parentesco: "",
            ssn: ""
          });
      } else if (n < cur) {
        window.currentDependentsData = window.currentDependentsData.slice(0, n);
      }
    });
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