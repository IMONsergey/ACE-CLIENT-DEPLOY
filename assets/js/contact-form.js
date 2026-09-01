(function () {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const fileInput = form.querySelector("[data-contact-file]");
  const fileLabel = form.querySelector("[data-contact-file-label]");
  const defaultFileLabel = fileLabel?.textContent || "";
  const requiredFields = [...form.querySelectorAll("[required]")];

  form.noValidate = true;

  function isEmpty(field) {
    return !field.value || !field.value.trim();
  }

  function getErrorMessage(field) {
    if (isEmpty(field)) return "Заполните обязательное поле";
    return field.validity.typeMismatch ? "Введите корректный e-mail" : "Заполните обязательное поле";
  }

  function isValid(field) {
    if (isEmpty(field)) return false;
    return field.validity.valid;
  }

  function clearError(field) {
    field.classList.remove("is-invalid");
    field.removeAttribute("aria-invalid");
    field.removeAttribute("aria-describedby");
    field.parentElement?.querySelector(".contact-field__error")?.remove();
  }

  function showError(field) {
    clearError(field);

    const error = document.createElement("span");
    const errorId = `contact-error-${field.name}`;
    error.id = errorId;
    error.className = "contact-field__error";
    error.textContent = getErrorMessage(field);

    field.classList.add("is-invalid");
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", errorId);
    field.insertAdjacentElement("afterend", error);
  }

  requiredFields.forEach((field) => {
    field.addEventListener("input", () => {
      if (isValid(field)) clearError(field);
    });

    field.addEventListener("blur", () => {
      if (isValid(field)) {
        clearError(field);
        return;
      }
      showError(field);
    });
  });

  fileInput?.addEventListener("change", () => {
    if (!fileLabel) return;
    fileLabel.textContent = fileInput.files?.[0]?.name || defaultFileLabel;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    let firstInvalid = null;
    requiredFields.forEach((field) => {
      if (isValid(field)) {
        clearError(field);
        return;
      }
      showError(field);
      firstInvalid ||= field;
    });

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const organization = String(data.get("organization") || "").trim();
    const message = String(data.get("message") || "").trim();
    const body = [
      `Ваше имя: ${name}`,
      `E-mail: ${email}`,
      `Организация: ${organization}`,
      "",
      `Сообщение: ${message}`
    ].join("\n");

    window.location.href = `mailto:executive@int-ace.com?subject=${encodeURIComponent("Связаться с Ассоциацией")}&body=${encodeURIComponent(body)}`;
  });
})();
