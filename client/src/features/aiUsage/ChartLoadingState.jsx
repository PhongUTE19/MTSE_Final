import React from 'react';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import Text from '../../primitives/typography/Text.jsx';

/**
 * Standardized loading state for analytics charts and breakdowns.
 */
export default function ChartLoadingState({ height = 'lg', label = 'Loading…' }) {
  const pyClass = height === 'sm' ? 'py-8' : 'py-12';
  return (
    <div className={`${pyClass} flex flex-col items-center justify-center gap-3`}>
      <Spinner size="md" variant="primary" label={label} />
      <Text variant="secondary">{label}</Text>
    </div>
  );
}
