
const clientId = "64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com";
const SPREADSHEET_ID = "1T8YifEIUU7a6ugf_Xn5_1edUUMoYfM9loDuOQU1u2-8"; // ID de tu Google Sheet
const SHEET_NAME_OBAMACARE = "Pólizas"; // Nombre de la hoja principal
const SHEET_NAME_CIGNA = "Cigna Complementario"; // Nombre de la hoja para Cigna
const SHEET_NAME_PAGOS = "Pagos"; // Nombre de la hoja para Pagos
const DRIVE_FOLDER_ID = "1zxpiKTAgF6ZPDF3hi40f7CRWY8QXVqRE"; // ID de la carpeta de Google Drive donde se guardarán los archivos

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let accessToken = null;
let gapiInitialized = false;
let statusTimeout; 
let isPageFullyLoaded = false; // Bandera para controlar la carga de la página

// Elementos del DOM - Botones y Contenedores principales
const loginBtn = document.getElementById("loginBtn");
const dataForm = document.getElementById("dataForm");
const submitBtn = document.getElementById("submitBtn");
const fileInput = document.getElementById("fileInput");
const statusMessageDiv = document.getElementById("statusMessage"); 

// Elementos para las pestañas
const tabButtons = document.querySelectorAll('.tabs-nav .tab-button');
const tabContents = document.querySelectorAll('.tab-content');

// Elementos del DOM - Campos de Obamacare
const cantidadDependientesInput = document.getElementById("cantidadDependientes");
const addDependentsBtn = document.getElementById("addDependentsBtn"); 
const editDependentsBtn = document.getElementById("editDependentsBtn"); 
const hasPoBoxCheckbox = document.getElementById('hasPoBox');
const poBoxAddressContainer = document.getElementById('poBoxAddressContainer');
const direccionCalleInput = document.getElementById('direccionCalle');
const casaApartamentoInput = document.getElementById('casaApartamento');
const condadoInput = document.getElementById('condado');
const ciudadInput = document.getElementById('ciudad');
const zipCodeInput = document.getElementById('zipCode');
const direccionPoBoxInput = document.getElementById('direccionPoBox');
const socialInput = document.getElementById('social');
const ingresosInput = document.getElementById('ingresos');
const creditoFiscalInput = document.getElementById('creditoFiscal');
const primaInput = document.getElementById('prima');
const fechaNacimientoInput = document.getElementById('fechaNacimiento'); 

// Elementos del DOM - Modal de Dependientes
const dependentsModal = document.getElementById('dependentsModal');
const closeModalButton = dependentsModal.querySelector('.close-button');
const modalDependentsContainer = document.getElementById('modalDependentsContainer');
const saveDependentsBtn = document.getElementById('saveDependentsBtn');

// Elementos del DOM - Pestaña Pagos
const pagoBancoRadio = document.getElementById('pagoBanco');
const pagoTarjetaRadio = document.getElementById('pagoTarjeta');
const pagoBancoContainer = document.getElementById('pagoBancoContainer');
const pagoTarjetaContainer = document.getElementById('pagoTarjetaContainer');

// Campos de Tarjeta para eventos (no se guardan completos en Sheets)
const numTarjetaInput = document.getElementById('numTarjeta');
const fechaVencimientoInput = document.getElementById('fechaVencimiento');
const cvcInput = document.getElementById('cvc'); 
const titularTarjetaInput = document.getElementById('titularTarjeta'); 


// Variable para almacenar dependientes temporalmente
let currentDependentsData = []; 
let currentTitularClientId = null; // Para vincular datos entre hojas

// Funciones de utilidad
/**
 * Muestra un mensaje de estado en la interfaz de usuario.
 * @param {string} msg - El mensaje a mostrar.
 * @param {'info'|'success'|'error'} type - El tipo de mensaje (para estilos CSS).
 * @param {number} duration - Duración en milisegundos para que el mensaje sea visible (0 para indefinido).
 */
function displayStatus(msg, type = 'info', duration = 5000) {
    clearTimeout(statusTimeout); 
    statusMessageDiv.textContent = msg;
    statusMessageDiv.className = `visible alert-${type === 'error' ? 'danger' : type}`; 
    
    if (duration > 0) {
        statusTimeout = setTimeout(() => {
            statusMessageDiv.className = ''; 
            statusMessageDiv.textContent = '';
        }, duration);
    }
}

/**
 * Formatea un valor numérico como moneda (ej: $123.45) al perder el foco.
 * Elimina caracteres no numéricos excepto el punto decimal.
 * @param {HTMLInputElement} inputElement - El elemento input a formatear.
 */
function formatCurrencyInput(inputElement) {
    let value = inputElement.value.replace(/[^0-9.]/g, ''); 
    const parts = value.split('.');
    if (parts.length > 2) {
        value = parts[0] + '.' + parts.slice(1).join('');
    }
    let floatValue = parseFloat(value);
    if (isNaN(floatValue) || value.trim() === '') {
        inputElement.value = ''; 
        return;
    }
    inputElement.value = `$${floatValue.toFixed(2)}`;
}

/**
 * Elimina el formato de moneda de un input para facilitar la edición.
 * @param {HTMLInputElement} inputElement - El elemento input.
 */
function unformatCurrencyInput(inputElement) {
    inputElement.value = inputElement.value.replace(/[^0-9.]/g, '');
}

/**
 * Convierte un valor de input formateado (ej. "$1,234.56") a un número limpio.
 * @param {string} formattedValue - El valor de la cadena formateada.
 * @returns {number} El valor numérico limpio.
 */
function parseFormattedMonetaryValue(formattedValue) {
    const cleanValue = formattedValue.replace(/[^0-9.]/g, '');
    return parseFloat(cleanValue);
}

// Lógica de Inicialización de GAPI
async function initGapiClient() {
    try {
        await gapi.client.init({
            discoveryDocs: [
                "https://sheets.googleapis.com/$discovery/rest?version=v4",
                "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
            ]
        });
        await gapi.client.load('sheets', 'v4');
        await gapi.client.load('drive', 'v3'); 
        
        gapiInitialized = true;
    } catch (error) {
        console.error("Error al inicializar gapi.client para Sheets/Drive API:", error);
        displayStatus("Error crítico: No se pudo inicializar la API de Sheets/Drive. Revisa la consola.", 'error', 10000);
    }
}
gapi.load('client', initGapiClient);

window.onload = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response) => {
            if (response.error) {
                console.error("Error de autenticación:", response);
                displayStatus("Error al autenticar: " + response.error, 'error', 10000);
            } else {
                accessToken = response.access_token;
                displayStatus("Conectado con Google. Ya puedes enviar el formulario.", 'success');
                submitBtn.disabled = false; 
                loginBtn.disabled = true; 
            }
        },
    });

    // Ocultar contenedores de pago al cargar la página
    pagoBancoContainer.style.display = 'none';
    pagoTarjetaContainer.style.display = 'none';

    // Ocultar botones de dependientes al cargar la página
    addDependentsBtn.style.display = 'none';
    editDependentsBtn.style.display = 'none';

    // Iniciar la primera pestaña activa por defecto
    document.getElementById('tab-obamacare').style.display = 'block';
    tabButtons[0].classList.add('active'); // Activa el primer botón de pestaña

    isPageFullyLoaded = true; // La página ha cargado completamente y los valores iniciales están listos
};

// Event Listeners de la UI
loginBtn.addEventListener("click", () => {
    tokenClient.requestAccessToken();
});

// Lógica para mostrar/ocultar campo de PO BOX
hasPoBoxCheckbox.addEventListener('change', () => {
    if (hasPoBoxCheckbox.checked) {
        poBoxAddressContainer.style.display = 'block';
    } else {
        poBoxAddressContainer.style.display = 'none';
        direccionPoBoxInput.value = ''; 
}
});

// Lógica para formato de SSN (en blur/focus)
socialInput.addEventListener('blur', function(e) {
    let value = e.target.value.replace(/\D/g, ''); 
    let formattedValue = '';
    if (value.length > 0) {
        formattedValue = value.substring(0, 3);
        if (value.length > 3) { formattedValue += '-' + value.substring(3, 5); }
        if (value.length > 5) { formattedValue += '-' + value.substring(5, 9); }
    }
    e.target.value = formattedValue;
});
socialInput.addEventListener('focus', function(e) {
    e.target.value = e.target.value.replace(/\D/g, ''); 
});

// Añadir listeners de 'blur' y 'focus' para formatear/desformatear campos monetarios
ingresosInput.addEventListener('blur', () => formatCurrencyInput(ingresosInput));
creditoFiscalInput.addEventListener('blur', () => formatCurrencyInput(creditoFiscalInput));
primaInput.addEventListener('blur', () => formatCurrencyInput(primaInput));
ingresosInput.addEventListener('focus', () => unformatCurrencyInput(ingresosInput));
creditoFiscalInput.addEventListener('focus', () => unformatCurrencyInput(creditoFiscalInput));
primaInput.addEventListener('focus', () => unformatCurrencyInput(primaInput));

// Lógica para formato de Fecha de Nacimiento (mm/dd/aaaa) para INPUT TYPE="TEXT"
fechaNacimientoInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, ''); 
    let formattedValue = '';
    if (value.length > 0) {
        formattedValue = value.substring(0, 2); // MM
        if (value.length > 2) {
            formattedValue += '/' + value.substring(2, 4); // MM/DD
        }
        if (value.length > 4) {
            formattedValue += '/' + value.substring(4, 8); // MM/DD/YYYY
        }
    }
    e.target.value = formattedValue;
});
fechaNacimientoInput.addEventListener('blur', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length === 8) { 
        e.target.value = `${value.substring(0,2)}/${value.substring(2,4)}/${value.substring(4,8)}`;
    } else if (value.length > 0 && value.length < 8) {
        displayStatus("Formato de fecha incorrecto. Use MM/DD/AAAA.", 'error');
    }
});


// Lógica de Pestañas
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.dataset.tab;

        // 1. Desactivar todas las pestañas y ocultar todos los contenidos (solo una vez)
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.style.display = 'none');

        // 2. Activar la pestaña clicada y mostrar su contenido
        button.classList.add('active');
        document.getElementById(`tab-${tabId}`).style.display = 'block';

        // 3. Lógica específica para la pestaña de pagos
        if (tabId === 'pagos') {
            // Cuando la pestaña de pagos está activa, muestra el contenedor del método de pago seleccionado
            // o oculta ambos si no hay selección.
            if (pagoBancoRadio.checked) {
                pagoBancoContainer.style.display = 'block';
                pagoTarjetaContainer.style.display = 'none';
            } else if (pagoTarjetaRadio.checked) {
                pagoTarjetaContainer.style.display = 'block';
                pagoBancoContainer.style.display = 'none';
            } else {
                // Si ningún radio button está seleccionado, oculta ambos contenedores
                pagoBancoContainer.style.display = 'none';
                pagoTarjetaContainer.style.display = 'none';
            }
    } else {
        // Si NO estamos en la pestaña de pagos, asegúrate de que los contenedores de pago estén ocultos
        pagoBancoContainer.style.display = 'none';
        pagoTarjetaContainer.style.display = 'none';
    };
    });
});

// Lógica para mostrar/ocultar campos de pago (Banco/Tarjeta)
pagoBancoRadio.addEventListener('change', () => {
    pagoBancoContainer.style.display = pagoBancoRadio.checked ? 'grid' : 'none';
    // Limpiar campos de tarjeta si se selecciona banco
    numTarjetaInput.value = ''; fechaVencimientoInput.value = ''; cvcInput.value = ''; titularTarjetaInput.value = '';
    pagoTarjetaContainer.style.display = 'none'; 
});
pagoTarjetaRadio.addEventListener('change', () => {
    pagoTarjetaContainer.style.display = pagoTarjetaRadio.checked ? 'grid' : 'none';
    // Limpiar campos de banco si se selecciona tarjeta
    document.getElementById('numCuenta').value = ''; document.getElementById('numRuta').value = ''; 
    document.getElementById('nombreBanco').value = ''; document.getElementById('titularCuenta').value = ''; 
    document.getElementById('socialCuenta').value = '';
    pagoBancoContainer.style.display = 'none'; 
});


// Lógica del Modal de Dependientes
addDependentsBtn.addEventListener('click', () => openDependentsModal(false)); // Abrir para agregar/primera vez
editDependentsBtn.addEventListener('click', () => openDependentsModal(true)); // Abrir para editar

// Lógica para controlar la visibilidad de los botones de dependientes.
// El modal NO se abre automáticamente BAJO NINGUNA CIRCUNSTANCIA por un 'input' en cantidadDependientesInput.
// El usuario DEBE hacer click en 'Agregar' o 'Editar'.
cantidadDependientesInput.addEventListener('input', () => {
    const num = parseInt(cantidadDependientesInput.value);
    
    // Validar y controlar visibilidad de botones
    if (isNaN(num) || num < 0) { 
        cantidadDependientesInput.value = 0; 
        displayStatus("Por favor, introduce una cantidad válida (número positivo) de dependientes.", 'error');
        currentDependentsData = [];
        addDependentsBtn.style.display = 'none';
        editDependentsBtn.style.display = 'none';
        return;
    }

    if (num > 0) {
        // Ajustar `currentDependentsData` al nuevo `num`
        if (currentDependentsData.length !== num) {
            currentDependentsData = currentDependentsData.slice(0, num);
            for(let i = currentDependentsData.length; i < num; i++) {
                currentDependentsData.push({}); 
            }
        } 
        
        // Controlar la visibilidad de los botones:
        if (currentDependentsData.some(dep => Object.keys(dep).length > 0)) { 
            editDependentsBtn.style.display = 'block';
            addDependentsBtn.style.display = 'none';
        } else {
            editDependentsBtn.style.display = 'none';
            addDependentsBtn.style.display = 'block';
        }
        
        // El modal YA NO se abre automáticamente aquí. Solo se abrirá con click.
    } else { // num === 0
        currentDependentsData = []; 
        addDependentsBtn.style.display = 'none';
        editDependentsBtn.style.display = 'none';
    }
});


closeModalButton.addEventListener('click', () => {
    dependentsModal.classList.remove('modal-show'); // Usar clase para ocultar
});

saveDependentsBtn.addEventListener('click', () => {
    const num = parseInt(cantidadDependientesInput.value);
    for (let i = 0; i < num; i++) {
        const parentesco = document.getElementById(`modal_dep${i}_parentesco`).value;
        const nombre = document.getElementById(`modal_dep${i}_nombre`).value;
        const apellido = document.getElementById(`modal_dep${i}_apellido`).value;
        const fechaNacimiento = document.getElementById(`modal_dep${i}_fechaNacimiento`).value;

        // Validar formato de fecha en el modal
        if (fechaNacimiento && !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaNacimiento)) {
            displayStatus(`Formato de fecha incorrecto para Dependiente #${i+1}. Use MM/DD/AAAA.`, 'error');
            return;
        }

        if (!parentesco || !nombre || !apellido) {
            displayStatus(`Faltan campos requeridos para el Dependiente #${i+1}.`, 'error');
            return; 
        }
    }

    saveDependentsFromModal();
    dependentsModal.classList.remove('modal-show'); // Usar clase para ocultar
    editDependentsBtn.style.display = 'block'; 
    addDependentsBtn.style.display = 'none'; 
});

// Cierra el modal si se hace clic fuera de su contenido
window.addEventListener('click', (event) => {
    if (event.target === dependentsModal) {
        dependentsModal.classList.remove('modal-show'); // Usar clase para ocultar
    }
});

// Lógica de máscara para Número de Tarjeta y Fecha de Vencimiento
numTarjetaInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, ''); 
    let formattedValue = '';
    for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) {
            formattedValue += ' ';
        }
        formattedValue += value[i];
    }
    e.target.value = formattedValue;
});

fechaVencimientoInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, ''); 
    if (value.length > 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    e.target.value = value;
});


/**
 * Abre el modal de dependientes.
 * @param {boolean} forEdit - True si se abre para editar datos existentes.
 */
function openDependentsModal(forEdit) {
    const num = parseInt(cantidadDependientesInput.value);
    if (isNaN(num) || num <= 0) {
        displayStatus("Introduce una cantidad válida y mayor a 0 para dependientes.", 'error');
        cantidadDependientesInput.value = 0; 
        addDependentsBtn.style.display = 'none'; 
        editDependentsBtn.style.display = 'none';
        return;
    }

    modalDependentsContainer.innerHTML = ''; 

    // Ajustar `currentDependentsData` al número actual de dependientes si no coincide
    if (currentDependentsData.length !== num) {
        currentDependentsData = currentDependentsData.slice(0, num);
        for (let i = currentDependentsData.length; i < num; i++) {
            currentDependentsData.push({}); 
        }
    }
    
    // Generar los campos
    for (let i = 0; i < num; i++) {
        const dep = currentDependentsData[i] || {}; 
        const div = document.createElement("div");
        div.className = "dependent-card"; 
        div.innerHTML = `
            <h4>Dependiente #${i + 1}</h4>
            <div class="grid-item">
                <label for="modal_dep${i}_parentesco">Parentesco:</label>
                <input type="text" id="modal_dep${i}_parentesco" value="${dep.parentesco || ''}" placeholder="Ej: Hijo, Cónyuge" required>
            </div>
            <div class="grid-item">
                <label for="modal_dep${i}_nombre">Nombre:</label>
                <input type="text" id="modal_dep${i}_nombre" value="${dep.nombre || ''}" placeholder="Nombre del dependiente" required>
            </div>
            <div class="grid-item">
                <label for="modal_dep${i}_apellido">Apellido:</label>
                <input type="text" id="modal_dep${i}_apellido" value="${dep.apellido || ''}" placeholder="Apellido del dependiente" required>
            </div>
            <div class="grid-item">
                <label for="modal_dep${i}_fechaNacimiento">Fecha de nacimiento (mm/dd/aaaa):</label>
                <input type="text" id="modal_dep${i}_fechaNacimiento" value="${dep.fechaNacimiento || ''}" placeholder="MM/DD/AAAA" maxlength="10">
            </div>
            <div class="grid-item">
                <label for="modal_dep${i}_estadoMigratorio">Estado migratorio:</label>
                <select id="modal_dep${i}_estadoMigratorio">
                    <option value="">Selecciona...</option>
                    <option value="Ciudadano" ${dep.estadoMigratorio === 'Ciudadano' ? 'selected' : ''}>Ciudadano</option>
                    <option value="Residente" ${dep.estadoMigratorio === 'Residente' ? 'selected' : ''}>Residente</option>
                    <option value="Permiso de Trabajo" ${dep.estadoMigratorio === 'Permiso de Trabajo' ? 'selected' : ''}>Permiso de Trabajo</option>
                    <option value="Asilo Político" ${dep.estadoMigratorio === 'Asilo Político' ? 'selected' : ''}>Asilo Político</option>
                    <option value="I-94" ${dep.estadoMigratorio === 'I-94' ? 'selected' : ''}>I-94</option>
                    <option value="Otro" ${dep.estadoMigratorio === 'Otro' ? 'selected' : ''}>Otro</option>
                </select>
            </div>
            <div class="grid-item">
                <label for="modal_dep${i}_aplica">Aplica:</label>
                <select id="modal_dep${i}_aplica">
                    <option value="Sí" ${dep.aplica === 'Sí' ? 'selected' : ''}>Sí</option>
                    <option value="No" ${dep.aplica === 'No' ? 'selected' : ''}>No</option>
                </select>
            </div>
        `;
        modalDependentsContainer.appendChild(div);

        // Añadir listeners de máscara de fecha a los nuevos inputs del modal
        const modalDepFechaNacimientoInput = document.getElementById(`modal_dep${i}_fechaNacimiento`);
        if (modalDepFechaNacimientoInput) {
            modalDepFechaNacimientoInput.addEventListener('input', function(e) {
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
            modalDepFechaNacimientoInput.addEventListener('blur', function(e) {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length === 8) { 
                    e.target.value = `${value.substring(0,2)}/${value.substring(2,4)}/${value.substring(4,8)}`;
                } else if (value.length > 0 && value.length < 8) {
                    displayStatus("Formato de fecha incorrecto. Use MM/DD/AAAA.", 'error');
                }
            });
        }
    }
    dependentsModal.classList.add('modal-show'); // Usar clase para mostrar
}

/**
 * Guarda los datos de los dependientes desde el modal a la variable temporal.
 */
function saveDependentsFromModal() {
    currentDependentsData = []; 
    const num = parseInt(cantidadDependientesInput.value);

    for (let i = 0; i < num; i++) {
        const parentesco = document.getElementById(`modal_dep${i}_parentesco`).value;
        const nombre = document.getElementById(`modal_dep${i}_nombre`).value;
        const apellido = document.getElementById(`modal_dep${i}_apellido`).value;
        const fechaNacimiento = document.getElementById(`modal_dep${i}_fechaNacimiento`).value;
        const estadoMigratorio = document.getElementById(`modal_dep${i}_estadoMigratorio`).value;
        const aplica = document.getElementById(`modal_dep${i}_aplica`).value;

        currentDependentsData.push({
            parentesco, nombre, apellido, fechaNacimiento, estadoMigratorio, aplica
        });
    }
    displayStatus("Dependientes guardados temporalmente.", 'info');
}


// Event listener para el envío del formulario
dataForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // Prevenir el envío normal del formulario

    if (!accessToken) {
        displayStatus("Por favor, inicia sesión con Google primero.", 'error');
        return;
    }
    submitBtn.disabled = true; // Deshabilitar botón de envío para evitar múltiples envíos.
    submitBtn.textContent = "Enviando...";


    if (!gapiInitialized || !gapi.client.sheets || !gapi.client.drive) {
        displayStatus("Las APIs de Google no están completamente listas. Intenta recargar la página o espera un momento.", 'error', 10000);
        console.error("gapi.client no está completamente inicializado. No se puede proceder.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar";
        return;
    }

    displayStatus("Procesando...", 'info', 0); 

    try {
        currentTitularClientId = `CLIENT-${Date.now()}-${Math.floor(Math.random() * 1000)}`; 

        // --- Recolectar datos de la pestaña Obamacare (Principal) ---
        const titularData = {};
        const getInputValue = (id) => document.getElementById(id).value;
        
        // Datos Personales (incluyendo campos movidos)
        titularData.nombre = getInputValue('nombre');
        titularData.apellidos = getInputValue('apellidos');
        titularData.sexo = getInputValue('sexo');
        titularData.correo = getInputValue('correo');
        titularData.telefono = getInputValue('telefono'); 
        titularData.fechaNacimiento = getInputValue('fechaNacimiento'); 
        titularData.estadoMigratorio = getInputValue('estadoMigratorio'); 
        titularData.social = getInputValue('social'); 
        titularData.ingresos = parseFormattedMonetaryValue(getInputValue('ingresos')); 
        titularData.aplica = getInputValue('aplica'); 
        titularData.cantidadDependientes = getInputValue('cantidadDependientes'); 
        
        // Dirección se procesa aparte
        
        // Información de la Póliza (campos restantes)
        titularData.compania = getInputValue('compania');
        titularData.plan = getInputValue('plan');
        titularData.creditoFiscal = parseFormattedMonetaryValue(getInputValue('creditoFiscal')); 
        titularData.prima = parseFormattedMonetaryValue(getInputValue('prima')); 
        titularData.link = getInputValue('link');
        titularData.observaciones = getInputValue('observaciones');
        
        // Metadata
        titularData.Fecha = new Date().toLocaleDateString('es-ES'); 
        titularData.clientId = currentTitularClientId;


        // Procesar la dirección consolidada
        let fullAddress = '';
        if (hasPoBoxCheckbox.checked) {
            fullAddress = direccionPoBoxInput.value.trim();
        } else {
            const calle = direccionCalleInput.value.trim();
            const casaApto = casaApartamentoInput.value.trim();
            const condado = condadoInput.value.trim();
            const ciudad = ciudadInput.value.trim();
            const zip = zipCodeInput.value.trim();

            const addressParts = [];
            if (calle) addressParts.push(calle);
            if (casaApto) addressParts.push(casaApto);
            if (condado) addressParts.push(condado);
            if (ciudad) addressParts.push(ciudad);
            if (zip) addressParts.push(zip);
            
            fullAddress = addressParts.join(', ');
        }
        titularData.direccion = fullAddress; 

        // --- Procesar documentos ---
        let fileHyperlinks = []; 
        const filesToUpload = fileInput.files; // Acceder a los archivos desde input file

        if (filesToUpload.length > 0) {
            displayStatus(`Subiendo ${filesToUpload.length} archivo(s) a Drive...`, 'info', 0);

            const formDataForBackend = new FormData();
            formDataForBackend.append('clientId', currentTitularClientId);
            formDataForBackend.append('nombreCliente', titularData.nombre);
            formDataForBackend.append('apellidoCliente', titularData.apellidos);
            
            for (const file of filesToUpload) {
                formDataForBackend.append('files', file); // Agregar cada archivo al FormData
            }
            try {
                // Que la URL del backend sea la correcta
                const backendResponse = await fetch("https://asesoriasth-backend.onrender.com/api/upload-to-drive", {
                    method: 'POST',
                    body: formDataForBackend
                });

                if (!backendResponse.ok) {
                    const errorData = await backendResponse.json();
                    throw new Error(`Error al subir archivos al backend: ${errorData.message || backendResponse.statusText}`);
                }
                const uploadResult = await backendResponse.json();
                if (uploadResult.fileLinks && uploadResult.fileLinks.length > 0) {
                    fileHyperlinks = uploadResult.fileLinks.map(link => `HYPERLINK("${link.url}", "${link.name}")`);
                }
                titularData.documentos = fileHyperlinks.join(' & CHAR(10) & '); // Formato para Sheets

            } catch (backendError) {
                console.error('Error al subir archivos al backend:', backendError);
                displayStatus(`Error al subir el archivo: ${backendError.message}`, 'error', 10000);
                titularData.documentos = ''; // No hay documentos si falla la subida 
            }
        } else {
            titularData.documentos = ''; // No hay documentos si no se seleccionan archivos
        }

        // --- Enviar datos a Obamacare (Hoja principal) ---
        // Aquí se formatean los valores monetarios numéricos a `$X.XX` para la hoja de cálculo
        titularData.ingresos = titularData.ingresos ? `$${titularData.ingresos.toFixed(2)}` : '';
        titularData.creditoFiscal = titularData.creditoFiscal ? `$${titularData.creditoFiscal.toFixed(2)}` : '';
        titularData.prima = titularData.prima ? `$${titularData.prima.toFixed(2)}` : '';

        await appendObamacareDataToSheet(titularData, currentDependentsData);


        // --- Recolectar y enviar datos de Cigna Complementario ---
        const cignaData = { clientId: currentTitularClientId };
        cignaData.planTipo = getInputValue('cignaPlanTipo');
        cignaData.coberturaTipo = getInputValue('cignaCoberturaTipo');
        cignaData.beneficio = getInputValue('cignaBeneficio');
        cignaData.deducible = getInputValue('cignaDeducible');
        cignaData.mensualidad = getInputValue('cignaMensualidad');
        
        // Solo envía si hay datos significativos de Cigna (excluyendo el clientId vacío)
        if (Object.values(cignaData).some(val => val !== '' && val !== currentTitularClientId)) {
            await appendCignaDataToSheet(cignaData);
        }

        // --- Recolectar y enviar datos de Pagos ---
        const paymentData = { clientId: currentTitularClientId };
        paymentData.metodoPago = document.querySelector('input[name="metodoPago"]:checked')?.value || '';

        if (paymentData.metodoPago === 'Banco') {
            paymentData.numCuenta = getInputValue('numCuenta');
            paymentData.numRuta = getInputValue('numRuta');
            paymentData.nombreBanco = getInputValue('nombreBanco');
            paymentData.titularCuenta = getInputValue('titularCuenta');
            paymentData.socialCuenta = getInputValue('socialCuenta');
            // Asegurarse de que los campos de tarjeta no se envíen
            paymentData.numTarjeta = ''; 
            paymentData.fechaVencimiento = '';
            paymentData.titularTarjeta = '';
        } else if (paymentData.metodoPago === 'Tarjeta') {
            const fullCardNum = getInputValue('numTarjeta').replace(/\D/g, '');
            paymentData.numTarjeta = fullCardNum.slice(-4); 
            paymentData.fechaVencimiento = getInputValue('fechaVencimiento');
            // CVV/CVC NO SE RECOLECTA NI SE ENVÍA A NINGUNA PARTE POR SEGURIDAD
            paymentData.titularTarjeta = getInputValue('titularTarjeta');
            // Asegurarse de que los campos de banco no se envíen
            paymentData.numCuenta = '';
            paymentData.numRuta = '';
            paymentData.nombreBanco = '';
            paymentData.titularCuenta = '';
            paymentData.socialCuenta = '';
        }
        
        // Solo envía si se seleccionó un método de pago
        if (paymentData.metodoPago) {
            await appendPaymentDataToSheet(paymentData);
        }


        displayStatus("✅ ¡Datos guardados en Sheets y archivo(s) subido(s) a Drive!", 'success', 8000);
        
        // Resetear todos los campos y estados después del envío exitoso
        dataForm.reset(); 
        fileInput.value = ''; 
        cantidadDependientesInput.value = 0;
        currentDependentsData = []; // Limpiar datos de dependientes en memoria
        editDependentsBtn.style.display = 'none'; // Ocultar botón editar dependientes
        addDependentsBtn.style.display = 'none'; // Ocultar botón agregar dependientes
        hasPoBoxCheckbox.checked = false;
        poBoxAddressContainer.style.display = 'none';
        pagoBancoRadio.checked = false;
        pagoTarjetaRadio.checked = false;
        pagoBancoContainer.style.display = 'none';
        pagoTarjetaContainer.style.display = 'none';
        
        // Volver a la primera pestaña
        tabButtons[0].click(); 

    } catch (error) {
        console.error("Error al procesar el formulario:", error);
        displayStatus("Ocurrió un error al procesar tu solicitud: " + error.message, 'error', 10000);
    }finally{
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar Datos Completos";
    }
        // Subir archivos a Drive
        const uploadedFilelLinks = []
        const filesToUpload = fileInput.files; // acceder a los archivos desde input file
        if (filesToUpload.length > 0) {
            displayStatus(`Subiendo ${filesToUpload.length} archivo(s) a Drive...`, 'info', 0); //Mensajae de estado informativo
            for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i];
                // Renombrar arvhivo para incluir el nombre del titular
                const fileName = `${FormData.nombre}_${FormData.apellidos}__${Date.now()}_${file.name}`;

                const metadata = {
                    'name': fileName,
                    'mimeType': file.type,
                    'parents': [DRIVE_FOLDER_ID] // Guardar en la carpeta específica de Drive
                };
                try {
                    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, {
                        method: 'POST',
                        headers: new Headers({ 'authorization': `Bearer ${accessToken}` }), // Usar el token de acceso
                        body: form,
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error("Error al subir archivo a Drive (fetch): " + (errorData.error?.message || response.statusText));
                    }
                    const fileInfoResponse = await response.json();
                    uploadedFilelLinks.push(fileInfoResponse.webViewLink); // Guardar el enlace de visualización
                    displayStatus(`Documento "${fileName}" subido exitosamente a Drive.`, 'success', 5000);
                }
                catch (filesToUploadError) {
                    console.error("Error al subir archivo a Drive:", filesToUploadError);
                    displayStatus("Error al subir archivo a Drive: " + filesToUploadError.message, 'error', 10000);
                }
            }
        }
        // Mostrar enlaces de archivos subidos
        // (Si necesitas mostrar los enlaces, agrégalos aquí)
    // El bloque catch/finally ya está arriba, así que elimina este bloque duplicado.
});

/**
 * Sube un archivo a Google Drive y le da permisos públicos de lectura.
 * @param {File} file - El archivo a subir.
 * @returns {Promise<{webViewLink: string, id: string}>} - Un objeto con el enlace de visualización del archivo y su ID.
 */
async function uploadFileToDrive(file) {
    const metadata = { name: file.name, mimeType: file.type };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", file);

    const uploadResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
    });
    if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error("Error al subir archivo a Drive (fetch): " + (errorData.error?.message || uploadResponse.statusText));
    }
    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.id;

    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" })
    });

    const fileInfoResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!fileInfoResponse.ok) {
        const errorData = await fileInfoResponse.json();
        throw new Error("Error al obtener webViewLink: " + (errorData.error?.message || fileInfoResponse.statusText));
    }
    const fileInfo = await fileInfoResponse.json();
    return { webViewLink: fileInfo.webViewLink, id: fileId };
}


/**
 * Añade los datos del titular y dependientes a la hoja principal "Pólizas".
 * @param {object} titularData - Objeto con los datos del titular.
 * @param {Array<object>} dependents - Array de objetos con los datos de los dependientes.
 */
async function appendObamacareDataToSheet(titularData, dependents) {
    gapi.client.setToken({ access_token: accessToken });

    const allRows = [];

    // Fila del titular para Obamacare
    // ¡IMPORTANTE! El orden de estas columnas DEBE coincidir EXACTAMENTE con tu hoja de Google Sheets.
    const titularRow = [
        'Titular', 
        titularData.nombre || '',
        titularData.apellidos || '',
        titularData.sexo || '', 
        titularData.correo || '', 
        titularData.telefono || '', 
        titularData.fechaNacimiento || '', 
        titularData.estadoMigratorio || '', 
        titularData.social || '', 
        titularData.ingresos || '', 
        titularData.aplica || '', 
        titularData.cantidadDependientes || '', 
        titularData.direccion || '', 
        titularData.compania || '', 
        titularData.plan || '', 
        titularData.creditoFiscal || '', 
        titularData.prima || '', 
        titularData.link || '', 
        titularData.observaciones || '', 
        titularData.Fecha || '', 
        titularData.clientId || '', // Aquí va el Client ID del titular
        titularData.documentos || ''
    ];
    allRows.push(titularRow);

    // Filas de los dependientes
    // Asegúrate de que el orden de estas columnas coincida con las columnas de dependientes en tu hoja
    // Y que el clientId del titular se incluya para vincularlos.
    dependents.forEach(dep => {
        const dependentRow = [
            'Dependiente', // Tipo de registro
            dep.nombre || '',
            dep.apellido || '',
            dep.parentesco || '', // Parentesco del dependiente
            dep.fechaNacimiento || '', // Fecha de nacimiento del dependiente
            dep.estadoMigratorio || '', // Estado migratorio del dependiente
            dep.aplica || '', // Aplica del dependiente
            '', // Deja vacío si no hay correo para dependientes
            '', // Deja vacío si no hay teléfono para dependientes
            '', // Deja vacío si no hay SSN para dependientes
            '', // Deja vacío si no hay ingresos para dependientes
            '', // Deja vacío si no hay aplica para dependientes (ya está en la columna de dependientes)
            '', // Deja vacío si no hay dirección para dependientes
            '', // Deja vacío si no hay compañía para dependientes
            '', // Deja vacío si no hay plan para dependientes
            '', // Deja vacío si no hay crédito fiscal para dependientes
            '', // Deja vacío si no hay prima para dependientes
            '', // Deja vacío si no hay link para dependientes
            '', // Deja vacío si no hay observaciones para dependientes
            titularData.Fecha || '', // Misma fecha que el titular
            titularData.clientId || '', // ¡AQUÍ SE AÑADE EL CLIENT ID DEL TITULAR!
            '' // Deja vacío si no hay documentos para dependientes
        ];
        allRows.push(dependentRow);
    });

    const resource = {
        values: allRows,
    };

    try {
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME_OBAMACARE}!A:Z`, // Asegúrate de que el rango cubra todas tus columnas
            valueInputOption: 'USER_ENTERED',
            resource: resource,
        });
        if (response.status !== 200) {
            throw new Error(`Error al añadir datos a la hoja '${SHEET_NAME_OBAMACARE}': ${response.result.error.message}`);
        }
    } catch (error) {
        console.error("Error al añadir datos a la hoja de Obamacare:", error);
        throw new Error("No se pudieron guardar los datos del titular/dependientes en la hoja principal.");
    }
}


/**
 * Añade los datos de Cigna Complementario a su hoja.
 * @param {object} cignaData - Objeto con los datos de Cigna.
 */
async function appendCignaDataToSheet(cignaData) {
    gapi.client.setToken({ access_token: accessToken });

    // ¡IMPORTANTE! El orden de estas columnas DEBE coincidir EXACTAMENTE con tu hoja de Cigna.
    const row = [
        cignaData.clientId || '', // Client ID para vincular
        cignaData.planTipo || '',
        cignaData.coberturaTipo || '',
        cignaData.beneficio || '',
        cignaData.deducible || '',
        cignaData.mensualidad || '',
        new Date().toLocaleDateString('es-ES') // Fecha de registro
    ];

    const resource = {
        values: [row],
    };

    try {
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME_CIGNA}!A:G`, // Ajusta el rango a tus columnas de Cigna
            valueInputOption: 'USER_ENTERED',
            resource: resource,
        });
        if (response.status !== 200) {
            throw new Error(`Error al añadir datos a la hoja '${SHEET_NAME_CIGNA}': ${response.result.error.message}`);
        }
    } catch (error) {
        console.error("Error al añadir datos a la hoja de Cigna Complementario:", error);
        throw new Error("No se pudieron guardar los datos de Cigna Complementario.");
    }
}

/**
 * Añade los datos de Pagos a su hoja.
 * @param {object} paymentData - Objeto con los datos de Pagos.
 */
async function appendPaymentDataToSheet(paymentData) {
    gapi.client.setToken({ access_token: accessToken });

    // ¡IMPORTANTE! El orden de estas columnas DEBE coincidir EXACTAMENTE con tu hoja de Pagos.
    const row = [
        paymentData.clientId || '', // Client ID para vincular
        paymentData.metodoPago || '',
        paymentData.numCuenta || '',
        paymentData.numRuta || '',
        paymentData.nombreBanco || '',
        paymentData.titularCuenta || '',
        paymentData.socialCuenta || '',
        paymentData.numTarjeta || '', // Solo los últimos 4 dígitos
        paymentData.fechaVencimiento || '',
        paymentData.titularTarjeta || '',
        new Date().toLocaleDateString('es-ES') // Fecha de registro
    ];

    const resource = {
        values: [row],
    };

    try {
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME_PAGOS}!A:K`, // Ajusta el rango a tus columnas de Pagos
            valueInputOption: 'USER_ENTERED',
            resource: resource,
        });
        if (response.status !== 200) {
            throw new Error(`Error al añadir datos a la hoja '${SHEET_NAME_PAGOS}': ${response.result.error.message}`);
        }
    } catch (error) {
        console.error("Error al añadir datos a la hoja de Pagos:", error);
        throw new Error("No se pudieron guardar los datos de Pagos.");
    }
}
// Fin del código de envío de datos
