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
    const shortIdleThresholdSeconds = Math.round(
      parseNonNegativeNumber(req.query.shortIdleThresholdMinutes, 10) * 60,
    );
    const longIdleThresholdSeconds = Math.round(
      parseNonNegativeNumber(req.query.longIdleThresholdMinutes, 60) * 60,
    );
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

    const idleCte = `
      WITH filtered_jobs AS (
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
      ),
      idle_gaps AS (
        SELECT
          id,
          job,
          machine_name,
          start_time,
          previous_end_time,
          GREATEST(TIMESTAMPDIFF(SECOND, previous_end_time, start_time) - :setupAllowanceSeconds, 0) AS idle_seconds
        FROM sequenced_jobs
        WHERE previous_end_time IS NOT NULL
          AND start_time > previous_end_time
      )`;

    const idleParams = {
      ...params,
      setupAllowanceSeconds,
      shortIdleThresholdSeconds,
      longIdleThresholdSeconds,
    };

    const [[idleSummaryRow], [idleBucketRows], [idleDailyRows], [idleMachineRows], [longestIdleRows]] =
      await Promise.all([
        pool.execute(
          `${idleCte}
           SELECT
             COUNT(*) AS gap_count,
             COALESCE(SUM(idle_seconds), 0) AS total_idle_seconds,
             COALESCE(AVG(NULLIF(idle_seconds, 0)), 0) AS average_idle_seconds,
             COALESCE(MAX(idle_seconds), 0) AS longest_idle_seconds
           FROM idle_gaps
           WHERE idle_seconds > 0`,
          idleParams,
        ),
        pool.execute(
          `${idleCte}
           SELECT bucket, COUNT(*) AS gap_count, SUM(idle_seconds) AS total_idle_seconds
           FROM (
             SELECT
               CASE
                 WHEN idle_seconds < :shortIdleThresholdSeconds THEN CONCAT('Under ', ROUND(:shortIdleThresholdSeconds / 60), ' mins')
                 WHEN idle_seconds < :longIdleThresholdSeconds THEN CONCAT(ROUND(:shortIdleThresholdSeconds / 60), '-', ROUND(:longIdleThresholdSeconds / 60), ' mins')
                 ELSE CONCAT('Over ', ROUND(:longIdleThresholdSeconds / 60), ' mins')
               END AS bucket,
               idle_seconds
             FROM idle_gaps
             WHERE idle_seconds > 0
           ) bucketed
           GROUP BY bucket`,
          idleParams,
        ),
        pool.execute(
          `${idleCte}
           SELECT DATE(start_time) AS idle_date, SUM(idle_seconds) AS total_idle_seconds
           FROM idle_gaps
           WHERE idle_seconds > 0
           GROUP BY DATE(start_time)
           ORDER BY idle_date ASC`,
          idleParams,
        ),
        pool.execute(
          `${idleCte}
           SELECT machine_name, COUNT(*) AS gap_count, SUM(idle_seconds) AS total_idle_seconds
           FROM idle_gaps
           WHERE idle_seconds > 0
           GROUP BY machine_name
           ORDER BY total_idle_seconds DESC
           LIMIT 5`,
          idleParams,
        ),
        pool.execute(
          `${idleCte}
           SELECT machine_name, job, start_time, previous_end_time, idle_seconds
           FROM idle_gaps
           WHERE idle_seconds > 0
           ORDER BY idle_seconds DESC
           LIMIT 5`,
          idleParams,
        ),
      ]);

    res.json({
      rows,
      total: summaryRow.total,
      metrics: {
        totalCuttingTimeSeconds: Number(summaryRow.total_cutting_time_seconds),
        totalCutPathLength: Number(summaryRow.total_cut_path_length),
        activeDays: Number(summaryRow.active_days),
        activeMachines: Number(summaryRow.active_machines),
        idle: {
          totalIdleSeconds: Number(idleSummaryRow[0]?.total_idle_seconds || 0),
          averageIdleSeconds: Number(idleSummaryRow[0]?.average_idle_seconds || 0),
          longestIdleSeconds: Number(idleSummaryRow[0]?.longest_idle_seconds || 0),
          gapCount: Number(idleSummaryRow[0]?.gap_count || 0),
          buckets: idleBucketRows,
          daily: idleDailyRows,
          byMachine: idleMachineRows,
          longestGaps: longestIdleRows,
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
