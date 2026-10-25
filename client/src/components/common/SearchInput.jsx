import React from 'react';
import { VALIDATION_LIMITS, UI_LABELS } from '../../constants';

/**
 * Reusable accessible search input component with clear button support.
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
 * @param {string} [props.className='search-input'] - Input CSS class name
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
  className = 'search-input',
  id,
}) {
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
      handleClear();
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div className="search-input-wrapper" role="search">
      <input
        id={id}
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        maxLength={maxLength}
        aria-label={ariaLabel}
      />
      {value && !disabled && (
        <button
          type="button"
          className="search-clear-btn"
          onClick={handleClear}
          title={UI_LABELS.COMMON.CLEAR_SEARCH || 'Clear search'}
          aria-label={UI_LABELS.COMMON.CLEAR_SEARCH || 'Clear search'}
        >
          ×
        </button>
      )}
    </div>
  );
}
