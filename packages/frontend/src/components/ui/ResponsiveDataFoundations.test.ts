import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";
import {
  isHorizontallyOverflowing,
  TableScrollRegion,
} from "./TableScrollRegion";

function TestIcon(props: Record<string, unknown>) {
  return createElement("svg", props);
}

describe("PageHeader responsive contract", () => {
  it("gives long action content mobile width and intrinsic desktop sizing", () => {
    const markup = renderToStaticMarkup(
      createElement(PageHeader, {
        title: "A long localized page title",
        description: "Descripción localizada de esta vista de datos.",
        action: createElement(
          "button",
          null,
          "Crear una nueva cuenta comercial"
        ),
      })
    );

    expect(markup).toContain("min-w-0 w-full sm:w-auto sm:flex-shrink-0");
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("break-words text-2xl");
    expect(markup).toContain("A long localized page title");
    expect(markup).toContain("Descripción localizada");
    expect(markup).toContain("Crear una nueva cuenta comercial");
  });

  it("remains backward compatible without an action", () => {
    const markup = renderToStaticMarkup(
      createElement(PageHeader, { title: "Records" })
    );

    expect(markup).toContain("Records");
    expect(markup).not.toContain("sm:flex-shrink-0");
  });
});

describe("EmptyState responsive contract", () => {
  const longDescription =
    "No se encontraron registros que coincidan con los filtros seleccionados. Ajusta los filtros para volver a intentarlo.";

  it("constrains and wraps long localized content with an optional action", () => {
    const markup = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: TestIcon as never,
        title: "No hay resultados disponibles para esta búsqueda",
        description: longDescription,
        action: createElement("button", null, "Limpiar todos los filtros"),
      })
    );

    expect(markup).toContain("px-4 py-10 text-center sm:py-12");
    expect(markup).toContain("mx-auto mt-1 max-w-md break-words");
    expect(markup).toContain("mt-6 max-w-full");
    expect(markup).toContain(longDescription);
    expect(markup).toContain("Limpiar todos los filtros");
  });

  it("remains backward compatible without an action", () => {
    const markup = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: TestIcon as never,
        title: "No records",
        description: "Records will appear here.",
      })
    );

    expect(markup).toContain("No records");
    expect(markup).not.toContain("mt-6 max-w-full");
  });
});

describe("TableScrollRegion contract", () => {
  it("preserves native table markup and supplies an accessible region label", () => {
    const table = createElement(
      "table",
      null,
      createElement(
        "tbody",
        null,
        createElement(
          "tr",
          null,
          createElement("th", { scope: "row" }, "Record"),
          createElement("td", null, "Value")
        )
      )
    );
    const markup = renderToStaticMarkup(
      createElement(TableScrollRegion, {
        label: "Performance results",
        className: "border",
        children: table,
      })
    );

    expect(markup).toContain('role="region"');
    expect(markup).toContain('aria-label="Performance results"');
    expect(markup).toContain("overflow-x-auto overscroll-x-contain");
    expect(markup).toContain("focus-visible:ring-2");
    expect(markup).toContain("border");
    expect(markup).toContain("<table>");
    expect(markup).toContain('<th scope="row">Record</th>');
    expect(markup).not.toContain("tabindex");
  });

  it("detects horizontal overflow without browser layout dependencies", () => {
    expect(
      isHorizontallyOverflowing({ clientWidth: 390, scrollWidth: 900 })
    ).toBe(true);
    expect(
      isHorizontallyOverflowing({ clientWidth: 390, scrollWidth: 390 })
    ).toBe(false);
  });
});
