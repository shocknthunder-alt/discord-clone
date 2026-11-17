import { useIsMobile, useMobileStore } from "../store/mobileStore";
import { useMentionStore } from "../store/mentionStore";
import { useDmStore } from "../store/dmStore";
import { tr } from "../i18n";

/** ☰ at the left of a chat header on phones: back to the channel list (red dot = something new). */
export default function MobileNavButton() {
  const mobile = useIsMobile();
  const showNav = useMobileStore((s) => s.showNav);
  const mentions = useMentionStore((s) => Object.values(s.counts).reduce((a, b) => a + b, 0));
  const dms = useDmStore((s) => Object.values(s.unreadCounts).reduce((a, b) => a + b, 0));
  if (!mobile) return null;
  return (
    <button type="button" className="mobile-nav-button" onClick={showNav} aria-label={tr("Канали", "Channels")}>
      ☰{mentions + dms > 0 && <span className="mobile-nav-dot" />}
    </button>
  );
}
