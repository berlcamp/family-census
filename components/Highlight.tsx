import { Fragment } from 'react'

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Highlight the searched words inside a name. */
export function Highlight({
  text,
  tokens
}: {
  text: string | null | undefined
  tokens: string[]
}) {
  if (!text) return null
  const clean = tokens.filter((token) => token.length > 1)
  if (clean.length === 0) return <>{text}</>

  const lookup = new Set(clean.map((token) => token.toLowerCase()))
  const parts = text.split(new RegExp(`(${clean.map(escape).join('|')})`, 'gi'))

  return (
    <>
      {parts.map((part, index) =>
        lookup.has(part.toLowerCase()) ? (
          <mark key={index} className="rounded bg-yellow-300 px-0.5">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  )
}
