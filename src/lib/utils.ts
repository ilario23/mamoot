import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge<
  "safe-pt" | "safe-pb" | "safe-pl" | "safe-pr" | "safe-mb"
>({
  extend: {
    classGroups: {
      // Prevent tailwind-merge from stripping safe-area custom utilities
      // (they must not conflict with standard padding/margin groups)
      "safe-pt": ["pt-safe"],
      "safe-pb": ["pb-safe", "pb-bottom-nav"],
      "safe-pl": ["pl-safe"],
      "safe-pr": ["pr-safe"],
      "safe-mb": ["mb-safe"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
