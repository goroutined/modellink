const app = document.querySelector("#app");
const globalSearchTrigger = document.querySelector("#global-search-trigger");
const globalSearchDialog = document.querySelector("#global-search-dialog");
const globalSearchInput = document.querySelector("#global-search-input");
const globalSearchResults = document.querySelector("#global-search-results");
const globalSearchClose = document.querySelector("#global-search-close");
const searchShortcut = document.querySelector("#search-shortcut");
const siteHeader = document.querySelector(".site-header");
let globalSearchActiveIndex = 0;
let globalSearchComposing = false;

const FIELD_LABELS = {
  id: "ID", name: "名称", description: "描述", family: "模型家族", series: "模型系列",
  attachment: "文件附件", reasoning: "推理能力", reasoning_options: "推理选项",
  field: "请求字段", values: "可用值",
  tool_call: "工具调用", interleaved: "交错推理", structured_output: "结构化输出",
  temperature: "温度参数", knowledge: "知识截止日期", release_date: "发布日期",
  last_updated: "更新时间", modalities: "输入输出模态", open_weights: "开放权重",
  limit: "限制", context: "上下文窗口", input: "输入", output: "输出",
  cost: "美元价格（每百万 Token）", cost_cn: "人民币价格（元 / 百万 Token）",
  cost_points: "套餐积分消耗", per_tokens: "计费 Token 单位",
  cache_read: "缓存读取价格", thinking: "思考模式价格",
  cache_write: "缓存写入价格", status: "生命周期状态", provider: "服务商调用配置",
  experimental: "实验性配置", weights: "权重", benchmarks: "评测", links: "相关链接",
  api: "API 地址", env: "环境变量", npm: "兼容 SDK 包", protocol: "调用协议",
  endpoints: "端点", default: "默认值",
  doc: "模型详情页", models: "模型列表", pricing: "价格与套餐",
  api_key: "API Key 说明", console: "管理控制台",
  plans_cn: "人民币订阅套餐", price_month: "月费", usage: "适用场景",
  quota_windows: "额度窗口", credits_cn: "预付积分", points: "积分",
  cny: "人民币价值", valid_days: "有效天数",
  label: "标签", url: "链接", type: "类型", min: "最小值", max: "最大值",
  tiers: "阶梯价格", when: "生效条件", size: "输入长度阈值",
  days: "星期", start: "开始时间", end: "结束时间", timezone: "时区",
  holiday: "节假日规则",
};

const BOOLEAN_LABELS = { true: "是", false: "否" };
const PROTOCOL_LABELS = {
  "openai-compatible": "OpenAI Chat",
  "anthropic-compatible": "Anthropic Messages",
  "openai-responses": "OpenAI Responses",
};
const state = {
  catalog: { models: {}, providers: {} },
  siteData: { labs: {}, model_providers: {} },
  query: "",
  modelFilters: { lab: "all", reasoning: "all", weights: "all" },
  modelSort: { key: "release_date", direction: -1 },
  expandedModelPrices: new Set(),
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const routeHref = (section, id) => `#/${section}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;
const formatNumber = (value) => value == null ? "—" : new Intl.NumberFormat("zh-CN").format(value);
const compactTokenLimit = (value) => {
  if (value >= 1_048_576 && value % 1_048_576 === 0) return `${value / 1_048_576}M`;
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  const binaryK = value / 1_024;
  if (Number.isInteger(binaryK)) return `${binaryK}K`;
  if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}K`;
  if (value >= 1_000) return `${Math.floor(value / 1_000)}K`;
  return null;
};
const formatTokenShort = (value) => compactTokenLimit(value) ?? formatNumber(value);
const formatTokenLimit = (value) => {
  if (value == null) return '<span class="pending-value">-</span>';
  const compact = compactTokenLimit(value);
  if (!compact) return `<span class="token-limit"><span class="token-exact only">${formatNumber(value)}</span></span>`;
  return `<span class="token-limit"><span class="token-compact">${compact}</span><span class="token-exact">${formatNumber(value)}</span></span>`;
};
const isUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value);
const labIdFor = (modelId) => modelId.split("/")[0];
const labFor = (id) => state.siteData.labs?.[id] ?? { id, name: id };
const boolBadge = (value) => value === undefined
  ? '<span class="badge unknown">未知</span>'
  : `<span class="badge ${value ? "yes" : "no"}">${BOOLEAN_LABELS[value]}</span>`;
const logo = (kind, id, large = false) => `<img class="logo${large ? " large" : ""}" src="logos/${kind === "labs" ? "labs/" : ""}${escapeHtml(id)}.svg" alt="" onerror="this.onerror=null;this.src='logos/default.svg'">`;

function providerEndpoints(provider) {
  if (provider.endpoints?.length) return provider.endpoints;
  if (!provider.protocol) return [];
  return [{ id: "default", protocol: provider.protocol, api: provider.api, default: true }];
}

function modelEndpoints(provider, model) {
  const endpoints = providerEndpoints(provider);
  if (!model?.endpoints?.length) return endpoints.filter((endpoint) => endpoint.default);
  const supported = new Set(model.endpoints);
  return endpoints.filter((endpoint) => supported.has(endpoint.id));
}

function providerLinkEntries(provider) {
  const candidates = [
    ["模型列表", provider.links?.models],
    ["价格与套餐", provider.links?.pricing],
    ["API Key 说明", provider.links?.api_key],
    ["管理控制台", provider.links?.console],
    ["官方文档", provider.doc],
  ];
  return candidates.filter(([, url]) => Boolean(url));
}

function renderProviderLinks(provider, button = false) {
  const entries = providerLinkEntries(provider);
  if (!entries.length) return "—";
  return entries.map(([label, url]) => `<a class="${button ? "button-link" : "interactive-link"}" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`).join("");
}

function renderProtocols(endpoints) {
  if (!endpoints.length) return '<span class="pending-value">-</span>';
  return `<span class="protocol-list">${endpoints.map((endpoint) => {
    const label = PROTOCOL_LABELS[endpoint.protocol] ?? endpoint.protocol;
    return `<span class="protocol-badge${endpoint.default ? " default" : ""}" title="${escapeHtml(endpoint.api ?? label)}">${escapeHtml(label)}</span>`;
  }).join("")}</span>`;
}

function renderReasoningControl(model) {
  if (model.reasoning === undefined) return '<span class="pending-value">-</span>';
  if (model.reasoning !== true) return boolBadge(false);
  const options = model.reasoning_options ?? [];
  if (!options.length) return boolBadge(true);

  const groups = new Map();
  for (const option of options) {
    const field = option.field ?? (option.type === "budget_tokens" ? "Token 预算" : option.type === "toggle" ? "开关" : "推理档位");
    let value = "";
    if (option.type === "effort") {
      value = (option.values ?? []).map((item) => item ?? "null").join(" ");
      if (option.default !== undefined) value += `，默认 ${option.default ?? "null"}`;
    } else if (option.type === "budget_tokens") {
      const limits = [];
      if (option.min !== undefined) limits.push(`最小值 ${formatTokenShort(option.min)}`);
      if (option.max !== undefined) limits.push(`最大值 ${formatTokenShort(option.max)}`);
      value = limits.join("，") || "可调";
    } else if (option.type === "toggle") {
      value = "支持开关";
    }
    const line = `${field}：${value}`;
    for (const endpoint of option.endpoints?.length ? option.endpoints : ["default"]) {
      if (!groups.has(endpoint)) groups.set(endpoint, new Set());
      groups.get(endpoint).add(line);
    }
  }

  const tooltip = [...groups.entries()].map(([endpoint, lines]) => {
    const protocol = endpoint === "default" ? "默认协议" : PROTOCOL_LABELS[endpoint] ?? endpoint;
    return `<span class="reasoning-tooltip-group"><strong>${escapeHtml(protocol)}</strong>${[...lines].map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</span>`;
  }).join("");
  const ariaDetails = [...groups.entries()].map(([endpoint, lines]) => `${endpoint}：${[...lines].join("；")}`).join("；");
  return `<span class="reasoning-control reasoning-tooltip" tabindex="0" aria-label="支持推理；${escapeHtml(ariaDetails)}"><span class="badge yes">是</span><span class="reasoning-help" aria-hidden="true">?</span><span class="reasoning-tooltip-content" role="tooltip">${tooltip}</span></span>`;
}

function renderEndpointList(provider) {
  const endpoints = providerEndpoints(provider);
  if (!endpoints.length) return '<span class="pending-value">-</span>';
  return `<div class="endpoint-list">${endpoints.map((endpoint) => `<div class="endpoint-row"><span>${escapeHtml(PROTOCOL_LABELS[endpoint.protocol] ?? endpoint.protocol)}${endpoint.default ? '<small>默认</small>' : ""}</span><code class="api-address">${escapeHtml(endpoint.api ?? "-")}</code></div>`).join("")}</div>`;
}

const MODALITY_LABELS = { text: "文本", image: "图片", audio: "音频", video: "视频", pdf: "PDF" };
const MODALITY_ICONS = {
  text: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3.5h12M10 3.5v13M7 16.5h6"/></svg>',
  image: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.75" y="3" width="14.5" height="14" rx="2"/><circle cx="7" cy="7.25" r="1.25"/><path d="m4.5 15 3.75-4 2.5 2.5 1.75-2 3 3.5"/></svg>',
  audio: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8.25v3.5M6.5 5.5v9M10 3v14M13.5 6v8M17 8.25v3.5"/></svg>',
  video: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="m8.5 7.5 4.5 2.5-4.5 2.5Z"/></svg>',
  pdf: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.5h6l4 4v11H5zM11 2.5v4h4"/><path d="M7 13h6M7 10h4"/></svg>',
};

function renderModalities(modalities) {
  const input = modalities?.input ?? [];
  const output = modalities?.output ?? [];
  const values = [...new Set([...input, ...output])];
  if (!values.length) return '<span class="pending-value">-</span>';
  return `<span class="modality-icons">${values.map((value) => {
    const hasInput = input.includes(value);
    const hasOutput = output.includes(value);
    const direction = hasInput && hasOutput ? "both" : hasInput ? "input" : "output";
    const directionLabel = direction === "both" ? "输入与输出" : direction === "input" ? "仅输入" : "仅输出";
    const label = `${MODALITY_LABELS[value] ?? value}：${directionLabel}`;
    const icon = MODALITY_ICONS[value] ?? MODALITY_ICONS.text;
    return `<span class="modality-icon ${direction}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon}</span>`;
  }).join("")}</span>`;
}

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

function formatCny(value) {
  return value == null ? '<span class="pending-value">-</span>' : `¥${formatNumber(value)}`;
}

function formatCnyPair(first, second) {
  return `<span class="price-pair"><span>${formatCny(first)}</span><span class="price-separator">/</span><span>${formatCny(second)}</span></span>`;
}

function formatCnyModes(cost, firstKey, secondKey) {
  if (!cost?.thinking) return formatCnyPair(cost?.[firstKey], cost?.[secondKey]);
  return `<span class="mode-prices"><span><small>普通</small>${formatCnyPair(cost?.[firstKey], cost?.[secondKey])}</span><span><small>思考</small>${formatCnyPair(cost.thinking?.[firstKey], cost.thinking?.[secondKey])}</span></span>`;
}

function compactTokens(value) {
  return compactTokenLimit(value) ?? formatNumber(value);
}

function tokenBoundary(value) {
  const compact = value >= 1_000_000 && value % 1_000_000 === 0
    ? `${value / 1_000_000}M`
    : value >= 1_000 && value % 1_000 === 0
      ? `${value / 1_000}K`
      : compactTokens(value);
  return value < 1_000 ? `${compact} Token` : compact;
}

function formatTokenRange(range) {
  const parts = [];
  if (range.gt !== undefined) parts.push(`>${tokenBoundary(range.gt)}`);
  else if (range.gte !== undefined && range.gte !== 0) parts.push(`≥${tokenBoundary(range.gte)}`);
  if (range.lt !== undefined) parts.push(`<${tokenBoundary(range.lt)}`);
  else if (range.lte !== undefined) parts.push(`≤${tokenBoundary(range.lte)}`);
  return parts.join(" · ");
}

function formatConditionalTier(tier) {
  const parts = [];
  if (tier.input) parts.push(`输入 ${formatTokenRange(tier.input)}`);
  if (tier.output) parts.push(`输出 ${formatTokenRange(tier.output)}`);
  if (tier.time) {
    const windows = tier.time.windows
      .map((window) => {
        const days = formatWindowDays(window.days);
        const holiday = window.holiday === "exclude_cn_statutory" ? " · 不含中国法定节假日" : "";
        return `${days ? `${days} ` : ""}${window.start}–${window.end}${holiday}`;
      })
      .join("、");
    parts.push(`${windows}（${tier.time.timezone}）`);
  }
  return parts.join(" · ");
}

function priceHelp(detail) {
  const label = `查看计费条件：${detail}`;
  return `<span class="price-help" tabindex="0" role="img" aria-label="${escapeHtml(label)}" data-tooltip="${escapeHtml(detail)}">?</span>`;
}

function formatCnyTiered(cost, firstKey, secondKey) {
  const tiers = [...(cost?.tiers ?? [])];
  if (!tiers.length) return formatCnyModes(cost, firstKey, secondKey);
  const contextOnly = tiers.every((tier) => tier.when.type === "context");
  const rows = contextOnly
    ? (() => {
        const sorted = tiers.sort((left, right) => left.when.size - right.when.size);
        return [{ label: cost.label, detail: `上下文 <${compactTokens(sorted[0].when.size)}`, cost }, ...sorted.map((tier, index) => ({
          detail: sorted[index + 1]
            ? `上下文 ≥${compactTokens(tier.when.size)} · <${compactTokens(sorted[index + 1].when.size)}`
            : `上下文 ≥${compactTokens(tier.when.size)}`,
          cost: tier,
        }))];
      })()
    : [
      ...(cost.label ? [{ label: cost.label, detail: "其他时间，未命中专项计费条件", cost }] : []),
      ...tiers.map((tier) => ({
        label: tier.label,
        detail: formatConditionalTier(tier.when),
        cost: tier,
      })),
    ];
  return `<span class="tier-prices">${rows.map(({ label, detail, cost: tierCost }, index) => `<span><small class="price-tier-summary"><span>${escapeHtml(label ?? `阶梯 ${index + 1}`)}</span>${priceHelp(detail)}</small>${formatCnyModes(tierCost, firstKey, secondKey)}</span>`).join("")}</span>`;
}

const WEEKDAY_LABELS = {
  monday: "周一", tuesday: "周二", wednesday: "周三", thursday: "周四",
  friday: "周五", saturday: "周六", sunday: "周日",
};

function formatWindowDays(days) {
  if (!days?.length) return "";
  const key = days.join(",");
  if (key === "monday,tuesday,wednesday,thursday,friday") return "工作日";
  if (key === "saturday,sunday") return "周末";
  if (days.length === 7) return "每天";
  return days.map((day) => WEEKDAY_LABELS[day] ?? day).join("、");
}

function formatPointCost(cost, firstKey, secondKey) {
  if (!cost) return '<span class="pending-value">-</span>';
  const tiers = [...(cost.tiers ?? [])];
  if (tiers.length) {
    const rows = [
      ...(cost.label ? [{ label: cost.label, detail: "其他时间，未命中专项计费条件", cost }] : []),
      ...tiers.map((tier) => ({
      label: tier.label,
      detail: formatConditionalTier(tier.when),
      cost: tier,
    })),
    ];
    return `<span class="tier-prices">${rows.map(({ label, detail, cost: tierCost }, index) => `<span><small class="price-tier-summary"><span>${escapeHtml(label ?? `阶梯 ${index + 1}`)}</span>${priceHelp(detail)}</small>${formatPointCost({ ...tierCost, per_tokens: cost.per_tokens }, firstKey, secondKey)}</span>`).join("")}</span>`;
  }
  const first = cost[firstKey];
  const second = cost[secondKey];
  const pair = `<span class="price-pair"><span>${first == null ? "-" : formatNumber(first)}</span><span class="price-separator">/</span><span>${second == null ? "-" : formatNumber(second)}</span></span>`;
  const detail = [`每 ${formatNumber(cost.per_tokens)} Token 按所示积分抵扣`];
  return `<span class="point-cost"><span>${pair}<small>积分</small></span>${priceHelp(detail.join("；"))}</span>`;
}

function formatOfferingCost(model, firstKey, secondKey) {
  if (model.cost_cn) return formatCnyTiered(model.cost_cn, firstKey, secondKey);
  return formatPointCost(model.cost_points, firstKey, secondKey);
}

function formatComparableCost(model, firstKey, secondKey) {
  if (model.cost_cn) return formatCnyTiered(model.cost_cn, firstKey, secondKey);
  if (model.cost_points && firstKey === "input" && secondKey === "output") {
    return '<span class="plan-billing" title="该服务按套餐额度计费，不换算为人民币 Token 单价">套餐制</span>';
  }
  return '<span class="pending-value">-</span>';
}

function pricingUnitNote(models, showPointDetails = true) {
  const hasCny = models.some((model) => model.cost_cn);
  const hasPoints = models.some((model) => model.cost_points);
  if (!showPointDetails && hasCny && hasPoints) return "人民币价格：元 / 百万 Token；积分套餐不换算人民币单价";
  if (!showPointDetails && hasPoints) return "积分套餐不换算人民币 Token 单价";
  if (hasCny && hasPoints) return "人民币价格：元 / 百万 Token；订阅套餐显示积分消耗";
  if (hasPoints) return "订阅套餐积分消耗；悬停 ? 查看抵扣规则";
  return "人民币价格单位：元 / 百万 Token";
}

function renderProviderPlans(provider) {
  const plans = provider.plans_cn ?? [];
  if (!plans.length && !provider.credits_cn) return "";
  const planCards = plans.map((plan) => `<div class="plan-card"><span>${escapeHtml(plan.name)}</span><strong>¥${formatNumber(plan.price_month)}<small>/月</small></strong>${plan.usage ? `<p>${escapeHtml(plan.usage)}</p>` : ""}${plan.quota_windows?.length ? `<small>${escapeHtml(plan.quota_windows.join(" · "))}</small>` : ""}</div>`).join("");
  const credits = provider.credits_cn;
  const creditCard = credits ? `<div class="plan-card credit-card"><span>预付积分</span><strong>${formatNumber(credits.points)}<small>积分 = ¥${formatNumber(credits.cny)}</small></strong>${credits.valid_days ? `<p>有效期 ${formatNumber(credits.valid_days)} 天</p>` : ""}</div>` : "";
  return `<section class="section provider-plans"><div class="section-heading"><h2>订阅与积分</h2><span>套餐额度与按量 API 余额相互独立</span></div><div class="plan-grid">${planCards}${creditCard}</div></section>`;
}

function catalogSummary() {
  const offerings = Object.values(state.catalog.providers).reduce((sum, provider) => sum + Object.keys(provider.models ?? {}).length, 0);
  return `${formatNumber(Object.keys(state.catalog.models).length)} 规范模型 · ${formatNumber(Object.keys(state.catalog.providers).length)} 服务商 · ${formatNumber(Object.keys(state.siteData.labs ?? {}).length)} 研发机构 · ${formatNumber(offerings)} 可调用`;
}

function modelPrices(modelId) {
  const offerings = modelOfferings(modelId);
  if (!offerings.length) return '<span class="pending-value">-</span>';
  const expanded = state.expandedModelPrices.has(modelId);
  const toggle = `<button class="model-price-toggle${expanded ? " expanded" : ""}" type="button" data-price-toggle="${escapeHtml(modelId)}" aria-expanded="${expanded}" aria-label="${expanded ? "收起" : "展开"}${offerings.length}个服务商的价格"><span>${offerings.length} 个服务商提供</span><span class="model-price-caret" aria-hidden="true">›</span></button>`;
  if (!expanded) return toggle;
  return `<span class="model-price-summary">${toggle}<span class="model-price-list">${offerings.map(({ providerId, provider, model }) => `<span><a class="interactive-link" href="${routeHref("providers", providerId)}">${escapeHtml(provider.name ?? providerId)}</a>${formatComparableCost(model, "input", "output")}</span>`).join("")}</span></span>`;
}

function modelSortValue([id, model], key) {
  if (key === "lab") return labFor(labIdFor(id)).name;
  if (key === "providers") return modelOfferings(id).length;
  if (key === "context") return model.limit?.context ?? -1;
  if (key === "price") return Math.min(...modelOfferings(id)
    .map(({ model: offering }) => {
      const input = offering.cost_cn?.input;
      const output = offering.cost_cn?.output;
      return Number.isFinite(input) && Number.isFinite(output) ? input + output : Infinity;
    }), Infinity);
  return model[key] ?? "";
}

function sortHeader(key, label) {
  const active = state.modelSort.key === key;
  const arrow = active ? (state.modelSort.direction > 0 ? " ↑" : " ↓") : "";
  return `<button class="sort-button${active ? " active" : ""}" data-sort="${key}">${label}${arrow}</button>`;
}

function modelSeriesKey(id, model) {
  return model.series ? `${labIdFor(id)}/${model.series}` : `model:${id}`;
}

function newestModelEntry(entries) {
  return [...entries].sort((left, right) => {
    const date = String(right[1].release_date ?? right[1].last_updated ?? "")
      .localeCompare(String(left[1].release_date ?? left[1].last_updated ?? ""));
    return date || right[0].localeCompare(left[0]);
  })[0];
}

function modelSeriesEntries(id) {
  const current = state.catalog.models[id];
  if (!current?.series) return current ? [[id, current]] : [];
  return Object.entries(state.catalog.models)
    .filter(([candidateId, model]) => labIdFor(candidateId) === labIdFor(id) && model.series === current.series)
    .sort((left, right) => String(left[1].release_date ?? "").localeCompare(String(right[1].release_date ?? "")) || left[0].localeCompare(right[0]));
}

function modelVersionLabel(id, model) {
  if (!model.series) return model.name;
  const localId = id.split("/").at(-1);
  if (localId === model.series) return "预览版";
  const prefix = `${model.series}-`;
  if (localId.startsWith(prefix)) return localId.slice(prefix.length).toUpperCase();
  return model.name;
}

function renderModelRow([id, model], options = {}) {
  const { seriesMembers = [], versionRow = false } = options;
  const hasVersions = seriesMembers.length > 1;
  const rootEntry = hasVersions
    ? seriesMembers.find(([candidateId]) => candidateId.split("/").at(-1) === model.series)
    : undefined;
  const displayName = hasVersions && !versionRow ? (rootEntry?.[1].name ?? model.name) : model.name;
  const detail = id;
  const count = hasVersions && !versionRow ? `<span class="series-count">${seriesMembers.length} 个版本</span>` : "";
  return `<tr class="${versionRow ? "version-row" : hasVersions ? "series-row" : ""}">
    <td><div class="series-model-cell"><a class="primary-cell row-link" href="${routeHref("models", id)}">${logo("labs", labIdFor(id))}<span><span class="series-title-line"><strong>${escapeHtml(displayName)}</strong>${count}</span><small title="${escapeHtml(id)}">${escapeHtml(detail)}</small></span></a></div></td>
    <td><a href="${routeHref("labs", labIdFor(id))}">${escapeHtml(labFor(labIdFor(id)).name)}</a></td><td class="number">${modelOfferings(id).length}</td>
    <td class="number">${formatTokenLimit(model.limit?.context)}</td><td class="number">${formatTokenLimit(model.limit?.input)}</td><td class="number">${formatTokenLimit(model.limit?.output)}</td><td>${renderModalities(model.modalities)}</td>
    <td>${boolBadge(model.reasoning)}</td><td>${boolBadge(model.tool_call)}</td><td>${boolBadge(model.structured_output)}</td><td>${boolBadge(model.temperature)}</td><td>${boolBadge(model.open_weights)}</td>
    <td class="model-prices-cell">${modelPrices(id)}</td><td>${escapeHtml(model.release_date ?? "—")}</td><td>${escapeHtml(model.last_updated ?? "—")}</td>
  </tr>`;
}

function renderModels() {
  const allEntries = Object.entries(state.catalog.models);
  const labs = [...new Set(allEntries.map(([id]) => labIdFor(id)))].sort();
  const q = state.query.toLowerCase();
  const matches = ([id, model]) => {
    const lab = labFor(labIdFor(id));
    const searchable = `${id} ${model.name ?? ""} ${model.description ?? ""} ${model.family ?? ""} ${model.series ?? ""} ${lab.name}`.toLowerCase();
    return (!q || searchable.includes(q))
      && (state.modelFilters.lab === "all" || labIdFor(id) === state.modelFilters.lab)
      && (state.modelFilters.reasoning === "all" || String(model.reasoning === true) === state.modelFilters.reasoning)
      && (state.modelFilters.weights === "all" || String(model.open_weights === true) === state.modelFilters.weights);
  };
  const grouped = new Map();
  allEntries.forEach((entry) => {
    const key = modelSeriesKey(...entry);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  });
  const groups = [...grouped.entries()].flatMap(([key, members]) => {
    const visibleMembers = members.filter(matches);
    if (!visibleMembers.length) return [];
    return [{ key, members, visibleMembers, representative: newestModelEntry(visibleMembers) }];
  }).sort((left, right) => {
    const a = modelSortValue(left.representative, state.modelSort.key);
    const b = modelSortValue(right.representative, state.modelSort.key);
    if (state.modelSort.key === "release_date") {
      if (!a && b) return 1;
      if (a && !b) return -1;
    }
    const primary = (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "zh-CN")) * state.modelSort.direction;
    if (primary) return primary;
    const name = String(left.representative[1].name ?? left.representative[0])
      .localeCompare(String(right.representative[1].name ?? right.representative[0]), "zh-CN");
    return name || left.representative[0].localeCompare(right.representative[0]);
  });
  const visibleModelCount = groups.reduce((sum, group) => sum + group.visibleMembers.length, 0);

  app.innerHTML = pageHeading("MODELS", "模型", "统一查看中国开发者常用模型的能力、上下文、开放权重和各服务商价格。", `${groups.length} / ${grouped.size} 个系列 · ${visibleModelCount} / ${allEntries.length} 个基础模型`)
    + `<div class="toolbar">
        <input data-local-search type="search" value="${escapeHtml(state.query)}" placeholder="筛选模型名称、ID、家族或机构">
        <select data-filter="lab"><option value="all">全部研发机构</option>${labs.map((id) => `<option value="${escapeHtml(id)}"${state.modelFilters.lab === id ? " selected" : ""}>${escapeHtml(labFor(id).name)}</option>`).join("")}</select>
        <select data-filter="reasoning"><option value="all">全部推理能力</option><option value="true"${state.modelFilters.reasoning === "true" ? " selected" : ""}>支持推理</option><option value="false"${state.modelFilters.reasoning === "false" ? " selected" : ""}>不支持推理</option></select>
        <select data-filter="weights"><option value="all">全部权重类型</option><option value="true"${state.modelFilters.weights === "true" ? " selected" : ""}>开放权重</option><option value="false"${state.modelFilters.weights === "false" ? " selected" : ""}>闭源权重</option></select>
      </div>`
    + (groups.length ? `<div class="table-panel"><div class="table-scroll"><table><thead><tr>
        <th>${sortHeader("name", "模型")}</th><th>${sortHeader("lab", "研发机构")}</th><th>${sortHeader("providers", "服务商")}</th>
        <th>${sortHeader("context", "上下文窗口")}</th><th>最大输入</th><th>最大输出</th><th>模态</th><th>推理能力</th><th>工具调用</th><th>结构化输出</th><th>温度参数</th><th>开放权重</th>
        <th>${sortHeader("price", "服务商价格（输入 / 输出）")}</th><th>${sortHeader("release_date", "发布日期")}</th><th>${sortHeader("last_updated", "更新时间")}</th>
      </tr></thead><tbody>${groups.map(({ members, visibleMembers, representative }) => {
        const children = visibleMembers.filter(([id]) => id !== representative[0]);
        return renderModelRow(representative, { seriesMembers: members })
          + children.map((entry) => renderModelRow(entry, { versionRow: true })).join("");
      }).join("")}</tbody></table></div></div>` : '<div class="empty-state">没有符合当前条件的模型。</div>');
  bindListControls();
}

function renderProviders() {
  const q = state.query.toLowerCase();
  const providers = Object.entries(state.catalog.providers).filter(([id, provider]) => `${id} ${provider.name ?? ""} ${provider.api ?? ""} ${provider.protocol ?? ""} ${Object.values(provider.links ?? {}).join(" ")} ${(provider.endpoints ?? []).map((endpoint) => `${endpoint.protocol} ${endpoint.api}`).join(" ")}`.toLowerCase().includes(q));
  app.innerHTML = pageHeading("PROVIDERS", "服务商", "比较国内模型服务商的可调用模型、API 入口、调用协议与官方文档。", `${providers.length} / ${Object.keys(state.catalog.providers).length} · ${catalogSummary()}`)
    + `<div class="toolbar"><input data-local-search type="search" value="${escapeHtml(state.query)}" placeholder="筛选服务商名称、ID、API 或协议"></div>`
    + (providers.length ? `<div class="table-panel"><div class="table-scroll"><table><thead><tr><th>服务商</th><th>模型数</th><th>调用协议</th><th>API 地址</th><th>官方入口</th></tr></thead><tbody>${providers.map(([id, provider]) => `<tr>
      <td><a class="primary-cell row-link" href="${routeHref("providers", id)}">${logo("providers", id)}<span><strong>${escapeHtml(provider.name ?? id)}</strong><small>${escapeHtml(id)}</small></span></a></td>
      <td class="number">${Object.keys(provider.models ?? {}).length}</td><td>${renderProtocols(providerEndpoints(provider))}</td>
      <td>${provider.api ? `<code class="api-address">${escapeHtml(provider.api)}</code>` : "—"}</td>
      <td><span class="provider-link-list">${renderProviderLinks(provider)}</span></td></tr>`).join("")}</tbody></table></div></div>` : '<div class="empty-state">没有符合当前条件的服务商。</div>');
  bindListControls();
}

function labModelEntries(id) {
  return Object.entries(state.catalog.models).filter(([modelId]) => labIdFor(modelId) === id);
}

function renderLabs() {
  const q = state.query.toLowerCase();
  const labs = Object.entries(state.siteData.labs ?? {}).filter(([id, lab]) => `${id} ${lab.name ?? ""} ${lab.description ?? ""}`.toLowerCase().includes(q));
  app.innerHTML = pageHeading("LABS", "研发机构", "按研发机构浏览模型家族与规范模型。", `${labs.length} / ${Object.keys(state.siteData.labs ?? {}).length} · ${catalogSummary()}`)
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

function renderVersionSwitcher(id) {
  const versions = modelSeriesEntries(id);
  if (versions.length < 2) return "";
  return `<nav class="version-switcher" aria-label="同系列版本"><span>同系列版本</span>${versions.map(([versionId, model]) => `<a href="${routeHref("models", versionId)}"${versionId === id ? ' class="active" aria-current="page"' : ""}>${escapeHtml(modelVersionLabel(versionId, model))}</a>`).join("")}</nav>`;
}

function renderModelDetail(id) {
  const model = state.catalog.models[id];
  if (!model) return renderNotFound("模型", id, "models");
  const labId = labIdFor(id);
  const lab = labFor(labId);
  const offerings = modelOfferings(id);
  const modalities = [...(model.modalities?.input ?? []).map((x) => `输入：${x}`), ...(model.modalities?.output ?? []).map((x) => `输出：${x}`)];
  app.innerHTML = `<nav class="breadcrumb"><a href="#/models">模型</a><span>›</span><a href="${routeHref("labs", labId)}">${escapeHtml(lab.name)}</a><span>›</span><span>${escapeHtml(model.name)}</span></nav>
    <header class="page-heading"><div class="detail-title">${logo("labs", labId, true)}<div><p class="eyebrow">MODEL</p><h1>${escapeHtml(model.name)}</h1><p class="lead">${escapeHtml(model.description ?? "暂无中文描述")}</p><code>${escapeHtml(id)}</code>${renderVersionSwitcher(id)}</div></div></header>
    <div class="detail-grid"><section class="panel"><h2>核心参数</h2><div class="stat-grid">
      <div class="stat"><span>上下文窗口</span><strong>${formatTokenLimit(model.limit?.context)}</strong></div><div class="stat"><span>最大输入</span><strong>${formatTokenLimit(model.limit?.input)}</strong></div><div class="stat"><span>最大输出</span><strong>${formatTokenLimit(model.limit?.output)}</strong></div><div class="stat"><span>发布日期</span><strong>${escapeHtml(model.release_date ?? "未知")}</strong></div>
    </div></section><aside class="panel"><h2>能力与模态</h2><div class="badge-group">${[["推理", model.reasoning], ["工具调用", model.tool_call], ["结构化输出", model.structured_output], ["开放权重", model.open_weights]].map(([label, value]) => `<span class="capability ${value ? "yes" : ""}">${label}：${value === undefined ? "未知" : BOOLEAN_LABELS[value]}</span>`).join("")}${modalities.map((x) => `<span class="modality">${escapeHtml(x)}</span>`).join("")}</div></aside></div>
    <section class="section"><div class="section-heading"><h2>服务商与价格</h2><span>${escapeHtml(pricingUnitNote(offerings.map(({ model: offering }) => offering), false))}</span></div>${offerings.length ? `<div class="table-panel"><div class="table-scroll"><table class="offering-table"><thead><tr><th>服务商与调用 ID</th><th>上下文窗口</th><th>最大输入</th><th>最大输出</th><th>输入 / 输出</th><th>缓存读 / 写</th><th>协议</th><th class="secondary-cell">推理控制</th><th class="secondary-cell">工具调用</th><th class="secondary-cell">结构化输出</th><th class="secondary-cell">温度参数</th><th class="secondary-cell">模型详情</th></tr></thead><tbody>${offerings.map(({ providerId, modelId, provider, model: offering }) => `<tr>
      <td class="model-call-cell"><a class="interactive-link" href="${routeHref("providers", providerId)}">${escapeHtml(provider.name ?? providerId)}</a><span class="call-id"><code>${escapeHtml(modelId)}</code><button class="copy-button" type="button" data-copy="${escapeHtml(modelId)}" aria-label="复制调用模型 ID" title="复制调用模型 ID">⧉</button></span></td>
      <td class="key-cell number">${formatTokenLimit(offering.limit?.context)}</td><td class="key-cell number">${formatTokenLimit(offering.limit?.input)}</td><td class="key-cell number">${formatTokenLimit(offering.limit?.output)}</td><td class="key-cell number">${formatComparableCost(offering, "input", "output")}</td><td class="key-cell number">${formatComparableCost(offering, "cache_read", "cache_write")}</td><td class="key-cell">${renderProtocols(modelEndpoints(provider, offering))}</td><td class="secondary-cell">${renderReasoningControl(offering)}</td>
      <td class="secondary-cell">${boolBadge(offering.tool_call)}</td><td class="secondary-cell">${boolBadge(offering.structured_output)}</td><td class="secondary-cell">${boolBadge(offering.temperature)}</td><td class="secondary-cell">${offering.doc ? `<a class="interactive-link" href="${escapeHtml(offering.doc)}" target="_blank" rel="noreferrer">模型详情</a>` : provider.doc ? `<a class="interactive-link" href="${escapeHtml(provider.doc)}" target="_blank" rel="noreferrer">服务商文档</a>` : "-"}</td></tr>`).join("")}</tbody></table></div></div>` : '<div class="empty-state">暂未录入可调用此模型的服务商。</div>'}</section>
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
  app.innerHTML = `<nav class="breadcrumb provider-breadcrumb"><a href="#/providers">服务商</a><span>›</span><span>${escapeHtml(provider.name ?? id)}</span></nav>
    <header class="page-heading provider-heading"><div class="detail-title">${logo("providers", id, true)}<div><p class="eyebrow">PROVIDER</p><h1>${escapeHtml(provider.name ?? id)}</h1><p class="lead">${escapeHtml(id)} · ${models.length} 个可调用模型</p></div></div><div class="detail-actions">${renderProviderLinks(provider, true)}</div></header>
    <div class="detail-grid provider-overview"><section class="panel">${renderEndpointList(provider)}</section><aside class="panel"><div class="stat-grid"><div class="stat"><span>模型数</span><strong>${models.length}</strong></div><div class="stat"><span>协议数</span><strong>${providerEndpoints(provider).length}</strong></div><div class="stat"><span>环境变量</span><strong>${formatNumber(provider.env?.length ?? 0)}</strong></div></div></aside></div>
    ${renderProviderPlans(provider)}
    <section class="section"><div class="section-heading"><h2>可调用模型</h2><span>${escapeHtml(pricingUnitNote(models.map(([, model]) => model)))}</span></div>${models.length ? `<div class="table-panel"><div class="table-scroll"><table class="offering-table"><thead><tr>
      <th>模型与调用 ID</th><th>上下文窗口</th><th>最大输入</th><th>最大输出</th><th>模态</th><th>输入 / 输出</th><th>缓存读 / 写</th><th>协议</th>
      <th class="secondary-cell">推理控制</th><th class="secondary-cell">工具调用</th><th class="secondary-cell">结构化输出</th><th class="secondary-cell">温度参数</th><th class="secondary-cell">模型详情</th>
    </tr></thead><tbody>${models.map(([modelId, model]) => {
      const canonical = canonicalForOffering(id, modelId);
      return `<tr>
        <td class="model-call-cell">${canonical ? `<a class="interactive-link" href="${routeHref("models", canonical)}">${escapeHtml(model.name ?? canonical)}</a>` : `<strong>${escapeHtml(model.name ?? modelId)}</strong>`}<span class="call-id"><code>${escapeHtml(modelId)}</code><button class="copy-button" type="button" data-copy="${escapeHtml(modelId)}" aria-label="复制调用模型 ID" title="复制调用模型 ID">⧉</button></span></td>
        <td class="key-cell number">${formatTokenLimit(model.limit?.context)}</td><td class="key-cell number">${formatTokenLimit(model.limit?.input)}</td><td class="key-cell number">${formatTokenLimit(model.limit?.output)}</td><td class="key-cell">${renderModalities(model.modalities)}</td>
        <td class="key-cell number">${formatOfferingCost(model, "input", "output")}</td><td class="key-cell number">${formatOfferingCost(model, "cache_read", "cache_write")}</td><td class="key-cell">${renderProtocols(modelEndpoints(provider, model))}</td>
        <td class="secondary-cell">${renderReasoningControl(model)}</td><td class="secondary-cell">${boolBadge(model.tool_call)}</td><td class="secondary-cell">${boolBadge(model.structured_output)}</td><td class="secondary-cell">${boolBadge(model.temperature)}</td><td class="secondary-cell">${model.doc ? `<a class="interactive-link" href="${escapeHtml(model.doc)}" target="_blank" rel="noreferrer">模型详情</a>` : provider.doc ? `<a class="interactive-link" href="${escapeHtml(provider.doc)}" target="_blank" rel="noreferrer">服务商文档</a>` : "-"}</td>
      </tr>`;
    }).join("")}</tbody></table></div></div>` : '<div class="empty-state">暂未录入该服务商的模型。</div>'}</section>
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
  document.querySelectorAll("[data-price-toggle]").forEach((button) => button.addEventListener("click", () => {
    const modelId = button.dataset.priceToggle;
    const scrollTop = window.scrollY;
    if (state.expandedModelPrices.has(modelId)) state.expandedModelPrices.delete(modelId);
    else state.expandedModelPrices.add(modelId);
    render();
    window.scrollTo({ top: scrollTop, behavior: "instant" });
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

function globalSearchEntries() {
  const models = Object.entries(state.catalog.models).map(([id, model]) => {
    const labId = labIdFor(id);
    const lab = labFor(labId);
    const offeringIds = (state.siteData.model_providers?.[id] ?? []).map(({ model_id: modelId }) => modelId);
    return {
      section: "models", id, group: "模型", name: model.name ?? id,
      subtitle: `${lab.name ?? labId} · ${id}`,
      secondary: [model.description, model.family, model.series, ...offeringIds].filter(Boolean),
      related: [lab.name, labId].filter(Boolean),
      icon: logo("labs", labId),
    };
  });
  const providers = Object.entries(state.catalog.providers).map(([id, provider]) => ({
    section: "providers", id, group: "服务商", name: provider.name ?? id,
    subtitle: `${Object.keys(provider.models ?? {}).length} 个可调用模型 · ${id}`,
    secondary: [provider.api, provider.doc, provider.protocol,
      ...providerEndpoints(provider).flatMap((endpoint) => [endpoint.protocol, endpoint.api])].filter(Boolean),
    related: [],
    icon: logo("providers", id),
  }));
  const labs = Object.entries(state.siteData.labs ?? {}).map(([id, lab]) => ({
    section: "labs", id, group: "研发机构", name: lab.name ?? id,
    subtitle: `${labModelEntries(id).length} 个模型 · ${id}`,
    secondary: [lab.description].filter(Boolean),
    related: [],
    icon: logo("labs", id),
  }));
  return { models, providers, labs };
}

function globalSearchScore(entry, query) {
  const name = entry.name.toLowerCase();
  const id = entry.id.toLowerCase();
  if (name === query || id === query) return 0;
  if (name.startsWith(query)) return 10;
  if (id.startsWith(query)) return 12;
  if (name.split(/\s+|[-_/]/).some((part) => part.startsWith(query))) return 14;
  if (name.includes(query) || id.includes(query)) return 20;
  if ((entry.secondary ?? []).some((value) => String(value).toLowerCase() === query)) return 30;
  if ((entry.secondary ?? []).some((value) => String(value).toLowerCase().includes(query))) return 40;
  if ((entry.related ?? []).some((value) => String(value).toLowerCase() === query)) return 60;
  if ((entry.related ?? []).some((value) => String(value).toLowerCase().startsWith(query))) return 65;
  if ((entry.related ?? []).some((value) => String(value).toLowerCase().includes(query))) return 70;
  return Number.POSITIVE_INFINITY;
}

function globalSearchResult(entry, index) {
  return `<a class="global-search-result" data-global-result data-result-index="${index}" href="${routeHref(entry.section, entry.id)}" role="option" aria-selected="false">
    ${entry.icon}<span class="global-search-result-copy"><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.subtitle)}</small></span><span class="global-search-kind">${entry.group}</span>
  </a>`;
}

function renderGlobalSearchResults() {
  const query = globalSearchInput.value.trim().toLowerCase();
  const entries = globalSearchEntries();
  const groups = [];
  if (query) {
    for (const [order, [key, label]] of [["models", "模型"], ["providers", "服务商"], ["labs", "研发机构"]].entries()) {
      const matches = entries[key].map((entry) => ({ entry, score: globalSearchScore(entry, query) }))
        .filter(({ score }) => Number.isFinite(score))
        .sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name, "zh-CN"));
      if (matches.length) groups.push({ label, order, score: matches[0].score, entries: matches.map(({ entry }) => entry) });
    }
    groups.sort((a, b) => a.score - b.score || a.order - b.order);
  } else {
    groups.push({ label: "快速入口", entries: [
      { section: "models", id: undefined, group: "入口", name: "浏览全部模型", subtitle: `${entries.models.length} 个规范模型`, icon: '<span class="global-search-mark">M</span>' },
      { section: "providers", id: undefined, group: "入口", name: "浏览全部服务商", subtitle: `${entries.providers.length} 个模型服务商`, icon: '<span class="global-search-mark">P</span>' },
      { section: "labs", id: undefined, group: "入口", name: "浏览全部研发机构", subtitle: `${entries.labs.length} 个研发机构`, icon: '<span class="global-search-mark">L</span>' },
    ] });
    const latest = [...entries.models].sort((a, b) => {
      const modelA = state.catalog.models[a.id];
      const modelB = state.catalog.models[b.id];
      return String(modelB.release_date ?? modelB.last_updated ?? "").localeCompare(String(modelA.release_date ?? modelA.last_updated ?? ""));
    }).slice(0, 6);
    if (latest.length) groups.push({ label: "最新模型", entries: latest });
  }

  if (!groups.length) {
    globalSearchResults.innerHTML = `<div class="global-search-empty"><strong>没有找到匹配结果</strong><span>试试模型名称、调用 ID、服务商或研发机构</span></div>`;
    globalSearchActiveIndex = -1;
    return;
  }

  let resultIndex = 0;
  globalSearchResults.innerHTML = groups.map((group) => `<section class="global-search-group"><h2>${group.label}<span>${group.entries.length}</span></h2><div>${group.entries.map((entry) => globalSearchResult(entry, resultIndex++)).join("")}</div></section>`).join("");
  globalSearchActiveIndex = Math.min(Math.max(globalSearchActiveIndex, 0), resultIndex - 1);
  syncGlobalSearchActive(false);
}

function syncGlobalSearchActive(shouldScroll = true) {
  const results = [...globalSearchResults.querySelectorAll("[data-global-result]")];
  results.forEach((result, index) => {
    const active = index === globalSearchActiveIndex;
    result.classList.toggle("active", active);
    result.setAttribute("aria-selected", String(active));
  });
  if (shouldScroll) results[globalSearchActiveIndex]?.scrollIntoView({ block: "nearest" });
}

function openGlobalSearch() {
  if (!globalSearchDialog.open) globalSearchDialog.showModal();
  globalSearchInput.value = "";
  globalSearchActiveIndex = 0;
  renderGlobalSearchResults();
  requestAnimationFrame(() => globalSearchInput.focus());
}

function closeGlobalSearch() {
  if (globalSearchDialog.open) globalSearchDialog.close();
}

function configureSearchShortcut() {
  if (!searchShortcut) return;
  const platform = navigator.userAgentData?.platform ?? navigator.platform ?? "";
  const mobile = navigator.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (mobile) return;
  searchShortcut.textContent = /Mac/i.test(platform) ? "⌘ K" : "Ctrl K";
  searchShortcut.hidden = false;
}

configureSearchShortcut();
globalSearchTrigger.addEventListener("click", openGlobalSearch);
globalSearchClose.addEventListener("click", closeGlobalSearch);
globalSearchDialog.addEventListener("click", (event) => {
  if (event.target === globalSearchDialog) closeGlobalSearch();
});
globalSearchInput.addEventListener("input", () => {
  if (globalSearchComposing) return;
  globalSearchActiveIndex = 0;
  renderGlobalSearchResults();
});
globalSearchInput.addEventListener("compositionstart", () => {
  globalSearchComposing = true;
});
globalSearchInput.addEventListener("compositionend", () => {
  globalSearchComposing = false;
  globalSearchActiveIndex = 0;
  renderGlobalSearchResults();
});
globalSearchInput.addEventListener("keydown", (event) => {
  if (globalSearchComposing || event.isComposing || event.keyCode === 229) return;
  const results = [...globalSearchResults.querySelectorAll("[data-global-result]")];
  if (event.key === "ArrowDown" && results.length) {
    event.preventDefault();
    globalSearchActiveIndex = (globalSearchActiveIndex + 1) % results.length;
    syncGlobalSearchActive();
  } else if (event.key === "ArrowUp" && results.length) {
    event.preventDefault();
    globalSearchActiveIndex = (globalSearchActiveIndex - 1 + results.length) % results.length;
    syncGlobalSearchActive();
  } else if (event.key === "Enter" && results[globalSearchActiveIndex]) {
    event.preventDefault();
    results[globalSearchActiveIndex].click();
  }
});
globalSearchResults.addEventListener("mousemove", (event) => {
  const result = event.target.closest("[data-result-index]");
  if (!result) return;
  globalSearchActiveIndex = Number(result.dataset.resultIndex);
  syncGlobalSearchActive(false);
});
globalSearchResults.addEventListener("click", (event) => {
  const result = event.target.closest("[data-global-result]");
  if (!result) return;
  state.query = "";
  closeGlobalSearch();
  if (result.getAttribute("href") === location.hash) requestAnimationFrame(render);
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (globalSearchDialog.open) globalSearchInput.focus();
    else openGlobalSearch();
  }
});
window.addEventListener("hashchange", render);

function syncTableStickyTop() {
  const height = siteHeader?.getBoundingClientRect().height ?? 0;
  document.documentElement.style.setProperty("--table-sticky-top", `${Math.ceil(height)}px`);
}

syncTableStickyTop();
window.addEventListener("resize", syncTableStickyTop);
if (siteHeader && "ResizeObserver" in window) {
  new ResizeObserver(syncTableStickyTop).observe(siteHeader);
}

async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // file:// 页面可能无法使用 Clipboard API，继续使用兼容方案。
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  await copyToClipboard(button.dataset.copy);
  button.classList.add("copied");
  button.textContent = "✓";
  button.setAttribute("aria-label", "已复制调用模型 ID");
  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.classList.remove("copied");
    button.textContent = "⧉";
    button.setAttribute("aria-label", "复制调用模型 ID");
  }, 1400);
});

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
