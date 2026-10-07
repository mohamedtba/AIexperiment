'use client';

import * as React from 'react';

/**
 * Prevents a click on the given element from bubbling to a parent <Link>.
 *
 * The students list renders whole rows as links on mobile; the selection
 * checkbox inside a row therefore needs its own click target that must not
 * trigger navigation.
 */
export function StopLinkClick({ children }: { children: React.ReactNode }) {
  return <span onClick={(event) => event.stopPropagation()}>{children}</span>;
}
