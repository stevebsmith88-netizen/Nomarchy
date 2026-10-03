// The name and handle the welcome step pre-fills (WelcomeModal). New
// accounts start with a neutral placeholder username ("member-1a2b3c4d",
// see handle_new_user in schema.sql), so the suggestion is worked out from
// the person's own email here in their browser - nothing from the email is
// stored until they press Continue. Accounts from before the placeholder
// change get their old username tidied (the random "-1a2b" suffix removed).
export function suggestedNames(email, profile) {
  const prefix = (email || "").split("@")[0];
  const handle = /^member-[0-9a-f]{8}$/.test(profile?.username || "")
    ? prefix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "")
    : (profile?.username || "").replace(/-[0-9a-f]{4}$/, "");
  return { handle, displayName: profile?.display_name || prefix.slice(0, 40) || handle };
}
