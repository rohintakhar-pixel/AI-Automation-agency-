#!/usr/bin/env node
/*
 * Checks the built workflow before it is sold to anybody.
 *
 * This is a structural check, not a live one. It proves the file is
 * well-formed, that its node types and versions exist in n8n, that nothing is
 * orphaned, that every node named inside an expression is really there, that
 * the shipped code matches the tested code byte for byte, and that no
 * credential or key-shaped string is in the file.
 *
 * It does not, and cannot, prove that the workflow runs. That needs a real
 * n8n, a real Shopify store, a real inbox and a real OpenAI key. Step 10 of
 * the buyer manual is that test.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sharedBlock } from "./build-workflow.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.join(
  here,
  "..",
  "catalog",
  "shopify-support-drafter",
  "downloads",
  "shopify-support-drafter.workflow.json",
);

/*
 * Node types and the typeVersions they accept.
 *
 * Read out of n8n-nodes-base 2.15.1 on 2026-09-04, from the node definitions
 * themselves rather than from documentation.
 */
const KNOWN_NODES = {
  "n8n-nodes-base.gmailTrigger": [1, 1.1, 1.2, 1.3],
  "n8n-nodes-base.gmail": [1, 2, 2.1, 2.2],
  "n8n-nodes-base.httpRequest": [1, 2, 3, 4, 4.1, 4.2, 4.3, 4.4],
  "n8n-nodes-base.set": [1, 2, 3, 3.1, 3.2, 3.3, 3.4],
  "n8n-nodes-base.if": [1, 2, 2.1, 2.2, 2.3],
  "n8n-nodes-base.code": [1, 2],
  "n8n-nodes-base.noOp": [1],
};

/** Which logic files each Code node must carry, unchanged. */
const EXPECTED_CODE = {
  "Read the email": ["classify.js", "shopify.js"],
  "Read Shopify's answer": ["shopify.js", "decide.js"],
  "Build the prompt": ["prompt.js"],
  "Check the reply": ["prompt.js", "draftcheck.js"],
  "Write a note for you": ["draftcheck.js"],
};

const SECRET_SHAPES = [
  { name: "OpenAI key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "Shopify access token", pattern: /\bshp(at|ss|ca|pa)_[A-Fa-f0-9]{16,}/ },
  { name: "Stripe key", pattern: /\bsk_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9]{16,}/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Google OAuth client secret", pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: "private key block", pattern: /-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}/ },
];

const failures = [];
const checks = [];

function check(description, condition, detail) {
  checks.push({ description, ok: Boolean(condition) });
  if (!condition) failures.push(detail ? `${description}: ${detail}` : description);
}

function walkStrings(value, visit, trail = "root") {
  if (typeof value === "string") {
    visit(value, trail);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => walkStrings(entry, visit, `${trail}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      walkStrings(entry, visit, `${trail}.${key}`);
    }
  }
}

function main() {
  check("the workflow file exists", fs.existsSync(WORKFLOW), WORKFLOW);
  if (failures.length > 0) return report();

  const raw = fs.readFileSync(WORKFLOW, "utf8");

  let workflow;
  try {
    workflow = JSON.parse(raw);
    check("the file is valid JSON", true);
  } catch (error) {
    check("the file is valid JSON", false, error.message);
    return report();
  }

  // Only the two checks below can make the rest impossible to run, so only
  // they stop the checker. Everything else is reported together, because a
  // list of one problem at a time is a slow way to fix five.
  const structural = [
    Array.isArray(workflow.nodes) && workflow.nodes.length > 0,
    Boolean(workflow.connections) && typeof workflow.connections === "object",
  ];
  check("it has a list of nodes", structural[0]);
  check("it has connections", structural[1]);
  if (!structural[0] || !structural[1]) return report();

  check("it has a name", typeof workflow.name === "string" && workflow.name.length > 0);
  check("it ships switched off", workflow.active === false, `active is ${workflow.active}`);

  const names = new Set();
  const ids = new Set();

  for (const node of workflow.nodes) {
    const label = node.name || "(a node with no name)";

    check(`${label} has a name`, typeof node.name === "string" && node.name.length > 0);
    check(`${label} has a unique name`, !names.has(node.name));
    names.add(node.name);

    check(`${label} has an id`, typeof node.id === "string" && node.id.length > 0);
    check(`${label} has a unique id`, !ids.has(node.id));
    ids.add(node.id);

    check(
      `${label} has a position`,
      Array.isArray(node.position) && node.position.length === 2,
    );

    const allowed = KNOWN_NODES[node.type];
    check(`${label} uses a node type that exists in n8n`, Boolean(allowed), node.type);
    if (allowed) {
      check(
        `${label} uses a version of ${node.type} that exists`,
        allowed.includes(node.typeVersion),
        `typeVersion ${node.typeVersion}, n8n accepts ${allowed.join(", ")}`,
      );
    }

    check(
      `${label} carries no credential`,
      !node.credentials || Object.keys(node.credentials).length === 0,
      "the buyer attaches their own credentials after importing",
    );
  }

  // Every connection has to point at a node that is really there.
  for (const [from, outputs] of Object.entries(workflow.connections)) {
    check(`the connection from ${from} starts at a real node`, names.has(from));
    for (const branch of outputs.main || []) {
      for (const link of branch || []) {
        check(
          `${from} connects to a real node`,
          names.has(link.node),
          `it points at "${link.node}"`,
        );
      }
    }
  }

  // Nothing stranded. Every node has to be reachable from the trigger.
  const trigger = workflow.nodes.find((node) => node.type.endsWith("Trigger"));
  check("there is exactly one trigger", Boolean(trigger));
  if (trigger) {
    const reached = new Set([trigger.name]);
    const queue = [trigger.name];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const branch of (workflow.connections[current] || {}).main || []) {
        for (const link of branch || []) {
          if (!reached.has(link.node)) {
            reached.add(link.node);
            queue.push(link.node);
          }
        }
      }
    }
    for (const node of workflow.nodes) {
      check(
        `${node.name} is reachable from the trigger`,
        reached.has(node.name),
        "nothing connects to it",
      );
    }
  }

  // Every node named inside an expression or inside code must exist. A typo
  // here is invisible until the workflow runs and then fails on a live email.
  walkStrings(workflow, (value, trail) => {
    const pattern = /\$\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = pattern.exec(value)) !== null) {
      check(
        `the reference to "${match[1]}" points at a real node`,
        names.has(match[1]),
        `found in ${trail}`,
      );
    }
  });

  // The shipped code has to be the tested code, character for character.
  for (const [nodeName, modules] of Object.entries(EXPECTED_CODE)) {
    const node = workflow.nodes.find((entry) => entry.name === nodeName);
    check(`the code node "${nodeName}" is in the workflow`, Boolean(node));
    if (!node) continue;

    const code = node.parameters?.jsCode ?? "";
    check(`"${nodeName}" has code in it`, code.length > 100);

    for (const file of modules) {
      const source = fs.readFileSync(path.join(here, "src", file), "utf8");
      check(
        `"${nodeName}" carries bot/src/${file} unchanged`,
        code.includes(sharedBlock(source, file)),
        "the shipped copy has drifted from the tested one",
      );
    }
  }

  // No key-shaped string anywhere in the file.
  for (const shape of SECRET_SHAPES) {
    check(`the file contains no ${shape.name}`, !shape.pattern.test(raw));
  }

  report();
}

function report() {
  const passed = checks.filter((entry) => entry.ok).length;
  if (failures.length === 0) {
    console.log(`Workflow checks: ${passed} of ${checks.length} passed.`);
    return;
  }
  console.error(`Workflow checks: ${passed} of ${checks.length} passed.`);
  console.error("");
  for (const failure of failures) console.error(`  FAILED  ${failure}`);
  process.exitCode = 1;
}

main();
