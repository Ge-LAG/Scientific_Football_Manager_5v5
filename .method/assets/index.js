"use strict";
const search = document.querySelector("#search");
const cards = Array.from(document.querySelectorAll("[data-search]"));
const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
search?.addEventListener("input", () => {
  const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
  let count = 0;
  for (const card of cards) {
    card.hidden = !terms.every(term => normalize(card.dataset.search).includes(term));
    if (!card.hidden) count++;
  }
  document.querySelector("#results").textContent = `${count} reference${count === 1 ? "" : "s"}`;
});
