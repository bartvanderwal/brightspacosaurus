/* Browser-side geometry extraction, based on the public rendered-HTML exporter. */
globalThis.bsoExtractSlides = async function (settings) {
  const roots = [...document.querySelectorAll("svg[data-marpit-svg]")];
  if (!roots.length) roots.push(...document.querySelectorAll("section"));
  await Promise.all([...document.images].map(async (image) => {
    try {
      await image.decode();
      if (/^(?:data:image\/gif[;,])|\.gif(?:[?#]|$)/i.test(image.src)) {
        const bitmap = await createImageBitmap(image);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        bitmap.close();
        image.src = canvas.toDataURL("image/png");
        await image.decode();
      }
    } catch {
      throw new Error(
        `Slide image failed to load: ${
          image.getAttribute("src")?.slice(0, 120)
        }`,
      );
    }
  }));
  await document.fonts.ready;
  for (const font of document.fonts) {
    if (font.status === "error") {
      throw new Error(`Slide font failed to load: ${font.family}`);
    }
  }
  const style = document.createElement("style");
  style.textContent =
    "[data-bso-export-slide]{display:block!important;position:relative!important;transform:none!important;margin:0!important;overflow:hidden!important} *{animation:none!important;transition:none!important}";
  document.head.append(style);
  for (const [index, root] of roots.entries()) {
    root.setAttribute("data-bso-export-slide", String(index));
    const view = root.viewBox?.baseVal;
    const width = view?.width || root.clientWidth;
    const height = view?.height || root.clientHeight;
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    if (index === 0 && settings.notice) {
      const band = 64;
      if (root.tagName.toLowerCase() !== "svg") {
        throw new Error("A source notice requires Marp SVG output.");
      }
      // Keep Marp's direct-child selectors intact; an extra SVG would unstyle the title.
      const factor = (height - band) / height;
      const offset = width * (1 - factor) / 2;
      for (const child of root.children) {
        const existing = child.getAttribute("transform") || "";
        child.setAttribute(
          "transform",
          `translate(${offset} 0) scale(${factor}) ${existing}`,
        );
      }
      const foreign = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "foreignObject",
      );
      foreign.setAttribute("x", "24");
      foreign.setAttribute("y", height - band);
      foreign.setAttribute("width", width - 48);
      foreign.setAttribute("height", band);
      const notice = document.createElement("div");
      notice.style.cssText =
        "font:16px/1.35 Arial,sans-serif;color:#555;background:white;padding:8px;box-sizing:border-box;height:100%";
      const text = document.createElement(settings.sourceUrl ? "a" : "span");
      text.textContent = settings.notice;
      if (settings.sourceUrl) text.setAttribute("href", settings.sourceUrl);
      notice.append(text);
      foreign.append(notice);
      root.append(foreign);
    }
  }
  const visible = (element) => {
    const css = getComputedStyle(element);
    return css.display !== "none" && css.visibility !== "hidden" &&
      Number(css.opacity) !== 0;
  };
  const color = (value) => {
    const parts = value.match(/[\d.]+/g)?.map(Number);
    if (!parts || (parts.length === 4 && parts[3] === 0)) return null;
    const alpha = parts.length === 4 ? parts[3] : 1;
    return parts.slice(0, 3).map((v) =>
      Math.round(v * alpha + 255 * (1 - alpha)).toString(16).padStart(2, "0")
    ).join("");
  };
  const notes = [...document.querySelectorAll(".bespoke-marp-note")];
  return await Promise.all(roots.map(async (root, index) => {
    const origin = root.getBoundingClientRect();
    const width = root.viewBox?.baseVal.width || root.clientWidth;
    const height = root.viewBox?.baseVal.height || root.clientHeight;
    const scale = origin.width / width;
    const rect = (r) => ({
      x: (r.left - origin.left) / scale,
      y: (r.top - origin.top) / scale,
      w: r.width / scale,
      h: r.height / scale,
    });
    const text = [];
    const images = [];
    const shapes = [];
    const links = [];
    const addImage = (image, box, framed) => {
      const canvas = document.createElement("canvas");
      const ratio = settings.maxImageWidth === 0
        ? 1
        : Math.min(1, settings.maxImageWidth / image.naturalWidth);
      if (ratio === 1 && /^data:image\/(?:png|jpeg);base64,/i.test(image.src)) {
        images.push({ ...box, data: image.src, framed });
        return;
      }
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels =
        context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = false;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 255) {
          transparent = true;
          break;
        }
      }
      images.push({
        ...box,
        data: canvas.toDataURL(
          !transparent && /^data:image\/jpeg/i.test(image.src)
            ? "image/jpeg"
            : "image/png",
          0.9,
        ),
        framed,
      });
    };
    const addFittedImage = (image, box, fit, position, framed) => {
      if (!["fill", "contain", "cover"].includes(fit)) {
        throw new Error(
          `Slide ${
            index + 1
          }: unsupported native image fit '${fit}'. Use contain/cover or export raster.`,
        );
      }
      const positions = position.split(/\s+/).map((part) => {
        if (!/^\d+(?:\.\d+)?%$/.test(part)) {
          throw new Error(
            `Slide ${
              index + 1
            }: unsupported native image position '${position}'. Use percentages or export raster.`,
          );
        }
        return parseFloat(part) / 100;
      });
      if (positions.length !== 2 || positions.some((value) => value > 1)) {
        throw new Error(
          `Slide ${
            index + 1
          }: unsupported native image position '${position}'.`,
        );
      }
      const ratio = image.naturalWidth / image.naturalHeight;
      if (fit === "contain") {
        const shown = { ...box };
        shown.w = Math.min(box.w, box.h * ratio);
        shown.h = shown.w / ratio;
        shown.x += (box.w - shown.w) * positions[0];
        shown.y += (box.h - shown.h) * positions[1];
        addImage(image, shown, framed);
      } else if (fit === "cover") {
        const scale = Math.max(
          box.w / image.naturalWidth,
          box.h / image.naturalHeight,
        );
        const cropWidth = box.w / scale;
        const cropHeight = box.h / scale;
        const width = settings.maxImageWidth === 0
          ? cropWidth
          : Math.min(cropWidth, settings.maxImageWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(width * cropHeight / cropWidth));
        canvas.getContext("2d").drawImage(
          image,
          (image.naturalWidth - cropWidth) * positions[0],
          (image.naturalHeight - cropHeight) * positions[1],
          cropWidth,
          cropHeight,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        images.push({
          ...box,
          framed,
          data: canvas.toDataURL(
            /^data:image\/jpeg/i.test(image.src) ? "image/jpeg" : "image/png",
            0.9,
          ),
        });
      } else addImage(image, box, framed);
    };
    const sections = [...root.querySelectorAll("section")];
    if (root.matches("section")) sections.unshift(root);
    let background = "FFFFFF";
    for (const section of sections) {
      background = color(getComputedStyle(section).backgroundColor) ||
        background;
    }
    for (const element of root.querySelectorAll("*")) {
      if (!visible(element)) continue;
      const css = getComputedStyle(element);
      const box = rect(element.getBoundingClientRect());
      if (!box.w || !box.h) continue;
      const elementScale = box.w / (element.clientWidth || box.w);
      if (element.matches("a[href]")) {
        const href = element.getAttribute("href");
        if (/^(https?:|mailto:|#)/i.test(href)) {
          links.push({ ...box, target: href });
        } else {throw new Error(
            `Slide ${
              index + 1
            }: unresolved hyperlink '${href}'. Use a slide anchor or HTTP(S) URL.`,
          );}
      }
      if (!settings.native) continue;
      if (element.matches("video,audio,iframe,canvas,math")) {
        throw new Error(
          `Slide ${
            index + 1
          }: unsupported native content '${element.tagName.toLowerCase()}'.`,
        );
      }
      if (
        element.matches("svg") &&
        element.closest("foreignObject") &&
        !element.querySelector("foreignObject")
      ) {
        const clone = element.cloneNode(true);
        const originals = [element, ...element.querySelectorAll("*")];
        const copies = [clone, ...clone.querySelectorAll("*")];
        for (const [i, original] of originals.entries()) {
          const computed = getComputedStyle(original);
          for (
            const key of [
              "fill",
              "stroke",
              "stroke-width",
              "font-family",
              "font-size",
              "font-weight",
            ]
          ) {
            copies[i].style.setProperty(key, computed.getPropertyValue(key));
          }
        }
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", box.w);
        clone.setAttribute("height", box.h);
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${
          btoa(
            unescape(
              encodeURIComponent(new XMLSerializer().serializeToString(clone)),
            ),
          )
        }`;
        await image.decode();
        addImage(image, box, false);
      }
      const fill = color(css.backgroundColor);
      if (fill && !element.matches("img,svg,foreignObject")) {
        shapes.push({ ...box, fill, radius: parseFloat(css.borderRadius) > 0 });
      }
      if (element.matches("img")) {
        addFittedImage(
          element,
          box,
          css.objectFit,
          css.objectPosition,
          Boolean(element.closest(".framed")),
        );
      } else if (css.backgroundImage !== "none") {
        const url = css.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
        if (!url) {
          throw new Error(
            `Slide ${index + 1}: unsupported native background '${
              css.backgroundImage.slice(0, 80)
            }'.`,
          );
        }
        const image = new Image();
        image.src = url;
        await image.decode();
        addFittedImage(
          image,
          box,
          css.backgroundSize === "100% 100%" ? "fill" : css.backgroundSize,
          css.backgroundPosition,
          false,
        );
      }
      if (element.matches("li")) {
        const ordered = element.parentElement.matches("ol");
        const start = Number(element.parentElement.getAttribute("start") || 1);
        const number = Number(element.getAttribute("value")) ||
          [...element.parentElement.children].indexOf(element) + start;
        text.push({
          x: box.x - 30 * elementScale,
          y: box.y,
          w: 28 * elementScale,
          h: (parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.2) *
            elementScale,
          text: ordered ? `${number}.` : "\u2022",
          size: parseFloat(css.fontSize) * elementScale,
          font: css.fontFamily.split(",")[0].replace(/["']/g, ""),
          color: color(css.color) || "1A1A1A",
        });
      }
      if (element.matches("section")) {
        for (const pseudo of ["::before", "::after"]) {
          const pc = getComputedStyle(element, pseudo);
          if (
            !pc.content || ["none", "normal", '""'].includes(pc.content) ||
            pc.display === "none"
          ) continue;
          let content = pc.content.replace(
            /attr\(([\w-]+)\)/g,
            (_, key) => JSON.stringify(element.getAttribute(key) || ""),
          );
          content = [...content.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join(
            "",
          );
          if (!content) continue;
          const font = parseFloat(pc.fontSize) * elementScale;
          const w = parseFloat(pc.width) * elementScale ||
            content.length * font * 0.65;
          const h = parseFloat(pc.height) * elementScale || font * 1.4;
          const x = pc.left !== "auto"
            ? box.x + parseFloat(pc.left) * elementScale
            : box.x + box.w - parseFloat(pc.right || 0) * elementScale - w;
          const y = pc.top !== "auto"
            ? box.y + parseFloat(pc.top) * elementScale
            : box.y + box.h - parseFloat(pc.bottom || 0) * elementScale - h;
          text.push({
            x,
            y,
            w,
            h,
            text: content,
            size: font,
            font: pc.fontFamily.split(",")[0].replace(/["']/g, ""),
            color: color(pc.color) || "777777",
          });
        }
      }
    }
    {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const metrics = document.createElement("canvas").getContext("2d");
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!node.textContent.trim() || !parent || !visible(parent)) continue;
        // Marp's background alt caption is deliberately clipped for screen readers.
        if (
          parent.closest(
            'section[data-marpit-advanced-background="background"] figcaption',
          )
        ) continue;
        // Marp wraps ordinary HTML in an SVG foreignObject: that ancestor is not a diagram.
        if (
          parent.closest("script,style,math") ||
          (parent.namespaceURI === "http://www.w3.org/2000/svg")
        ) continue;
        const css = getComputedStyle(parent);
        const link = parent.closest("a")?.getAttribute("href");
        const range = document.createRange();
        metrics.font =
          `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
        let current;
        for (let i = 0; i < node.length; i++) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const box = rect(range.getBoundingClientRect());
          if (!box.w || !box.h) continue;
          if (
            box.x < -2 || box.y < -2 || box.x + box.w > width + 2 ||
            box.y + box.h > height + 2
          ) {
            throw new Error(
              `Slide ${index + 1}: text overflows the slide near '${
                node.textContent.slice(0, 60)
              }'. Shorten or split the Markdown slide.`,
            );
          }
          for (
            let ancestor = parent;
            ancestor && ancestor !== root;
            ancestor = ancestor.parentElement
          ) {
            const ac = getComputedStyle(ancestor);
            const bounds = rect(ancestor.getBoundingClientRect());
            const clippedX = /hidden|clip/.test(ac.overflowX) &&
              (box.x < bounds.x - 2 || box.x + box.w > bounds.x + bounds.w + 2);
            const clippedY = /hidden|clip/.test(ac.overflowY) &&
              (box.y < bounds.y - 2 || box.y + box.h > bounds.y + bounds.h + 2);
            if (clippedX || clippedY) {
              throw new Error(
                `Slide ${index + 1}: text is clipped near '${
                  node.textContent.slice(0, 60)
                }'. Shorten or split the Markdown slide.`,
              );
            }
          }
          if (current && Math.abs(current.y - box.y) < 1) {
            current.text += node.textContent[i];
            current.w = box.x + box.w - current.x;
          } else {
            const measured = metrics.measureText(node.textContent[i]).width;
            current = {
              ...box,
              text: node.textContent[i],
              size: measured > 0
                ? parseFloat(css.fontSize) * box.w / measured
                : parseFloat(css.fontSize),
              font: css.fontFamily.split(",")[0].replace(/["']/g, ""),
              bold: Number(css.fontWeight) >= 600,
              italic: css.fontStyle === "italic",
              color: color(css.color) || "1A1A1A",
              link,
            };
            text.push(current);
          }
        }
      }
    }
    return {
      width,
      height,
      background,
      shapes,
      images,
      text,
      links,
      notes: notes.find((note) =>
        Number(note.dataset.index) === index
      )?.innerText || "",
    };
  }));
};
