import { useEffect, useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';

const MOBILE_QUERY = '(max-width: 768px)';

type WarningKind = 'mobile' | 'firefox';

const WARNINGS: Record<WarningKind, { storageKey: string; title: string; body: string; note: string }> = {
  mobile: {
    storageKey: 'nyxvideo:mobileWarningDismissed',
    title: "NyxVideo isn't built for mobile",
    body: "The editor relies on a dense, multi-track timeline and precise pointer input that small touchscreens aren't suited for. Expect things to be cramped or broken here.",
    note: "If you continue anyway, please don't file bug reports for issues you run into on mobile, this isn't a supported way to use the app.",
  },
  firefox: {
    storageKey: 'nyxvideo:firefoxWarningDismissed',
    title: 'Limited support on Firefox',
    body: "NyxVideo is built and tested primarily for Chrome. Some styling and features (like the voice recorder and eyedropper color picking) may look off or not work correctly here.",
    note: 'For the smoothest experience, use Chrome or another Chromium-based browser.',
  },
};

function isDismissed(kind: WarningKind): boolean {
  return localStorage.getItem(WARNINGS[kind].storageKey) === 'true';
}

export function EnvironmentWarning() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(MOBILE_QUERY).matches,
  );
  const [isFirefox] = useState(() => typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent));
  const [mobileDismissed, setMobileDismissed] = useState(() => isDismissed('mobile'));
  const [firefoxDismissed, setFirefoxDismissed] = useState(() => isDismissed('firefox'));

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Mobile takes priority — it's the more fundamentally broken experience — so the two warnings
  // never stack; Firefox's only shows up once mobile's has been dealt with (or doesn't apply).
  const active: WarningKind | null = isMobile && !mobileDismissed ? 'mobile' : isFirefox && !firefoxDismissed ? 'firefox' : null;

  if (!active) return null;
  const cfg = WARNINGS[active];

  const handleContinue = () => {
    localStorage.setItem(cfg.storageKey, 'true');
    if (active === 'mobile') setMobileDismissed(true);
    else setFirefoxDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-surface-0 p-6 text-center shadow-2xl">
        <FiAlertTriangle size={26} className="text-amber-400" />
        <h2 className="text-base font-semibold text-fg">{cfg.title}</h2>
        <p className="text-sm text-fg-muted">{cfg.body}</p>
        <p className="text-xs text-fg-faint">{cfg.note}</p>
        <button
          onClick={handleContinue}
          className="mt-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Continue anyway
        </button>
      </div>
    </div>
  );
}
