import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const VISIBLE_FILE_INPUT_CLASSES =
  'w-full border border-border rounded-md font-sans text-sm text-content-primary bg-surface px-3 py-1.5 transition-[border-color,box-shadow,background-color] duration-150 focus:outline-none focus:border-brand focus:shadow-focus file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-surface-muted file:text-content-primary hover:file:bg-surface-hover disabled:bg-surface-muted disabled:text-content-muted disabled:cursor-not-allowed';

/**
 * Base FileInput component for file uploads across SpendWise.
 * Can be rendered hidden (for custom button upload triggers) or standard.
 *
 * @param {object} props
 * @param {string} [props.accept] - Allowed MIME types or file extensions
 * @param {boolean} [props.hidden=false] - Whether file input is visually hidden
 * @param {boolean} [props.multiple=false] - Whether multiple files can be selected
 * @param {boolean} [props.disabled=false] - Disabled state
 * @param {function} [props.onChange] - File selection callback
 */
const FileInput = forwardRef(function FileInput(
  {
    accept,
    hidden = false,
    multiple = false,
    disabled = false,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);
  const isHidden = Boolean(hidden);
  const classes = isHidden ? 'hidden' : VISIBLE_FILE_INPUT_CLASSES;

  return (
    <input
      ref={ref}
      type="file"
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      className={classes}
      aria-hidden={isHidden ? 'true' : undefined}
      tabIndex={isHidden ? -1 : undefined}
      {...domProps}
    />
  );
});

export default FileInput;
