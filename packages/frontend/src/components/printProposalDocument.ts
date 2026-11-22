/** Print a copy of the shared renderer from a blank URL with no acceptance controls or token. */
export function printProposalDocument(article: HTMLElement, title: string, locale: string) {
  const popup = window.open("about:blank", "_blank");
  if (!popup) return false;
  popup.opener = null;
  const printable = popup.document;
  printable.title = title;
  printable.documentElement.lang = locale;
  printable.body.className = "proposal-print-window";
  const styles = [...document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')];
  const pendingStyles = styles.map(style => {
    const copy = printable.importNode(style, true);
    if (copy instanceof HTMLLinkElement || copy.tagName === "LINK") {
      (copy as HTMLLinkElement).href = (style as HTMLLinkElement).href;
      return new Promise<void>(resolve => {
        copy.addEventListener("load", () => resolve(), { once: true });
        copy.addEventListener("error", () => resolve(), { once: true });
        printable.head.append(copy);
      });
    }
    printable.head.append(copy);
    return Promise.resolve();
  });
  const copy = printable.importNode(article, true);
  printable.body.append(copy);
  const pendingImages = Array.from(copy.querySelectorAll("img")).map(img => img.decode().catch(() => {
    img.remove();
  }));
  const ready = Promise.allSettled([...pendingStyles, ...pendingImages, printable.fonts.ready]);
  const timeout = new Promise<void>(resolve => window.setTimeout(resolve, 2500));
  void Promise.race([ready, timeout]).then(() => {
    if (popup.closed) return;
    popup.focus();
    popup.print();
  });
  return true;
}
