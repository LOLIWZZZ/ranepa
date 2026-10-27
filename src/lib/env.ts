declare const __PREVIEW__: boolean | undefined;

/** Сборка для предпросмотра (одна HTML-страница без service worker и установки). */
export const IS_PREVIEW: boolean = typeof __PREVIEW__ !== 'undefined' && __PREVIEW__ === true;
