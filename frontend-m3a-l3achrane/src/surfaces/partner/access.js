// Every /partner/* call is scoped to the caller's own partner_id (auth.py partner_ctx) — a user
// with no PartnerMember row gets a 403 (PartnerForbidden), not an empty dataset. Centralised here
// so each screen can distinguish "no membership" from a transient load error with one check.
export function isForbiddenError(err) {
  return err?.response?.status === 403
}
