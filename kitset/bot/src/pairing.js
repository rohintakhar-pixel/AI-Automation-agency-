// ==== BEGIN SHARED ====
/*
 * Lining answers up with the emails they belong to.
 *
 * n8n's HTTP nodes replace each item with the response they got, so the email
 * that produced a response is found by its position in an earlier node's
 * output. That only holds while the two lists are the same length. If they are
 * ever not, position means nothing, and pairing by position anyway would put
 * one customer's order into another customer's reply with no error anywhere.
 *
 * So the run stops instead. A stopped run shows up in n8n's execution list and
 * costs the owner a look. A quietly mispaired reply costs the customer.
 */
function pairByPosition(contexts, responses, whatAnswered) {
  const sent = Array.isArray(contexts) ? contexts.length : 0;
  const back = Array.isArray(responses) ? responses.length : 0;
  if (sent === back) return { ok: true, message: null };

  return {
    ok: false,
    message:
      `Kitset stopped on purpose. ${whatAnswered} returned ${back} answers ` +
      `for ${sent} emails, so there is no safe way to tell which answer ` +
      `belongs to which email. Nothing was sent and nothing was drafted. ` +
      `Open this run under Executions to see the emails involved and answer ` +
      `them yourself.`,
  };
}
// ==== END SHARED ====

module.exports = { pairByPosition };
