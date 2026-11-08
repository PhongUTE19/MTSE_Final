import React from 'react';
import SearchInput from '../search/SearchInput.jsx';
import Label from '../../primitives/labels/Label.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Reusable SearchField composite.
 * Standardizes search inputs with clear button, optional label, and optional explicit search action.
 *
 * @param {object} props
 * @param {string} [props.value=''] - Active search text
 * @param {(val: string) => void} props.onChange - Change handler
 * @param {() => void} [props.onSearch] - Search/submit callback
 * @param {() => void} [props.onClear] - Clear callback
 * @param {string} [props.placeholder='Search...'] - Input placeholder
 * @param {string} [props.ariaLabel='Search records'] - Accessible label
 * @param {string} [props.id='filter-search'] - Input DOM id
 * @param {string} [props.label] - Optional field label
 * @param {boolean} [props.disabled=false] - Whether search is disabled
 * @param {boolean} [props.showButton=false] - Whether to render explicit Search button
 * @param {string} [props.buttonLabel='Search'] - Label for search button
 */
export default function SearchField({
  value = '',
  onChange,
  onSearch,
  onClear,
  placeholder = 'Search...',
  ariaLabel = 'Search records',
  id = 'filter-search',
  label,
  disabled = false,
  showButton = false,
  buttonLabel = 'Search',
  ...rest
}) {
  const domProps = omitProps(rest);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && onSearch) {
      onSearch();
    }
  };

  const inputElement = (
    <SearchInput
      id={id}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      onClear={onClear}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      disabled={disabled}
    />
  );

  if (label) {
    return (
      <Stack gap="2xs" {...domProps}>
        <Label htmlFor={id}>{label}</Label>
        {showButton && onSearch ? (
          <Inline gap="xs" align="center">
            {inputElement}
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={onSearch}
            >
              {buttonLabel}
            </Button>
          </Inline>
        ) : (
          inputElement
        )}
      </Stack>
    );
  }

  if (showButton && onSearch) {
    return (
      <Inline gap="xs" align="center" {...domProps}>
        {inputElement}
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={onSearch}
        >
          {buttonLabel}
        </Button>
      </Inline>
    );
  }

  return inputElement;
}
