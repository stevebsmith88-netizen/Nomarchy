// Single source of truth for "what's new" - both the in-app notification
// feed (loadNotifications in lib/data.js) and the monthly re-engagement
// email (app/api/reengage/send/route.js) read from this one list, so a
// shipped feature only needs to be logged here once. Deciding what's
// worth including is still a judgment call for whoever ships it - add an
// entry when something is worth telling a returning user about; both
// surfaces pick it up automatically from then on, dated by when it
// actually shipped, nothing else to remember to touch.
//
// Use the real date AND time it shipped (UTC), not midnight of the day: the
// feed flags an item as new only if it's later than the moment you last
// opened the bell, so an entry stamped 00:00 never counts as new for anyone
// who already checked earlier that same day.
//
// `featured: true` marks the entries compelling enough to headline the
// re-engagement email, which shows the four most recent featured ones
// (falling back to the four most recent overall if none are flagged). The
// in-app feed ignores the flag and shows everything.
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
  { at: "2026-10-02T00:00:00Z", title: "A tidier Court", desc: "the top three in your Court get gold, silver and bronze crowns, and the list can be switched to a compact view.", featured: true },
  { at: "2026-10-02T00:00:00Z", title: "Follower counts", desc: "see how many follow you and how many are in your Court, and each friend's follower count on their profile." },
  { at: "2026-10-02T00:00:00Z", title: "Known for", desc: "open a friend to see the cuisine they're best known for, worked out from their crowns and visits.", featured: true },
  { at: "2026-10-02T00:00:00Z", title: "Google Maps", desc: "the maps now run on Google Maps, with the same cuisine pins, and follow light and dark mode.", featured: true },
  { at: "2026-10-02T19:55:00Z", title: "Smarter search", desc: "find almost any restaurant, anywhere, and we'll suggest the cuisine for you.", featured: true },
  { at: "2026-10-02T19:55:00Z", title: "A cleaner profile", desc: "your stats, Conquests and settings now tuck into tap-to-open sections." },
  { at: "2026-10-02T19:55:00Z", title: "Throne cards, rearranged", desc: "Share is a quick icon, and removing a photo now lives inside Edit." },
  { at: "2026-10-02T21:27:00Z", title: "A quick tour", desc: "tap your name, then Take the tour, for a short walkthrough of the app." },
  { at: "2026-10-02T21:42:00Z", title: "A tidier Next in Line", desc: "places open with a tap, the Privy Council folds away, and Still to try and Been to are now separate tabs." },
  { at: "2026-10-02T22:04:00Z", title: "Icons for your own cuisines", desc: "when you add a cuisine, pick an icon for it - it shows on your map pins, and you can change it later." },
  { at: "2026-10-02T22:25:00Z", title: "Easier for everyone to use", desc: "stronger text colours in light mode, clear outlines when you use a keyboard, messages that stay up longer and are read out by screen readers, and less motion if your phone is set to reduce it." },
  { at: "2026-10-02T22:39:00Z", title: "Accessibility settings", desc: "in Your Profile: reduce motion, calmer celebrations, larger text, and messages that stay until you close them.", featured: true },
  { at: "2026-10-03T00:10:00Z", title: "Royal words, explained", desc: "each tab now says plainly what it's for, and the FAQ has a quick guide to the royal words." },
  { at: "2026-10-03T02:35:00Z", title: "Tap a notification to see it", desc: "when someone in your Court crowns or tries somewhere new, tap the notification to jump straight to that pick." },
  { at: "2026-10-03T11:41:00Z", title: "A tidier FAQ", desc: "questions are now grouped into topics that fold away, with a couple of new ones on what Nomarchy is for." },
  { at: "2026-10-03T11:41:00Z", title: "Decrees are never lost", desc: "if the pop-up closes mid-sentence, your half-written decree is waiting when you come back.", featured: true },
  { at: "2026-10-03T12:09:00Z", title: "Personal invite links", desc: "invite a friend from Court and, when they join, you're in each other's Court straight away - plus a new Conquest, Royal Envoy.", featured: true },
  { at: "2026-10-03T12:29:00Z", title: "Restaurant pages", desc: "every restaurant now has its own public page with everyone's decrees for it - and sharing a crown links straight there.", featured: true },
  { at: "2026-10-03T13:55:00Z", title: "Smarter list imports", desc: "imported places are checked on Google, so they arrive with their address, map pin and a suggested cuisine." },
  { at: "2026-10-03T14:32:00Z", title: "Report a decree", desc: "see something that doesn't belong on a restaurant page? Tap Report under it and we'll take a look." },
  { at: "2026-10-03T14:53:00Z", title: "Restaurant pages, one tap away", desc: "tap a restaurant's name (look for the small arrow) on your Kingdom or a friend's picks, or Restaurant page on a Next in Line card - and Back returns you to where you were." },
];
