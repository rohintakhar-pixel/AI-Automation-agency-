// ---- n8n wiring. The tested logic is above this line. ----
// Builds the OpenAI request. Nothing is sent yet.

const out = [];
for (const item of $input.all()) {
  const j = item.json;

  const messages = buildMessages({
    category: j.read.category,
    order: j.order,
    customerMessage: j.read.cleanBody,
    settings: j.settings,
  });

  out.push({
    json: {
      ...j,
      openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        body: buildRequestBody({ model: j.settings.model, messages }),
      },
    },
  });
}

return out;
