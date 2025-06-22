// ==UserScript==
// @name         Codeforces Submission Ratings Filter + Toggles + Contest Status
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Show verdicts only for contest problems (with "Unattempted" if not tried). Gym/etc show blank status. Includes rating filter UI.
// @author       Mutiur
// @match        https://codeforces.com/submissions/*
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(async function () {
  "use strict";

  const ratingRanges = [
    { label: "800–999", min: 800, max: 999 },
    { label: "1000–1199", min: 1000, max: 1199 },
    { label: "1200–1399", min: 1200, max: 1399 },
    { label: "1400–1599", min: 1400, max: 1599 },
    { label: "1600–1799", min: 1600, max: 1799 },
    { label: "1800–1999", min: 1800, max: 1999 },
    { label: "2000+", min: 2000, max: Infinity },
    { label: "Show All", min: 0, max: Infinity },
    { label: "Unrated", min: NaN, max: NaN },
  ];

  const handle = document
    .querySelector('.lang-chooser a[href^="/profile/"]')
    ?.textContent.trim();

  const getRatings = async () => {
    const res = await fetch("https://codeforces.com/api/problemset.problems");
    const data = await res.json();
    if (data.status !== "OK") throw new Error("Failed to fetch problem ratings");
    const map = {};
    for (const p of data.result.problems)
      if (p.rating) map[`${p.contestId}-${p.index}`] = p.rating;
    return map;
  };

  const getUserProblemStatus = async () => {
    const res = await fetch(
      `https://codeforces.com/api/user.status?handle=${handle}&from=1&count=1000000`
    );
    const data = await res.json();
    if (data.status !== "OK") throw new Error("Failed to fetch user submissions");

    const statusMap = {};
    for (const sub of data.result) {
      const key = `${sub.problem.contestId}-${sub.problem.index}`;
      if (!statusMap[key] || sub.creationTimeSeconds > statusMap[key].time) {
        statusMap[key] = {
          verdict: sub.verdict || "No Verdict",
          time: sub.creationTimeSeconds,
        };
      }
    }

    const finalStatusMap = {};
    for (const [key, val] of Object.entries(statusMap)) {
      finalStatusMap[key] = val.verdict;
    }

    return finalStatusMap;
  };

  const showRatingsAndStatus = (table, ratings, statuses) => {
    const headerRow = table.querySelector("tbody tr:first-child");
    const headerCells = [...headerRow.querySelectorAll("th")];
    const verdictIndex = headerCells.findIndex(
      (th) => th.textContent.trim().toLowerCase() === "verdict"
    );

    if (verdictIndex === -1) {
      console.error("Verdict column not found");
      return;
    }

    const statusHeader = document.createElement("th");
    statusHeader.textContent = "Status";
    headerCells[verdictIndex].insertAdjacentElement("afterend", statusHeader);

    const dataRows = Array.from(table.querySelectorAll("tbody tr")).slice(1);
    for (const row of dataRows) {
      const link = row.querySelector("td:nth-child(4) a");
      const verdictTd = row.querySelector(`td:nth-child(${verdictIndex + 1})`);
      if (!link || !verdictTd) continue;

      const contestMatch = link.href.match(/\/contest\/(\d+)\/problem\/(\w+)/);
      const generalMatch = link.href.match(/\/(?:contest|gym|edu|problemset|acmsguru)\/(\d+)\/problem\/(\w+)/);

      let key, rating;
      const span = document.createElement("span");
      span.className = "problem-rating";

      if (generalMatch) {
        key = `${generalMatch[1]}-${generalMatch[2]}`;
        rating = ratings[key];
        if (rating) {
          span.textContent = ` (Rating: ${rating})`;
          row.dataset.rating = rating;
        } else {
          row.dataset.rating = "";
        }
        link.parentNode.appendChild(span);
      }

      let statusTd = row.querySelector(".problem-status");
      if (!statusTd) {
        statusTd = document.createElement("td");
        statusTd.className = "problem-status";
        verdictTd.insertAdjacentElement("afterend", statusTd);
      }

      if (contestMatch) {
        const contestKey = `${contestMatch[1]}-${contestMatch[2]}`;
        const rawStatus = statuses[contestKey];
const statusText = rawStatus
  ? rawStatus === "OK"&& "AC"
    || rawStatus === "WRONG_ANSWER"&& "WA"
    || rawStatus === "TIME_LIMIT_EXCEEDED" && "TLE"
    || rawStatus === "COMPILATION_ERROR" && "CE"
    || rawStatus === "MEMORY_LIMIT_EXCEEDED"&& "MLE"
    : "Unattempted";
        const prettyVerdict = (verdict) =>
          verdict
            .replace(/_/g, " ")
            .replace(/(^|\s)\S/g, (l) => l.toUpperCase());
        statusTd.textContent = prettyVerdict(statusText);
        statusTd.classList.add(`verdict-${rawStatus || "Unattempted"}`);
      } else {
        statusTd.textContent = "";
      }
    }
  };

  const setupFilter = () => {
    const div = document.createElement("div");
    div.id = "rating-filter-container";

    div.innerHTML = `
      <div id="manual-filter">
          <label>Rating Filter:</label>
          <input id="min-rating" type="number" placeholder="Min" style="width:60px;">
          <input id="max-rating" type="number" placeholder="Max" style="width:60px;">
          <button id="filter-btn">Apply</button>
      </div>
      <div id="range-buttons" style="margin-top: 5px;"></div>
    `;

    const table = document.querySelector(".datatable");
    table.before(div);

    document.getElementById("filter-btn").onclick = () => {
      const min = parseInt(document.getElementById("min-rating").value) || "";
      const max = parseInt(document.getElementById("max-rating").value) || Infinity;
      applyRatingFilter(min, max);
    };

    const btnContainer = document.getElementById("range-buttons");
    ratingRanges.forEach((range) => {
      const btn = document.createElement("button");
      btn.textContent = range.label;
      btn.className = "range-btn";
      btn.onclick = () => {
        applyRatingFilter(range.min, range.max);
        if (range.label === "Show All") {
          document.getElementById("min-rating").value = "";
          document.getElementById("max-rating").value = "";
        } else {
          document.getElementById("min-rating").value = range.min;
          document.getElementById("max-rating").value = isFinite(range.max) ? range.max : "";
        }
      };
      btnContainer.appendChild(btn);
    });
  };

  const applyRatingFilter = (min, max) => {
    document.getElementById("min-rating").value = min;
    document.getElementById("max-rating").value = max;
    document
      .querySelectorAll(".status-frame-datatable tr[data-submission-id]")
      .forEach((row) => {
        const r = parseInt(row.dataset.rating);
        if (isNaN(min) && isNaN(max) && isNaN(r)) {
          row.style.display = "";
          return;
        }
        if (isNaN(r) && (min === 0 || min === "") && max === Infinity) {
          row.style.display = "";
          return;
        }
        row.style.display = r >= min && r <= max ? "" : "none";
      });
  };

  GM_addStyle(`
  .problem-rating { margin-left: 5px; color: green; font-weight: bold; }
  #rating-filter-container { margin: 10px 0; }
  #manual-filter input { margin: 0 5px; padding: 3px; }
  #filter-btn, .range-btn {
      padding: 3px 8px;
      margin: 2px 4px;
      background: #0073e6;
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 13px;
  }
  #filter-btn:hover, .range-btn:hover {
      background: #005bb5;
  }
  .problem-status {
      font-weight: bold;
      text-align: center;
      font-size: 1.1rem !important;
  }
  .verdict-OK { color: #0a0; }
  .verdict-WRONG_ANSWER { color: red; }
  .verdict-TIME_LIMIT_EXCEEDED { color: orange; }
  .verdict-MEMORY_LIMIT_EXCEEDED { color: purple; }
  .verdict-COMPILATION_ERROR { color: gray; }
  .verdict-RUNTIME_ERROR { color: crimson; }
  .verdict-PRESENTATION_ERROR { color: darkorange; }
  .verdict-IDLENESS_LIMIT_EXCEEDED { color: darkblue; }
  // .verdict-NO_VERDICT, .verdict-FAILED, .verdict-Unattempted { color: darkred; }
`);

  async function waitForTable() {
    for (let i = 0; i < 30; i++) {
      const table = document.querySelector(".status-frame-datatable");
      if (table) {
        const headerRow = table.querySelector("tbody tr:first-child");
        if (headerRow) return table;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Table or header not found after waiting");
  }

  try {
    const ratings = await getRatings();
    const statuses = await getUserProblemStatus();
    const table = await waitForTable();
    showRatingsAndStatus(table, ratings, statuses);
    setupFilter();
  } catch (err) {
    console.error("Error:", err);
  }
})();
