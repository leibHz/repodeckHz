// Type declarations for the repocard web component package.

export interface RepoCardLocaleStrings {
  loading?: string;
  errorTitle?: string;
  viewDetails?: string;
  openOnGithub?: string;
  readmeSection?: string;
  screenshotsSection?: string;
  resumeSection?: string;
  linkSection?: string;
  starsLabel?: string;
  forksLabel?: string;
  noScreenshots?: string;
  readmeUnavailable?: string;
  resumeUnavailable?: string;
  screenshotsUnavailable?: string;
  close?: string;
  closeDialog?: string;
  clickToOpen?: string;
  more?: string;
  [key: string]: string | undefined;
}

export interface RepoCardAnalyticsEvent {
  type: 'viewed' | 'modal_open' | 'modal_close' | 'error' | string;
  name: string;
  owner: string | null;
  repo: string | null;
  detail: Record<string, unknown>;
  timestamp: number;
}

export type AnalyticsHandler = (event: RepoCardAnalyticsEvent) => void;

export interface RepoCardAPI {
  setLocale(locale: string, strings?: RepoCardLocaleStrings): void;
  getLocale(): string;
  t(key: string): string;
  createAnalyticsAdapter(handler: AnalyticsHandler): void;
  removeAnalyticsAdapter(handler: AnalyticsHandler): void;
}

declare global {
  interface Window {
    RepoCard: RepoCardAPI;
  }
}

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'repo-card': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
          owner?: string;
          repo?: string;
          branch?: string;
          preset?: string;
          'config-path'?: string;
          theme?: string;
          'modal-sections'?: string;
          radius?: string;
          'data-url'?: string;
          'hide-branding'?: string;
          debug?: string;
          lazy?: string;
          'show-stats'?: string;
          locale?: string;
          token?: string;
        };
        'repocard-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
          repos?: string;
          preset?: string;
          theme?: string;
          radius?: string;
          cols?: string;
          gap?: string;
          lazy?: string;
          'show-stats'?: string;
          'data-url'?: string;
          'modal-sections'?: string;
          'config-path'?: string;
          locale?: string;
          sort?: string;
          'sort-order'?: string;
          'batch-check'?: string;
          'filter-tag'?: string;
        };
        'repo-deck': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
          owner?: string;
          repo?: string;
          branch?: string;
          preset?: string;
          'config-path'?: string;
          theme?: string;
          'modal-sections'?: string;
          radius?: string;
          'data-url'?: string;
          'hide-branding'?: string;
          debug?: string;
          lazy?: string;
          'show-stats'?: string;
          locale?: string;
          token?: string;
        };
        'repodeck-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
          repos?: string;
          preset?: string;
          theme?: string;
          radius?: string;
          cols?: string;
          gap?: string;
          lazy?: string;
          'show-stats'?: string;
          'data-url'?: string;
          'modal-sections'?: string;
          'config-path'?: string;
          locale?: string;
          sort?: string;
          'sort-order'?: string;
          'batch-check'?: string;
          'filter-tag'?: string;
          token?: string;
          'hide-branding'?: string;
          debug?: string;
        };
      }
    }
  }
}

export const RepoCard: RepoCardAPI;
export default RepoCard;
