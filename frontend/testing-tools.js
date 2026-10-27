(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const lockedPanel = byId("loginToolsLocked");
  const unlockedPanel = byId("loginToolsUnlocked");
  const passphraseInput = byId("loginToolsPassphrase");
  const unlockButton = byId("loginToolsUnlock");
  const lockButton = byId("loginToolsLock");
  const status = byId("loginToolsStatus");
  const enabled = byId("loginHeadersEnabled");
  const controls = byId("loginHeaderControls");
  const preview = byId("loginHeadersPreview");
  const count = byId("loginHeadersCount");
  let deadline = 0;
  let lockTimer;
  let unlockController = null;
  let unlockVersion = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clearLoginResult() {
    byId("loginMessage").textContent = "";
    byId("loginResponse").textContent = "";
    byId("loginResponseBox").classList.add("hidden");
    byId("loginResponseBox").open = false;
  }

  function lockTools(message = "Locked. Standard login is available.") {
    unlockVersion += 1;
    unlockController?.abort();
    unlockController = null;
    clearTimeout(lockTimer);
    deadline = 0;
    passphraseInput.value = "";
    passphraseInput.disabled = false;
    unlockButton.disabled = false;
    unlockButton.textContent = "Unlock";
    lockButton.classList.add("hidden");
    lockedPanel.classList.remove("hidden");
    unlockedPanel.classList.add("hidden");
    enabled.checked = false;
    controls.disabled = true;
    controls.replaceChildren();
    byId("loginToolsTitle").textContent = "";
    byId("loginToolsDescription").textContent = "";
    preview.value = "";
    preview.rows = 3;
    count.textContent = "";
    status.textContent = message;
    clearLoginResult();
    window.dispatchEvent(new Event("testing-tools-lock"));
  }

  function isUnlocked() {
    if (deadline && Date.now() >= deadline) {
      lockTools("Access expired. Enter your passphrase to unlock again.");
    }
    return deadline > 0;
  }

  // Both the preview and the request use this builder.
  function getHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (!isUnlocked() || !enabled.checked) return headers;

    for (const control of controls.querySelectorAll("[data-header]")) {
      if (control.matches(":disabled") || (control.type === "checkbox" && !control.checked)) continue;
      if (control.tagName === "SELECT" && control.selectedOptions[0]?.disabled) {
        throw new Error(`${control.dataset.header}: choose an available option.`);
      }
      if (!control.validity.valid) throw new Error(`${control.dataset.header}: ${control.validationMessage}`);
      const value = control.type === "number" ? String(control.valueAsNumber) : control.value.trim();
      if (/[^\x20-\x7E]/.test(value)) throw new Error(`${control.dataset.header}: use a single line of printable ASCII characters.`);
      if (value !== "") headers[control.dataset.header] = value;
    }
    return headers;
  }

  function updatePreview() {
    if (!isUnlocked()) return;
    controls.disabled = !enabled.checked;
    for (const input of controls.querySelectorAll('input[type="text"]')) {
      input.setCustomValidity(/[^\x20-\x7E]/.test(input.value)
        ? "Use a single line of printable ASCII characters for this header."
        : "");
    }
    try {
      const headers = getHeaders();
      const total = Object.keys(headers).length - 1;
      preview.value = JSON.stringify(headers, null, 2);
      preview.rows = total + 3;
      count.textContent = `${total} override${total === 1 ? "" : "s"}`;
    } catch (error) {
      preview.value = error.message;
      preview.rows = 3;
      count.textContent = "Fix the invalid value to send";
    }
  }

  function renderSchema(schema) {
    if (schema?.version !== 1 || !Array.isArray(schema.groups)
      || typeof schema.title !== "string" || typeof schema.description !== "string") {
      throw new Error("Invalid testing controls.");
    }
    const fragment = document.createDocumentFragment();
    fragment.append(element("legend", "sr-only", "Private testing controls"));
    const ids = new Set();
    const claimId = (id) => {
      if (typeof id !== "string" || !/^login[A-Za-z0-9]+$/.test(id) || ids.has(id) || byId(id)) {
        throw new Error("Invalid testing control identifier.");
      }
      ids.add(id);
      return id;
    };

    for (const group of schema.groups) {
      if (!Array.isArray(group.fields)) throw new Error("Invalid testing group.");
      const wrapper = element(group.advanced ? "details" : "div",
        group.advanced ? "rounded-lg border bg-white p-3" : "space-y-2");
      if (group.title) {
        wrapper.append(element(group.advanced ? "summary" : "h4",
          "text-sm font-medium text-gray-700 cursor-pointer", group.title));
      }
      const grid = element("div", `${group.advanced ? "mt-3 " : ""}grid gap-3 sm:grid-cols-2`);
      for (const field of group.fields) {
        if (typeof field.label !== "string" || typeof field.header !== "string"
          || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(field.header)) {
          throw new Error("Invalid testing field.");
        }
        const id = claimId(field.id);
        const wrapper = element("div", "min-w-0");
        const label = element("label", "text-sm font-medium text-gray-700", field.label);
        label.htmlFor = id;
        let input;
        if (field.type === "select") {
          if (!Array.isArray(field.options)) throw new Error("Invalid testing options.");
          input = element("select", "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand");
          for (const option of field.options) {
            if (typeof option.value !== "string" || typeof option.label !== "string") throw new Error("Invalid testing option.");
            const node = element("option", "", option.label);
            node.value = option.value;
            node.disabled = option.disabled === true;
            input.append(node);
          }
          input.value = "";
          wrapper.append(label, input);
        } else if (field.type === "score") {
          const min = field.min ?? 0;
          const max = field.max ?? 100;
          const initial = field.default ?? 95;
          if (![min, max, initial].every(Number.isInteger) || min > max || initial < min || initial > max) {
            throw new Error("Invalid testing score range.");
          }
          wrapper.className = "rounded-lg border bg-white p-3 min-w-0";
          wrapper.dataset.scoreControl = "";
          const toggle = element("input", "h-4 w-4 accent-blue-600");
          toggle.type = "checkbox";
          toggle.id = claimId(`${id}Enabled`);
          toggle.dataset.scoreEnabled = "";
          label.className = "flex items-center gap-2 text-sm font-medium text-gray-700";
          label.htmlFor = toggle.id;
          label.prepend(toggle);
          const row = element("div", "mt-2 flex items-center gap-3");
          const range = element("input", "min-w-0 flex-1 accent-blue-600");
          range.type = "range";
          range.id = claimId(`${id}Range`);
          input = element("input", "w-20 rounded-lg border border-gray-300 px-2 py-1 font-mono text-sm focus:ring-2 focus:ring-brand");
          input.type = "number";
          input.required = true;
          for (const control of [range, input]) {
            control.min = String(min);
            control.max = String(max);
            control.step = "1";
            control.defaultValue = String(initial);
            control.value = String(initial);
            control.disabled = true;
          }
          range.setAttribute("aria-label", `${field.label} slider`);
          input.setAttribute("aria-label", `${field.label} value`);
          toggle.addEventListener("change", () => {
            range.disabled = input.disabled = !toggle.checked;
            updatePreview();
          });
          range.addEventListener("input", () => { input.value = range.value; });
          input.addEventListener("input", () => {
            if (input.validity.valid) range.value = input.value;
          });
          row.append(range, input);
          wrapper.append(label, row);
        } else if (field.type === "checkbox") {
          if (typeof field.value !== "string") throw new Error("Invalid testing toggle.");
          wrapper.className = "min-w-0 sm:col-span-2";
          input = element("input", "mt-1 h-4 w-4 shrink-0 accent-blue-600");
          input.type = "checkbox";
          input.value = field.value;
          label.className = "flex items-start gap-2 text-sm text-gray-700";
          label.prepend(input);
          wrapper.append(label);
        } else if (field.type === "text") {
          wrapper.className = "min-w-0 sm:col-span-2";
          input = element("input", "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-brand");
          input.type = "text";
          input.autocomplete = "off";
          input.spellcheck = false;
          input.placeholder = "Enter an optional value";
          wrapper.append(label, input);
        } else {
          throw new Error("Unsupported testing control.");
        }
        input.id = id;
        input.dataset.header = field.header;
        const help = element("p", "mt-1 text-xs text-gray-500 break-words");
        help.id = claimId(`${id}Help`);
        help.append(element("code", "", `${field.header}${field.type === "checkbox" ? `: ${field.value}` : ""}`));
        if (field.description) help.append(document.createTextNode(` — ${field.description}`));
        input.setAttribute("aria-describedby", help.id);
        wrapper.append(help);
        grid.append(wrapper);
      }
      wrapper.append(grid);
      fragment.append(wrapper);
    }
    controls.replaceChildren(fragment);
    byId("loginToolsTitle").textContent = schema.title;
    byId("loginToolsDescription").textContent = schema.description;
  }

  async function unlockTools() {
    if (unlockController || isUnlocked()) return;
    if (!passphraseInput.value) {
      status.textContent = "Enter your testing passphrase first.";
      passphraseInput.focus();
      return;
    }
    const version = ++unlockVersion;
    const controller = new AbortController();
    unlockController = controller;
    unlockButton.disabled = true;
    unlockButton.textContent = "Unlocking…";
    lockButton.classList.remove("hidden");
    lockButton.textContent = "Cancel";
    status.textContent = "Checking passphrase…";
    try {
      const request = fetch("/api/testing-tools/unlock", {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: passphraseInput.value }),
        signal: controller.signal,
      });
      passphraseInput.value = "";
      passphraseInput.disabled = true;
      const response = await request;
      if (version !== unlockVersion) return;
      if (!response.ok) {
        const message = response.status === 401 ? "Incorrect passphrase. Try again."
          : response.status === 429 ? "Too many attempts. Wait a few minutes before trying again."
          : response.status === 503 ? "Testing tools are not configured on this server."
          : response.status === 404 ? "Unlock endpoint not found (HTTP 404). The deployed gateway needs the testing-tools route."
          : response.status === 405 ? "Unlock request method rejected (HTTP 405). Check the deployed gateway route."
          : `Could not unlock testing tools (HTTP ${response.status}). Please try again.`;
        lockTools(message);
        return;
      }
      const payload = await response.json();
      if (version !== unlockVersion) return;
      if (!Number.isFinite(payload.expiresIn) || payload.expiresIn <= 0) throw new Error("Invalid access duration.");
      renderSchema(payload.schema);
      const duration = Math.min(payload.expiresIn, 900) * 1000;
      deadline = Date.now() + duration;
      lockTimer = setTimeout(() => lockTools("Access expired. Enter your passphrase to unlock again."), duration);
      lockedPanel.classList.add("hidden");
      unlockedPanel.classList.remove("hidden");
      lockButton.textContent = "Lock tools";
      status.textContent = "Unlocked for this page visit. Lock the tools when you finish.";
      updatePreview();
    } catch (error) {
      if (!controller.signal.aborted && version === unlockVersion) {
        lockTools("Could not unlock testing tools. Check the connection and try again.");
      }
    } finally {
      if (version === unlockVersion) {
        unlockController = null;
        unlockButton.disabled = false;
        unlockButton.textContent = "Unlock";
        passphraseInput.disabled = false;
      }
    }
  }

  unlockButton.addEventListener("click", unlockTools);
  passphraseInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      unlockTools();
    }
  });
  lockButton.addEventListener("click", () => lockTools());
  enabled.addEventListener("change", updatePreview);
  controls.addEventListener("input", updatePreview);
  controls.addEventListener("change", updatePreview);
  controls.addEventListener("invalid", (event) => {
    const details = event.target.closest("details");
    if (details) details.open = true;
  }, true);
  byId("loginHeadersReset").addEventListener("click", () => {
    enabled.checked = false;
    for (const control of controls.querySelectorAll("input, select")) {
      if (control.type === "checkbox") control.checked = false;
      else control.value = control.tagName === "SELECT" ? "" : control.defaultValue;
      if (control.type === "range" || control.type === "number") control.disabled = true;
    }
    updatePreview();
  });
  window.addEventListener("pagehide", () => lockTools());
  window.addEventListener("pageshow", (event) => { if (event.persisted) lockTools(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) isUnlocked(); });
  window.loginTestingTools = Object.freeze({ getHeaders, lock: lockTools });
  lockTools();
})();
