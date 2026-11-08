import React from 'react';

/**
 * Feature layout component for authentication pages.
 * Centralizes page container semantics, centering, and responsive grid layout.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.showcase] - Optional brand showcase section (for AuthPage)
 * @param {string} [props.ariaLabelledby] - Optional accessibility label for content region
 * @param {React.ReactNode} props.children - Main authentication form/card
 */
const CARD_SECTION_CLASSES = 'w-full max-w-modal-md';

export default function AuthLayout({ showcase, ariaLabelledby, children }) {
  return (
    <main className="min-h-dvh grid grid-cols-1 content-center p-6 max-tablet:p-4 max-mobile:p-2 bg-page-gradient text-content-primary">
      <div className={showcase ? 'w-full max-w-auth-showcase mx-auto grid grid-cols-[1.1fr_1fr] max-desktop:grid-cols-1 gap-8 max-tablet:gap-4 items-center' : 'w-full max-w-modal-md mx-auto flex flex-col items-center justify-center'}>
        {showcase}
        <section
          className={showcase ? `${CARD_SECTION_CLASSES} justify-self-end max-desktop:justify-self-center` : `${CARD_SECTION_CLASSES} mx-auto`}
          aria-labelledby={ariaLabelledby}
        >
          {children}
        </section>
      </div>
    </main>
  );
}
