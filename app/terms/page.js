// Server component wrapper, kept separate from TermsContent (a client
// component, needed for the light/dark theme toggle) purely so this file
// can keep its metadata export - see [username]/page.js for the same split.
import TermsContent from "./TermsContent";

export const metadata = { title: "Terms of Service" };

export default function TermsOfService() {
  return <TermsContent />;
}
