import React, { createContext, forwardRef, useContext } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const TableVariantContext = createContext('default');

export function useTableVariant() {
  return useContext(TableVariantContext);
}

const TABLE_VARIANT_CLASSES = Object.freeze({
  default: 'w-full border-collapse text-sm leading-normal font-sans',
  compact: 'w-full border-collapse text-xs leading-normal font-sans',
  comfortable: 'w-full min-w-table border-collapse text-sm leading-normal font-sans',
});

/**
 * Table Base Component.
 * Standardizes tabular layout across SpendWise with controlled styling variants.
 *
 * @param {object} props
 * @param {'default'|'compact'|'comfortable'} [props.variant='default'] - Table styling variant
 * @param {boolean} [props.responsive=true] - Whether to wrap in an overflow scroll container
 * @param {React.ReactNode} props.children - Table sections (TableHead, TableBody)
 */
const Table = forwardRef(function Table(
  {
    variant = 'default',
    responsive = true,
    children,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);

  const tableClass = TABLE_VARIANT_CLASSES[variant] ?? TABLE_VARIANT_CLASSES.default;

  const tableElement = (
    <TableVariantContext.Provider value={variant}>
      <table ref={ref} className={tableClass} {...domProps}>
        {children}
      </table>
    </TableVariantContext.Provider>
  );

  if (responsive) {
    return <div className="overflow-x-auto w-full">{tableElement}</div>;
  }

  return tableElement;
});

export default Table;
