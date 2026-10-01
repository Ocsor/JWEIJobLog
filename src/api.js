const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function buildParams(filters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  return params;
}

export async function fetchJobs(filters) {
  const params = buildParams(filters);

  const response = await fetch(`${API_BASE}/api/jobs?${params.toString()}`);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || "Unable to load jobs.");
  }

  return response.json();
}

export function getJobsCsvUrl(filters) {
  const params = buildParams(filters);
  return `${API_BASE}/api/jobs.csv?${params.toString()}`;
}
