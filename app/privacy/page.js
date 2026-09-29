// Server component wrapper, kept separate from PrivacyContent (a client
// component, needed for the light/dark theme toggle) purely so this file
// can keep its metadata export - see [username]/page.js for the same split.
import PrivacyContent from "./PrivacyContent";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPolicy() {
  return <PrivacyContent />;
}
