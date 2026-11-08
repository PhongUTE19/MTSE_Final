import React from 'react';
import Badge from '../../primitives/labels/Badge.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import { Inline } from '../../primitives/layout/index.js';
import { UI_LABELS } from '../../shared/constants/index.js';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Header badge showing whether the backend / database is reachable.
 * Interprets the health-check state and renders it with the generic Badge primitive.
 *
 * @param {object} props
 * @param {boolean} [props.loading] - Whether a health check is pending
 * @param {boolean|string} [props.error] - Whether the health check failed
 * @param {Function} [props.onRetry] - Invoked when the retry button is pressed
 */
export default function HealthBadge({ loading, error, onRetry, ...rest }) {
  // Strip className and style to conform to controlled variant rules
  const validRest = omitProps(rest);

  if (loading) {
    return (
      <Badge as="div" variant="warning" {...validRest}>
        {UI_LABELS.HEALTH.CHECKING}
      </Badge>
    );
  }

  if (error) {
    return (
      <Badge as="div" variant="error" {...validRest}>
        <Inline align="center" gap="xs">
          <span>{UI_LABELS.HEALTH.OFFLINE}</span>
          {onRetry && (
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              {UI_LABELS.COMMON.RETRY}
            </Button>
          )}
        </Inline>
      </Badge>
    );
  }

  return (
    <Badge as="div" variant="success" {...validRest}>
      {UI_LABELS.HEALTH.ONLINE_PREFIX}
    </Badge>
  );
}
