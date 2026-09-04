// ---- n8n wiring. The tested logic is above this line. ----
// Reads OpenAI's answer and runs the last checks on it.
//
// Nothing reaches a customer unless the decision was "send" AND every check
// below passed. A failed check does not throw the draft away; it goes to the
// owner with the reason on top.

const context = $('Build the prompt').all();
const responses = $input.all();
const out = [];

for (let i = 0; i < responses.length; i++) {
  const j = (context[i] || context[0]).json;
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

  const check = checkDraft(completion.text, j.order);
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
