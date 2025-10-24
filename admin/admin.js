// import { error } from "console";
// import { load } from "mime";

import { showStatus, $, $all } from "../formulario.js";
const BACKEND_URL = "https://asesoriasth-backend-88xb.onrender.com";

async function fetchPolicies() {
    const loadingMessage = $("#loadingMessage");
    const policiesTable = $("#policiesTable");
    const policiesBody = $("#policiesBody");

    // Limpieza inicial
    if (loadingMessage) loadingMessage.textContent = "Cargando datos..."
    if (policiesBody) policiesBody.innerHTML = '';
    if (policiesTable) policiesTable.style.display = "none";
    showStatus("Conectando con el servidor...", "info");

    try {
        const response = await fetch(`${BACKEND_URL}/api/policies`);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `Error ${response.status} al obtener datos`)
        }

        const policies = result.data || [];

        if (loadingMessage) loadingMessage.style.display = "none";

        if (policies.length === 0) {
            showStatus("No hay polizas registradas en la base de datos.", "warning")
            return;
        }

        policiesTable.style.display = "table";
        showStatus(`${policies.length} pólizas cargadas exitosamente.`, "success");

        policies.forEach(policy => {
            const row = policiesBody.insertRow();

            // Contar elementos JSON
            const dependentsCount = policy.dependents_json?.length || 0;
            const cignaCount = policy.cigna_plans_json?.length || 0;

            // formatear prima y fecha
            const fecha = new Date(policy.fecha_registro).toLocaleDateString('es-ES');

            // Insertar celdas
            row.insertCell().textContent = policy.client_id;
            row.insertCell().textContent = fecha;
            row.insertCell().textContent = policy.nombre_completo;
            row.insertCell().textContent = policy.operador;
            row.insertCell().textContent = policy.compania;
            row.insertCell().textContent = `$${prima}`;
            row.insertCell().textContent = telefono;
            row.insertCell().textContent = correo;
            row.insertCell().textContent = dependentsCount > 0 ? `${dependentsCount} Dptes.` : '0';
            row.insertCell().textContent = cignaCount > 0 ? `${cignaCount} planes` : '0';
        })
    } catch (error) {
        console.error("Error al cargar las pólizas:", error);
        if (loadingMessage) loadingMessage.textContent = `Error: ${error.message}`;
        showStatus("Error cargando datos: " + error.message, "error");
    }
}

window.fetchPolicies = fetchPolicies;

document.addEventListener("DOMContentLoaded", fetchPolicies);
