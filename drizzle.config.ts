import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const rawUrl = process.env.DATABASE_URL;
const needsSsl = rawUrl.startsWith("postgres:") || rawUrl.startsWith("postgresql:");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: needsSsl ? rawUrl.replace(/&?sslmode=\w+/, "") : rawUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  },
});
