import React from 'react';

/**
 * Title subcomponent for Card.
 * Enforces canonical card title styling while supporting semantic heading levels via the `as` prop.
 * Arbitrary className and style escape hatches are stripped per Strict Component Styling Policy.
 *
 * @param {object} props
 * @param {'h1'|'h2'|'h3'|'h4'|'h5'|'h6'|'span'|'div'} [props.as='h3'] - Semantic heading or element tag
 * @param {React.ReactNode} props.children - Title content
 */
export function CardTitle({ as: Component = 'h3', children, ...rest }) {
  const {
    className: _strippedClassName,
    style: _strippedStyle,
    ...domProps
  } = rest;
  
  return (
    <Component
      className="m-0 font-sans text-base font-semibold text-content-primary leading-snug"
      {...domProps}
    >
      {children}
    </Component>
  );
}

export default CardTitle;
