import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge has to know our custom type scale, or it reads `text-meta`
 * as a colour and drops it whenever a colour class such as `text-ink` follows.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['badge', 'meta', 'body', 'card', 'pane', 'app'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
