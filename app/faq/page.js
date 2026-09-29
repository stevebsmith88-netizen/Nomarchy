// Server component wrapper, kept separate from FaqContent (a client
// component, needed for the light/dark theme toggle) purely so this file
// can keep its metadata export - see [username]/page.js for the same split.
import FaqContent from "./FaqContent";

export const metadata = { title: "How Nomarchy works" };

export default function FAQ() {
  return <FaqContent />;
}
