// ==========================================================================
// Icon set — hand-tuned inline SVG on a 24px grid, stroked with currentColor
// so icons inherit text colour, hover states and theme accents.
// ==========================================================================

const svg = (paths, { fill = false, w = 24 } = {}) =>
  `<svg viewBox="0 0 ${w} ${w}" fill="${fill ? "currentColor" : "none"}" stroke="${fill ? "none" : "currentColor"}" ` +
  `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  home: svg(`<path d="M3.5 10.4 12 3.8l8.5 6.6"/><path d="M5.6 9v10.2h12.8V9"/><path d="M9.8 19.2v-5.4h4.4v5.4"/>`),
  library: svg(`<rect x="2.6" y="6.4" width="18.8" height="11.2" rx="3.6"/><path d="M7.2 10.2v3.6M5.4 12h3.6"/><circle cx="15.6" cy="11.2" r="1.05" fill="currentColor" stroke="none"/><circle cx="17.9" cy="13.4" r="1.05" fill="currentColor" stroke="none"/>`),
  profile: svg(`<circle cx="12" cy="8.4" r="3.7"/><path d="M4.8 19.6c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6"/>`),
  trophy: svg(`<path d="M7.4 4.4h9.2v4.2a4.6 4.6 0 0 1-9.2 0z"/><path d="M7.4 5.6H4.9v1.3a3.1 3.1 0 0 0 2.8 3.1M16.6 5.6h2.5v1.3a3.1 3.1 0 0 1-2.8 3.1"/><path d="M12 13.2v3.4M8.9 19.6h6.2l-.5-3h-5.2z"/>`),
  stats: svg(`<path d="M4 19.4h16"/><rect x="5.6" y="11" width="3.4" height="6.6" rx="1.2"/><rect x="10.4" y="6.8" width="3.4" height="10.8" rx="1.2"/><rect x="15.2" y="9" width="3.4" height="8.6" rx="1.2"/>`),
  settings: svg(`<circle cx="12" cy="12" r="3.1"/><path d="M19.2 14.2a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.46v.17a1.9 1.9 0 1 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97h-.17a1.9 1.9 0 1 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .97-1.46v-.17a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.97h.17a1.9 1.9 0 1 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46.97z"/>`),
  search: svg(`<circle cx="10.8" cy="10.8" r="6.2"/><path d="m19.4 19.4-4.2-4.2"/>`),
  star: svg(`<path d="m12 3.9 2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 17.42l-5.3 2.79 1.01-5.9-4.29-4.18 5.93-.86z"/>`),
  starFilled: svg(`<path d="m12 3.9 2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 17.42l-5.3 2.79 1.01-5.9-4.29-4.18 5.93-.86z"/>`, { fill: true }),
  heart: svg(`<path d="M12 19.8s-7.3-4.4-7.3-9.3a4.1 4.1 0 0 1 7.3-2.6 4.1 4.1 0 0 1 7.3 2.6c0 4.9-7.3 9.3-7.3 9.3z"/>`),
  play: svg(`<path d="M8.4 5.8 18 12l-9.6 6.2z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`),
  pause: svg(`<rect x="8" y="5.6" width="3" height="12.8" rx="1.2" fill="currentColor" stroke="none"/><rect x="13" y="5.6" width="3" height="12.8" rx="1.2" fill="currentColor" stroke="none"/>`),
  restart: svg(`<path d="M19 12a7 7 0 1 1-2.4-5.3"/><path d="M19.4 4.6v4.2h-4.2"/>`),
  close: svg(`<path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4"/>`),
  chevronLeft: svg(`<path d="M14.2 6.4 8.6 12l5.6 5.6"/>`),
  chevronRight: svg(`<path d="M9.8 6.4 15.4 12l-5.6 5.6"/>`),
  arrowRight: svg(`<path d="M4.8 12h14M13.4 6.6 18.8 12l-5.4 5.4"/>`),
  volume: svg(`<path d="M4.8 9.6h3.1L12 6v12l-4.1-3.6H4.8z"/><path d="M15.6 9.4a3.6 3.6 0 0 1 0 5.2M18 7a7 7 0 0 1 0 10"/>`),
  volumeMuted: svg(`<path d="M4.8 9.6h3.1L12 6v12l-4.1-3.6H4.8z"/><path d="m16.2 9.8 4 4.4M20.2 9.8l-4 4.4"/>`),
  coin: svg(`<circle cx="12" cy="12" r="7.6"/><path d="M12 8v8M9.9 9.8h3a1.8 1.8 0 0 1 0 3.6h-3M9.9 13.4h3.6"/>`),
  grid: svg(`<rect x="4.4" y="4.4" width="6" height="6" rx="1.6"/><rect x="13.6" y="4.4" width="6" height="6" rx="1.6"/><rect x="4.4" y="13.6" width="6" height="6" rx="1.6"/><rect x="13.6" y="13.6" width="6" height="6" rx="1.6"/>`),
  list: svg(`<path d="M4.6 7h14.8M4.6 12h14.8M4.6 17h14.8"/>`),
  filter: svg(`<path d="M4.6 6.4h14.8L14 12.6v5l-4 1.8v-6.8z"/>`),
  clock: svg(`<circle cx="12" cy="12" r="7.8"/><path d="M12 7.6V12l3 1.9"/>`),
  calendar: svg(`<rect x="4.2" y="5.6" width="15.6" height="14" rx="3"/><path d="M4.2 10h15.6M8.6 3.8v3.4M15.4 3.8v3.4"/>`),
  check: svg(`<path d="m5.6 12.4 4 4 8.8-9"/>`),
  lock: svg(`<rect x="5.4" y="10.4" width="13.2" height="9.2" rx="3"/><path d="M8.6 10.4V8.2a3.4 3.4 0 0 1 6.8 0v2.2"/>`),
  bolt: svg(`<path d="M13.4 3.4 6.2 13.2h4.6l-.8 7.4 7.6-10.2h-4.8z"/>`),
  fire: svg(`<path d="M12 20.4c3.2 0 5.6-2.2 5.6-5.2 0-3.8-3.6-5.4-3.2-9.6-2 .8-3.4 2.4-3.4 4.4 0 1-.6 1.6-1.2 1.6-.8 0-1.4-.8-1.2-2-1.4 1.4-2.2 3.4-2.2 5.6 0 3 2.4 5.2 5.6 5.2z"/>`),
  menu: svg(`<path d="M4.6 7h14.8M4.6 12h14.8M4.6 17h14.8"/>`),
  sparkles: svg(`<path d="m9 4.4 1.3 3 3 1.3-3 1.3-1.3 3-1.3-3-3-1.3 3-1.3z"/><path d="m16.6 12.8.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z"/>`),
  target: svg(`<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="3.9"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`),
  gamepad: svg(`<path d="M8.4 7.4h7.2a5 5 0 0 1 4.9 4.1l.7 4a2.8 2.8 0 0 1-5.1 2l-1.3-1.9H9.2l-1.3 1.9a2.8 2.8 0 0 1-5.1-2l.7-4a5 5 0 0 1 4.9-4.1z"/><path d="M7.6 11.2v2.4M6.4 12.4h2.4"/><circle cx="15.6" cy="11.8" r="1" fill="currentColor" stroke="none"/><circle cx="17.4" cy="13.6" r="1" fill="currentColor" stroke="none"/>`),
  medal: svg(`<circle cx="12" cy="14.6" r="5"/><path d="m8.6 10.2-2.4-6h4l2 4M15.4 10.2l2.4-6h-4"/>`),
  download: svg(`<path d="M12 4.4v10M7.8 10.6 12 14.8l4.2-4.2M5 19.2h14"/>`),
  upload: svg(`<path d="M12 14.8v-10M7.8 8.6 12 4.4l4.2 4.2M5 19.2h14"/>`),
  trash: svg(`<path d="M5.4 7.2h13.2M9.6 7.2V5.6a1.6 1.6 0 0 1 1.6-1.6h1.6a1.6 1.6 0 0 1 1.6 1.6v1.6"/><path d="M7.2 7.2 8 19a1.6 1.6 0 0 0 1.6 1.4h4.8A1.6 1.6 0 0 0 16 19l.8-11.8"/>`),
  edit: svg(`<path d="M15.6 4.6a2.3 2.3 0 0 1 3.3 3.3L8.6 18.2l-4.2 1 1-4.2z"/>`),
  palette: svg(`<path d="M12 3.9a8.1 8.1 0 0 0 0 16.2c1.2 0 1.9-.8 1.9-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h1.6a4.2 4.2 0 0 0 4.2-4.2c0-3.6-3.7-6.2-8.4-6.2z"/><circle cx="8.2" cy="10.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.8" cy="10" r="1.1" fill="currentColor" stroke="none"/>`),
  accessibility: svg(`<circle cx="12" cy="5.4" r="1.8"/><path d="M4.8 9.2c2.3.9 4.7 1.4 7.2 1.4s4.9-.5 7.2-1.4"/><path d="M12 10.6v4.2M12 14.8l-2.6 5M12 14.8l2.6 5"/>`),
  gauge: svg(`<path d="M4.6 17.4a8.4 8.4 0 1 1 14.8 0"/><path d="m12 12.6 3.6-3"/><circle cx="12" cy="13.4" r="1.2" fill="currentColor" stroke="none"/>`),
  save: svg(`<path d="M5.6 4.8h9.6l3.6 3.6v10.8a1.2 1.2 0 0 1-1.2 1.2H5.6a1.2 1.2 0 0 1-1.2-1.2V6a1.2 1.2 0 0 1 1.2-1.2z"/><path d="M8 4.8v5h6v-5M8 20.4v-5.6h8v5.6"/>`),
  flag: svg(`<path d="M6 20.4V4.6M6 5.4h11.4l-2 3.6 2 3.6H6"/>`),
  info: svg(`<circle cx="12" cy="12" r="8.2"/><path d="M12 11.2v5"/><circle cx="12" cy="7.9" r="1.05" fill="currentColor" stroke="none"/>`),
  book: svg(`<path d="M4.6 5.2h5a3 3 0 0 1 3 3v11a2.4 2.4 0 0 0-2.4-2.2H4.6z"/><path d="M19.4 5.2h-5a3 3 0 0 0-3 3v11a2.4 2.4 0 0 1 2.4-2.2h5.6z"/>`),
  users: svg(`<circle cx="9.4" cy="8.6" r="3.2"/><path d="M3.6 19.2c.6-3 2.8-4.8 5.8-4.8s5.2 1.8 5.8 4.8"/><path d="M16.2 5.9a3.2 3.2 0 0 1 0 5.9M17.2 14.8c2 .6 3.3 2.2 3.7 4.4"/>`),
};

/** Returns an <span> containing the requested icon, sized by CSS. */
export function icon(name, { className = "", size } = {}) {
  const span = document.createElement("span");
  span.className = className;
  span.style.display = "grid";
  span.style.placeItems = "center";
  if (size) { span.style.width = `${size}px`; span.style.height = `${size}px`; }
  span.innerHTML = ICONS[name] || ICONS.sparkles;
  if (size) {
    const s = span.querySelector("svg");
    s.setAttribute("width", size); s.setAttribute("height", size);
  }
  return span;
}

export function iconMarkup(name) { return ICONS[name] || ICONS.sparkles; }
export default ICONS;
