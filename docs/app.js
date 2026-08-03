const app = document.querySelector("#app");
const searchInput = document.querySelector("#global-search");

const FIELD_LABELS = {
  id: "ID", name: "名称", description: "描述", family: "模型家族",
  attachment: "文件附件", reasoning: "推理能力", reasoning_options: "推理选项",
  tool_call: "工具调用", interleaved: "交错推理", structured_output: "结构化输出",
  temperature: "温度参数", knowledge: "知识截止日期", release_date: "发布日期",
  last_updated: "更新时间", modalities: "输入输出模态", open_weights: "开放权重",
  limit: "限制", context: "上下文窗口", input: "输入", output: "输出",
  cost: "价格（每百万 Token / 美元）", cache_read: "缓存读取价格",
  cache_write: "缓存写入价格", status: "生命周期状态", provider: "服务商调用配置",
  experimental: "实验性配置", weights: "权重", benchmarks: "评测", links: "相关链接",
  api: "API 地址", env: "环境变量", npm: "SDK 包", doc: "官方文档", models: "模型",
  label: "标签", url: "链接", type: "类型", min: "最小值", max: "最大值",
};

const BOOLEAN_LABELS = { true: "是", false: "否" };
const state = {
  catalog: { models: {}, providers: {} },
  siteData: { labs: {}, model_providers: {} },
  query: "",
  modelFilters: { lab: "all", reasoning: "all", weights: "all" },
  modelSort: { key: "name", direction: 1 },
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const routeHref = (section, id) => `#/${section}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;
const formatNumber = (value) => value == null ? "—" : new Intl.NumberFormat("zh-CN").format(value);
const isUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value);
const labIdFor = (modelId) => modelId.split("/")[0];
const labFor = (id) => state.siteData.labs?.[id] ?? { id, name: id };
const providerFor = (id) => state.catalog.providers[id] ?? { id, name: id, models: {} };
const boolBadge = (value) => value === undefined
  ? '<span class="badge unknown">未知</span>'
  : `<span class="badge ${value ? "yes" : "no"}">${BOOLEAN_LABELS[value]}</span>`;
const logo = (kind, id, large = false) => `<img class="logo${large ? " large" : ""}" src="logos/${kind === "labs" ? "labs/" : ""}${escapeHtml(id)}.svg" alt="" onerror="this.hidden=true">`;

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { section: parts[0] || "models", id: parts.length > 1 ? decodeURIComponent(parts.slice(1).join("/")) : undefined };
}

function setActiveNav(section) {
  document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("active", link.dataset.nav === section));
}

function pageHeading(eyebrow, title, lead, count = "") {
  return `<header class="page-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(lead)}</p></div>${count ? `<span class="count-note">${escapeHtml(count)}</span>` : ""}</header>`;
}

function modelOfferings(modelId) {
  return (state.siteData.model_providers?.[modelId] ?? []).flatMap(({ provider_id, model_id }) => {
    const provider = state.catalog.providers[provider_id];
    const model = provider?.models?.[model_id];
    return provider && model ? [{ providerId: provider_id, modelId: model_id, provider, model }] : [];
  });
}

function minimumPrice(modelId) {
  const prices = modelOfferings(modelId).flatMap(({ model }) => Object.values(model.cost ?? {}).filter((x) => typeof x === "number"));
  return prices.length ? `$${Math.min(...prices).toLocaleString("zh-CN")}` : "未公布";
}

function renderMetrics() {
  const offerings = Object.values(state.catalog.providers).reduce((sum, provider) => sum + Object.keys(provider.models ?? {}).length, 0);
  const values = [
    [Object.keys(state.catalog.models).length, "规范模型"],
    [Object.keys(state.catalog.providers).length, "服务商"],
    [Object.keys(state.siteData.labs ?? {}).length, "研发机构"],
    [offerings, "可调用模型"],
  ];
  return `<div class="metrics">${values.map(([value, label]) => `<div class="metric-card"><strong>${formatNumber(value)}</strong><span>${label}</span></div>`).join("")}</div>`;
}

function modelSortValue([id, model], key) {
  if (key === "lab") return labFor(labIdFor(id)).name;
  if (key === "providers") return modelOfferings(id).length;
  if (key === "context") return model.limit?.context ?? -1;
  if (key === "price") return Math.min(...modelOfferings(id).flatMap(({ model: offering }) => Object.values(offering.cost ?? {})).filter(Number.isFinite), Infinity);
  return model[key] ?? "";
}

function sortHeader(key, label) {
  const active = state.modelSort.key === key;
  const arrow = active ? (state.modelSort.direction > 0 ? " ↑" : " ↓") : "";
  return `<button class="sort-button${active ? " active" : ""}" data-sort="${key}">${label}${arrow}</button>`;
}

function renderModels() {
  const labs = [...new Set(Object.keys(state.catalog.models).map(labIdFor))].sort();
  const q = state.query.toLowerCase();
  const rows = Object.entries(state.catalog.models).filter(([id, model]) => {
    const lab = labFor(labIdFor(id));
    const searchable = `${id} ${model.name ?? ""} ${model.description ?? ""} ${model.family ?? ""} ${lab.name}`.toLowerCase();
    return (!q || searchable.includes(q))
      && (state.modelFilters.lab === "all" || labIdFor(id) === state.modelFilters.lab)
      && (state.modelFilters.reasoning === "all" || String(model.reasoning === true) === state.modelFilters.reasoning)
      && (state.modelFilters.weights === "all" || String(model.open_weights === true) === state.modelFilters.weights);
  }).sort((left, right) => {
    const a = modelSortValue(left, state.modelSort.key);
    const b = modelSortValue(right, state.modelSort.key);
    return (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "zh-CN")) * state.modelSort.direction;
  });

  app.innerHTML = pageHeading("MODELS", "模型", "统一查看中国开发者常用模型的能力、上下文、开放权重和各服务商价格。", `显示 ${rows.length} / ${Object.keys(state.catalog.models).length}`)
    + renderMetrics()
    + `<div class="toolbar">
        <input data-local-search type="search" value="${escapeHtml(state.query)}" placeholder="筛选模型名称、ID、家族或机构">
        <select data-filter="lab"><option value="all">全部研发机构</option>${labs.map((id) => `<option value="${escapeHtml(id)}"${state.modelFilters.lab === id ? " selected" : ""}>${escapeHtml(labFor(id).name)}</option>`).join("")}</select>
        <select data-filter="reasoning"><option value="all">全部推理能力</option><option value="true"${state.modelFilters.reasoning === "true" ? " selected" : ""}>支持推理</option><option value="false"${state.modelFilters.reasoning === "false" ? " selected" : ""}>不支持推理</option></select>
        <select data-filter="weights"><option value="all">全部权重类型</option><option value="true"${state.modelFilters.weights === "true" ? " selected" : ""}>开放权重</option><option value="false"${state.modelFilters.weights === "false" ? " selected" : ""}>闭源权重</option></select>
      </div>`
    + (rows.length ? `<div class="table-panel"><div class="table-scroll"><table><thead><tr>
        <th>${sortHeader("name", "模型")}</th><th>${sortHeader("lab", "研发机构")}</th><th>${sortHeader("providers", "服务商")}</th>
        <th>${sortHeader("context", "上下文窗口")}</th><th>最大输出</th><th>推理能力</th><th>工具调用</th><th>结构化输出</th><th>温度参数</th><th>开放权重</th>
        <th>${sortHeader("price", "最低价格")}</th><th>${sortHeader("release_date", "发布日期")}</th><th>${sortHeader("last_updated", "更新时间")}</th>
      </tr></thead><tbody>${rows.map(([id, model]) => `<tr>
        <td><a class="primary-cell row-link" href="${routeHref("models", id)}">${logo("labs", labIdFor(id))}<span><strong>${escapeHtml(model.name)}</strong><small>${escapeHtml(id)}</small></span></a></td>
        <td><a href="${routeHref("labs", labIdFor(id))}">${escapeHtml(labFor(labIdFor(id)).name)}</a></td><td class="number">${modelOfferings(id).length}</td>
        <td class="number">${formatNumber(model.limit?.context)}</td><td class="number">${formatNumber(model.limit?.output)}</td>
        <td>${boolBadge(model.reasoning)}</td><td>${boolBadge(model.tool_call)}</td><td>${boolBadge(model.structured_output)}</td><td>${boolBadge(model.temperature)}</td><td>${boolBadge(model.open_weights)}</td>
        <td class="number">${minimumPrice(id)}</td><td>${escapeHtml(model.release_date ?? "—")}</td><td>${escapeHtml(model.last_updated ?? "—")}</td>
      </tr>`).join("")}</tbody></table></div></div>` : '<div class="empty-state">没有符合当前条件的模型。</div>');
  bindListControls();
}

function renderProviders() {
  const q = state.query.toLowerCase();
  const providers = Object.entries(state.catalog.providers).filter(([id, provider]) => `${id} ${provider.name ?? ""} ${provider.api ?? ""} ${provider.npm ?? ""}`.toLowerCase().includes(q));
  app.innerHTML = pageHeading("PROVIDERS", "服务商", "比较国内模型服务商的可调用模型、API 入口、SDK 与官方文档。", `显示 ${providers.length} / ${Object.keys(state.catalog.providers).length}`)
    + renderMetrics()
    + `<div class="toolbar"><input data-local-search type="search" value="${escapeHtml(state.query)}" placeholder="筛选服务商名称、ID、API 或 SDK"></div>`
    + (providers.length ? `<div class="table-panel"><div class="table-scroll"><table><thead><tr><th>服务商</th><th>模型数</th><th>SDK 包</th><th>API 地址</th><th>官方文档</th></tr></thead><tbody>${providers.map(([id, provider]) => `<tr>
      <td><a class="primary-cell row-link" href="${routeHref("providers", id)}">${logo("providers", id)}<span><strong>${escapeHtml(provider.name ?? id)}</strong><small>${escapeHtml(id)}</small></span></a></td>
      <td class="number">${Object.keys(provider.models ?? {}).length}</td><td><code>${escapeHtml(provider.npm ?? "—")}</code></td>
      <td>${provider.api ? `<code class="api-address">${escapeHtml(provider.api)}</code>` : "—"}</td>
      <td>${provider.doc ? `<a href="${escapeHtml(provider.doc)}" target="_blank" rel="noreferrer">查看文档</a>` : "—"}</td></tr>`).join("")}</tbody></table></div></div>` : '<div class="empty-state">没有符合当前条件的服务商。</div>');
  bindListControls();
}

function labModelEntries(id) {
  return Object.entries(state.catalog.models).filter(([modelId]) => labIdFor(modelId) === id);
}

function renderLabs() {
  const q = state.query.toLowerCase();
  const labs = Object.entries(state.siteData.labs ?? {}).filter(([id, lab]) => `${id} ${lab.name ?? ""} ${lab.description ?? ""}`.toLowerCase().includes(q));
  app.innerHTML = pageHeading("LABS", "研发机构", "按研发机构浏览模型家族与规范模型。", `显示 ${labs.length} / ${Object.keys(state.siteData.labs ?? {}).length}`)
    + renderMetrics()
    + `<div class="toolbar"><input data-local-search type="search" value="${escapeHtml(state.query)}" placeholder="筛选机构名称、ID 或描述"></div>`
    + (labs.length ? `<div class="lab-grid">${labs.map(([id, lab]) => `<a class="data-card" href="${routeHref("labs", id)}">${logo("labs", id, true)}<span><strong>${escapeHtml(lab.name ?? id)}</strong><span>${labModelEntries(id).length} 个模型 · ${escapeHtml(id)}</span></span></a>`).join("")}</div>` : '<div class="empty-state">没有符合当前条件的研发机构。</div>');
  bindListControls();
}

function translateKey(key) {
  return FIELD_LABELS[key] ?? key.replaceAll("_", " ");
}

function renderScalar(value, linkUrls = true) {
  if (value === undefined) return '<span class="badge unknown">未提供</span>';
  if (value === null) return '<span class="badge unknown">空值</span>';
  if (typeof value === "boolean") return boolBadge(value);
  if (isUrl(value) && linkUrls) return `<a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`;
  if (isUrl(value)) return `<code class="api-address">${escapeHtml(value)}</code>`;
  if (typeof value === "number") return `<span class="number">${formatNumber(value)}</span>`;
  return `<span>${escapeHtml(value)}</span>`;
}

function renderFieldRows(value, path = "") {
  if (Array.isArray(value)) {
    if (!value.length) return '<div class="field-row"><div class="field-value subtle">空数组</div></div>';
    return value.map((item, index) => {
      const itemPath = `${path}[${index}]`;
      return item && typeof item === "object"
        ? `<details class="field-node"><summary>第 ${index + 1} 项 <code title="${escapeHtml(itemPath)}">${escapeHtml(itemPath)}</code></summary><div class="field-children">${renderFieldRows(item, itemPath)}</div></details>`
        : `<div class="field-row"><div class="field-label"><strong>第 ${index + 1} 项</strong><code title="${escapeHtml(itemPath)}">${escapeHtml(itemPath)}</code></div><div class="field-value">${renderScalar(item)}</div></div>`;
    }).join("");
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => {
      const itemPath = path ? `${path}.${key}` : key;
      return item && typeof item === "object"
        ? `<details class="field-node"><summary>${escapeHtml(translateKey(key))} <code title="${escapeHtml(itemPath)}">${escapeHtml(itemPath)}</code></summary><div class="field-children">${renderFieldRows(item, itemPath)}</div></details>`
        : `<div class="field-row"><div class="field-label"><strong>${escapeHtml(translateKey(key))}</strong><code title="${escapeHtml(itemPath)}">${escapeHtml(itemPath)}</code></div><div class="field-value">${renderScalar(item, key !== "api")}</div></div>`;
    }).join("");
  }
  return renderScalar(value);
}

function fullDataSection(data, title = "全部字段") {
  return `<section class="section"><div class="section-heading"><h2>${escapeHtml(title)}</h2><span>所有字段均动态展示，未识别字段也不会被隐藏</span></div>
    <div class="tab-strip"><button class="tab-button active" data-tab="fields">中文字段</button><button class="tab-button" data-tab="json">原始 JSON</button></div>
    <div data-tab-panel="fields" class="field-tree">${renderFieldRows(data)}</div>
    <pre data-tab-panel="json" class="raw-block hidden">${escapeHtml(JSON.stringify(data, null, 2))}</pre></section>`;
}

function renderModelDetail(id) {
  const model = state.catalog.models[id];
  if (!model) return renderNotFound("模型", id, "models");
  const labId = labIdFor(id);
  const lab = labFor(labId);
  const offerings = modelOfferings(id);
  const modalities = [...(model.modalities?.input ?? []).map((x) => `输入：${x}`), ...(model.modalities?.output ?? []).map((x) => `输出：${x}`)];
  app.innerHTML = `<nav class="breadcrumb"><a href="#/models">模型</a><span>›</span><a href="${routeHref("labs", labId)}">${escapeHtml(lab.name)}</a><span>›</span><span>${escapeHtml(model.name)}</span></nav>
    <header class="page-heading"><div class="detail-title">${logo("labs", labId, true)}<div><p class="eyebrow">MODEL</p><h1>${escapeHtml(model.name)}</h1><p class="lead">${escapeHtml(model.description ?? "暂无中文描述")}</p><code>${escapeHtml(id)}</code></div></div></header>
    <div class="detail-grid"><section class="panel"><h2>核心参数</h2><div class="stat-grid">
      <div class="stat"><span>上下文窗口</span><strong>${formatNumber(model.limit?.context)}</strong></div><div class="stat"><span>最大输出</span><strong>${formatNumber(model.limit?.output)}</strong></div><div class="stat"><span>发布日期</span><strong>${escapeHtml(model.release_date ?? "未知")}</strong></div>
    </div></section><aside class="panel"><h2>能力与模态</h2><div class="badge-group">${[["推理", model.reasoning], ["工具调用", model.tool_call], ["结构化输出", model.structured_output], ["开放权重", model.open_weights]].map(([label, value]) => `<span class="capability ${value ? "yes" : ""}">${label}：${value === undefined ? "未知" : BOOLEAN_LABELS[value]}</span>`).join("")}${modalities.map((x) => `<span class="modality">${escapeHtml(x)}</span>`).join("")}</div></aside></div>
    <section class="section"><div class="section-heading"><h2>服务商与价格</h2><span>${offerings.length} 个可调用版本</span></div>${offerings.length ? `<div class="table-panel"><div class="table-scroll"><table><thead><tr><th>服务商</th><th>调用模型 ID</th><th>输入价格</th><th>输出价格</th><th>上下文窗口</th><th>官方文档</th></tr></thead><tbody>${offerings.map(({ providerId, modelId, provider, model: offering }) => `<tr><td><a href="${routeHref("providers", providerId)}">${escapeHtml(provider.name ?? providerId)}</a></td><td><code>${escapeHtml(modelId)}</code></td><td>${offering.cost?.input == null ? "未公布" : `$${formatNumber(offering.cost.input)}`}</td><td>${offering.cost?.output == null ? "未公布" : `$${formatNumber(offering.cost.output)}`}</td><td>${formatNumber(offering.limit?.context)}</td><td>${provider.doc ? `<a href="${escapeHtml(provider.doc)}" target="_blank" rel="noreferrer">查看文档</a>` : "—"}</td></tr>`).join("")}</tbody></table></div></div>` : '<div class="empty-state">暂未录入可调用此模型的服务商。</div>'}</section>
    ${fullDataSection(model, "模型全部字段")}`;
  bindTabs();
}

function canonicalForOffering(providerId, modelId) {
  for (const [canonicalId, offerings] of Object.entries(state.siteData.model_providers ?? {})) {
    if (offerings.some((x) => x.provider_id === providerId && x.model_id === modelId)) return canonicalId;
  }
}

function renderProviderDetail(id) {
  const provider = state.catalog.providers[id];
  if (!provider) return renderNotFound("服务商", id, "providers");
  const models = Object.entries(provider.models ?? {});
  app.innerHTML = `<nav class="breadcrumb"><a href="#/providers">服务商</a><span>›</span><span>${escapeHtml(provider.name ?? id)}</span></nav>
    <header class="page-heading"><div class="detail-title">${logo("providers", id, true)}<div><p class="eyebrow">PROVIDER</p><h1>${escapeHtml(provider.name ?? id)}</h1><p class="lead">共录入 ${models.length} 个可调用模型。</p><code>${escapeHtml(id)}</code></div></div><div class="detail-actions">${provider.doc ? `<a class="button-link" href="${escapeHtml(provider.doc)}" target="_blank" rel="noreferrer">官方文档</a>` : ""}</div></header>
    <div class="detail-grid"><section class="panel"><h2>接入信息</h2><div class="field-tree">${renderFieldRows({ api: provider.api, npm: provider.npm, env: provider.env })}</div></section><aside class="panel"><h2>目录统计</h2><div class="stat-grid"><div class="stat"><span>模型数</span><strong>${models.length}</strong></div><div class="stat"><span>SDK</span><strong>${escapeHtml(provider.npm ?? "未提供")}</strong></div><div class="stat"><span>环境变量</span><strong>${formatNumber(provider.env?.length ?? 0)}</strong></div></div></aside></div>
    <section class="section"><div class="section-heading"><h2>可调用模型</h2><span>${models.length} 个版本</span></div>${models.length ? `<div class="table-panel"><div class="table-scroll"><table><thead><tr><th>模型</th><th>调用模型 ID</th><th>输入价格</th><th>输出价格</th><th>上下文窗口</th><th>推理能力</th></tr></thead><tbody>${models.map(([modelId, model]) => { const canonical = canonicalForOffering(id, modelId); return `<tr><td>${canonical ? `<a class="row-link" href="${routeHref("models", canonical)}"><strong>${escapeHtml(model.name ?? canonical)}</strong><small>${escapeHtml(canonical)}</small></a>` : `<strong>${escapeHtml(model.name ?? modelId)}</strong><small>服务商专属模型</small>`}</td><td><code>${escapeHtml(modelId)}</code></td><td>${model.cost?.input == null ? "未公布" : `$${formatNumber(model.cost.input)}`}</td><td>${model.cost?.output == null ? "未公布" : `$${formatNumber(model.cost.output)}`}</td><td>${formatNumber(model.limit?.context)}</td><td>${boolBadge(model.reasoning)}</td></tr>`; }).join("")}</tbody></table></div></div>` : '<div class="empty-state">暂未录入该服务商的模型。</div>'}</section>
    ${fullDataSection(provider, "服务商全部字段")}`;
  bindTabs();
}

function renderLabDetail(id) {
  const lab = state.siteData.labs?.[id];
  if (!lab) return renderNotFound("研发机构", id, "labs");
  const models = labModelEntries(id);
  app.innerHTML = `<nav class="breadcrumb"><a href="#/labs">研发机构</a><span>›</span><span>${escapeHtml(lab.name ?? id)}</span></nav>
    <header class="page-heading"><div class="detail-title">${logo("labs", id, true)}<div><p class="eyebrow">LAB</p><h1>${escapeHtml(lab.name ?? id)}</h1><p class="lead">${escapeHtml(lab.description ?? "暂无机构描述")}</p><code>${escapeHtml(id)}</code></div></div><span class="count-note">${models.length} 个模型</span></header>
    <section class="section"><div class="section-heading"><h2>规范模型</h2><span>${models.length} 个</span></div>${models.length ? `<div class="lab-grid">${models.map(([modelId, model]) => `<a class="data-card" href="${routeHref("models", modelId)}">${logo("labs", id)}<span><strong>${escapeHtml(model.name)}</strong><span>${escapeHtml(modelId)}</span></span></a>`).join("")}</div>` : '<div class="empty-state">暂未录入该机构的模型。</div>'}</section>
    ${fullDataSection(lab, "机构全部字段")}`;
  bindTabs();
}

function renderNotFound(kind, id, section) {
  app.innerHTML = `<div class="error-state"><h1>未找到${escapeHtml(kind)}</h1><p><code>${escapeHtml(id ?? "")}</code></p><a class="button-link" href="#/${section}">返回${escapeHtml(kind)}列表</a></div>`;
}

function bindListControls() {
  const localSearch = document.querySelector("[data-local-search]");
  localSearch?.addEventListener("input", (event) => {
    state.query = event.target.value;
    searchInput.value = state.query;
    render();
    document.querySelector("[data-local-search]")?.focus();
  });
  document.querySelectorAll("[data-filter]").forEach((select) => select.addEventListener("change", () => {
    state.modelFilters[select.dataset.filter] = select.value;
    render();
  }));
  document.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    state.modelSort.direction = state.modelSort.key === key ? -state.modelSort.direction : 1;
    state.modelSort.key = key;
    render();
  }));
}

function bindTabs() {
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.tabPanel !== tab));
  }));
}

function render() {
  const current = route();
  setActiveNav(current.section);
  if (current.section === "models") current.id ? renderModelDetail(current.id) : renderModels();
  else if (current.section === "providers") current.id ? renderProviderDetail(current.id) : renderProviders();
  else if (current.section === "labs") current.id ? renderLabDetail(current.id) : renderLabs();
  else renderNotFound("页面", current.section, "models");
  window.scrollTo({ top: 0, behavior: "instant" });
}

async function loadData() {
  if (globalThis.MODELLINK_SITE) return globalThis.MODELLINK_SITE;
  const [catalogResponse, siteDataResponse] = await Promise.all([fetch("catalog.json"), fetch("site-data.json")]);
  if (!catalogResponse.ok || !siteDataResponse.ok) throw new Error("目录数据加载失败");
  return { catalog: await catalogResponse.json(), siteData: await siteDataResponse.json() };
}

searchInput.addEventListener("input", () => { state.query = searchInput.value; if (!route().id) render(); });
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.focus(); }
  if (event.key === "Escape" && document.activeElement === searchInput) { state.query = ""; searchInput.value = ""; render(); }
});
window.addEventListener("hashchange", render);

async function boot() {
  try {
    const loaded = await loadData();
    state.catalog = loaded.catalog;
    state.siteData = loaded.siteData;
    if (!location.hash) location.hash = "#/models";
    else render();
  } catch (error) {
    app.innerHTML = `<section class="error-state"><h1>目录加载失败</h1><p>${escapeHtml(error.message)}</p><p>请先运行 <code>bun run build</code> 生成页面数据。</p></section>`;
  }
}

void boot();
