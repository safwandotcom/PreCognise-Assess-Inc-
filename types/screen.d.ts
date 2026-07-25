// types/screen.d.ts
export {};

declare global {
  interface Screen {
    /** Window Management API — true when the OS reports more than one connected display. Not yet in TypeScript's bundled DOM lib. */
    readonly isExtended?: boolean;
  }
}
