/**
 * Small red "!" shown next to things only the owner (berlcamp@gmail.com)
 * can see. `title` overrides the hover text for things with a slightly
 * wider audience (e.g. also province admins).
 */
export default function OwnerMark({
  title = 'Only visible to the owner',
  className = ''
}: {
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-600 align-middle text-[10px] font-bold leading-none text-white ${className}`}
    >
      !
    </span>
  )
}
