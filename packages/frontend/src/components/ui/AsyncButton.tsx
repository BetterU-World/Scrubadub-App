import {
  ButtonHTMLAttributes,
  forwardRef,
  MouseEvent,
  ReactNode,
} from "react";
import { clsx } from "clsx";

type AsyncButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  pendingLabel: ReactNode;
  variant?: "primary" | "secondary" | "danger";
};

const VARIANT_CLASSES = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
} as const;

export const AsyncButton = forwardRef<HTMLButtonElement, AsyncButtonProps>(
  function AsyncButton(
    {
      pending = false,
      pendingLabel,
      variant,
      disabled,
      className,
      children,
      onClick,
      type = "button",
      ...props
    },
    ref
  ) {
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      if (pending || disabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        onClick={handleClick}
        className={clsx(
          "relative",
          variant && VARIANT_CLASSES[variant],
          className
        )}
      >
        <span
          className={clsx(
            "inline-flex items-center justify-center gap-2",
            pending && "invisible"
          )}
        >
          {children}
        </span>
        {pending && (
          <span className="absolute inset-0 inline-flex items-center justify-center gap-2">
            {pendingLabel}
          </span>
        )}
      </button>
    );
  }
);
