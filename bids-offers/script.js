const app = document.querySelector(".bo-app");
const viewButtons = document.querySelectorAll("[data-view-target]");
const forms = document.querySelectorAll("form[data-next-view]");
const authCard = document.querySelector("[data-auth-card]");
const authStage = document.querySelector("[data-auth-stage]");
const authModeButtons = document.querySelectorAll("[data-auth-target]");
const authPanes = document.querySelectorAll("[data-auth-pane]");
const filters = document.querySelector("[data-filters]");
const requestsBody = document.querySelector("[data-requests-body]");
const requestForm = document.querySelector("[data-request-form]");
const drawer = document.querySelector(".bo-drawer");
const drawerBackdrop = document.querySelector(".bo-drawer-backdrop");
const drawerClosers = document.querySelectorAll("[data-close-drawer]");
const successModal = document.querySelector("[data-success-modal]");
const successClosers = document.querySelectorAll("[data-close-success]");
const confirmEmail = document.querySelector("[data-confirm-email]");
const resetEmail = document.querySelector("[data-reset-email]");
const dateInput = document.querySelector("[data-date-input]");
const datePicker = document.querySelector("[data-date-picker]");
const dateToggle = document.querySelector("[data-date-toggle]");
const sortButtons = document.querySelectorAll("[data-sort-key]");
const columnFilterButtons = document.querySelectorAll("[data-column-filter]");
const columnFilterValueButtons = document.querySelectorAll("[data-column-filter-value]");
const columnMenus = document.querySelectorAll("[data-column-menu]");
const typographWordPattern = /(^|[\s([{"'«„])((?:а|в|и|к|о|с|у|во|да|до|за|из|ли|на|не|но|об|от|по|со|то|же|бы|без|для|или|как|над|под|при|про))\s+([^\s])/giu;
const typographSkipTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);
const authSwitchDelay = 140;
const viewSwitchDelay = 150;
const successCloseDelay = 280;
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const statusClasses = {
  "Активна": "bo-status--active",
  "Исполнена": "bo-status--done",
  "Отменена": "bo-status--canceled",
};

const typeClasses = {
  "Продажа": "bo-type--sell",
  "Покупка": "bo-type--buy",
};

const defaultSortDirections = {
  date: "desc",
  volume: "desc",
  price: "desc",
};

let sortState = {
  key: null,
  direction: "asc",
};

let authSwitchTimer = null;
let viewSwitchTimer = null;
let viewReadyTimer = null;
let viewReadyToken = 0;
let lastSubmittedRequestId = null;
let lastRegisterEmail = "test@test.ru";
let lastForgotEmail = "test@test.ru";

let requests = [
  {
    id: "spimex-wheat-2026",
    date: "01.08.2026",
    type: "Продажа",
    participant: "Петербургская Биржа",
    product: "Пшеница 3 класса, урожай 2026",
    volume: "5000 т",
    volumeNote: "мин. партия 500 т",
    price: "320 USD/т, предоплата 30%, базис цены фиксируется после подтверждения доступного объема, качества партии, графика отгрузки и финального согласования платежного календаря между участниками сделки. В цену включается базовая проверка документов, подтверждение порта отгрузки, резервирование партии на согласованный период, сверка спецификации и уточнение допустимого отклонения по весу. Окончательный расчет выполняется после подтверждения объема, доступного окна погрузки, реквизитов сторон и условий банковского сопровождения. При изменении даты судозахода, валюты расчетов, требований к упаковке или перечня документов участники отдельно согласуют корректировку цены, порядок оплаты и срок действия предложения. Поставка остается доступной в демо-сценарии при условии своевременного подтверждения интереса, проверки полномочий участника, согласования лимитов и обмена финальными параметрами сделки через рабочий контакт биржи. Дополнительные расходы по хранению, лабораторной проверке и изменению маршрута не включены в базовую цену",
    delivery: "FOB, порт Новороссийск",
    status: "Активна",
    flag: "assets/images/russia-flag.png",
    logo: "assets/images/spimex-logo.png",
  },
  {
    id: "uzrtsb-cotton-2026",
    date: "28.08.2026",
    type: "Покупка",
    participant: "УзРТСБ (Узбекистан)",
    product: "Хлопок-волокно",
    volume: "300 т",
    price: "1450 USD/т, аккредитив",
    delivery: "FCA, склад продавца",
    status: "Активна",
  },
  {
    id: "butb-sugar-2026",
    date: "26.08.2026",
    type: "Продажа",
    participant: "Белорусская универсальная товарная биржа",
    product: "Сахар белый",
    volume: "1000 т",
    price: "650 USD/т, предоплата 20%",
    delivery: "DAP, Минск",
    status: "Активна",
  },
  {
    id: "ime-polyethylene-2026",
    date: "24.08.2026",
    type: "Покупка",
    participant: "Iran Mercantile Exchange",
    product: "Полиэтилен высокой плотности",
    volume: "500 т",
    price: "по договорённости, USD",
    delivery: "FOB, порт Бендер-Аббас",
    status: "Исполнена",
  },
  {
    id: "egypt-corn-2026",
    date: "22.08.2026",
    type: "Продажа",
    participant: "Egyptian Mercantile Exchange",
    product: "Кукуруза фуражная",
    volume: "2500 т",
    price: "210 USD/т, постоплата 7 дней",
    delivery: "CIF, порт Александрия",
    status: "Активна",
  },
  {
    id: "dce-soy-2026",
    date: "20.08.2026",
    type: "Покупка",
    participant: "Dalian Commodity Exchange",
    product: "Соя",
    volume: "4000 т",
    price: "Цена обсуждается после подтверждения качества.",
    delivery: "CFR, порт Циндао",
    status: "Отменена",
  },
  {
    id: "etc-barley-2026",
    date: "15.08.2026",
    type: "Продажа",
    participant: "ETC (Казахстан)",
    product: "Ячмень кормовой",
    volume: "1800 т",
    price: "185 USD/т, предоплата 50%",
    delivery: "FOB, порт Актау",
    status: "Активна",
  },
  {
    id: "butb-roundwood-2026",
    date: "12.08.2026",
    type: "Покупка",
    participant: "БУТБ (Беларусь)",
    product: "Лесоматериалы круглые",
    volume: "600 куб. м",
    price: "по договорённости, BYN/USD",
    delivery: "Самовывоз со склада продавца",
    status: "Исполнена",
  },
  {
    id: "ncdex-sesame-2026",
    date: "08.08.2026",
    type: "Продажа",
    participant: "NCDEX (Индия)",
    product: "Кунжут",
    volume: "350 т",
    price: "1250 USD/т, предоплата 30%",
    delivery: "FOB, порт Мумбаи",
    status: "Активна",
  },
  {
    id: "etc-metal-2026",
    date: "30.07.2026",
    type: "Покупка",
    participant: "ETC (Казахстан)",
    product: "Металлопрокат г/к",
    volume: "1200 т",
    price: "по договорённости, KZT/USD",
    delivery: "DAP, склад покупателя",
    status: "Активна",
  },
  {
    id: "butb-lumber-2026",
    date: "25.07.2026",
    type: "Продажа",
    participant: "БУТБ (Беларусь)",
    product: "Пиломатериалы хвойных пород",
    volume: "800 куб. м",
    price: "190 USD/куб.м, отсрочка 14 дней",
    delivery: "Самовывоз со склада",
    status: "Исполнена",
  },
  {
    id: "ncdex-soy-2026",
    date: "18.07.2026",
    type: "Покупка",
    participant: "NCDEX (Индия)",
    product: "Соевые бобы",
    volume: "от 2000 т",
    price: "Цена и график оплаты согласуются после подтверждения объема и порта назначения, проверки доступного периода поставки, валюты расчетов, условий резервирования партии и согласования документов. Предложение предполагает поэтапное подтверждение: сначала участники фиксируют минимальный объем, затем уточняют допустимые сроки поставки, требования к качеству, порядок обмена документами и способ подтверждения платежа. Итоговая цена зависит от выбранного маршрута, доступности склада, размера партии, банковских условий и срока действия заявки. При изменении порта назначения, графика приемки, валюты расчетов, требований к страхованию или состава документов параметры оплаты пересматриваются отдельно. В демо-сценарии карточка показывает полный текст условий только в модальном просмотре, а в таблице остается краткий фрагмент, чтобы список заявок не растягивался и пользователи могли быстро сравнивать несколько предложений между собой. Условия действуют после подтверждения полномочий участника, лимитов и готовности сторон перейти к сделке",
    delivery: "Любой способ, порт назначения - по согласованию",
    status: "Отменена",
  },
];

function normalizeViewTarget(view) {
  let authMode = null;
  if (view === "register") {
    authMode = "register";
    view = "login";
  } else if (view === "login") {
    authMode = "login";
  }
  return { view, authMode };
}

function cancelViewReady() {
  viewReadyToken += 1;
  window.clearTimeout(viewReadyTimer);
}

function scheduleViewReady(after) {
  const token = viewReadyToken + 1;
  viewReadyToken = token;
  window.clearTimeout(viewReadyTimer);
  const finish = () => {
    if (token !== viewReadyToken) {
      return;
    }
    window.clearTimeout(viewReadyTimer);
    applyTypography(app);
    updateAuthStageHeight();
    app.classList.add("is-view-ready");
    if (typeof after === "function") {
      after();
    }
  };
  requestAnimationFrame(finish);
  viewReadyTimer = window.setTimeout(finish, 80);
}

function completeViewSwitch(view, authMode, after) {
  app.dataset.view = view;
  app.classList.remove("is-view-leaving");
  app.classList.remove("is-view-ready");
  if (authMode) {
    setAuthMode(authMode);
  }
  scheduleViewReady(after);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function setView(nextView, options = {}) {
  const settings = typeof options === "boolean" ? { immediate: options } : options;
  const { view, authMode } = normalizeViewTarget(nextView);
  const sameView = app.dataset.view === view;
  window.clearTimeout(viewSwitchTimer);
  cancelViewReady();
  closeDrawer(false);
  closeColumnMenus();
  closeDatePicker();

  if (sameView) {
    app.classList.remove("is-view-leaving");
    if (authMode) {
      setAuthMode(authMode);
    }
    scheduleViewReady(settings.after);
    return;
  }

  const immediate = Boolean(settings.immediate) || reducedMotionQuery.matches;
  app.classList.remove("is-view-ready");

  if (immediate) {
    completeViewSwitch(view, authMode, settings.after);
    return;
  }

  app.classList.add("is-view-leaving");
  viewSwitchTimer = window.setTimeout(() => {
    viewSwitchTimer = null;
    completeViewSwitch(view, authMode, settings.after);
  }, viewSwitchDelay);
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[char]);
}

function typographText(value) {
  return String(value || "").replace(typographWordPattern, "$1$2\u00a0$3");
}

function applyTypography(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || typographSkipTags.has(parent.tagName) || !/[а-яё]/i.test(node.nodeValue)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  nodes.forEach((node) => {
    node.nodeValue = typographText(node.nodeValue);
  });
}

function setDynamicEmail(target, value) {
  const email = String(value || "").trim() || "test@test.ru";
  if (target === "confirm" && confirmEmail) {
    lastRegisterEmail = email;
    confirmEmail.textContent = email;
  }
  if (target === "reset" && resetEmail) {
    lastForgotEmail = email;
    resetEmail.textContent = email;
  }
}

function getActiveAuthPane() {
  return document.querySelector(".bo-auth-pane.is-active");
}

function getAuthPane(mode) {
  return document.querySelector(`[data-auth-pane="${mode}"]`);
}

function updateAuthStageHeight() {
  if (!authStage) {
    return;
  }
  const activePane = getActiveAuthPane();
  if (activePane) {
    authStage.style.height = `${activePane.offsetHeight}px`;
  }
}

function activateAuthPane(mode) {
  authPanes.forEach((pane) => {
    const active = pane.dataset.authPane === mode;
    pane.hidden = !active;
    pane.classList.toggle("is-active", active);
    pane.classList.remove("is-leaving");
    pane.setAttribute("aria-hidden", active ? "false" : "true");
    pane.inert = !active;
    if (!active) {
      clearFormErrors(pane);
    }
  });
  authModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTarget === mode);
  });
  authCard.dataset.authMode = mode;
  requestAnimationFrame(() => {
    updateAuthStageHeight();
    applyTypography(authCard);
  });
}

function setAuthMode(mode, immediate = false) {
  if (!authCard || !authStage) {
    return;
  }
  window.clearTimeout(authSwitchTimer);
  const targetPane = getAuthPane(mode);
  const currentPane = getActiveAuthPane();
  if (!targetPane || (currentPane === targetPane && authCard.dataset.authMode === mode)) {
    updateAuthStageHeight();
    return;
  }
  const currentHeight = currentPane ? currentPane.offsetHeight : authStage.getBoundingClientRect().height;
  authStage.style.height = `${currentHeight}px`;
  authCard.dataset.authMode = mode;
  authModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTarget === mode);
  });
  if (immediate || !currentPane) {
    activateAuthPane(mode);
    return;
  }
  currentPane.classList.remove("is-active");
  currentPane.classList.add("is-leaving");
  currentPane.setAttribute("aria-hidden", "true");
  currentPane.inert = true;
  clearFormErrors(currentPane);
  authSwitchTimer = window.setTimeout(() => {
    currentPane.hidden = true;
    targetPane.hidden = false;
    activateAuthPane(mode);
  }, authSwitchDelay);
}

function volumeMarkup(request) {
  if (!request.volumeNote) {
    return escapeHtml(request.volume);
  }
  return `${escapeHtml(request.volume)} <small>(${escapeHtml(request.volumeNote)})</small>`;
}

function parseDate(value) {
  const match = String(value || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return 0;
  }
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

function isValidDateString(value) {
  const match = String(value || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return false;
  }
  const [, day, month, year] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function formatDateInput(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{2})(\d)/, "$1.$2.$3");
}

function parseNumber(value) {
  const match = String(value || "").replace(",", ".").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function sortValue(request, key) {
  if (key === "date") {
    return parseDate(request.date);
  }
  if (key === "volume") {
    return parseNumber(request.volume);
  }
  if (key === "price") {
    return parseNumber(request.price);
  }
  return 0;
}

function sortRequests(items) {
  if (!sortState.key) {
    return items;
  }
  return [...items].sort((a, b) => {
    const aValue = sortValue(a, sortState.key);
    const bValue = sortValue(b, sortState.key);
    if (aValue === null && bValue === null) {
      return 0;
    }
    if (aValue === null) {
      return 1;
    }
    if (bValue === null) {
      return -1;
    }
    const diff = aValue - bValue;
    return sortState.direction === "asc" ? diff : -diff;
  });
}

function matchesFilters(request) {
  const values = new FormData(filters);
  const type = values.get("type");
  const status = values.get("status");
  const participant = normalize(values.get("participant"));
  const product = normalize(values.get("product"));
  const delivery = normalize(values.get("delivery"));

  return (!type || request.type === type)
    && (!status || request.status === status)
    && (!participant || normalize(request.participant).includes(participant))
    && (!product || normalize(request.product).includes(product))
    && (!delivery || normalize(request.delivery).includes(delivery));
}

function renderRequests() {
  const filtered = sortRequests(requests.filter(matchesFilters));
  if (!filtered.length) {
    requestsBody.innerHTML = `
      <tr class="bo-empty-row">
        <td colspan="8">
          <div class="bo-empty-state">
            <strong>По выбранным фильтрам заявок нет</strong>
            <span>Измените параметры поиска или выберите другой статус</span>
            <button class="bo-secondary" type="button" data-reset-filters>Сбросить фильтры</button>
          </div>
        </td>
      </tr>
    `;
    syncControlState();
    applyTypography(requestsBody);
    return;
  }
  requestsBody.innerHTML = filtered.map((request, index) => `
    <tr data-request-id="${escapeHtml(request.id)}" tabindex="0" style="--row-index: ${index}" aria-label="${escapeHtml(request.type)} ${escapeHtml(request.product)}">
      <td data-label="ДАТА ЗАЯВКИ">${escapeHtml(request.date)}</td>
      <td data-label="ТИП"><strong class="bo-type ${typeClasses[request.type]}">${escapeHtml(request.type)}</strong></td>
      <td data-label="УЧАСТНИК">${escapeHtml(request.participant)}</td>
      <td data-label="ТОВАР">${escapeHtml(request.product)}</td>
      <td data-label="ОБЪЁМ">${volumeMarkup(request)}</td>
      <td data-label="ЦЕНА И УСЛОВИЯ"><span class="bo-cell-clamp bo-cell-clamp--price">${escapeHtml(request.price)}</span></td>
      <td data-label="УСЛОВИЯ ПОСТАВКИ">${escapeHtml(request.delivery)}</td>
      <td data-label="СТАТУС"><span class="bo-status ${statusClasses[request.status]}">${escapeHtml(request.status)}</span></td>
    </tr>
  `).join("");
  syncControlState();
  applyTypography(requestsBody);
}

function getRequestById(id) {
  return requests.find((request) => request.id === id);
}

function setClassByMap(element, map, value, baseClass) {
  element.className = baseClass;
  element.classList.add(map[value]);
}

function fillDrawer(request) {
  drawer.querySelector("[data-drawer-date]").textContent = request.date;
  drawer.querySelector("[data-drawer-product]").textContent = request.product;
  drawer.querySelector("[data-drawer-participant]").textContent = request.participant;
  drawer.querySelector("[data-drawer-volume]").textContent = request.volumeNote
    ? `${request.volume} (${request.volumeNote})`
    : request.volume || "-";
  drawer.querySelector("[data-drawer-delivery]").textContent = request.delivery || "-";
  drawer.querySelector("[data-drawer-price]").textContent = request.price || "-";

  const type = drawer.querySelector("[data-drawer-type]");
  type.textContent = request.type;
  setClassByMap(type, typeClasses, request.type, "bo-type");

  const status = drawer.querySelector("[data-drawer-status]");
  status.textContent = request.status;
  setClassByMap(status, statusClasses, request.status, "bo-status");

  const flag = drawer.querySelector("[data-drawer-flag]");
  flag.hidden = !request.flag;
  if (request.flag) {
    flag.src = request.flag;
  }

  const logo = drawer.querySelector("[data-drawer-logo]");
  logo.hidden = !request.logo;
  if (request.logo) {
    logo.src = request.logo;
  }
  applyTypography(drawer);
}

function openDrawer(id) {
  const request = getRequestById(id);
  if (!request) {
    return;
  }
  fillDrawer(request);
  drawer.hidden = false;
  drawerBackdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  drawer.getBoundingClientRect();
  document.body.classList.add("is-drawer-open");
  app.classList.add("is-drawer-open");
  requestAnimationFrame(() => {
    drawer.querySelector("[data-close-drawer]").focus({ preventScroll: true });
  });
}

function closeDrawer(animate = true) {
  if (drawer.hidden) {
    document.body.classList.remove("is-drawer-open");
    app.classList.remove("is-drawer-open");
    return;
  }
  document.body.classList.remove("is-drawer-open");
  app.classList.remove("is-drawer-open");
  drawer.setAttribute("aria-hidden", "true");
  const finish = () => {
    drawer.hidden = true;
    drawerBackdrop.hidden = true;
  };
  if (animate) {
    window.setTimeout(finish, 220);
  } else {
    finish();
  }
}

function openSuccessModal(requestId) {
  lastSubmittedRequestId = requestId;
  successModal.hidden = false;
  successModal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    app.classList.add("is-success-open");
    successModal.querySelector("[data-close-success]").focus({ preventScroll: true });
  });
}

function closeSuccessModal() {
  if (successModal.hidden) {
    return;
  }
  app.classList.remove("is-success-open");
  successModal.setAttribute("aria-hidden", "true");
  window.setTimeout(() => {
    successModal.hidden = true;
    setView("requests", {
      after: () => {
        if (lastSubmittedRequestId) {
          window.setTimeout(() => openDrawer(lastSubmittedRequestId), 120);
        }
      },
    });
  }, successCloseDelay);
}

function requestFromForm(form) {
  const values = new FormData(form);
  const id = `request-${Date.now()}`;
  return {
    id,
    date: values.get("date"),
    type: values.get("type"),
    participant: values.get("participant"),
    product: values.get("product"),
    volume: values.get("volume") || "-",
    price: values.get("price") || "-",
    delivery: values.get("delivery") || "-",
    status: values.get("status"),
  };
}

function getFieldErrorMessage(field) {
  const value = String(field.value || "").trim();
  if (field.required && !value) {
    return field.dataset.errorRequired || "Заполните обязательное поле";
  }
  if (field.type === "email" && value && field.validity.typeMismatch) {
    return field.dataset.errorEmail || "Введите корректный e-mail";
  }
  if (field.minLength > 0 && value && value.length < field.minLength) {
    return field.dataset.errorMinlength || "Минимум 6 символов";
  }
  if (field.pattern && value && !new RegExp(`^(?:${field.pattern})$`).test(value)) {
    return field.dataset.errorPattern || "Заполните обязательное поле";
  }
  if (field.dataset.dateInput !== undefined && value && !isValidDateString(value)) {
    return field.dataset.errorPattern || "Укажите дату в формате дд.мм.гггг";
  }
  if (field.dataset.match) {
    const matchedField = field.form.elements[field.dataset.match];
    if (matchedField && value && value !== matchedField.value) {
      return field.dataset.errorMatch || "Пароли должны совпадать";
    }
  }
  return "";
}

function setFieldError(field, message) {
  const container = field.closest(".bo-field");
  const error = container ? container.querySelector(".bo-field__error") : null;
  field.setAttribute("aria-invalid", message ? "true" : "false");
  if (container) {
    container.classList.toggle("is-invalid", Boolean(message));
  }
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
  if (field.closest(".bo-auth-pane.is-active")) {
    requestAnimationFrame(updateAuthStageHeight);
  }
}

function prepareValidationSlots() {
  document.querySelectorAll(".bo-field__error").forEach((error) => {
    error.hidden = !error.textContent;
  });
}

function validateField(field) {
  const message = getFieldErrorMessage(field);
  setFieldError(field, message);
  return !message;
}

function validateForm(form) {
  const fields = [...form.querySelectorAll("input, select, textarea")];
  let firstInvalid = null;
  fields.forEach((field) => {
    if (!validateField(field) && !firstInvalid) {
      firstInvalid = field;
    }
  });
  updateAuthStageHeight();
  if (firstInvalid) {
    firstInvalid.focus({ preventScroll: true });
    firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
    return false;
  }
  return true;
}

function clearFormErrors(form) {
  form.querySelectorAll("input, select, textarea").forEach((field) => {
    setFieldError(field, "");
  });
}

function closeColumnMenus() {
  columnMenus.forEach((menu) => {
    menu.hidden = true;
    menu.style.removeProperty("--menu-top");
    menu.style.removeProperty("--menu-left");
  });
  columnFilterButtons.forEach((button) => {
    button.classList.remove("is-active");
  });
}

function positionColumnMenu(menu, button) {
  const rect = button.getBoundingClientRect();
  const menuWidth = Math.max(menu.offsetWidth, 138);
  const viewportGap = 12;
  const left = Math.min(
    Math.max(viewportGap, rect.left + 8),
    window.innerWidth - menuWidth - viewportGap,
  );
  menu.style.setProperty("--menu-left", `${left}px`);
  menu.style.setProperty("--menu-top", `${rect.bottom + 6}px`);
}

function repositionOpenColumnMenu() {
  const openMenu = [...columnMenus].find((menu) => !menu.hidden);
  if (!openMenu) {
    return;
  }
  const button = document.querySelector(`[data-column-filter="${openMenu.dataset.columnMenu}"]`);
  if (button) {
    positionColumnMenu(openMenu, button);
  }
}

function toggleColumnMenu(button) {
  const key = button.dataset.columnFilter;
  columnMenus.forEach((menu) => {
    const isCurrent = menu.dataset.columnMenu === key;
    const shouldOpen = isCurrent ? menu.hidden : false;
    menu.hidden = !shouldOpen;
    if (shouldOpen) {
      positionColumnMenu(menu, button);
    }
  });
  columnFilterButtons.forEach((button) => {
    const menu = document.querySelector(`[data-column-menu="${button.dataset.columnFilter}"]`);
    button.classList.toggle("is-active", menu && !menu.hidden);
  });
}

function closeDatePicker() {
  if (datePicker) {
    datePicker.hidden = true;
  }
}

function openDatePicker() {
  if (!datePicker) {
    return;
  }
  closeColumnMenus();
  datePicker.hidden = false;
}

function selectDate(value) {
  if (!dateInput) {
    return;
  }
  dateInput.value = value;
  validateField(dateInput);
  closeDatePicker();
  dateInput.focus({ preventScroll: true });
}

function buildDatePicker() {
  if (!datePicker) {
    return;
  }
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  datePicker.innerHTML = `
    <div class="bo-date-picker__head">Август 2026</div>
    <div class="bo-date-picker__week" aria-hidden="true">
      <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
    </div>
    <div class="bo-date-picker__grid">
      ${Array.from({ length: 5 }, () => "<span></span>").join("")}
      ${days.map((day) => {
        const date = `${String(day).padStart(2, "0")}.08.2026`;
        return `<button type="button" data-date-value="${date}">${day}</button>`;
      }).join("")}
    </div>
  `;
  datePicker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date-value]");
    if (button) {
      selectDate(button.dataset.dateValue);
    }
  });
}

function syncTopFilters() {
  [...filters.elements].forEach((field) => {
    if (!field.name) {
      return;
    }
    const label = field.closest("label");
    if (label) {
      label.classList.toggle("is-active-filter", Boolean(String(field.value || "").trim()));
    }
  });
}

function resetFilters() {
  filters.reset();
  closeColumnMenus();
  renderRequests();
}

function syncControlState() {
  sortButtons.forEach((button) => {
    const th = button.closest("th");
    const active = sortState.key === button.dataset.sortKey;
    button.classList.toggle("is-active", active);
    th.dataset.sortState = active ? sortState.direction : "none";
  });

  columnFilterValueButtons.forEach((button) => {
    const menu = button.closest("[data-column-menu]");
    const value = filters.elements[menu.dataset.columnMenu].value;
    button.classList.toggle("is-active", button.dataset.columnFilterValue === value);
  });

  columnFilterButtons.forEach((button) => {
    const value = filters.elements[button.dataset.columnFilter].value;
    button.classList.toggle("is-filtered", Boolean(value));
  });

  syncTopFilters();
}

viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

authModeButtons.forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authTarget));
});

forms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validateForm(form)) {
      return;
    }
    if (form === requestForm) {
      const request = requestFromForm(form);
      requests = [request, ...requests];
      form.reset();
      clearFormErrors(form);
      renderRequests();
      openSuccessModal(request.id);
      return;
    }
    if (form.dataset.nextView === "confirm") {
      setDynamicEmail("confirm", form.elements.email.value);
    }
    if (form.dataset.nextView === "reset") {
      setDynamicEmail("reset", form.elements.email.value);
    }
    setView(form.dataset.nextView);
  });

  form.addEventListener("input", (event) => {
    if (!event.target.matches("input, select, textarea")) {
      return;
    }
    if (event.target.dataset.dateInput !== undefined) {
      event.target.value = formatDateInput(event.target.value);
    }
    validateField(event.target);
    if (event.target.name === "password") {
      const confirm = form.elements.password_confirm;
      if (confirm && confirm.value) {
        validateField(confirm);
      }
    }
  });

  form.addEventListener("blur", (event) => {
    if (event.target.matches("input, select, textarea")) {
      validateField(event.target);
    }
  }, true);
});

filters.addEventListener("input", renderRequests);
filters.addEventListener("change", renderRequests);
filters.addEventListener("submit", (event) => {
  event.preventDefault();
  renderRequests();
});

if (dateInput) {
  dateInput.addEventListener("focus", openDatePicker);
}

if (dateToggle) {
  dateToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (datePicker && datePicker.hidden) {
      openDatePicker();
    } else {
      closeDatePicker();
    }
  });
}

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sortKey;
    if (sortState.key === key) {
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    } else {
      sortState = {
        key,
        direction: defaultSortDirections[key],
      };
    }
    renderRequests();
  });
});

columnFilterButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleColumnMenu(button);
  });
});

columnFilterValueButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = button.closest("[data-column-menu]");
    filters.elements[menu.dataset.columnMenu].value = button.dataset.columnFilterValue;
    closeColumnMenus();
    renderRequests();
  });
});

document.addEventListener("click", (event) => {
  closeColumnMenus();
  if (datePicker && !event.target.closest("[data-date-field]")) {
    closeDatePicker();
  }
});

requestsBody.addEventListener("click", (event) => {
  const resetButton = event.target.closest("[data-reset-filters]");
  if (resetButton) {
    resetFilters();
    return;
  }
  const row = event.target.closest("[data-request-id]");
  if (row) {
    openDrawer(row.dataset.requestId);
  }
});

requestsBody.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const row = event.target.closest("[data-request-id]");
  if (row) {
    event.preventDefault();
    openDrawer(row.dataset.requestId);
  }
});

drawerClosers.forEach((button) => {
  button.addEventListener("click", () => closeDrawer());
});

successClosers.forEach((button) => {
  button.addEventListener("click", closeSuccessModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSuccessModal();
    closeDrawer();
    closeColumnMenus();
    closeDatePicker();
  }
});

prepareValidationSlots();
buildDatePicker();
setDynamicEmail("confirm", lastRegisterEmail);
setDynamicEmail("reset", lastForgotEmail);
renderRequests();
setAuthMode("login", true);
applyTypography(app);
app.classList.add("is-view-ready");
window.addEventListener("resize", updateAuthStageHeight);
window.addEventListener("resize", repositionOpenColumnMenu);
window.addEventListener("scroll", repositionOpenColumnMenu, true);
