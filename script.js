function parseDate(str) {
  const [day, month, year] = str.split("-").map(Number);
  return new Date(year, month - 1, day);
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

  const months = Math.round(n / 30.44);
  if (months < 12) {
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

function groupByYearAndMonth(events) {
  const eventsByMonth = new Map();
  for (const e of events) {
    const key = `${e.parsedDate.getFullYear()}-${e.parsedDate.getMonth()}`;
    if (!eventsByMonth.has(key)) eventsByMonth.set(key, []);
    eventsByMonth.get(key).push(e);
  }

  const first = events[0].parsedDate;
  const last = events[events.length - 1].parsedDate;

  const years = [];
  let currentYear = null;
  let cursorYear = first.getFullYear();
  let cursorMonth = first.getMonth();
  const endYear = last.getFullYear();
  const endMonth = last.getMonth();

  while (cursorYear < endYear || (cursorYear === endYear && cursorMonth <= endMonth)) {
    if (!currentYear || currentYear.year !== cursorYear) {
      currentYear = { year: cursorYear, months: [] };
      years.push(currentYear);
    }

    currentYear.months.push({
      month: cursorMonth,
      events: eventsByMonth.get(`${cursorYear}-${cursorMonth}`) || [],
    });

    cursorMonth++;
    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear++;
    }
  }

  return years;
}

function reverseGroups(years) {
  return years
    .slice()
    .reverse()
    .map((y) => ({
      year: y.year,
      months: y.months
        .slice()
        .reverse()
        .map((m) => ({
          month: m.month,
          events: m.events.slice().reverse(),
        })),
    }));
}

function renderEvent(e) {
  const tentative = e.title.endsWith("(?)");
  const title = tentative ? e.title.slice(0, -3).trim() : e.title;
  const soon = e.daysUntil >= 0 && e.daysUntil <= 7;
  const past = e.daysUntil < 0;
  const titleContent = `${title}${tentative ? '<span class="tentative-badge">Tentative</span>' : ""}`;
  const titleHtml = e.url && !past
    ? `<a class="event-title" href="${e.url}" target="_blank" rel="noopener">${titleContent}</a>`
    : `<span class="event-title">${titleContent}</span>`;

  return `
    <li class="event${tentative ? " tentative" : ""}">
      <div class="event-header">
        ${titleHtml}
        <div class="event-date-block">
          <span class="event-date">${formatDate(e.parsedDate)}</span>
          <span class="event-countdown${soon ? " soon" : ""}${past ? " past" : ""}">${formatRelativeTime(e.daysUntil)}</span>
        </div>
      </div>
      ${e.location ? `<div class="event-location">${e.location}</div>` : ""}
    </li>
  `;
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

async function loadEvents() {
  const list = document.getElementById("events");
  try {
    const res = await fetch("data.json");
    const events = await res.json();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const withDates = events
      .map((e) => ({ ...e, parsedDate: parseDate(e.date) }))
      .map((e) => ({
        ...e,
        daysUntil: Math.round((e.parsedDate - today) / 86400000),
      }));

    const upcoming = withDates
      .filter((e) => e.daysUntil >= 0)
      .sort((a, b) => a.parsedDate - b.parsedDate);

    const past = withDates
      .filter((e) => e.daysUntil < 0 && !e.title.endsWith("(?)"))
      .sort((a, b) => a.parsedDate - b.parsedDate);

    const upcomingGroups = upcoming.length ? groupByYearAndMonth(upcoming) : [];
    const pastGroups = past.length ? reverseGroups(groupByYearAndMonth(past)) : [];

    function render(view) {
      const groups = view === "past" ? pastGroups : upcomingGroups;
      const emptyMessage = view === "past" ? "No past events." : "No upcoming events.";
      list.innerHTML = groups.length === 0
        ? `<p class="empty">${emptyMessage}</p>`
        : renderGroups(groups, { showEmptyMonths: view !== "past" });
    }

    render("upcoming");

    document.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".toggle-btn").forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        render(btn.dataset.view);
      });
    });
  } catch (err) {
    list.innerHTML = '<p class="error">Could not load events.</p>';
    console.error(err);
  }
}

loadEvents();
