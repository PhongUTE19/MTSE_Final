import React from 'react';
import Text from '../../primitives/typography/Text.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Reusable ItemRangeSummary composite.
 * Displays the visible record range (e.g., "1–10 of 12 results" or "0 results").
 *
 * @param {object} props
 * @param {number} [props.start=0] - 1-indexed start record of the current page
 * @param {number} [props.end=0] - 1-indexed end record of the current page
 * @param {number} [props.total=0] - Total count of records
 * @param {string} [props.unit='results'] - Noun describing the items (e.g. 'results', 'records', 'transactions')
 * @param {React.ReactNode|((start: number, end: number, total: number) => React.ReactNode)} [props.label] - Optional custom label or formatter
 */
export default function ItemRangeSummary({
  start = 0,
  end = 0,
  total = 0,
  unit = 'results',
  label,
  ...rest
}) {
  const domProps = omitProps(rest);

  if (label) {
    return (
      <span className="whitespace-nowrap shrink-0" {...domProps}>
        {typeof label === 'function' ? label(start, end, total) : label}
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap shrink-0" {...domProps}>
      <Text as="span" variant="secondary">
        {total === 0 ? (
          <>
            <Text as="strong" weight="semibold">0</Text> {unit}
          </>
        ) : (
          <>
            <Text as="strong" weight="semibold">{start}-{end}</Text> of{' '}
            <Text as="strong" weight="semibold">{total}</Text> {unit}
          </>
        )}
      </Text>
    </span>
  );
}
