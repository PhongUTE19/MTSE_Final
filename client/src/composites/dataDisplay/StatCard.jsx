import React from 'react';
import Card from '../../primitives/cards/Card.jsx';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import { Stack, Inline } from '../../primitives/layout/index.js';
import Text from '../../primitives/typography/Text.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Standardized StatCard / MetricCard composite component.
 * Encapsulates the metric card pattern used across Analytics, KnowledgeBase,
 * and Expenses with strictly controlled layout and typography primitives.
 *
 * @param {object} props
 * @param {string} props.label - Metric label description
 * @param {string|number} [props.value] - Formatted metric primary value
 * @param {string} [props.sub] - Subtext description or trend context
 * @param {string} [props.unit] - Unit indicator (e.g. 'ms', 'USD', '%')
 * @param {'default'|'outlined'|'glass'|'flat'|'raised'} [props.variant='default'] - Card surface variant
 * @param {'primary'|'secondary'|'success'|'error'|'warning'|'income'|'expense'} [props.valueColor='primary'] - Value text color
 * @param {React.ReactNode} [props.badge] - Optional status badge or indicator
 * @param {boolean} [props.loading=false] - Whether the metric value is currently loading
 * @param {React.ReactNode} [props.children] - Additional metric contents
 */
export default function StatCard({
  label,
  value,
  sub,
  unit,
  variant = 'default',
  valueColor = 'primary',
  badge,
  loading = false,
  children,
  ...rest
}) {
  const domProps = omitProps(rest);

  return (
    <Card variant={variant} aria-busy={loading ? 'true' : undefined} {...domProps}>
      <Stack gap="2xs">
        <Text variant="secondary" size="xs" weight="medium">
          {label}
        </Text>
        <div className="flex items-center min-h-control-sm">
          {loading ? (
            <Spinner size="md" variant="primary" ariaHidden={false} label={`Loading ${label}`} />
          ) : (
            <Inline gap="xs" align="baseline">
              <Text size="xl" weight="bold" color={valueColor}>
                {value}
              </Text>
              {unit && (
                <Text variant="caption">
                  {unit}
                </Text>
              )}
              {badge}
            </Inline>
          )}
        </div>
        {sub && (
          <Text variant="caption">
            {sub}
          </Text>
        )}
        {children}
      </Stack>
    </Card>
  );
}
