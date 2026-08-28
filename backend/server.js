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
         COALESCE(SUM(cut_path_length), 0) AS total_cut_path_length
       FROM optiscout_jobs
       ${clause}`,
      params,
    );

    res.json({
      rows,
      total: summaryRow.total,
      metrics: {
        totalCuttingTimeSeconds: Number(summaryRow.total_cutting_time_seconds),
        totalCutPathLength: Number(summaryRow.total_cut_path_length),
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
