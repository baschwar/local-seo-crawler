import { createFixtureSite } from "./index.js";

const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const site = await createFixtureSite(port);
console.log(`SEO auditor fixture listening at ${site.origin}`);

const shutdown = async () => {
  await site.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
