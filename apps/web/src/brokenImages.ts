/**
 * A PICTURE THAT FAILS TO LOAD DISAPPEARS.
 *
 * Every <img> in the app is art (the street, the shops, the characters)
 * with a backdrop colour behind it. When one fails (a deploy restarting the
 * server answers 502 for a few seconds), iOS Safari paints a "?" box in the
 * middle of it, right across the welcome headline (Dvir, 2026-10-02). The
 * backdrop alone is the better failure, so a failed image is hidden.
 *
 * `error` does not bubble, so this listens in the capture phase: one
 * listener for every image, present and future.
 */
export function hideBrokenImage(target: EventTarget | null): void {
  if (target && (target as Element).tagName === "IMG") (target as HTMLImageElement).style.visibility = "hidden";
}

export function hideBrokenImages(doc: Pick<Document, "addEventListener"> = document): void {
  doc.addEventListener("error", (e) => hideBrokenImage(e.target), true);
  // A later successful load (a new src) shows it again.
  doc.addEventListener(
    "load",
    (e) => {
      const t = e.target as Element | null;
      if (t?.tagName === "IMG") (t as HTMLImageElement).style.visibility = "";
    },
    true
  );
}
