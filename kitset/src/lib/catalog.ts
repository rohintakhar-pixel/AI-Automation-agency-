import fs from "node:fs";
import path from "node:path";

/**
 * Reads the catalog folder at the project root.
 *
 * One subfolder per bot. Each subfolder needs a bot.json and a manual.md.
 * A missing or empty required field stops the build with a plain error that
 * names the file and the field, so the person who broke it knows what to fix.
 */

export type Download = {
  file: string;
  label: string;
};

export type Bot = {
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  whoItIsFor: string;
  requirements: string[];
  buyerMonthlyRunningCost: string;
  setupTime: string;
  price: number;
  currency: string;
  stripePriceIdEnv: string;
  version: string;
  lastUpdated: string;
  published: boolean;
  downloads: Download[];
};

const CATALOG_DIR = path.join(process.cwd(), "catalog");

/** Fields that must be present and non-empty on every bot. */
const REQUIRED_STRING_FIELDS = [
  "name",
  "slug",
  "shortDescription",
  "longDescription",
  "category",
  "whoItIsFor",
  "buyerMonthlyRunningCost",
  "setupTime",
  "currency",
  "stripePriceIdEnv",
  "version",
  "lastUpdated",
] as const;

class CatalogError extends Error {
  constructor(message: string) {
    super(`Catalog problem: ${message}`);
    this.name = "CatalogError";
  }
}

function readBotFolder(folder: string): Bot {
  const jsonPath = path.join(CATALOG_DIR, folder, "bot.json");
  const where = `catalog/${folder}/bot.json`;

  if (!fs.existsSync(jsonPath)) {
    throw new CatalogError(
      `the folder catalog/${folder} has no bot.json. Every bot folder needs one.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (error) {
    throw new CatalogError(
      `${where} is not valid JSON. ${(error as Error).message}`,
    );
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CatalogError(`${where} must contain a single JSON object.`);
  }

  const bot = raw as Record<string, unknown>;

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = bot[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new CatalogError(
        `${where} is missing the required field "${field}", or it is empty. ` +
          `Every bot needs a non-empty "${field}".`,
      );
    }
  }

  if (bot.slug !== folder) {
    throw new CatalogError(
      `${where} has slug "${String(bot.slug)}" but sits in the folder ` +
        `catalog/${folder}. The slug and the folder name must be the same.`,
    );
  }

  if (typeof bot.price !== "number" || !Number.isFinite(bot.price) || bot.price <= 0) {
    throw new CatalogError(
      `${where} is missing the required field "price", or it is not a number ` +
        `above zero. Write it as a plain number, for example 59.`,
    );
  }

  if (typeof bot.published !== "boolean") {
    throw new CatalogError(
      `${where} is missing the required field "published". Write it as ` +
        `true or false, with no quotation marks.`,
    );
  }

  if (
    !Array.isArray(bot.requirements) ||
    bot.requirements.length === 0 ||
    bot.requirements.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new CatalogError(
      `${where} is missing the required field "requirements", or it is empty. ` +
        `It must be a list of one or more sentences, each saying one thing the ` +
        `buyer has to have.`,
    );
  }

  if (
    !Array.isArray(bot.downloads) ||
    bot.downloads.length === 0 ||
    bot.downloads.some(
      (item) =>
        typeof item !== "object" ||
        item === null ||
        typeof (item as Download).file !== "string" ||
        (item as Download).file.trim() === "" ||
        typeof (item as Download).label !== "string" ||
        (item as Download).label.trim() === "",
    )
  ) {
    throw new CatalogError(
      `${where} is missing the required field "downloads", or an entry is ` +
        `missing its "file" or "label". The buyer paid for these files, so ` +
        `there has to be at least one.`,
    );
  }

  const manualPath = path.join(CATALOG_DIR, folder, "manual.md");
  if (!fs.existsSync(manualPath)) {
    throw new CatalogError(
      `catalog/${folder}/manual.md does not exist. Every bot needs a setup ` +
        `manual, because the buyer is sold the manual as well as the files.`,
    );
  }

  for (const download of bot.downloads as Download[]) {
    const filePath = path.join(CATALOG_DIR, folder, "downloads", download.file);
    if (!fs.existsSync(filePath)) {
      throw new CatalogError(
        `${where} lists the download "${download.file}", but ` +
          `catalog/${folder}/downloads/${download.file} does not exist. ` +
          `A buyer would pay and get nothing.`,
      );
    }
  }

  return bot as unknown as Bot;
}

/**
 * Every bot the site should show.
 *
 * Unpublished bots are dropped in a production build. In development they are
 * kept, so a bot can be worked on and previewed before it goes on sale.
 */
export function getBots(): Bot[] {
  if (!fs.existsSync(CATALOG_DIR)) {
    throw new CatalogError(
      `there is no catalog folder at the top of the project. The site reads ` +
        `its bots from there.`,
    );
  }

  const folders = fs
    .readdirSync(CATALOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const bots = folders.map(readBotFolder);

  const slugs = new Set<string>();
  for (const bot of bots) {
    if (slugs.has(bot.slug)) {
      throw new CatalogError(`two bots share the slug "${bot.slug}".`);
    }
    slugs.add(bot.slug);
  }

  if (process.env.NODE_ENV === "production") {
    return bots.filter((bot) => bot.published);
  }
  return bots;
}

export function getBot(slug: string): Bot | undefined {
  return getBots().find((bot) => bot.slug === slug);
}

export function getManual(slug: string): string {
  return fs.readFileSync(path.join(CATALOG_DIR, slug, "manual.md"), "utf8");
}

export function getDownloadPath(slug: string, file: string): string | null {
  // Only files the bot.json actually lists can be served. This stops a
  // crafted file name from reaching anything else on the disk.
  const bot = getBot(slug);
  if (!bot) return null;
  if (!bot.downloads.some((download) => download.file === file)) return null;
  return path.join(CATALOG_DIR, slug, "downloads", file);
}

/** "$59 USD, one time" — the only place price copy is written. */
export function formatPrice(bot: Bot): string {
  const amount = Number.isInteger(bot.price) ? bot.price : bot.price.toFixed(2);
  const symbol = bot.currency === "USD" ? "$" : "";
  return `${symbol}${amount} ${bot.currency}`;
}
