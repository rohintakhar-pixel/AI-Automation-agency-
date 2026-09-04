// ---- n8n wiring. The tested logic is above this line. ----
// Builds the draft that lands in your Gmail drafts.
//
// Three different paths arrive here: a message the bot would not touch, a
// message it could not answer, and a drafted reply that did not clear every
// check. All three end the same way: something in your drafts with a plain
// note on top saying why it is there.

const out = [];
for (const item of $input.all()) {
  const j = item.json;

  const why =
    (j.decision && j.decision.why) ||
    (j.read && j.read.reason === 'mixed_signals'
      ? 'The customer asked about more than one thing at once.'
      : null) ||
    (j.shopify && j.shopify.canSearch === false
      ? 'There was no order number and no usable email address to look the order up by.'
      : null) ||
    'This one needs you to read it.';

  const problems = Array.isArray(j.checkProblems) ? j.checkProblems : [];
  const note = ownerNote({ why, problems });

  const original = [
    '',
    '--- the customer wrote ---',
    (j.email && j.email.body) || '',
  ].join('\n');

  const body = j.draft ? `${note}${j.draft}\n${original}` : `${note}${original}`;

  const subject = (j.email && j.email.subject) || 'Support message';

  out.push({
    json: {
      ...j,
      noteSubject: subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`,
      noteBody: body,
      noteTo: (j.read && j.read.customerEmail) || '',
    },
  });
}

return out;
