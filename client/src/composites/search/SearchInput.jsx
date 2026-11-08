import React from 'react';
import IconButton from '../../primitives/buttons/IconButton.jsx';
import TextInput from '../../primitives/inputs/TextInput.jsx';
import { VALIDATION_LIMITS, UI_LABELS } from '../../shared/constants';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Reusable accessible search input component with clear button support.
 * Composes Base TextInput and IconButton components.
 *
 * @param {object} props
 * @param {string} props.value - Controlled input value
 * @param {Function} props.onChange - Change handler: (newValue) => void
 * @param {string} [props.placeholder='Search...'] - Placeholder text
 * @param {string} [props.ariaLabel='Search'] - Accessible input label
 * @param {boolean} [props.disabled=false] - Disabled state
 * @param {Function} [props.onKeyDown] - Optional keydown handler (e.g. Enter key to submit search)
 * @param {Function} [props.onClear] - Clear handler
 * @param {number} [props.maxLength] - Maximum character length
 * @param {string} [props.id] - Optional HTML element ID
 */
export default function SearchInput({
  value = '',
  onChange,
  onKeyDown,
  placeholder = UI_LABELS.COMMON.SEARCH_PLACEHOLDER || 'Search...',
  ariaLabel = 'Search',
  disabled = false,
  onClear,
  maxLength = VALIDATION_LIMITS.SEARCH_QUERY.MAX_LENGTH,
  id,
  ...rest
}) {
  const domProps = omitProps(rest);

  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && value) {
      e.preventDefault();
      e.stopPropagation();
      handleClear();
      return;
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div role="search" className="relative flex items-center w-full" {...domProps}>
      <TextInput
        id={id}
        type="text"
        endPadding="sm"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        maxLength={maxLength}
        aria-label={ariaLabel}
      />
      {value && !disabled && (
        <span className="absolute right-1.5 inline-flex items-center justify-center">
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            title={UI_LABELS.COMMON.CLEAR_SEARCH || 'Clear search'}
            aria-label={UI_LABELS.COMMON.CLEAR_SEARCH || 'Clear search'}
          >
            ×
          </IconButton>
        </span>
      )}
    </div>
  );
}

export const SearchBar = SearchInput;
