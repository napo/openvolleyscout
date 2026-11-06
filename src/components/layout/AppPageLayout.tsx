import type { ReactNode, Ref } from 'react';

interface AppPageLayoutProps {
  dir?: 'ltr' | 'rtl' | 'auto';
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  layoutRef?: Ref<HTMLDivElement>;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
}

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

export function AppPageLayout({
  dir,
  header,
  children,
  footer,
  layoutRef,
  className,
  headerClassName,
  contentClassName,
  footerClassName,
}: AppPageLayoutProps) {
  return (
    <div dir={dir} ref={layoutRef} className={joinClassNames('app-page-layout', className)}>
      {header ? (
        <header className={joinClassNames('app-page-layout__header', headerClassName)}>
          {header}
        </header>
      ) : null}
      <section className={joinClassNames('app-page-layout__content', contentClassName)}>
        {children}
      </section>
      {footer ? (
        <footer className={joinClassNames('app-page-layout__footer', footerClassName)}>
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
