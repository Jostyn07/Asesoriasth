// ======================== Configuración Google APIs ========================
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
