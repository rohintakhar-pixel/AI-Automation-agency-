// ---- n8n wiring. The tested logic is above this line. ----
// Input: the Gmail trigger's raw output, with your settings merged onto it.
// Output: one item per email, carrying the settings, the email, and the read.

const out = [];
for (const item of $input.all()) {
  const j = item.json;

  const settings = {
    storeDomain: j.storeDomain,
    apiVersion: j.apiVersion,
    storeName: j.storeName,
    signOffName: j.signOffName,
    ownerEmail: j.ownerEmail,
    autoSend: j.autoSend === true || j.autoSend === 'true',
    model: j.model,
    returnPolicy: j.returnPolicy,
  };

  // The Gmail trigger with Simplify switched off returns a parsed message:
  // "text" is the plain-text body, "from" is an object with a "text" field,
  // and "headers" is a map of header name to the whole header line.
  const from =
    (j.from && (j.from.text || j.from.value?.[0]?.address)) ||
    j.From ||
    j.headers?.from ||
    '';

  const email = {
    from: String(from),
    subject: String(j.subject || j.Subject || ''),
    body: String(j.text || j.textPlain || j.html || j.snippet || ''),
    headers: j.headers || {},
  };

  const read = readEmail(email);

  // Work out the Shopify search here too, so the next step can ask one
  // question: is there something to handle and something to look it up by?
  const search = buildOrderSearch({
    orderNumber: read.orderNumber,
    customerEmail: read.customerEmail,
  });

  out.push({
    json: {
      messageId: j.id || j.messageId || null,
      threadId: j.threadId || null,
      settings,
      email,
      read,
      shopify: {
        canSearch: search.found,
        searchedBy: search.by,
        url: search.found ? adminApiUrl(settings.storeDomain, settings.apiVersion) : null,
        body: search.found ? buildRequestBody(search.search) : null,
      },
    },
  });
}

return out;
