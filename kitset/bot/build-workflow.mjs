#!/usr/bin/env node
/*
 * Builds the n8n workflow that buyers download.
 *
 * The bot's thinking lives in bot/src/*.js, where it can be read and tested
 * like ordinary code. This script pastes those files, byte for byte, into the
 * Code nodes of the workflow, and adds a short adapter at the end of each one
 * to move data in and out of n8n's shapes.
 *
 * The point is that the code that is tested is the code that ships. There is
 * no second copy to drift.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, "..");
const OUTPUT = path.join(
  projectRoot,
  "catalog",
  "shopify-support-drafter",
  "downloads",
  "shopify-support-drafter.workflow.json",
);

const BEGIN = "// ==== BEGIN SHARED ====";
const END = "// ==== END SHARED ====";

/** Which logic files and which adapter go into each Code node. */
const CODE_NODES = {
  "Read the email": {
    modules: ["classify.js", "shopify.js"],
    adapter: "read-email.js",
  },
  "Read Shopify's answer": {
    modules: ["shopify.js", "decide.js", "pairing.js"],
    adapter: "read-shopify.js",
  },
  "Build the prompt": {
    modules: ["prompt.js"],
    adapter: "build-prompt.js",
  },
  "Check the reply": {
    modules: ["prompt.js", "draftcheck.js", "pairing.js"],
    adapter: "check-reply.js",
  },
  "Write a note for you": {
    modules: ["draftcheck.js"],
    adapter: "write-note.js",
  },
};

/** The part of a logic file between the two markers, with nothing added. */
export function sharedBlock(source, file) {
  const start = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `bot/src/${file} has no shared block. It needs the lines "${BEGIN}" ` +
        `and "${END}" around the code that goes into the workflow.`,
    );
  }
  return source.slice(start + BEGIN.length, end).trim();
}

function build() {
  const template = JSON.parse(
    fs.readFileSync(path.join(here, "workflow.template.json"), "utf8"),
  );

  const byName = new Map(template.nodes.map((node) => [node.name, node]));

  for (const [nodeName, spec] of Object.entries(CODE_NODES)) {
    const node = byName.get(nodeName);
    if (!node) {
      throw new Error(
        `The template has no node called "${nodeName}". Either add it or ` +
          `remove it from CODE_NODES in bot/build-workflow.mjs.`,
      );
    }

    const parts = [
      "/*",
      " * Kitset — Shopify support drafter.",
      " *",
      " * Everything down to the adapter at the bottom is copied straight from",
      ` * the project's ${spec.modules.join(" and ")} and is covered by its tests.`,
      " * Editing it here means the tests no longer describe what runs.",
      " */",
      "",
    ];

    for (const file of spec.modules) {
      const source = fs.readFileSync(path.join(here, "src", file), "utf8");
      parts.push(sharedBlock(source, file), "");
    }

    parts.push(
      fs.readFileSync(path.join(here, "adapters", spec.adapter), "utf8").trim(),
      "",
    );

    node.parameters.jsCode = parts.join("\n");
  }

  // Belt and braces: the workflow that ships is never active and never
  // carries a credential.
  template.active = false;
  for (const node of template.nodes) {
    if (node.credentials) delete node.credentials;
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(template, null, 2)}\n`, "utf8");

  const size = fs.statSync(OUTPUT).size;
  console.log(
    `Built ${path.relative(projectRoot, OUTPUT)}: ${template.nodes.length} nodes, ` +
      `${(size / 1024).toFixed(1)} KB.`,
  );
}

// Only build when this file is run directly. The checker imports it for
// sharedBlock and must not rebuild the file it is about to inspect.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build();
}
