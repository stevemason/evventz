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

function formatDaysUntil(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;

  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `In ${weeks} week${weeks === 1 ? "" : "s"}`;
  }

  const months = Math.round(days / 30.44);
  if (months < 12) {
    return `In ${months} month${months === 1 ? "" : "s"}`;
  }

  const years = Math.round(days / 365.25);
  return `In ${years} year${years === 1 ? "" : "s"}`;
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

function renderEvent(e) {
  const tentative = e.title.endsWith("(?)");
  const title = tentative ? e.title.slice(0, -3).trim() : e.title;
  const soon = e.daysUntil <= 7;
  const titleContent = `${title}${tentative ? '<span class="tentative-badge">Tentative</span>' : ""}`;
  const titleHtml = e.url
    ? `<a class="event-title" href="${e.url}" target="_blank" rel="noopener">${titleContent}</a>`
    : `<span class="event-title">${titleContent}</span>`;

  return `
    <li class="event${tentative ? " tentative" : ""}">
      <div class="event-header">
        ${titleHtml}
        <div class="event-date-block">
          <span class="event-date">${formatDate(e.parsedDate)}</span>
          <span class="event-countdown${soon ? " soon" : ""}">${formatDaysUntil(e.daysUntil)}</span>
        </div>
      </div>
      ${e.location ? `<div class="event-location">${e.location}</div>` : ""}
    </li>
  `;
}

async function loadEvents() {
  const list = document.getElementById("events");
  try {
    const res = await fetch("data.json");
    const events = await res.json();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = events
      .map((e) => ({ ...e, parsedDate: parseDate(e.date) }))
      .filter((e) => e.parsedDate >= today)
      .map((e) => ({
        ...e,
        daysUntil: Math.round((e.parsedDate - today) / 86400000),
      }))
      .sort((a, b) => a.parsedDate - b.parsedDate);

    if (upcoming.length === 0) {
      list.innerHTML = '<p class="empty">No upcoming events.</p>';
      return;
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const years = groupByYearAndMonth(upcoming);

    list.innerHTML = years
      .map(
        (y) => `
          <section class="year-group">
            <h2 class="year-header">${y.year}</h2>
            ${y.months
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
              .join("")}
          </section>
        `
      )
      .join("");
  } catch (err) {
    list.innerHTML = '<p class="error">Could not load events.</p>';
    console.error(err);
  }
}

loadEvents();
