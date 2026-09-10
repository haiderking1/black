import React from 'react'

/**
 * The OpenCode mark.
 *
 * Taken from the vendor's own favicon so it stays the real logo rather than an
 * approximation. The paths are the mark itself; the outer square is the tile it
 * ships on.
 */
export function OpenCodeLogo({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="OpenCode"
    >
      <rect width="512" height="512" rx="96" fill="#131010" />
      <path d="M320 224V352H192V224H320Z" fill="#5A5858" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
        fill="#FFFFFF"
      />
    </svg>
  )
}
