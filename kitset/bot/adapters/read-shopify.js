// ---- n8n wiring. The tested logic is above this line. ----
// Reads Shopify's answer and decides what happens next.
//
// The HTTP node replaces the item with the response, so the context is taken
// from the true branch of "Do we handle it?", which lines up one for one with
// what was sent.

const context = $('Do we handle it?').all(0);
const responses = $input.all();

const paired = pairByPosition(context, responses, 'Ask Shopify');
if (!paired.ok) throw new Error(paired.message);

const out = [];

for (let i = 0; i < responses.length; i++) {
  const j = context[i].json;
  const raw = responses[i].json;

  // With "Never Error" switched on, an HTTP failure arrives here as data
  // rather than stopping the run. That is on purpose: the owner gets told
  // what went wrong instead of the workflow dying quietly.
  const parsed = parseOrderResponse(raw);
  const picked = chooseOrder(parsed, j.shopify.searchedBy);
  const chosen = { ...picked, searchedBy: j.shopify.searchedBy };

  const decision = decide({
    settings: j.settings,
    read: j.read,
    chosen,
    parsed,
  });

  out.push({
    json: {
      ...j,
      order: chosen.order,
      orderAmbiguous: chosen.ambiguous,
      shopifyProblem: parsed.problem || null,
      decision,
    },
  });
}

return out;
