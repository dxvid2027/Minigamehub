// ==========================================================================
// Library page — search, category/tag filters, sorting, grid/list view.
// ==========================================================================
import { GAMES, CATEGORIES } from "../../../data/games.js";
import { saveManager } from "../../systems/saveManager.js";
import { audioManager } from "../../systems/audioManager.js";
import { el } from "../../core/utils.js";
import { iconMarkup } from "../icons.js";
import { gameCard } from "../gameCard.js";

const SORTS = {
  popular: (a, b) => (saveManager.data.games[b.id]?.plays || 0) - (saveManager.data.games[a.id]?.plays || 0),
  name: (a, b) => a.title.localeCompare(b.title),
  newest: (a, b) => (b.newIn ? 1 : 0) - (a.newIn ? 1 : 0),
  highscore: (a, b) => (saveManager.data.games[b.id]?.highScore || 0) - (saveManager.data.games[a.id]?.highScore || 0),
};

export function renderLibrary(container, query = {}) {
  const state = {
    q: query.q || "",
    cats: query.cat ? [query.cat] : [],
    sort: "popular",
    view: "grid",
    favOnly: false,
  };

  container.innerHTML = "";
  const resultsCount = el("div", { class: "results-count" });
  const grid = el("div", { class: "game-grid stagger-in" });

  const searchInput = el("input", { class: "text-input", placeholder: "Search by name, tag or category…", value: state.q, style: "flex:1;", type: "search" });
  searchInput.addEventListener("input", () => { state.q = searchInput.value; renderResults(); });

  const sortSelect = el("select", { class: "select" }, [
    el("option", { value: "popular" }, "Most Popular"),
    el("option", { value: "name" }, "Name A-Z"),
    el("option", { value: "newest" }, "Newest"),
    el("option", { value: "highscore" }, "Your High Score"),
  ]);
  sortSelect.addEventListener("change", () => { state.sort = sortSelect.value; renderResults(); });

  const gridBtn = el("button", { class: "active", "aria-label": "Grid view", onClick: () => setView("grid") });
  gridBtn.innerHTML = iconMarkup("grid");
  const listBtn = el("button", { "aria-label": "List view", onClick: () => setView("list") });
  listBtn.innerHTML = iconMarkup("list");
  const viewToggle = el("div", { class: "view-toggle" }, [gridBtn, listBtn]);
  function setView(v) { state.view = v; gridBtn.classList.toggle("active", v === "grid"); listBtn.classList.toggle("active", v === "list"); audioManager.play("toggle"); renderResults(); }

  const favToggle = el("button", { class: "chip", onClick: () => { state.favOnly = !state.favOnly; favToggle.classList.toggle("active", state.favOnly); renderResults(); } });
  favToggle.innerHTML = iconMarkup("heart") + "<span>Favorites</span>";

  const searchBox = el("div", { class: "search-box" });
  searchBox.innerHTML = iconMarkup("search");
  searchBox.appendChild(searchInput);

  const toolbar = el("div", { class: "library-toolbar" }, [
    searchBox,
    sortSelect, favToggle, viewToggle,
  ]);

  const catGroup = el("div", { class: "group" }, [
    el("h5", {}, "Category"),
    ...CATEGORIES.map(cat => {
      const id = "cat-" + cat;
      const checked = state.cats.includes(cat);
      const input = el("input", { type: "checkbox", id, checked: checked || undefined });
      input.addEventListener("change", () => {
        if (input.checked) state.cats.push(cat); else state.cats = state.cats.filter(c => c !== cat);
        renderResults();
      });
      return el("label", { class: "filter-check", for: id }, [input, cat]);
    }),
  ]);

  const controlsGroup_inputs = [];
  const controlsGroup = el("div", { class: "group" }, [
    el("h5", {}, "Controls"),
    ...["keyboard", "touch", "both"].map(c => {
      const id = "ctrl-" + c;
      const input = el("input", { type: "checkbox", id, "data-ctrl": c });
      input.addEventListener("change", renderResults);
      controlsGroup_inputs.push(input);
      return el("label", { class: "filter-check", for: id }, [input, c === "both" ? "Keyboard + Touch" : c[0].toUpperCase() + c.slice(1)]);
    }),
  ]);

  const clearBtn = el("button", { class: "btn btn-ghost btn-sm btn-block", onClick: () => { state.q = ""; state.cats = []; state.favOnly = false; searchInput.value = ""; catGroup.querySelectorAll("input").forEach(i => i.checked = false); controlsGroup.querySelectorAll("input").forEach(i => i.checked = false); favToggle.classList.remove("active"); renderResults(); } }, "Clear Filters");

  const filtersPanel = el("div", { class: "filters-panel card card-pad" }, [catGroup, controlsGroup, clearBtn]);

  function renderResults() {
    let list = GAMES.filter(g => {
      if (state.favOnly && !saveManager.isFavorite(g.id)) return false;
      if (state.cats.length && !state.cats.includes(g.category)) return false;
      const activeCtrls = controlsGroup_inputs.filter(i => i.checked).map(i => i.dataset.ctrl);
      if (activeCtrls.length && !activeCtrls.includes(g.controls)) return false;
      if (state.q) {
        const q = state.q.toLowerCase();
        const hay = `${g.title} ${g.category} ${g.tags.join(" ")} ${g.desc}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort(SORTS[state.sort]);
    resultsCount.textContent = `${list.length} game${list.length === 1 ? "" : "s"} found`;
    grid.className = `game-grid stagger-in${state.view === "list" ? " list" : ""}`;
    grid.innerHTML = "";
    if (!list.length) {
      grid.appendChild(el("div", { class: "empty-state", style: "grid-column:1/-1;" }, [
        el("div", { class: "ic" }, "○"), el("h3", {}, "No games match"), el("p", {}, "Try clearing filters or searching something else."),
      ]));
    } else {
      list.forEach(g => grid.appendChild(gameCard(g, { list: state.view === "list" })));
    }
  }

  container.append(
    el("div", { class: "container" }, [
      el("div", { class: "section-title" }, [el("div", {}, [el("h2", {}, "Games Library"), el("div", { class: "subtitle" }, `Explore all ${GAMES.length} games on MegaPlay Hub`)])]),
      toolbar,
      el("div", { class: "library-layout" }, [filtersPanel, el("div", {}, [resultsCount, grid])]),
    ]),
  );
  renderResults();
}

export default renderLibrary;
