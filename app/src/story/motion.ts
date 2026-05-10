import type { MotionProps } from "motion/react";

const fadeEase = [0.16, 1, 0.3, 1] as const;

export const fadeUp: Pick<
  MotionProps,
  "initial" | "whileInView" | "viewport" | "transition"
> = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-10%" },
  transition: { duration: 0.7, ease: fadeEase },
};

export const fadeIn: Pick<
  MotionProps,
  "initial" | "whileInView" | "viewport" | "transition"
> = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true, margin: "-10%" },
  transition: { duration: 0.6, ease: fadeEase },
};

export const fadeRight: Pick<
  MotionProps,
  "initial" | "whileInView" | "viewport" | "transition"
> = {
  initial: { opacity: 0, x: 10 },
  whileInView: { opacity: 1, x: 0 },
  viewport: { once: true, margin: "-10%" },
  transition: { duration: 0.7, ease: fadeEase },
};

/** Stagger helper — apply to a parent motion element with children that have variants. */
export function fadeUpStagger(stagger = 0.08) {
  return {
    initial: "hidden",
    whileInView: "visible",
    viewport: { once: true, margin: "-10%" } as const,
    variants: {
      hidden: {},
      visible: { transition: { staggerChildren: stagger } },
    },
  };
}

export const fadeUpItem = {
  variants: {
    hidden: { opacity: 0, y: 18 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: fadeEase },
    },
  },
};
