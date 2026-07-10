import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs its config under Node and doesn't inherit bun's auto-loaded
// .env.local, so load it explicitly here.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: fail loudly if unset
    url: process.env.DATABASE_URL!,
  },
});
