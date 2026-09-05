// ---- n8n wiring. The tested logic is above this line. ----
// Reads OpenAI's answer and runs the last checks on it.
//
// Nothing reaches a customer unless the decision was "send" AND every check
// below passed. A failed check does not throw the draft away; it goes to the
// owner with the reason on top.

const context = $('Build the prompt').all();
const responses = $input.all();

const paired = pairByPosition(context, responses, 'Ask OpenAI');
if (!paired.ok) throw new Error(paired.message);

const out = [];

for (let i = 0; i < responses.length; i++) {
  const j = context[i].json;
  const completion = readCompletion(responses[i].json);

  if (!completion.ok) {
    out.push({
      json: {
        ...j,
        draft: '',
        checkPassed: false,
        checkProblems: [`The reply could not be written (${completion.problem}).`],
        sendIt: false,
      },
    });
    continue;
  }

  // The check is given the email as it arrived, so it can tell a detail the
  // customer supplied from one it only ever came out of Shopify.
  const check = checkDraft(completion.text, j.order, {
    incomingText: [j.email?.from, j.email?.subject, j.email?.body]
      .filter(Boolean)
      .join('\n'),
    storeDomain: j.settings?.storeDomain,
  });
  const sendIt = j.decision.action === 'send' && check.pass === true;

  out.push({
    json: {
      ...j,
      draft: completion.text,
      checkPassed: check.pass,
      checkProblems: check.problems,
      sendIt,
    },
  });
}

return out;
