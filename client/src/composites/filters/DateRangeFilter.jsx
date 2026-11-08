import React from 'react';
import TextInput from '../../primitives/inputs/TextInput.jsx';
import Label from '../../primitives/labels/Label.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Reusable DateRangeFilter composite.
 * Standardizes From / To date range inputs with an optional Apply action.
 *
 * @param {object} props
 * @param {string} [props.from=''] - Start date value (YYYY-MM-DD)
 * @param {string} [props.to=''] - End date value (YYYY-MM-DD)
 * @param {(val: string) => void} props.onFromChange - Change handler for start date
 * @param {(val: string) => void} props.onToChange - Change handler for end date
 * @param {() => void} [props.onApply] - Callback invoked when the user clicks the Apply action
 * @param {string} [props.fromLabel='From date'] - Label for start date
 * @param {string} [props.toLabel='To date'] - Label for end date
 * @param {string} [props.applyLabel='Apply filters'] - Label for apply button
 * @param {string} [props.fromId='filter-from-date'] - ID for from input
 * @param {string} [props.toId='filter-to-date'] - ID for to input
 * @param {boolean} [props.disabled=false] - Whether inputs/buttons are disabled
 * @param {boolean} [props.showApplyButton=true] - Whether to render the Apply button
 */
export default function DateRangeFilter({
  from = '',
  to = '',
  onFromChange,
  onToChange,
  onApply,
  fromLabel = 'From date',
  toLabel = 'To date',
  applyLabel = 'Apply filters',
  fromId = 'filter-from-date',
  toId = 'filter-to-date',
  disabled = false,
  showApplyButton = true,
  ...rest
}) {
  const domProps = omitProps(rest);

  return (
    <Inline gap="sm" align="end" wrap {...domProps}>
      <Stack gap="2xs">
        {fromLabel && <Label htmlFor={fromId}>{fromLabel}</Label>}
        <TextInput
          id={fromId}
          type="date"
          value={from}
          disabled={disabled}
          onChange={(e) => onFromChange?.(e.target.value)}
        />
      </Stack>

      <Stack gap="2xs">
        {toLabel && <Label htmlFor={toId}>{toLabel}</Label>}
        <TextInput
          id={toId}
          type="date"
          value={to}
          disabled={disabled}
          onChange={(e) => onToChange?.(e.target.value)}
        />
      </Stack>

      {showApplyButton && onApply && (
        <Inline align="center">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={onApply}
          >
            {applyLabel}
          </Button>
        </Inline>
      )}
    </Inline>
  );
}
