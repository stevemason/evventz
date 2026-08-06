// Expects ISO "YYYY-MM-DD"; returns null (rather than an Invalid Date) on bad
// input, including real-but-impossible dates like 2026-02-31.
function parseDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str))) return null;
  const [year, month, day] = String(str).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function isTentative(e) {
  return e.title.endsWith("(?)");
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(n) {
  if (n < 7) return `${n} day${n === 1 ? "" : "s"}`;

  if (n < 30) {
    const weeks = Math.round(n / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }

  if (n < 365) {
    const months = Math.round(n / 30.44);
    return `${months} month${months === 1 ? "" : "s"}`;
  }

  const years = Math.round(n / 365.25);
  return `${years} year${years === 1 ? "" : "s"}`;
}

function formatRelativeTime(daysUntil) {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  if (daysUntil === -1) return "Yesterday";

  if (daysUntil > 0) return `In ${formatDuration(daysUntil)}`;
  return `${formatDuration(-daysUntil)} ago`;
}

// events must be sorted by date (ascending or descending); groups come out in
// the same order, with the empty months in between filled in. The first and
// last entries define the month range that gets rendered.
function groupByYearAndMonth(events) {
  const eventsByMonth = new Map();
  for (const e of events) {
    const key = `${e.parsedDate.getFullYear()}-${e.parsedDate.getMonth()}`;
    if (!eventsByMonth.has(key)) eventsByMonth.set(key, []);
    eventsByMonth.get(key).push(e);
  }

  const first = events[0].parsedDate;
  const last = events[events.length - 1].parsedDate;
  const start = first.getFullYear() * 12 + first.getMonth();
  const end = last.getFullYear() * 12 + last.getMonth();
  const step = start <= end ? 1 : -1;

  const years = [];
  let currentYear = null;

  for (let cursor = start; step > 0 ? cursor <= end : cursor >= end; cursor += step) {
    const year = Math.floor(cursor / 12);
    const month = cursor % 12;

    if (currentYear?.year !== year) {
      currentYear = { year, months: [] };
      years.push(currentYear);
    }

    currentYear.months.push({
      month,
      events: eventsByMonth.get(`${year}-${month}`) || [],
    });
  }

  return years;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function safeUrl(url) {
  try {
    const parsed = new URL(url, location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // fall through
  }
  return null;
}

function renderEvent(e) {
  const tentative = isTentative(e);
  const title = tentative ? e.title.slice(0, -3).trim() : e.title;
  const soon = e.daysUntil >= 0 && e.daysUntil <= 7;
  const past = e.daysUntil < 0;
  const badge = tentative ? '<span class="tentative-badge">Tentative</span>' : "";
  const url = e.url ? safeUrl(e.url) : null;
  const titleLink = url && !past
    ? `<a class="event-title" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
    : `<span class="event-title">${escapeHtml(title)}</span>`;
  const titleHtml = `<span class="event-title-wrap">${titleLink}${badge}</span>`;

  return `
    <li class="event${tentative ? " tentative" : ""}">
      <div class="event-header">
        ${titleHtml}
        <div class="event-date-block">
          <span class="event-date">${formatDate(e.parsedDate)}</span>
          <span class="event-countdown${soon ? " soon" : ""}${past ? " past" : ""}">${formatRelativeTime(e.daysUntil)}</span>
        </div>
      </div>
      ${e.location ? `<div class="event-location">${escapeHtml(e.location)}</div>` : ""}
    </li>
  `;
}

// Locale-derived so month headers match the formatDate locale.
const monthNames = Array.from({ length: 12 }, (_, m) =>
  new Date(2000, m, 1).toLocaleDateString(undefined, { month: "long" })
);

function renderGroups(years, { showEmptyMonths = true } = {}) {
  return years
    .map((y) => {
      const monthsHtml = y.months
        .filter((m) => showEmptyMonths || m.events.length > 0)
        .map((m) =>
          m.events.length === 0
            ? `
              <div class="month-group month-empty">
                <h3 class="month-header">${monthNames[m.month]} <span class="no-events">No events</span></h3>
              </div>
            `
            : `
              <div class="month-group">
                <h3 class="month-header">${monthNames[m.month]}</h3>
                <ul class="events">
                  ${m.events.map(renderEvent).join("")}
                </ul>
              </div>
            `
        )
        .join("");

      if (!monthsHtml) return "";

      return `
        <section class="year-group">
          <h2 class="year-header">${y.year}</h2>
          ${monthsHtml}
        </section>
      `;
    })
    .join("");
}

const list = document.getElementById("events");

// Reassigned once data loads (or fails to), so the toggle buttons work
// regardless of how the fetch went.
let render = () => {};

document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".toggle-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");
    render(btn.dataset.view);
  });
});

try {
  const res = await fetch("data.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to fetch data.json: ${res.status}`);
  const events = await res.json();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const withDates = [];
  for (const e of events) {
    if (typeof e.title !== "string" || !e.title.trim()) {
      console.warn("Skipping event with missing title:", e);
      continue;
    }
    const parsedDate = parseDate(e.date);
    if (!parsedDate) {
      console.warn(`Skipping event with invalid date "${e.date}": ${e.title}`);
      continue;
    }
    withDates.push({
      ...e,
      parsedDate,
      daysUntil: Math.round((parsedDate - today) / 86400000),
    });
  }

  const upcoming = withDates
    .filter((e) => e.daysUntil >= 0)
    .sort((a, b) => a.parsedDate - b.parsedDate);

  // Tentative events are dropped once their date passes (rather than moving to
  // the past view), since there's no record of whether they were actually attended.
  const past = withDates
    .filter((e) => e.daysUntil < 0 && !isTentative(e))
    .sort((a, b) => b.parsedDate - a.parsedDate);

  const upcomingGroups = upcoming.length ? groupByYearAndMonth(upcoming) : [];
  const pastGroups = past.length ? groupByYearAndMonth(past) : [];

  render = (view) => {
    const groups = view === "past" ? pastGroups : upcomingGroups;
    const emptyMessage = view === "past" ? "No past events." : "No upcoming events.";
    list.innerHTML = groups.length === 0
      ? `<p class="empty">${emptyMessage}</p>`
      : renderGroups(groups, { showEmptyMonths: view !== "past" });
  };

  render(document.querySelector(".toggle-btn.active").dataset.view);
} catch (err) {
  console.error(err);
  render = () => {
    list.innerHTML = '<p class="error">Could not load events.</p>';
  };
  render();
}
