// Single source of truth for "what's new" - both the in-app notification
// feed (loadNotifications in lib/data.js) and the monthly re-engagement
// email (app/api/reengage/send/route.js) read from this one list, so a
// shipped feature only needs to be logged here once. Deciding what's
// worth including is still a judgment call for whoever ships it - add an
// entry when something is worth telling a returning user about; both
// surfaces pick it up automatically from then on, dated by when it
// actually shipped, nothing else to remember to touch.
export const CHANGELOG = [
  { at: "2026-09-21T00:00:00Z", title: "Google Sign-In", desc: "one tap, no password to remember." },
  { at: "2026-09-27T00:00:00Z", title: "The Map", desc: "see your friends' picks laid out geographically, in Court and Next in Line." },
  { at: "2026-09-29T00:00:00Z", title: "Light mode", desc: "toggle the sun/moon icon in the header, or in your profile settings." },
  { at: "2026-09-29T00:00:00Z", title: "Emoji avatars", desc: "pick one instead of a photo." },
  { at: "2026-09-29T00:00:00Z", title: "Best in the Land", desc: "the most-crowned restaurants across everyone's kingdoms, or just your Court - tap any restaurant to see who's crowned it." },
  { at: "2026-09-29T00:00:00Z", title: "Conquests", desc: "one-time achievements toward your rank." },
  { at: "2026-09-30T00:00:00Z", title: "The Privy Council", desc: "a \"can't decide what to eat\" card on Next in Line, pulling suggestions from your Court and your own list." },
  { at: "2026-10-01T00:00:00Z", title: "Rank promotions", desc: "a full-screen, over-the-top proclamation (and a share card) every time you climb a tier." },
  { at: "2026-10-01T00:00:00Z", title: "Cuisine map pins", desc: "every pin now shows an emoji for its cuisine, not just a plain dot." },
  { at: "2026-10-02T00:00:00Z", title: "A tidier Court", desc: "the top three in your Court get the crown, and the list can be switched to a compact view." },
];
