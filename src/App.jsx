import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Database,
  Gauge,
  Layers3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { fetchJobs } from "./api";

const visibleColumns = [
  { key: "job", label: "Job" },
  { key: "state", label: "State" },
  { key: "start_time", label: "Start" },
  { key: "end_time", label: "End" },
  { key: "machine_name", label: "Machine" },
  { key: "material_name", label: "Material" },
  { key: "material_thickness", label: "Thickness" },
  { key: "cutting_time_seconds", label: "Cut Time" },
  { key: "material_consumption", label: "Consumption" },
];

const detailLabels = {
  id: "Record ID",
  source_jobinfo_id: "Source Job Info ID",
  process_id: "Process ID",
  job: "Job",
  state: "State",
  start_time: "Start Time",
  end_time: "End Time",
  cutting_time_seconds: "Cutting Time",
  machine_name: "Machine",
  material_name: "Material",
  material_thickness: "Material Thickness",
  material_width: "Material Width",
  material_length: "Material Length",
  material_consumption: "Material Consumption",
  cut_path_length: "Cut Path Length",
  movement_length: "Movement Length",
  act_segment: "Active Segment",
  total_segments: "Total Segments",
  act_copy: "Active Copy",
  total_copies: "Total Copies",
  source_is_last: "Source Is Last",
  source_database: "Source Database",
  source_pc: "Source PC",
  imported_at: "Imported At",
  updated_at: "Updated At",
};

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || seconds === "") return "-";
  const total = Number(seconds);
  if (!Number.isFinite(total)) return String(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatNumber(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(number)}${suffix}`;
}

function displayValue(key, value) {
  if (key === "cutting_time_seconds") return formatDuration(value);
  if (key.includes("time") || key.endsWith("_at")) return formatDateTime(value);
  if (key === "material_thickness") return formatNumber(value, " mm");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function useDebouncedValue(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-700"
      aria-hidden="true"
    />
  );
}

function DashboardPlaceholder({ total, filters }) {
  const rangeLabel =
    filters.startDate || filters.endDate
      ? `${filters.startDate || "Start"} to ${filters.endDate || "Today"}`
      : "All available dates";

  const tiles = [
    { label: "Records In View", value: total.toLocaleString("en-GB"), icon: Database },
    { label: "Date Range", value: rangeLabel, icon: CalendarDays },
    { label: "Machine Output", value: "Next", icon: Gauge },
    { label: "Material Trends", value: "Next", icon: Layers3 },
  ];

  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <div
                key={tile.label}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-500">{tile.label}</span>
                  <Icon className="h-5 w-5 text-cyan-700" aria-hidden="true" />
                </div>
                <div className="mt-3 truncate text-2xl font-semibold text-ink">{tile.value}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FilterBar({ filters, setFilters }) {
  const inputClass =
    "block w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 shadow-sm focus:border-cyan-600 focus:ring-cyan-600";

  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_170px_170px_130px_auto]">
      <div>
        <Label htmlFor="search">Search jobs</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true" />
          <input
            id="search"
            className={`${inputClass} pl-10`}
            placeholder="Job, state, machine, material, source..."
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="startDate">From</Label>
        <input
          id="startDate"
          className={inputClass}
          type="date"
          value={filters.startDate}
          onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
        />
      </div>
      <div>
        <Label htmlFor="endDate">To</Label>
        <input
          id="endDate"
          className={inputClass}
          type="date"
          value={filters.endDate}
          onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
        />
      </div>
      <div>
        <Label htmlFor="limit">Rows</Label>
        <select
          id="limit"
          className={inputClass}
          value={filters.limit}
          onChange={(event) => setFilters((current) => ({ ...current, limit: event.target.value }))}
        >
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="250">250</option>
          <option value="500">500</option>
        </select>
      </div>
      <div className="flex items-end">
        <button
          type="button"
          className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
          onClick={() => setFilters({ search: "", startDate: "", endDate: "", limit: "100" })}
        >
          <X className="mr-2 h-4 w-4" />
          Clear
        </button>
      </div>
    </div>
  );
}

function StateBadge({ state }) {
  const finished = String(state || "").toLowerCase() === "finished";
  const classes = finished
    ? "bg-emerald-100 text-emerald-800"
    : "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${classes}`}>
      {displayValue("state", state)}
    </span>
  );
}

function JobsTable({ rows, onRowClick }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.key} scope="col" className="whitespace-nowrap px-6 py-3">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer bg-white transition-colors hover:bg-cyan-50 focus-within:bg-cyan-50"
                onClick={() => onRowClick(row)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onRowClick(row);
                }}
              >
                {visibleColumns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-6 py-4 ${
                      column.key === "job" ? "min-w-72 font-medium text-ink" : "whitespace-nowrap"
                    }`}
                  >
                    {column.key === "state" ? <StateBadge state={row.state} /> : displayValue(column.key, row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailModal({ record, onClose }) {
  if (!record) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-detail-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="job-detail-title" className="pr-4 text-xl font-semibold text-ink">
            {record.job || "Job record"}
          </h2>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-200"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(detailLabels).map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="mt-1 break-words text-sm text-ink">{displayValue(key, record[key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [filters, setFilters] = useState({ search: "", startDate: "", endDate: "", limit: "100" });
  const debouncedSearch = useDebouncedValue(filters.search);
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);

  const requestFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch, offset: 0 }),
    [filters, debouncedSearch],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchJobs(requestFilters)
      .then((payload) => {
        if (cancelled) return;
        setJobs(payload.rows);
        setTotal(payload.total);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError.message);
        setJobs([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestFilters]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h1 className="text-2xl font-semibold">JWEI Job Log</h1>
            <p className="mt-1 text-sm text-slate-300">OptiScout production records from MySQL</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Live database view
          </div>
        </div>
      </header>

      <DashboardPlaceholder total={total} filters={filters} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-slate-500">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
        </div>
        <FilterBar filters={filters} setFilters={setFilters} />

        <div className="mt-5 flex min-h-9 items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Showing <span className="font-semibold text-ink">{jobs.length.toLocaleString("en-GB")}</span> of{" "}
            <span className="font-semibold text-ink">{total.toLocaleString("en-GB")}</span> matching records
          </p>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Spinner />
              Loading
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            No job records match the current filters.
          </div>
        )}

        {jobs.length > 0 && (
          <div className="mt-4">
            <JobsTable rows={jobs} onRowClick={setSelectedRecord} />
          </div>
        )}
      </main>

      <DetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </div>
  );
}
