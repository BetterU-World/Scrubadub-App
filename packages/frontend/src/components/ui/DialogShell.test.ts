import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type PrimitiveProps = Record<string, unknown> & { children?: ReactNode };

const captured: {
  content?: PrimitiveProps;
  root?: PrimitiveProps;
} = {};

vi.mock("@radix-ui/react-dialog", () => {
  const primitive = (tag: string) =>
    ({ children, ...props }: PrimitiveProps) =>
      createElement(tag, props, children);

  return {
    Root: ({ children, ...props }: PrimitiveProps) => {
      captured.root = props;
      return createElement("div", props, children);
    },
    Portal: primitive("div"),
    Overlay: primitive("div"),
    Content: ({ children, ...props }: PrimitiveProps) => {
      captured.content = props;
      return createElement("section", props, children);
    },
    Title: primitive("h2"),
    Description: primitive("p"),
    Close: ({ children }: PrimitiveProps) => createElement("div", null, children),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => `translated:${key}` }),
}));

import { ConfirmDialog } from "./ConfirmDialog";
import { DialogShell } from "./DialogShell";

function renderDialog(props: Partial<ComponentProps<typeof DialogShell>> = {}) {
  return renderToStaticMarkup(
    createElement(DialogShell, {
      open: true,
      onOpenChange: vi.fn(),
      title: "Dialog title",
      description: "Dialog description",
      children: createElement("div", null, "Long body"),
      ...props,
    })
  );
}

describe("DialogShell responsive contract", () => {
  beforeEach(() => {
    captured.content = undefined;
    captured.root = undefined;
  });

  it("renders an internally scrolling body and an optional stable footer", () => {
    const withoutFooter = renderDialog();
    expect(withoutFooter).toContain(
      "min-h-0 flex-1 overflow-y-auto overscroll-contain"
    );
    expect(withoutFooter).not.toContain("border-t border-gray-200");

    const withFooter = renderDialog({
      footer: createElement("button", null, "Save"),
    });
    expect(withFooter).toContain("flex-col-reverse");
    expect(withFooter).toContain("sm:flex-row");
    expect(withFooter).toContain("[&amp;&gt;*]:w-full");
    expect(withFooter).toContain("Save");
  });

  it("uses dynamic viewport and safe-area sizing with a 44px close target", () => {
    const markup = renderDialog();
    expect(markup).toContain("100dvh");
    expect(markup).toContain("var(--safe-area-top)");
    expect(markup).toContain("var(--safe-area-bottom)");
    expect(markup).toContain("touch-target");
    expect(markup).toContain('aria-label="translated:common.closeDialog"');
    expect(markup).toContain("Dialog description");
  });

  it("prevents every dismissal path while pending", () => {
    const onOpenChange = vi.fn();
    renderDialog({ pending: true, onOpenChange });

    (captured.root?.onOpenChange as (open: boolean) => void)(false);
    expect(onOpenChange).not.toHaveBeenCalled();

    for (const name of [
      "onEscapeKeyDown",
      "onPointerDownOutside",
      "onInteractOutside",
    ] as const) {
      const preventDefault = vi.fn();
      (
        captured.content?.[name] as (event: {
          preventDefault: () => void;
        }) => void
      )({ preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
    }
  });
});

describe("ConfirmDialog", () => {
  it("uses the localized fallback and responsive shared footer", () => {
    const markup = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        open: true,
        onOpenChange: vi.fn(),
        title: "Delete item?",
        description: "This cannot be undone.",
        confirmVariant: "danger",
        onConfirm: vi.fn(),
      })
    );

    expect(markup).toContain("translated:common.confirm");
    expect(markup).toContain("translated:common.cancel");
    expect(markup).toContain("btn-danger");
    expect(markup).toContain("flex-col-reverse");
  });

  it("keeps actions disabled and announces a busy dialog while loading", () => {
    const markup = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        open: true,
        onOpenChange: vi.fn(),
        title: "Archive?",
        description: "Archive this record.",
        onConfirm: vi.fn(),
        loading: true,
      })
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("translated:common.processing");
    expect(markup.match(/disabled=""/g)).toHaveLength(3);
  });
});
