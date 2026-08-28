/**
 * @repocard/react — thin React wrapper around the <repo-deck> web component.
 *
 * Plan §2: "wrapper fino em cima do web component, opcional/futuro".
 * This gives React users a familiar <RepoDeck /> component instead of
 * dealing with custom-element refs directly.
 *
 * The web component auto-registers on import — this wrapper just provides
 * typed props.
 */

'use client';

import React, { useEffect, useRef } from 'react';
import 'repocard/repodeck/auto';

export interface RepoDeckProps {
  owner: string;
  repo: string;
  branch?: string;
  ref?: string;
  preset?: 'minimal' | 'standard' | 'detailed';
  configPath?: string;
  theme?: 'light' | 'dark' | 'auto';
  modalSections?: string;
  radius?: 'sharp' | 'soft' | 'round' | string;
  dataUrl?: string;
  showStats?: boolean;
  lazy?: boolean;
  hideBranding?: boolean;
  locale?: string;
  debug?: boolean;
  /** Disables the default client-side WebP re-encoding of screenshots. */
  noOptimize?: boolean;
  /** GitHub token forwarded to the data endpoint via the Authorization header. */
  token?: string;
  /** Optional className for the wrapper div. */
  className?: string;
  /** Optional style for the wrapper div. */
  style?: React.CSSProperties;
  /** Called when the card data loads. */
  onLoad?: (data: unknown) => void;
  /** Called when the card errors. */
  onError?: (error: unknown) => void;
  /** Called when the modal opens. */
  onModalOpen?: () => void;
  /** Called when the modal closes. */
  onModalClose?: () => void;
}

/**
 * React wrapper for the <repo-deck> Custom Element.
 *
 * @example
 * import { RepoDeck } from '@repocard/react';
 *
 * <RepoDeck owner="your-name" repo="your-repo" preset="standard" showStats />
 */
export const RepoDeck = React.forwardRef<HTMLElement, RepoDeckProps>(function RepoDeck(
  props,
  forwardedRef,
) {
  const {
    owner,
    repo,
    branch,
    ref: refAttr,
    preset,
    configPath,
    theme,
    modalSections,
    radius,
    dataUrl,
    showStats,
    lazy,
    hideBranding,
    locale,
    debug,
    noOptimize,
    token,
    className,
    style,
    onLoad,
    onError,
    onModalOpen,
    onModalClose,
  } = props as RepoDeckProps & { ref?: string };

  const internalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;

    // Set the forwarded ref.
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = el;

    // The `ref` prop (tag/commit pin, plan §16.7) conflicts with React's `ref`
    // for element refs — set it as an attribute imperatively.
    if (refAttr) el.setAttribute('ref', refAttr);

    // Wire event listeners.
    if (onLoad) {
      const handler = (e: Event) => onLoad((e as CustomEvent).detail?.data);
      el.addEventListener('repodeck:loaded', handler as EventListener);
    }
    if (onError) {
      const handler = (e: Event) => onError((e as CustomEvent).detail?.error);
      el.addEventListener('repodeck:error', handler as EventListener);
    }
    if (onModalOpen) {
      el.addEventListener('repodeck:modal-open', onModalOpen as EventListener);
    }
    if (onModalClose) {
      el.addEventListener('repodeck:modal-close', onModalClose as EventListener);
    }
  }, [forwardedRef, refAttr, onLoad, onError, onModalOpen, onModalClose]);

  return (
    <div className={className} style={style}>
      <repo-deck
        ref={internalRef}
        owner={owner}
        repo={repo}
        {...(branch ? { branch } : {})}
        {...(preset ? { preset } : {})}
        {...(configPath ? { 'config-path': configPath } : {})}
        {...(theme ? { theme } : {})}
        {...(modalSections ? { 'modal-sections': modalSections } : {})}
        {...(radius ? { radius } : {})}
        {...(dataUrl ? { 'data-url': dataUrl } : {})}
        {...(showStats ? { 'show-stats': '' } : {})}
        {...(lazy ? { lazy: '' } : {})}
        {...(hideBranding ? { 'hide-branding': '' } : {})}
        {...(locale ? { locale } : {})}
        {...(debug ? { debug: '' } : {})}
        {...(noOptimize ? { 'no-optimize': '' } : {})}
        {...(token ? { token } : {})}
      />
    </div>
  );
});

export interface RepoDeckListProps {
  repos: string;
  preset?: 'minimal' | 'standard' | 'detailed';
  theme?: 'light' | 'dark' | 'auto';
  radius?: 'sharp' | 'soft' | 'round' | string;
  cols?: string;
  gap?: string;
  showStats?: boolean;
  lazy?: boolean;
  locale?: string;
  sort?: 'none' | 'order' | 'stars' | 'name';
  sortOrder?: 'asc' | 'desc';
  filterTag?: string;
  batchCheck?: boolean;
  dataUrl?: string;
  modalSections?: string;
  configPath?: string;
  /** Disables the default client-side WebP re-encoding of screenshots. */
  noOptimize?: boolean;
  /** GitHub token forwarded to each card's data endpoint (Authorization header). */
  token?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * React wrapper for the <repodeck-list> Custom Element.
 *
 * @example
 * import { RepoDeckList } from '@repocard/react';
 *
 * <RepoDeckList
 *   repos="your-name/project-a,your-name/project-b"
 *   showStats
 *   lazy
 *   sort="stars"
 *   sort-order="desc"
 * />
 */
export const RepoDeckList = React.forwardRef<HTMLElement, RepoDeckListProps>(function RepoDeckList(
  props,
  forwardedRef,
) {
  const {
    repos,
    preset,
    theme,
    radius,
    cols,
    gap,
    showStats,
    lazy,
    locale,
    sort,
    sortOrder,
    filterTag,
    batchCheck,
    dataUrl,
    modalSections,
    configPath,
    noOptimize,
    token,
    className,
    style,
  } = props;

  const internalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = el;
  }, [forwardedRef]);

  return (
    <div className={className} style={style}>
      <repodeck-list
        ref={internalRef}
        repos={repos}
        {...(preset ? { preset } : {})}
        {...(theme ? { theme } : {})}
        {...(radius ? { radius } : {})}
        {...(cols ? { cols } : {})}
        {...(gap ? { gap } : {})}
        {...(showStats ? { 'show-stats': '' } : {})}
        {...(lazy ? { lazy: '' } : {})}
        {...(locale ? { locale } : {})}
        {...(sort ? { sort } : {})}
        {...(sortOrder ? { 'sort-order': sortOrder } : {})}
        {...(filterTag ? { 'filter-tag': filterTag } : {})}
        {...(batchCheck ? { 'batch-check': '' } : {})}
        {...(dataUrl ? { 'data-url': dataUrl } : {})}
        {...(modalSections ? { 'modal-sections': modalSections } : {})}
        {...(configPath ? { 'config-path': configPath } : {})}
        {...(noOptimize ? { 'no-optimize': '' } : {})}
        {...(token ? { token } : {})}
      />
    </div>
  );
});

export default RepoDeck;
