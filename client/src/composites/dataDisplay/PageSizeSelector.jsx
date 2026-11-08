import React from 'react';
import Select from '../../primitives/inputs/Select.jsx';
import Label from '../../primitives/labels/Label.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Reusable PageSizeSelector composite.
 * Standardizes per-page record limit selection across data-driven views.
 *
 * @param {object} props
 * @param {number|string} props.value - Active page size limit
 * @param {(limit: number) => void} props.onChange - Change handler receiving the selected numeric limit
 * @param {Array<number|string>} [props.options=[10, 20, 50, 100]] - Available page size options
 * @param {boolean} [props.disabled=false] - Whether selector is disabled
 * @param {string} [props.id='page-size-select'] - Input element ID for accessibility pairing
 * @param {string} [props.label='Per page:'] - Visible label string
 * @param {'sm'|'md'} [props.size='sm'] - Select primitive size
 * @param {string} [props.ariaLabel='Select number of items per page'] - Accessible label for screen readers
 */
export default function PageSizeSelector({
  value,
  onChange,
  options = [10, 20, 50, 100],
  disabled = false,
  id = 'page-size-select',
  label = 'Per page:',
  size = 'sm',
  ariaLabel = 'Select number of items per page',
  ...rest
}) {
  const domProps = omitProps(rest);

  const handleChange = (e) => {
    const next = Number(e.target.value);
    if (!Number.isNaN(next)) {
      onChange?.(next);
    }
  };

  return (
    <div className="inline-flex items-center gap-2 shrink-0 whitespace-nowrap" {...domProps}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Select
        id={id}
        size={size}
        fullWidth={false}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        aria-label={ariaLabel}
        options={options}
      />
    </div>
  );
}
