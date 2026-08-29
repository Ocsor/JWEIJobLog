import "dotenv/config";
import express from "express";
import { pool } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json());

const searchableColumns = [
  "job",
  "state",
  "machine_name",
  "material_name",
  "source_database",
  "source_pc",
  "process_id",
  "source_jobinfo_id",
];

const allColumns = [
  "id",
  "source_jobinfo_id",
  "process_id",
  "job",
  "state",
  "start_time",
  "end_time",
  "cutting_time_seconds",
  "machine_name",
  "material_name",
  "material_thickness",
  "material_width",
  "material_length",
  "material_consumption",
  "cut_path_length",
  "movement_length",
  "act_segment",
  "total_segments",
  "act_copy",
  "total_copies",
  "source_is_last",
  "source_database",
  "source_pc",
  "imported_at",
  "updated_at",
];

function buildFilters(query) {
  const where = [];
  const params = {};

  if (query.search?.trim()) {
    params.search = `%${query.search.trim()}%`;
    where.push(
      `(${searchableColumns
        .map((column) => `CAST(${column} AS CHAR) LIKE :search`)
        .join(" OR ")})`,
    );
  }

  if (query.startDate) {
    params.startDate = `${query.startDate} 00:00:00`;
    where.push("start_time >= :startDate");
  }

  if (query.endDate) {
    params.endDate = `${query.endDate} 23:59:59`;
    where.push("start_time <= :endDate");
  }

  return {
    clause: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

function parseLimit(value) {
  const limit = Number(value || 100);
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 25), 500) : 100;
}

function parseNonNegativeNumber(value, fallback = 0) {
  const number = Number(value || fallback);
  return Number.isFinite(number) ? Math.max(number, 0) : fallback;
}

function parseShiftStartMinutes(value) {
  const [hours = "8", minutes = "0"] = String(value || "08:00").split(":");
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) return 8 * 60;
  return Math.min(Math.max(parsedHours, 0), 23) * 60 + Math.min(Math.max(parsedMinutes, 0), 59);
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addSeconds(map, key, seconds) {
  map.set(key, (map.get(key) || 0) + seconds);
}

function addGapOverlapToBuckets({ gapStart, gapEnd, idleSeconds, settings, daily, hourly }) {
  if (idleSeconds <= 0 || gapEnd <= gapStart) return;

  let dayCursor = startOfLocalDay(gapStart);
  const finalDay = startOfLocalDay(gapEnd);

  while (dayCursor <= finalDay) {
    const shiftStart = new Date(dayCursor.getTime() + settings.shiftStartMinutes * 60 * 1000);
    const shiftEnd = new Date(shiftStart.getTime() + settings.shiftLengthSeconds * 1000);
    const overlapStart = new Date(Math.max(gapStart.getTime(), shiftStart.getTime()));
    const overlapEnd = new Date(Math.min(gapEnd.getTime(), shiftEnd.getTime()));

    if (overlapEnd > overlapStart) {
      const overlapSeconds = (overlapEnd.getTime() - overlapStart.getTime()) / 1000;
      const dateKey = `${overlapStart.getFullYear()}-${String(overlapStart.getMonth() + 1).padStart(2, "0")}-${String(
        overlapStart.getDate(),
      ).padStart(2, "0")}`;
      addSeconds(daily, dateKey, overlapSeconds);

      let hourCursor = new Date(overlapStart);
      hourCursor.setMinutes(0, 0, 0);
      if (hourCursor < overlapStart) hourCursor = new Date(hourCursor.getTime() + 60 * 60 * 1000);

      let segmentStart = overlapStart;
      while (segmentStart < overlapEnd) {
        const segmentEnd = new Date(Math.min(hourCursor.getTime(), overlapEnd.getTime()));
        const segmentSeconds = (segmentEnd.getTime() - segmentStart.getTime()) / 1000;
        addSeconds(hourly, segmentStart.getHours(), segmentSeconds);
        segmentStart = segmentEnd;
        hourCursor = new Date(hourCursor.getTime() + 60 * 60 * 1000);
      }
    }

    dayCursor = new Date(dayCursor.getFullYear(), dayCursor.getMonth(), dayCursor.getDate() + 1);
  }
}

function calculateIdleMetrics(gaps, settings) {
  const bucketMap = new Map();
  const dailyMap = new Map();
  const hourlyMap = new Map();
  const machineMap = new Map();
  const measuredGaps = [];

  gaps.forEach((gap) => {
    const gapStart = new Date(gap.previous_end_time);
    const gapEnd = new Date(gap.start_time);
    if (Number.isNaN(gapStart.getTime()) || Number.isNaN(gapEnd.getTime()) || gapEnd <= gapStart) return;

    const shiftDailyMap = new Map();
    const shiftHourlyMap = new Map();
    addGapOverlapToBuckets({
      gapStart,
      gapEnd,
      idleSeconds: (gapEnd.getTime() - gapStart.getTime()) / 1000,
      settings,
      daily: shiftDailyMap,
      hourly: shiftHourlyMap,
    });

    const shiftRawSeconds = Array.from(shiftDailyMap.values()).reduce((sum, seconds) => sum + seconds, 0);
    const shiftIdleSeconds = Math.max(shiftRawSeconds - settings.setupAllowanceSeconds, 0);
    if (shiftIdleSeconds <= 0) return;
    const setupScale = shiftRawSeconds > 0 ? shiftIdleSeconds / shiftRawSeconds : 0;

    const bucket =
      shiftIdleSeconds < settings.shortIdleThresholdSeconds
        ? `Under ${settings.shortIdleThresholdMinutes} mins`
        : shiftIdleSeconds < settings.longIdleThresholdSeconds
          ? `${settings.shortIdleThresholdMinutes}-${settings.longIdleThresholdMinutes} mins`
          : `Over ${settings.longIdleThresholdMinutes} mins`;

    const bucketValue = bucketMap.get(bucket) || { bucket, gap_count: 0, total_idle_seconds: 0 };
    bucketValue.gap_count += 1;
    bucketValue.total_idle_seconds += shiftIdleSeconds;
    bucketMap.set(bucket, bucketValue);

    shiftDailyMap.forEach((seconds, date) => addSeconds(dailyMap, date, seconds * setupScale));
    shiftHourlyMap.forEach((seconds, hour) => addSeconds(hourlyMap, hour, seconds * setupScale));

    const machineName = gap.machine_name || "Unassigned";
    const machineValue = machineMap.get(machineName) || {
      machine_name: machineName,
      gap_count: 0,
      total_idle_seconds: 0,
    };
    machineValue.gap_count += 1;
    machineValue.total_idle_seconds += shiftIdleSeconds;
    machineMap.set(machineName, machineValue);

    measuredGaps.push({
      machine_name: machineName,
      job: gap.job,
      start_time: gap.start_time,
      previous_end_time: gap.previous_end_time,
      idle_seconds: Math.round(shiftIdleSeconds),
    });
  });

  const totalIdleSeconds = measuredGaps.reduce((sum, gap) => sum + gap.idle_seconds, 0);
  const gapCount = measuredGaps.length;

  return {
    totalIdleSeconds,
    averageIdleSeconds: gapCount ? totalIdleSeconds / gapCount : 0,
    longestIdleSeconds: measuredGaps.reduce((max, gap) => Math.max(max, gap.idle_seconds), 0),
    gapCount,
    buckets: Array.from(bucketMap.values()).map((bucket) => ({
      ...bucket,
      total_idle_seconds: Math.round(bucket.total_idle_seconds),
    })),
    daily: Array.from(dailyMap.entries())
      .map(([idle_date, total_idle_seconds]) => ({ idle_date, total_idle_seconds: Math.round(total_idle_seconds) }))
      .sort((a, b) => a.idle_date.localeCompare(b.idle_date)),
    hourly: Array.from(hourlyMap.entries())
      .map(([idle_hour, total_idle_seconds]) => ({ idle_hour, total_idle_seconds: Math.round(total_idle_seconds) }))
      .sort((a, b) => a.idle_hour - b.idle_hour),
    byMachine: Array.from(machineMap.values())
      .map((machine) => ({ ...machine, total_idle_seconds: Math.round(machine.total_idle_seconds) }))
      .sort((a, b) => b.total_idle_seconds - a.total_idle_seconds)
      .slice(0, 5),
    longestGaps: measuredGaps.sort((a, b) => b.idle_seconds - a.idle_seconds).slice(0, 5),
  };
}

function calculateActiveSeries(records, settings) {
  const dailyMap = new Map();
  const hourlyMap = new Map();

  records.forEach((record) => {
    const activeSeconds = Number(record.cutting_time_seconds || 0);
    const startTime = new Date(record.start_time);

    if (!Number.isFinite(activeSeconds) || activeSeconds <= 0 || Number.isNaN(startTime.getTime())) return;

    addGapOverlapToBuckets({
      gapStart: startTime,
      gapEnd: new Date(startTime.getTime() + activeSeconds * 1000),
      idleSeconds: activeSeconds,
      settings,
      daily: dailyMap,
      hourly: hourlyMap,
    });
  });

  return {
    daily: Array.from(dailyMap.entries())
      .map(([active_date, total_active_seconds]) => ({
        active_date,
        total_active_seconds: Math.round(total_active_seconds),
      }))
      .sort((a, b) => a.active_date.localeCompare(b.active_date)),
    hourly: Array.from(hourlyMap.entries())
      .map(([active_hour, total_active_seconds]) => ({
        active_hour,
        total_active_seconds: Math.round(total_active_seconds),
      }))
      .sort((a, b) => a.active_hour - b.active_hour),
  };
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get("/api/jobs", async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const { clause, params } = buildFilters(req.query);
    const setupAllowanceSeconds = Math.round(
      parseNonNegativeNumber(req.query.setupAllowanceMinutes, 0) * 60,
    );
    const shortIdleThresholdMinutes = parseNonNegativeNumber(req.query.shortIdleThresholdMinutes, 10);
    const longIdleThresholdMinutes = parseNonNegativeNumber(req.query.longIdleThresholdMinutes, 60);
    const shiftLengthHours = parseNonNegativeNumber(req.query.shiftLengthHours, 8);
    const idleSettings = {
      setupAllowanceSeconds,
      shortIdleThresholdMinutes,
      longIdleThresholdMinutes,
      shortIdleThresholdSeconds: Math.round(shortIdleThresholdMinutes * 60),
      longIdleThresholdSeconds: Math.round(longIdleThresholdMinutes * 60),
      shiftLengthSeconds: Math.round(shiftLengthHours * 3600),
      shiftStartMinutes: parseShiftStartMinutes(req.query.shiftStartTime),
    };
    const idleBaseClause = `${clause ? `${clause} AND` : "WHERE"}
      start_time IS NOT NULL
      AND end_time IS NOT NULL`;

    const [rows] = await pool.execute(
      `SELECT ${allColumns.join(", ")}
       FROM optiscout_jobs
       ${clause}
       ORDER BY COALESCE(start_time, imported_at) DESC, id DESC
       LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset },
    );

    const [[summaryRow]] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(cutting_time_seconds), 0) AS total_cutting_time_seconds,
         COALESCE(SUM(cut_path_length), 0) AS total_cut_path_length,
         COUNT(DISTINCT DATE(start_time)) AS active_days,
         COUNT(DISTINCT COALESCE(NULLIF(machine_name, ''), source_pc)) AS active_machines
       FROM optiscout_jobs
       ${clause}`,
      params,
    );

    const [idleGapRows] = await pool.execute(
      `WITH filtered_jobs AS (
         SELECT
           id,
           job,
           COALESCE(NULLIF(machine_name, ''), source_pc, 'Unassigned') AS machine_name,
           start_time,
           end_time
         FROM optiscout_jobs
         ${idleBaseClause}
       ),
       sequenced_jobs AS (
         SELECT
           id,
           job,
           machine_name,
           start_time,
           end_time,
           LAG(end_time) OVER (
             PARTITION BY machine_name
             ORDER BY start_time, id
           ) AS previous_end_time
         FROM filtered_jobs
       )
       SELECT machine_name, job, start_time, previous_end_time
       FROM sequenced_jobs
       WHERE previous_end_time IS NOT NULL
         AND start_time > previous_end_time
       ORDER BY start_time ASC`,
      params,
    );

    const [activeRows] = await pool.execute(
      `SELECT start_time, cutting_time_seconds
       FROM optiscout_jobs
       ${idleBaseClause}
         AND cutting_time_seconds IS NOT NULL
         AND cutting_time_seconds > 0
       ORDER BY start_time ASC`,
      params,
    );

    const idleMetrics = calculateIdleMetrics(idleGapRows, idleSettings);
    const activeSeries = calculateActiveSeries(activeRows, idleSettings);

    res.json({
      rows,
      total: summaryRow.total,
      metrics: {
        totalCuttingTimeSeconds: Number(summaryRow.total_cutting_time_seconds),
        totalCutPathLength: Number(summaryRow.total_cut_path_length),
        activeDays: Number(summaryRow.active_days),
        activeMachines: Number(summaryRow.active_machines),
        active: activeSeries,
        idle: {
          ...idleMetrics,
          settings: {
            shiftStartTime: req.query.shiftStartTime || "08:00",
            shiftLengthHours,
            setupAllowanceMinutes: setupAllowanceSeconds / 60,
          },
        },
      },
      limit,
      offset,
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to load job records.", detail: error.message });
  }
});

app.listen(port, () => {
  console.log(`JWEI Job Log API listening on http://localhost:${port}`);
});
