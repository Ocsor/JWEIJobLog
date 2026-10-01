import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Database,
  Download,
  Gauge,
  Layers3,
  Menu,
  Search,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { fetchJobs, getJobsCsvUrl } from "./api";

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

const defaultSettings = {
  shiftStartTime: "08:00",
  shiftLengthHours: "8",
  setupAllowanceMinutes: "0",
  shortIdleThresholdMinutes: "10",
  longIdleThresholdMinutes: "60",
};

function loadSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem("jwei-job-log-settings") || "{}");
    return { ...defaultSettings, ...saved };
  } catch {
    return defaultSettings;
  }
}

function saveSettings(settings) {
  window.localStorage.setItem("jwei-job-log-settings", JSON.stringify(settings));
}

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

function formatHoursMinutes(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total)) return "0h 0m";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours.toLocaleString("en-GB")}h ${minutes}m`;
}

function formatNumber(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(number)}${suffix}`;
}

function formatRoundedUpNumber(value, suffix = "") {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return `0${suffix}`;
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Math.ceil(number))}${suffix}`;
}

function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
}

function formatPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0%";
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(number)}%`;
}

function formatAxisDuration(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return "0";
  const hours = total / 3600;
  if (hours >= 1) {
    return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(hours)}h`;
  }
  return `${Math.round(total / 60)}m`;
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

function MetricTile({ label, value, icon: Icon, hint, hints, onClick }) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      className={`rounded-lg border border-slate-200 bg-slate-50 p-4 text-left shadow-sm ${
        onClick ? "transition hover:border-cyan-300 hover:bg-cyan-50 focus:outline-none focus:ring-4 focus:ring-cyan-100" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <Icon className="h-5 w-5 text-cyan-700" aria-hidden="true" />
      </div>
      <div className="mt-3 truncate text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-slate-500">{hint}</div>}
      {hints?.length > 0 && (
        <div className="mt-1 space-y-0.5 text-xs text-slate-500">
          {hints.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      )}
    </Component>
  );
}

function DonutGauge({ label, value, detail, colorClass, strokeColor }) {
  const safeValue = Math.min(Math.max(Number(value || 0), 0), 100);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (safeValue / 100) * circumference;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center shadow-sm">
      <div className="mx-auto h-28 w-28">
        <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="12"
          />
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeLinecap="round"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="-mt-28 flex h-28 items-center justify-center">
          <span className="text-xl font-semibold text-ink">{formatPercent(value)}</span>
        </div>
      </div>
      <div className={`mt-3 text-sm font-semibold ${colorClass}`}>{label}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function UtilisationGauges({ shiftPercent, windowPercent, shiftCapacitySeconds, productionWindowSeconds }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DonutGauge
        label="Shift Capacity"
        value={shiftPercent}
        detail={`${formatHoursMinutes(shiftCapacitySeconds)} planned capacity`}
        colorClass="text-cyan-800"
        strokeColor="#0e7490"
      />
      <DonutGauge
        label="First-To-Last Cut"
        value={windowPercent}
        detail={`${formatHoursMinutes(productionWindowSeconds)} production window`}
        colorClass="text-emerald-700"
        strokeColor="#059669"
      />
    </div>
  );
}

function ChartModeToggle({ value, onChange }) {
  const options = [
    { value: "idle", label: "Idle" },
    { value: "active", label: "Active" },
    { value: "stacked", label: "Both" },
  ];

  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            value === option.value
              ? "bg-white text-cyan-800 shadow-sm"
              : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function IdleBarChart({ daily, hourly, activeDaily, activeHourly, showHourly, yAxisMaxSeconds, mode }) {
  const chartData = showHourly
    ? Array.from({ length: 24 }, (_, hour) => {
        const idleItem = hourly.find((entry) => Number(entry.idle_hour) === hour);
        const activeItem = activeHourly.find((entry) => Number(entry.active_hour) === hour);
        return {
          label: String(hour).padStart(2, "0"),
          tooltipLabel: `${String(hour).padStart(2, "0")}:00`,
          idleSeconds: Number(idleItem?.total_idle_seconds || 0),
          activeSeconds: Number(activeItem?.total_active_seconds || 0),
        };
      })
    : Array.from(
        new Set([
          ...daily.slice(-14).map((item) => item.idle_date),
          ...activeDaily.slice(-14).map((item) => item.active_date),
        ]),
      )
        .sort()
        .slice(-14)
        .map((dateKey) => {
          const idleItem = daily.find((entry) => entry.idle_date === dateKey);
          const activeItem = activeDaily.find((entry) => entry.active_date === dateKey);
          return {
            label: formatShortDate(dateKey),
            tooltipLabel: formatShortDate(dateKey),
            idleSeconds: Number(idleItem?.total_idle_seconds || 0),
            activeSeconds: Number(activeItem?.total_active_seconds || 0),
          };
        });
  const valueForMode = (item) => {
    if (mode === "active") return item.activeSeconds;
    if (mode === "stacked") return item.activeSeconds + item.idleSeconds;
    return item.idleSeconds;
  };
  const hasData = chartData.some((item) => valueForMode(item) > 0);
  const maxSeconds = Math.max(Number(yAxisMaxSeconds || 0), ...chartData.map(valueForMode), 1);
  const tickValues = [maxSeconds, maxSeconds * 0.75, maxSeconds * 0.5, maxSeconds * 0.25, 0];

  if (!chartData.length || !hasData) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No idle gaps found for this range.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>Idle time</span>
        <span>{showHourly ? "Hour of day" : "Date"}</span>
      </div>
      <div className="grid h-72 grid-cols-[52px_1fr] gap-3">
        <div className="flex h-56 flex-col justify-between border-r border-slate-200 pr-2 text-right text-xs text-slate-500">
          {tickValues.map((tick) => (
            <span key={tick}>{formatAxisDuration(tick)}</span>
          ))}
        </div>
        <div className="relative h-64">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56">
            {[0, 25, 50, 75, 100].map((top) => (
              <div
                key={top}
                className="absolute w-full border-t border-slate-200"
                style={{ top: `${top}%` }}
              />
            ))}
          </div>
          <div className="relative flex h-64 items-start gap-2">
            {chartData.map((item, index) => {
              const idleSeconds = Number(item.idleSeconds || 0);
              const activeSeconds = Number(item.activeSeconds || 0);
              const displaySeconds = valueForMode(item);
              const idleHeight = mode !== "active" && idleSeconds > 0 ? (idleSeconds / maxSeconds) * 100 : 0;
              const activeHeight = mode !== "idle" && activeSeconds > 0 ? (activeSeconds / maxSeconds) * 100 : 0;
              const singleHeight = displaySeconds > 0 ? Math.max((displaySeconds / maxSeconds) * 100, 4) : 0;
              const showLabel = !showHourly || index % 3 === 0;
              return (
                <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-56 w-full items-end border-b border-slate-300">
                    {mode === "stacked" ? (
                      <div
                        className="flex w-full flex-col-reverse overflow-hidden rounded-t-md"
                        style={{ height: `${Math.max(activeHeight + idleHeight, displaySeconds > 0 ? 4 : 0)}%` }}
                        title={`${item.tooltipLabel}: active ${formatHoursMinutes(activeSeconds)}, idle ${formatHoursMinutes(idleSeconds)}`}
                      >
                        <div className="bg-cyan-700" style={{ height: `${displaySeconds ? (idleSeconds / displaySeconds) * 100 : 0}%` }} />
                        <div className="bg-emerald-600" style={{ height: `${displaySeconds ? (activeSeconds / displaySeconds) * 100 : 0}%` }} />
                      </div>
                    ) : (
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          mode === "active" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-cyan-700 hover:bg-cyan-600"
                        }`}
                        style={{ height: `${singleHeight}%` }}
                        title={`${item.tooltipLabel}: ${formatHoursMinutes(displaySeconds)}`}
                      />
                    )}
                  </div>
                  <div className="h-6 w-full text-center text-[11px] leading-4 text-slate-500">
                    {showLabel ? item.label : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BucketBreakdown({ buckets, totalIdleSeconds }) {
  const rows = buckets.map((bucket) => {
    const seconds = Number(bucket?.total_idle_seconds || 0);
    return {
      label: bucket.bucket,
      gapCount: Number(bucket?.gap_count || 0),
      seconds,
      percent: totalIdleSeconds ? (seconds / totalIdleSeconds) * 100 : 0,
    };
  });

  return (
    <div className="space-y-3">
      {rows.length ? (
        rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">{row.label}</span>
              <span className="text-slate-500">
                {row.gapCount} gaps - {formatHoursMinutes(row.seconds)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-cyan-700" style={{ width: `${Math.max(row.percent, 1)}%` }} />
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-500">No idle gaps found for this range.</p>
      )}
    </div>
  );
}

function DashboardPlaceholder({ total, metrics, filters, settings, onOpenLongestGaps }) {
  const [chartMode, setChartMode] = useState("idle");
  const rangeLabel =
    filters.startDate || filters.endDate
      ? `${filters.startDate || "Start"} to ${filters.endDate || "Today"}`
      : "All available dates";
  const totalCutPathLength = Number(metrics.totalCutPathLength || 0);
  const idle = metrics.idle || {
    totalIdleSeconds: 0,
    averageIdleSeconds: 0,
    longestIdleSeconds: 0,
    gapCount: 0,
    buckets: [],
    daily: [],
    hourly: [],
    byMachine: [],
    longestGaps: [],
  };
  const active = metrics.active || { daily: [], hourly: [] };
  const totalTime = Number(metrics.totalCuttingTimeSeconds || 0) + Number(idle.totalIdleSeconds || 0);
  const idlePercent = totalTime ? (Number(idle.totalIdleSeconds || 0) / totalTime) * 100 : 0;
  const showHourlyChart = Boolean(filters.startDate && filters.endDate && filters.startDate === filters.endDate);
  const activeMachines = Math.max(Number(metrics.activeMachines || 0), 1);
  const shiftCapacitySeconds =
    Number(settings.shiftLengthHours || 0) *
    3600 *
    Number(metrics.activeDays || 0) *
    activeMachines;
  const chartAxisMaxSeconds = showHourlyChart
    ? 3600 * activeMachines
    : Number(settings.shiftLengthHours || 0) * 3600 * activeMachines;
  const cuttingCapacityPercent = shiftCapacitySeconds
    ? (Number(metrics.totalCuttingTimeSeconds || 0) / shiftCapacitySeconds) * 100
    : 0;
  const productionWindowSeconds = Number(metrics.totalProductionWindowSeconds || 0);
  const cuttingWindowPercent = productionWindowSeconds
    ? (Number(metrics.totalCuttingTimeSeconds || 0) / productionWindowSeconds) * 100
    : 0;

  const tiles = [
    { label: "Records In View", value: total.toLocaleString("en-GB"), icon: Database, hint: rangeLabel },
    {
      label: "Total Cutting Time",
      value: formatHoursMinutes(metrics.totalCuttingTimeSeconds),
      icon: Gauge,
    },
    { label: "Total Idle Time", value: formatHoursMinutes(idle.totalIdleSeconds), icon: Clock3, hint: `${formatPercent(idlePercent)} of tracked time` },
    { label: "Total Cut Path", value: formatRoundedUpNumber(totalCutPathLength, " m"), icon: Layers3 },
  ];

  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => <MetricTile key={tile.label} {...tile} />)}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">
                  {showHourlyChart ? "Machine Time By Hour" : "Machine Time By Day"}
                </h2>
                <p className="text-sm text-slate-500">Active and idle time clipped to the configured shift window.</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <ChartModeToggle value={chartMode} onChange={setChartMode} />
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {showHourlyChart ? "24 hours shown" : `Last ${Math.min(idle.daily.length, 14)} days shown`}
                </span>
              </div>
            </div>
            <IdleBarChart
              daily={idle.daily}
              hourly={idle.hourly || []}
              activeDaily={active.daily || []}
              activeHourly={active.hourly || []}
              showHourly={showHourlyChart}
              yAxisMaxSeconds={chartAxisMaxSeconds}
              mode={chartMode}
            />
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-cyan-700" />
                Idle
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
                Active
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <UtilisationGauges
              shiftPercent={cuttingCapacityPercent}
              windowPercent={cuttingWindowPercent}
              shiftCapacitySeconds={shiftCapacitySeconds}
              productionWindowSeconds={productionWindowSeconds}
            />

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">Idle Gap Bands</h2>
                <span className="text-sm text-slate-500">{idle.gapCount} gaps</span>
              </div>
              <BucketBreakdown buckets={idle.buckets} totalIdleSeconds={Number(idle.totalIdleSeconds || 0)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile label="Average Idle Gap" value={formatHoursMinutes(idle.averageIdleSeconds)} icon={CalendarDays} />
              <MetricTile
                label="Longest Idle Gap"
                value={formatHoursMinutes(idle.longestIdleSeconds)}
                icon={Clock3}
                hint="Click for details"
                onClick={onOpenLongestGaps}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterBar({ filters, setFilters, csvUrl, exportDisabled }) {
  const inputClass =
    "block w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 shadow-sm focus:border-cyan-600 focus:ring-cyan-600";
  const actionClass =
    "inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-4";

  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_170px_170px_130px_auto_auto]">
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
          className={`${actionClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-200`}
          onClick={() => setFilters({ search: "", startDate: "", endDate: "", limit: "100" })}
        >
          <X className="mr-2 h-4 w-4" />
          Clear
        </button>
      </div>
      <div className="flex items-end">
        <a
          className={`${actionClass} ${
            exportDisabled
              ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
              : "border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-800 focus:ring-cyan-100"
          }`}
          href={exportDisabled ? undefined : csvUrl}
          aria-disabled={exportDisabled}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          CSV
        </a>
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

function LongestIdleGapsModal({ open, gaps, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-gaps-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="idle-gaps-title" className="text-xl font-semibold text-ink">
              Longest Idle Gaps
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Largest shift-window idle gaps, showing the job before and the job started after the gap.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-200"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {gaps.length ? (
            <div className="space-y-3">
              {gaps.map((gap) => (
                <div
                  key={`${gap.machine_name}-${gap.start_time}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous job</div>
                      <div className="truncate font-medium text-slate-700">{gap.previous_job || "Unknown"}</div>
                      <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Next job after idle
                      </div>
                      <div className="truncate font-semibold text-ink">{gap.job || "Untitled job"}</div>
                      <div className="mt-2 text-sm text-slate-500">{gap.machine_name}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        {formatDateTime(gap.previous_end_time)} to {formatDateTime(gap.start_time)}
                      </div>
                    </div>
                    <div className="whitespace-nowrap text-lg font-semibold text-cyan-800">
                      {formatHoursMinutes(gap.idle_seconds)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No long idle gaps for this range.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AppMenu({ open, onToggle, onOpenSettings }) {
  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/20"
        onClick={onToggle}
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-40 w-48 rounded-lg border border-slate-200 bg-white py-2 text-slate-700 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50"
            onClick={onOpenSettings}
          >
            <Settings className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Settings
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsModal({ open, settings, onChange, onClose }) {
  if (!open) return null;

  const fieldClass =
    "block w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 shadow-sm focus:border-cyan-600 focus:ring-cyan-600";

  function updateSetting(key, value) {
    onChange((current) => ({ ...current, [key]: value }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="settings-title" className="text-xl font-semibold text-ink">
              Settings
            </h2>
            <p className="mt-1 text-sm text-slate-500">Configure operational assumptions used by dashboard metrics.</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-200"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="shiftStartTime">Shift start time</Label>
            <input
              id="shiftStartTime"
              className={fieldClass}
              type="time"
              value={settings.shiftStartTime}
              onChange={(event) => updateSetting("shiftStartTime", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="shiftLengthHours">Shift length, hours</Label>
            <input
              id="shiftLengthHours"
              className={fieldClass}
              min="0"
              step="0.25"
              type="number"
              value={settings.shiftLengthHours}
              onChange={(event) => updateSetting("shiftLengthHours", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="setupAllowanceMinutes">Setup allowance, minutes</Label>
            <input
              id="setupAllowanceMinutes"
              className={fieldClass}
              min="0"
              step="1"
              type="number"
              value={settings.setupAllowanceMinutes}
              onChange={(event) => updateSetting("setupAllowanceMinutes", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="shortIdleThresholdMinutes">Short idle threshold, minutes</Label>
            <input
              id="shortIdleThresholdMinutes"
              className={fieldClass}
              min="1"
              step="1"
              type="number"
              value={settings.shortIdleThresholdMinutes}
              onChange={(event) => updateSetting("shortIdleThresholdMinutes", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="longIdleThresholdMinutes">Long idle threshold, minutes</Label>
            <input
              id="longIdleThresholdMinutes"
              className={fieldClass}
              min="1"
              step="1"
              type="number"
              value={settings.longIdleThresholdMinutes}
              onChange={(event) => updateSetting("longIdleThresholdMinutes", event.target.value)}
            />
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
          Setup allowance is subtracted from each idle gap before dashboard totals and bands are calculated.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [filters, setFilters] = useState({ search: "", startDate: "", endDate: "", limit: "100" });
  const [settings, setSettings] = useState(loadSettings);
  const debouncedSearch = useDebouncedValue(filters.search);
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState({
    totalCuttingTimeSeconds: 0,
    totalCutPathLength: 0,
    totalProductionWindowSeconds: 0,
    activeDays: 0,
    activeMachines: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [longestIdleGapsOpen, setLongestIdleGapsOpen] = useState(false);

  const requestFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
      shiftStartTime: settings.shiftStartTime,
      shiftLengthHours: settings.shiftLengthHours,
      setupAllowanceMinutes: settings.setupAllowanceMinutes,
      shortIdleThresholdMinutes: settings.shortIdleThresholdMinutes,
      longIdleThresholdMinutes: settings.longIdleThresholdMinutes,
      offset: 0,
    }),
    [
      filters,
      debouncedSearch,
      settings.shiftStartTime,
      settings.shiftLengthHours,
      settings.setupAllowanceMinutes,
      settings.shortIdleThresholdMinutes,
      settings.longIdleThresholdMinutes,
    ],
  );
  const csvUrl = useMemo(() => getJobsCsvUrl(requestFilters), [requestFilters]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchJobs(requestFilters)
      .then((payload) => {
        if (cancelled) return;
        setJobs(payload.rows);
        setTotal(payload.total);
        setMetrics(payload.metrics || {
          totalCuttingTimeSeconds: 0,
          totalCutPathLength: 0,
          totalProductionWindowSeconds: 0,
          activeDays: 0,
          activeMachines: 0,
        });
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError.message);
        setJobs([]);
        setTotal(0);
        setMetrics({
          totalCuttingTimeSeconds: 0,
          totalCutPathLength: 0,
          totalProductionWindowSeconds: 0,
          activeDays: 0,
          activeMachines: 0,
        });
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
          <AppMenu
            open={menuOpen}
            onToggle={() => setMenuOpen((current) => !current)}
            onOpenSettings={() => {
              setMenuOpen(false);
              setSettingsOpen(true);
            }}
          />
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-slate-500">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
        </div>
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          csvUrl={csvUrl}
          exportDisabled={loading || total === 0}
        />
      </section>

      <DashboardPlaceholder
        total={total}
        metrics={metrics}
        filters={filters}
        settings={settings}
        onOpenLongestGaps={() => setLongestIdleGapsOpen(true)}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
      <LongestIdleGapsModal
        open={longestIdleGapsOpen}
        gaps={metrics.idle?.longestGaps || []}
        onClose={() => setLongestIdleGapsOpen(false)}
      />
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
