const CATEGORY_LABELS = {
  ai: "IA, skills & MCP",
  "home-assistant": "Home Assistant",
  trending: "Open source en tendance",
};

const SCORE_LABELS = {
  fit: "Pertinence",
  usability: "Utilisabilité",
  documentation: "Documentation",
  maintenance: "Maintenance",
};

const BENCHMARK_METRICS = {
  intelligence: "Intelligence",
  coding: "Code",
  agentic: "Agent",
};

const state = {
  entries: [],
  category: "all",
  query: "",
  showArchived: false,
  benchmarkModels: [],
  benchmarkMetric: "intelligence",
  benchmarkProvider: "all",
};

const grid = document.querySelector("#catalog-grid");
const emptyState = document.querySelector("#empty-state");
const resultSummary = document.querySelector("#result-summary");
const countLabel = document.querySelector("#project-count");
const template = document.querySelector("#project-card-template");
const benchmarkRowTemplate = document.querySelector("#llm-model-row-template");
const toolCardTemplate = document.querySelector("#llm-tool-card-template");
const growingToolCardTemplate = document.querySelector("#growing-tool-card-template");

function formatDate(value) {
  if (!value) return "REVUE NON DATÉE";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return "REVUE NON DATÉE";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    .format(date)
    .toUpperCase();
}

function safeImagePath(image, repositoryUrl) {
  if (!image || typeof image.path !== "string") return null;
  const path = image.path.replaceAll("\\", "/");
  if (path.startsWith("assets/") && !path.split("/").includes("..")) return `./${path}`;
  const repository = githubRepositoryName(repositoryUrl);
  if (!repository) return null;
  try {
    const url = new URL(path);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com"
      || parts.length < 4 || `${parts[0]}/${parts[1]}` !== repository
      || parts.includes("..") || !/\.(png|jpe?g|gif|webp|svg)$/i.test(parts.at(-1))
      || url.search || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

function imageSourceMatchesRepository(image, repositoryUrl) {
  const repository = githubRepositoryName(repositoryUrl);
  if (!repository || githubRepositoryName(image.sourceUrl) !== repository) return false;
  try {
    const sourceUrl = new URL(image.sourceUrl);
    const sourceParts = sourceUrl.pathname.split("/").filter(Boolean);
    const sourcePath = sourceParts[2] === "blob" ? sourceParts.slice(4).join("/") : "";
    const imagePath = image.path.startsWith("assets/")
      ? image.path.replaceAll("\\", "/")
      : new URL(image.path).pathname.split("/").filter(Boolean).slice(3).join("/");
    return sourceUrl.protocol === "https:" && sourceUrl.hostname === "github.com"
      && sourcePath.length > 0 && sourcePath === imagePath;
  } catch {
    return false;
  }
}

function githubRepositoryName(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

function isGithubRepositoryUrl(value) {
  return githubRepositoryName(value) !== null;
}

function isOpenRouterModelUrl(value, modelId) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "openrouter.ai" && url.pathname === `/${modelId}`;
  } catch {
    return false;
  }
}

function isValidEntry(entry) {
  const score = entry && entry.score;
  return Boolean(entry)
    && typeof entry.id === "string"
    && typeof entry.name === "string"
    && typeof entry.fullName === "string"
    && isGithubRepositoryUrl(entry.url)
    && Object.hasOwn(CATEGORY_LABELS, entry.category)
    && typeof entry.summary === "string"
    && Array.isArray(entry.tags)
    && Array.isArray(entry.useCases)
    && (entry.frenchTech === undefined || typeof entry.frenchTech === "boolean")
    && ["published", "archived"].includes(entry.status)
    && Object.keys(SCORE_LABELS).every((key) => Number.isFinite(score && score[key]) && score[key] >= 0 && score[key] <= 5)
    && (!entry.image || (safeImagePath(entry.image, entry.url)
      && typeof entry.image.alt === "string"
      && imageSourceMatchesRepository(entry.image, entry.url)
      && typeof entry.image.attribution === "string"));
}

function attachRepositoryImage(image, placeholder, imageData, repositoryUrl, fallbackAlt) {
  const imagePath = safeImagePath(imageData, repositoryUrl);
  if (!imagePath) return;
  image.src = imagePath;
  image.alt = imageData.alt || fallbackAlt;
  image.addEventListener("load", () => {
    image.classList.add("is-visible");
    placeholder.hidden = true;
  }, { once: true });
  image.addEventListener("error", () => {
    image.hidden = true;
  }, { once: true });
}

function makeTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}

function makeCard(entry) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".project-card");
  const image = fragment.querySelector(".card-image");
  const placeholder = fragment.querySelector(".image-placeholder");

  fragment.querySelector(".category-label").textContent = CATEGORY_LABELS[entry.category] || "Autre";
  fragment.querySelector(".archive-label").hidden = entry.status !== "archived";
  fragment.querySelector(".project-owner").textContent = entry.fullName || entry.id;
  fragment.querySelector(".review-date").textContent = formatDate(entry.reviewedAt);
  fragment.querySelector(".project-title").textContent = entry.name;
  fragment.querySelector(".project-summary").textContent = entry.summary;

  const useCase = fragment.querySelector(".project-use-case");
  const useCaseLabel = document.createElement("strong");
  useCaseLabel.textContent = "POUR QUOI ? ";
  useCase.append(useCaseLabel, document.createTextNode((entry.useCases || []).join(" · ")));

  const tags = fragment.querySelector(".tag-list");
  (entry.tags || []).slice(0, 5).forEach((tag) => tags.append(makeTag(tag)));

  const scores = entry.score || {};
  const scoreValues = Object.keys(SCORE_LABELS)
    .map((key) => scores[key])
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 5);
  const average = scoreValues.length
    ? (scoreValues.reduce((total, value) => total + value, 0) / scoreValues.length).toFixed(1)
    : "—";
  fragment.querySelector(".score-value strong").textContent = average;

  const breakdown = fragment.querySelector(".score-breakdown");
  Object.entries(SCORE_LABELS).forEach(([key, label]) => {
    const value = Number.isFinite(scores[key]) ? `${scores[key]}/5` : "Non notée";
    const line = document.createElement("div");
    line.textContent = `${label} : ${value}`;
    breakdown.append(line);
  });

  const stats = fragment.querySelector(".repo-stats");
  const statParts = [];
  if (Number.isFinite(entry.starsAtReview)) statParts.push(`${entry.starsAtReview.toLocaleString("fr-FR")} stars`);
  if (entry.lastPushedAt) statParts.push(`MAJ ${formatDate(entry.lastPushedAt)}`);
  stats.textContent = statParts.join(" · ") || "Depot GitHub";

  const link = fragment.querySelector(".repo-link");
  link.href = isGithubRepositoryUrl(entry.url) ? entry.url : "https://github.com";

  attachRepositoryImage(image, placeholder, entry.image, entry.url, `Aperçu de ${entry.name}`);

  if (entry.image && entry.image.sourceUrl && entry.image.attribution) {
    const attribution = fragment.querySelector(".image-attribution");
    attribution.href = entry.image.sourceUrl;
    attribution.textContent = `Image : ${entry.image.attribution}`;
    attribution.hidden = false;
  }

  card.dataset.search = [
    entry.name,
    entry.fullName,
    entry.summary,
    ...(entry.tags || []),
    ...(entry.useCases || []),
  ].join(" ").toLocaleLowerCase("fr");
  card.dataset.category = entry.category;
  card.dataset.status = entry.status;
  return fragment;
}

function renderFrenchTech() {
  const entries = state.entries.filter((entry) => entry.status === "published" && entry.frenchTech === true);
  document.querySelector("#french-tech-grid").replaceChildren(...entries.map(makeCard));
  document.querySelector("#french-tech-count").textContent =
    `${entries.length} projet${entries.length === 1 ? "" : "s"} sélectionné${entries.length === 1 ? "" : "s"}`;
  document.querySelector("#french-tech").hidden = entries.length === 0;
}

function render() {
  const visible = state.entries
    .filter((entry) => entry.status === "published" || (state.showArchived && entry.status === "archived"))
    .filter((entry) => {
      if (state.category === "french-tech") return entry.frenchTech === true;
      return state.category === "all" || entry.category === state.category;
    })
    .filter((entry) => {
      const searchText = [
        entry.name,
        entry.fullName,
        entry.summary,
        ...(entry.tags || []),
        ...(entry.useCases || []),
      ].join(" ").toLocaleLowerCase("fr");
      return searchText.includes(state.query);
    })
    .sort((left, right) => (right.publishedAt || "").localeCompare(left.publishedAt || ""));

  grid.replaceChildren(...visible.map(makeCard));
  emptyState.hidden = visible.length > 0;
  const publishedCount = state.entries.filter((entry) => entry.status === "published").length;
  countLabel.textContent = `${publishedCount} projet${publishedCount === 1 ? "" : "s"} publié${publishedCount === 1 ? "" : "s"}`;
  resultSummary.textContent = `${visible.length} fiche${visible.length === 1 ? "" : "s"} affichée${visible.length === 1 ? "" : "s"}`;
}

function formatTokens(value) {
  if (!Number.isFinite(value)) return "N/D";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 2)} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} k`;
  return value.toLocaleString("fr-FR");
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "N/D";
  if (value === 0) return "0";
  return value < 0.01 ? value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : value.toFixed(2);
}

function makeModelFact(text, supported = false) {
  const fact = document.createElement("span");
  fact.className = `model-fact${supported ? " is-supported" : ""}`;
  fact.textContent = text;
  return fact;
}

function renderBenchmarkChart() {
  const chart = document.querySelector("#benchmark-chart");
  const metric = state.benchmarkMetric;
  const metricLabel = BENCHMARK_METRICS[metric];
  const models = state.benchmarkModels
    .filter((model) => state.benchmarkProvider === "all" || model.provider === state.benchmarkProvider)
    .sort((left, right) => (right.indices[metric] ?? -1) - (left.indices[metric] ?? -1));
  const measured = models.filter((model) => Number.isFinite(model.indices[metric])).length;
  document.querySelector("#benchmark-coverage").textContent =
    `${measured}/${models.length} modèle${models.length === 1 ? "" : "s"} avec un indice ${metricLabel.toLowerCase()}`;

  chart.replaceChildren();
  for (const model of models) {
    const fragment = benchmarkRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".llm-model-row");
    const score = model.indices[metric];
    const track = fragment.querySelector(".llm-score-track");
    const bar = fragment.querySelector(".llm-score-bar");
    const scoreLabel = fragment.querySelector(".llm-score-value");
    const modelLink = fragment.querySelector(".llm-model-link");
    const facts = fragment.querySelector(".llm-model-facts");

    fragment.querySelector(".llm-provider").textContent = model.providerName;
    modelLink.href = model.url;
    modelLink.textContent = model.name;
    scoreLabel.textContent = Number.isFinite(score) ? score.toFixed(1) : "N/D";
    scoreLabel.classList.toggle("is-unavailable", !Number.isFinite(score));
    bar.style.width = Number.isFinite(score) ? `${Math.max(0, Math.min(score, 100))}%` : "0";
    bar.classList.toggle("is-unavailable", !Number.isFinite(score));
    track.setAttribute("role", "meter");
    track.setAttribute("aria-label", `${metricLabel} : ${Number.isFinite(score) ? score.toFixed(1) : "non mesuré"} sur 100`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    if (Number.isFinite(score)) track.setAttribute("aria-valuenow", String(score));
    facts.append(
      makeModelFact(`${formatTokens(model.contextTokens)} contexte`),
      makeModelFact(`Entrée $${formatPrice(model.inputPricePerMillionUsd)}`),
      makeModelFact(`Sortie $${formatPrice(model.outputPricePerMillionUsd)}`),
      makeModelFact(model.toolCallingSupported ? "Tool calling" : "Sans tools", model.toolCallingSupported),
    );
    row.dataset.provider = model.provider;
    chart.append(fragment);
  }
}

function isValidBenchmarkModel(model) {
  return Boolean(model)
    && typeof model.provider === "string"
    && typeof model.providerName === "string"
    && typeof model.id === "string"
    && typeof model.name === "string"
    && model.id.startsWith(`${model.provider}/`)
    && isOpenRouterModelUrl(model.url, model.id)
    && model.indices
    && Object.keys(BENCHMARK_METRICS).every((metric) =>
      model.indices[metric] === null || (Number.isFinite(model.indices[metric]) && model.indices[metric] >= 0 && model.indices[metric] <= 100))
    && (model.contextTokens === null || (Number.isFinite(model.contextTokens) && model.contextTokens > 0))
    && (model.inputPricePerMillionUsd === null || (Number.isFinite(model.inputPricePerMillionUsd) && model.inputPricePerMillionUsd >= 0))
    && (model.outputPricePerMillionUsd === null || (Number.isFinite(model.outputPricePerMillionUsd) && model.outputPricePerMillionUsd >= 0))
    && typeof model.toolCallingSupported === "boolean";
}

function renderTools(tools) {
  const grid = document.querySelector("#llm-tool-grid");
  if (!Array.isArray(tools) || !tools.every((tool) =>
    tool && typeof tool.name === "string" && typeof tool.repository === "string"
      && isGithubRepositoryUrl(tool.url) && githubRepositoryName(tool.url) === tool.repository)) {
    throw new Error("Le catalogue des outils LLM est incomplet ou invalide.");
  }
  grid.replaceChildren();
  for (const tool of tools) {
    const fragment = toolCardTemplate.content.cloneNode(true);
    fragment.querySelector(".tool-kind").textContent = tool.kind;
    fragment.querySelector(".tool-models").textContent = tool.models;
    fragment.querySelector(".tool-name").textContent = tool.name;
    fragment.querySelector(".tool-description").textContent = tool.description;
    fragment.querySelector(".tool-repo-name").textContent = tool.repository;
    fragment.querySelector(".tool-repo-link").href = tool.url;
    grid.append(fragment);
  }
}

function isValidGrowingTool(tool) {
  return Boolean(tool)
    && typeof tool.name === "string"
    && typeof tool.repository === "string"
    && isGithubRepositoryUrl(tool.url)
    && githubRepositoryName(tool.url) === tool.repository
    && typeof tool.description === "string"
    && Number.isFinite(tool.stars) && tool.stars >= 0
    && Number.isFinite(tool.ageDays) && tool.ageDays >= 1 && tool.ageDays <= 90
    && Number.isFinite(tool.growthStarsPerDay) && tool.growthStarsPerDay >= 0
    && (!tool.image || (safeImagePath(tool.image, tool.url)
      && typeof tool.image.alt === "string"
      && imageSourceMatchesRepository(tool.image, tool.url)
      && typeof tool.image.attribution === "string"));
}

function renderGrowingTools(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.tools)
    || !snapshot.tools.length || !snapshot.tools.every(isValidGrowingTool)) {
    throw new Error("Format des signaux de progression invalide.");
  }
  document.querySelector("#growth-updated").textContent = `Instantané du ${formatDate(snapshot.generatedAt)}`;
  const grid = document.querySelector("#growing-tool-grid");
  grid.replaceChildren();
  for (const tool of snapshot.tools) {
    const fragment = growingToolCardTemplate.content.cloneNode(true);
    const image = fragment.querySelector(".growing-tool-image");
    const placeholder = fragment.querySelector(".image-placeholder");
    const repoLink = fragment.querySelector(".tool-repo-link");
    fragment.querySelector(".tool-kind").textContent = tool.kind;
    fragment.querySelector(".growth-rate").textContent =
      `${Math.round(tool.growthStarsPerDay).toLocaleString("fr-FR")} étoiles/j`;
    fragment.querySelector(".tool-name").textContent = tool.name;
    fragment.querySelector(".tool-description").textContent = tool.description;
    fragment.querySelector(".growth-stats").textContent =
      `${tool.stars.toLocaleString("fr-FR")} étoiles · ${tool.ageDays} j depuis création`;
    fragment.querySelector(".tool-repo-name").textContent = tool.repository;
    repoLink.href = tool.url;
    attachRepositoryImage(image, placeholder, tool.image, tool.url, `Aperçu de ${tool.name}`);
    if (tool.image) {
      const attribution = fragment.querySelector(".image-attribution");
      attribution.href = tool.image.sourceUrl;
      attribution.textContent = `Image : ${tool.image.attribution}`;
      attribution.hidden = false;
    }
    grid.append(fragment);
  }
}

document.querySelector("#benchmark-metric").addEventListener("change", (event) => {
  state.benchmarkMetric = event.target.value;
  renderBenchmarkChart();
});

document.querySelector("#benchmark-provider").addEventListener("change", (event) => {
  state.benchmarkProvider = event.target.value;
  renderBenchmarkChart();
});

fetch("./data/llm-benchmarks.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Impossible de charger les benchmarks (${response.status}).`);
    return response.json();
  })
  .then((snapshot) => {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.models)
      || !snapshot.models.length || !snapshot.models.every(isValidBenchmarkModel)) {
      throw new Error("Format des données de benchmark invalide.");
    }
    state.benchmarkModels = snapshot.models;
    const providers = [...new Map(snapshot.models.map((model) => [model.provider, model.providerName])).entries()]
      .sort((left, right) => left[1].localeCompare(right[1], "fr"));
    const providerSelect = document.querySelector("#benchmark-provider");
    providers.forEach(([provider, name]) => {
      const option = document.createElement("option");
      option.value = provider;
      option.textContent = name;
      providerSelect.append(option);
    });
    document.querySelector("#benchmark-updated").textContent = `Instantané du ${formatDate(snapshot.generatedAt)}`;
    renderBenchmarkChart();
  })
  .catch((error) => {
    document.querySelector("#benchmark-error").textContent = error.message;
    document.querySelector("#benchmark-error").hidden = false;
    document.querySelector("#benchmark-coverage").textContent = "Données indisponibles";
  });

fetch("./data/llm-tools.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Impossible de charger les outils (${response.status}).`);
    return response.json();
  })
  .then((data) => renderTools(data.tools))
  .catch((error) => {
    document.querySelector("#llm-tools-error").textContent = error.message;
    document.querySelector("#llm-tools-error").hidden = false;
  });

fetch("./data/growing-tools.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Impossible de charger les outils en progression (${response.status}).`);
    return response.json();
  })
  .then(renderGrowingTools)
  .catch((error) => {
    document.querySelector("#growing-tools-error").textContent = error.message;
    document.querySelector("#growing-tools-error").hidden = false;
  });

function powershellQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function updateLocalSearchCommand() {
  const category = document.querySelector("#local-search-category").value;
  const topic = document.querySelector("#local-search-topic").value.trim().replace(/[\r\n]+/g, " ");
  const slug = `${category}-${topic.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "research"}`;
  const argumentsList = [`--category ${powershellQuote(category)}`];
  if (topic) argumentsList.push(`--topic ${powershellQuote(topic)}`);
  const outputPath = ["candidates", `${slug}.json`].join("\\");
  argumentsList.push("--limit 20", `--output ${powershellQuote(outputPath)}`);
  document.querySelector("#local-search-command").textContent = `python scripts\\discover.py ${argumentsList.join(" ")}`;
}

document.querySelector("#local-search-category").addEventListener("change", updateLocalSearchCommand);
document.querySelector("#local-search-topic").addEventListener("input", updateLocalSearchCommand);
document.querySelector("#copy-search-command").addEventListener("click", async () => {
  const status = document.querySelector("#copy-search-status");
  try {
    await navigator.clipboard.writeText(document.querySelector("#local-search-command").textContent);
    status.textContent = "Commande copiée.";
  } catch {
    const selection = window.getSelection();
    if (!selection) {
      status.textContent = "Copie indisponible; sélectionnez la commande affichée.";
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#local-search-command"));
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = "Commande sélectionnée; appuyez sur Ctrl+C pour la copier.";
  }
});
updateLocalSearchCommand();

document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    state.category = button.dataset.category;
    document.querySelectorAll(".filter-chip").forEach((chip) => {
      const selected = chip === button;
      chip.classList.toggle("is-active", selected);
      chip.setAttribute("aria-pressed", String(selected));
    });
    render();
  });
});

document.querySelector("#search-input").addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLocaleLowerCase("fr");
  render();
});

document.querySelector("#show-archived").addEventListener("change", (event) => {
  state.showArchived = event.target.checked;
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    document.querySelector("#search-input").focus();
  }
});

fetch("./data/catalog.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Impossible de charger le catalogue (${response.status}).`);
    return response.json();
  })
  .then((catalog) => {
    if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.entries)) {
      throw new Error("Format de catalogue invalide.");
    }
    if (!catalog.entries.every(isValidEntry)) {
      throw new Error("Une fiche est incomplete ou ne respecte pas le format du catalogue.");
    }
    state.entries = catalog.entries;
    render();
    renderFrenchTech();
  })
  .catch((error) => {
    countLabel.textContent = "Catalogue indisponible";
    resultSummary.textContent = error.message;
    emptyState.hidden = false;
    emptyState.querySelector("h3").textContent = "Impossible de charger le catalogue.";
    emptyState.querySelector("p").textContent = "Vérifiez que le fichier site/data/catalog.json existe et contient un tableau entries valide.";
  });
