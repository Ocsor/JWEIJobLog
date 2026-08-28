# JWEI Job Log

A React + Tailwind + Flowbite web GUI for viewing OptiScout job records from a MySQL database.

The app has two parts:

- React frontend served by Vite
- Express API that connects to MySQL and reads from `optiscout_jobs`

## Prerequisites

Install these before the first run:

- Node.js 20 or newer
- npm
- MySQL Server
- A MySQL database containing the `optiscout_jobs` table

You can confirm Node and npm are available with:

```powershell
node --version
npm.cmd --version
```

On this Windows machine, use `npm.cmd` instead of `npm` if PowerShell blocks `npm.ps1`.

## First-Time Setup

### 1. Open the project folder

```powershell
cd C:\Projects\JWEIJobLog
```

### 2. Create the MySQL database

Log in to MySQL and create a database for the app:

```sql
CREATE DATABASE jwei_job_log CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Then import the schema from:

```text
Sample Files\schema.sql
```

Example from PowerShell:

```powershell
mysql -u root -p jwei_job_log < "Sample Files\schema.sql"
```

### 3. Create the local environment file

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set your MySQL connection details:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password_here
MYSQL_DATABASE=jwei_job_log
PORT=3001
```

### 4. Install dependencies

```powershell
npm.cmd install
```

This creates the local `node_modules` environment for the app.

## Running The App

Start both the backend API and frontend dev server:

```powershell
npm.cmd run dev
```

The backend API runs on:

```text
http://localhost:3001
```

The frontend usually runs on:

```text
http://localhost:5173
```

If port `5173` is already in use, Vite will automatically choose the next available port and print it in the terminal.

## Health Check

To check whether the API can connect to MySQL:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

A successful response looks like:

```json
{
  "ok": true
}
```

If you see an access denied message, update the MySQL values in `.env`.

## Build For Production

```powershell
npm.cmd run build
```

The production frontend files are written to:

```text
dist
```

## Current Features

- Searchable job table
- Date range filters
- Core job fields visible in the table
- Clickable rows with full record details in a modal
- Reserved dashboard area above the table for future charts and metrics
